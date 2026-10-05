"""Expose private analysis jobs, completed suggestions, and durable combo-pair association."""
from jobs import record_effect
import json
from asyncpg import UndefinedColumnError
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from database import get_pool
from jobs import admit_job
from workers import launch_job

router = APIRouter(prefix="/mba", tags=["mba"])

class MarkComboCreatedRequest(BaseModel):
    # Preserve the existing ordered-name association contract; it is not an unordered variant pair.
    product_name_a: str
    product_name_b: str
    product_id: str


@router.post("/analyze")
async def create_analysis_job(
    min_support: float = Query(0.005, ge=0.001, le=1.0),
    min_confidence: float = Query(0.08, ge=0.01, le=1.0),
    top_n: int = Query(20, ge=1, le=50),
):
    """Attach to existing admitted work or launch one newly owned analysis with validated thresholds."""
    job_id, owner = await admit_job("mba")
    if owner is None:
        return {"job_id": job_id, "status": "busy", "message": "An analysis is already running. Attached to it."}
    launch_job("mba", job_id, owner, {"min_support": min_support, "min_confidence": min_confidence, "top_n": top_n})
    return {"job_id": job_id, "status": "running"}


@router.get("/jobs")
async def list_jobs(limit: int = Query(20, ge=1, le=50)):
    """List recent MBA analysis jobs."""
    pool = await get_pool()
    rows = await pool.fetch(
        """SELECT id, status, total_orders, products_analyzed, combos_found,
                  started_at, completed_at, error_message
           FROM mba_jobs
           ORDER BY started_at DESC
           LIMIT $1""",
        limit,
    )
    return [dict(r) for r in rows]


async def _load_rule_rows(pool, job_id):
    """Read ranked rules; retry without optional columns only for a missing-column error."""
    # The format slot contains fixed server-owned column names; job identity stays parameterized.
    query = """SELECT r.id, r.product_name_a, r.product_name_b, r.product_id_a, r.product_id_b,
                          r.variant_id_a, r.variant_id_b, r.size_name_a, r.size_name_b,
                          r.support, r.confidence, r.lift, r.is_combo, r.explanation, r.suggested_name,
                          r.merged_ingredients, r.pricing,
                          {extended_columns}
                          EXISTS (
                            SELECT 1 FROM combo_created_pairs c
                            WHERE c.product_name_a = r.product_name_a
                              AND c.product_name_b = r.product_name_b
                          ) AS combo_exists
                   FROM mba_rules r
                   WHERE r.job_id = $1
                   ORDER BY r.confidence * r.lift DESC"""
    try:
        rows = await pool.fetch(query.format(extended_columns="r.conviction, r.stable, r.recent_support, r.recent_confidence, r.recent_lift,"), job_id)
        return rows, True
    except UndefinedColumnError:
        rows = await pool.fetch(query.format(extended_columns=""), job_id)
        return rows, False


@router.get("/jobs/{job_id}")
async def get_job(job_id: int):
    """Return rules only after atomic job publication; missing IDs retain a 404 response."""
    pool = await get_pool()

    job = await pool.fetchrow(
        """SELECT id, status, total_orders, products_analyzed, combos_found,
                  started_at, completed_at, error_message
           FROM mba_jobs WHERE id = $1""",
        job_id,
    )
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    rules = []
    top_pair_a, top_pair_b = None, None
    if job["status"] == "completed":
        rule_rows, extended = await _load_rule_rows(pool, job_id)
        for r in rule_rows:
            # asyncpg JSON may be text or decoded data depending on connection codecs.
            keys = set(r.keys())
            merged_ings = r["merged_ingredients"]
            if isinstance(merged_ings, str):
                merged_ings = json.loads(merged_ings)

            pricing = r["pricing"]
            if isinstance(pricing, str):
                pricing = json.loads(pricing)

            rule = {
                "id": r["id"],
                "product_a": r["product_name_a"],
                "product_b": r["product_name_b"],
                "product_a_id": r["product_id_a"],
                "product_b_id": r["product_id_b"],
                "variant_id_a": r["variant_id_a"],
                "variant_id_b": r["variant_id_b"],
                "size_name_a": r["size_name_a"],
                "size_name_b": r["size_name_b"],
                "support": r["support"],
                "confidence": r["confidence"],
                "lift": r["lift"],
                "score": round(float(r["confidence"]) * float(r["lift"]), 4),
                "is_combo": r["is_combo"],
                "combo_exists": bool(r["combo_exists"]),
                "explanation": r["explanation"],
                "suggested_name": r["suggested_name"],
                "merged_ingredients": merged_ings,
                "pricing": pricing,
                "conviction": float(r["conviction"]) if extended and r["conviction"] is not None else None,
                "stable": bool(r["stable"]) if extended and "stable" in keys else None,
                "recent_support": float(r["recent_support"]) if extended and r["recent_support"] is not None else None,
                "recent_confidence": float(r["recent_confidence"]) if extended and r["recent_confidence"] is not None else None,
                "recent_lift": float(r["recent_lift"]) if extended and r["recent_lift"] is not None else None,
            }
            rules.append(rule)

        if rules:
            top_pair_a = f"{rules[0]['product_a']} {rules[0].get('size_name_a', '')}".strip()
            top_pair_b = f"{rules[0]['product_b']} {rules[0].get('size_name_b', '')}".strip()

    return {
        **dict(job),
        "rules": rules,
        "top_pair": f"{top_pair_a} + {top_pair_b}" if top_pair_a else None,
    }


@router.post("/mark-combo-created")
async def mark_combo_created(body: MarkComboCreatedRequest):
    """Upsert the ordered name pair and capture its audit effect in one transaction.

    Product creation is a separate backend request; this endpoint only records
    its association and does not make the two requests atomic.
    """
    pool = await get_pool()
    async with pool.acquire(timeout=10) as conn, conn.transaction():
        await conn.execute(
            """INSERT INTO combo_created_pairs (product_name_a, product_name_b, product_id)
               VALUES ($1, $2, $3)
               ON CONFLICT (product_name_a, product_name_b) DO UPDATE SET
                 product_id = EXCLUDED.product_id,
                 created_at = NOW()""",
            body.product_name_a,
            body.product_name_b,
            body.product_id,
        )
        await record_effect(conn, "MBA_COMBO_CREATED", "product", body.product_id,
                            {"source": "ml-service", "stage": "published"})
    return {"marked": True}
