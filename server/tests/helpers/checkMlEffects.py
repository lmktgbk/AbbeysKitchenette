"""Cross-language checks against the calling Node fixture's disposable schema."""
import asyncio
import json
import os
from pathlib import Path
import re
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "ml-service"))
import asyncpg
import jobs


async def main():
    schema = sys.argv[1]
    if not re.fullmatch(r"report_ml_check_[a-f0-9]{32}", schema):
        raise RuntimeError("Invalid disposable schema")
    pool = await asyncpg.create_pool(os.environ["DIRECT_URL"], min_size=1, max_size=3,
                                     timeout=10, command_timeout=15, server_settings={"search_path": schema})
    async def fixture_pool():
        return pool
    jobs.get_pool = fixture_pool
    try:
        assert await pool.fetchval("SELECT current_schema()") == schema
        job_id, owner = await jobs.admit_job("forecast")
        repeated, repeated_owner = await jobs.admit_job("forecast")
        assert repeated == job_id and repeated_owner is None
        assert await pool.fetchval("SELECT count(*) FROM domain_effects") == 1
        await pool.execute("ALTER TABLE domain_effects ADD CONSTRAINT fixture_python_capture CHECK (false) NOT VALID")
        jobs.WORKER_OWNER.set(owner)
        try:
            try:
                async with jobs.job_connection("forecast", job_id) as conn:
                    await conn.execute("UPDATE forecast_jobs SET status='completed' WHERE id=$1", job_id)
            except asyncpg.CheckViolationError:
                pass
            else:
                raise AssertionError("Expected transactional capture failure")
        finally:
            await pool.execute("ALTER TABLE domain_effects DROP CONSTRAINT fixture_python_capture")
        assert await pool.fetchval("SELECT status FROM forecast_jobs WHERE id=$1", job_id) == "running"
        async with jobs.job_connection("forecast", job_id) as conn:
            await conn.execute("UPDATE forecast_jobs SET status='completed', lease_owner=NULL, lease_expires_at=NULL WHERE id=$1", job_id)
        assert await pool.fetchval("SELECT count(*) FROM domain_effects") == 2
        mba_id, mba_owner = await jobs.admit_job("mba")
        await jobs.fail_owned_job("mba", mba_id, mba_owner, "Fixture failure")
        await jobs.fail_owned_job("mba", mba_id, mba_owner, "Repeated fixture failure")
        assert await pool.fetchval("SELECT count(*) FROM domain_effects") == 4
        expired, _ = await jobs.admit_job("mba")
        await pool.execute("UPDATE mba_jobs SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", expired)
        await jobs.recover_expired_jobs()
        assert await pool.fetchval("SELECT status FROM mba_jobs WHERE id=$1", expired) == "failed"
        assert await pool.fetchval("SELECT count(*) FROM domain_effects") == 6
        print(json.dumps({"checks": 5, "events": 6}))
    finally:
        await pool.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        print(type(error).__name__, file=sys.stderr)
        sys.exit(1)
