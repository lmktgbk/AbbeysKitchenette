"""Database admission and ownership fencing for process-isolated ML work."""
from contextlib import asynccontextmanager
from contextvars import ContextVar
from uuid import uuid4
import json
from database import get_pool

LEASE_SECONDS = 120
HEARTBEAT_SECONDS = 20
WORKER_OWNER = ContextVar("ml_worker_owner", default=None)
# SQL identifiers come exclusively from this allowlist, never request input.
# Each tuple contains the job table, result table, and per-type advisory-lock key.
KINDS = {"forecast": ("forecast_jobs", "forecast_results", 1), "mba": ("mba_jobs", "mba_rules", 2)}


class LeaseLostError(RuntimeError):
    """Signal that the current worker must no longer publish job data."""
    pass


async def record_effect(conn, action, target_type, target_id, details):
    """Append the backend outbox contract in the caller transaction; rollback also removes this audit event."""
    # Match the backend's durable payload contract; never include provider credentials.
    payload = {"version": 1, "notifications": [], "audit": {
        "action": action, "targetType": target_type, "targetId": str(target_id), "details": details,
    }}
    await conn.execute("INSERT INTO domain_effects (payload) VALUES ($1::jsonb)", json.dumps(payload))


async def record_job_effect(conn, kind, job_id, stage):
    """Translate a job lifecycle stage into its feature-specific durable audit event."""
    await record_effect(conn, "FORECAST_RUN" if kind == "forecast" else "MBA_RUN",
                        "forecast" if kind == "forecast" else "market_basket", job_id,
                        {"source": "ml-worker", "stage": stage, "jobId": job_id})


async def _expire(conn, table, results):
    """Fail expired running rows and remove partial results in the caller recovery/admission transaction."""
    counters = ", completed=0, failed=0" if table == "forecast_jobs" else ""
    rows = await conn.fetch(f"""UPDATE {table}
        SET status='failed', error_message='Worker ownership expired before completion',
            completed_at=clock_timestamp(), lease_expires_at=NULL, lease_owner=NULL{counters}
        WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at <= clock_timestamp())
        RETURNING id""")
    if rows:
        await conn.execute(f"DELETE FROM {results} WHERE job_id=ANY($1::int[])", [row["id"] for row in rows])
        for row in rows:
            await record_job_effect(conn, "forecast" if table == "forecast_jobs" else "mba", row["id"], "expired")


async def recover_expired_jobs():
    """Serialize recovery per allowlisted type while preserving healthy owners on other instances."""
    pool = await get_pool()
    for table, results, lock in KINDS.values():
        async with pool.acquire(timeout=10) as conn, conn.transaction():
            await conn.execute("SELECT pg_advisory_xact_lock(73421, $1)", lock)
            await _expire(conn, table, results)


async def admit_job(kind):
    """Return (job_id, owner) for new work or (existing_id, None) to attach without launching another worker."""
    table, results, lock = KINDS[kind]
    owner = uuid4()
    pool = await get_pool()
    async with pool.acquire(timeout=10) as conn, conn.transaction():
        # Transaction locks work with Supabase transaction pooling and span instances.
        await conn.execute("SELECT pg_advisory_xact_lock(73421, $1)", lock)
        await _expire(conn, table, results)
        running = await conn.fetchrow(f"SELECT id FROM {table} WHERE status='running' ORDER BY id DESC LIMIT 1")
        if running:
            return running["id"], None
        period_column = ", period" if kind == "forecast" else ""
        period_value = ", 7" if kind == "forecast" else ""
        row = await conn.fetchrow(f"""INSERT INTO {table} (status, lease_owner, lease_expires_at{period_column})
            VALUES ('running', $1, clock_timestamp() + $2 * interval '1 second'{period_value}) RETURNING id""", owner, LEASE_SECONDS)
        await record_job_effect(conn, kind, row["id"], "admitted")
        return row["id"], owner


async def renew_lease(kind, job_id, owner):
    """Extend only a still-live owned job; False tells the supervisor to stop its worker."""
    table = KINDS[kind][0]
    pool = await get_pool()
    async with pool.acquire(timeout=10) as conn:
        return await conn.fetchval(f"""UPDATE {table}
            SET lease_expires_at=clock_timestamp() + $3 * interval '1 second'
            WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_expires_at > clock_timestamp()
            RETURNING id""", job_id, owner, LEASE_SECONDS) is not None


@asynccontextmanager
async def job_connection(kind, job_id):
    """Fence a short result-write transaction with a live owner check and row lock.

    Model fitting belongs outside this block. Completion captures the durable
    audit event before commit; a failed write rolls back the whole block."""
    table = KINDS[kind][0]
    pool = await get_pool()
    async with pool.acquire(timeout=10) as conn, conn.transaction():
        row = await conn.fetchrow(f"""SELECT id FROM {table}
            WHERE id=$1 AND lease_owner=$2 AND status='running' AND lease_expires_at > clock_timestamp()
            FOR UPDATE""", job_id, WORKER_OWNER.get())
        if row is None:
            raise LeaseLostError("ML job no longer owns its execution lease")
        yield conn
        status = await conn.fetchval(f"SELECT status FROM {table} WHERE id=$1", job_id)
        if status == "completed":
            await record_job_effect(conn, kind, job_id, "completed")


async def fail_owned_job(kind, job_id, owner, message):
    """Fail only this running owner and atomically remove its partial results; completed jobs are untouched."""
    table, results, _ = KINDS[kind]
    counters = ", completed=0, failed=0" if kind == "forecast" else ""
    pool = await get_pool()
    async with pool.acquire(timeout=10) as conn, conn.transaction():
        row = await conn.fetchrow(f"""UPDATE {table}
            SET status='failed', error_message=$3, completed_at=clock_timestamp(),
                lease_owner=NULL, lease_expires_at=NULL{counters}
            WHERE id=$1 AND lease_owner=$2 AND status='running' RETURNING id""", job_id, owner, message[:500])
        if row:
            await conn.execute(f"DELETE FROM {results} WHERE job_id=$1", job_id)
            await record_job_effect(conn, kind, job_id, "failed")
