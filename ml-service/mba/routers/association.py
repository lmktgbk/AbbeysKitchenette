import asyncio
import json
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel

from database import get_pool
from mba.services.fpgrowth import (
    run_market_basket_analysis,
    save_results_to_db,
    mark_job_failed,
)

router = APIRouter(prefix="/mba", tags=["mba"])


class MarkComboCreatedRequest(BaseModel):
    product_name_a: str
    product_name_b: str
    product_id: str


@router.post("/analyze")
async def create_analysis_job(
    min_support: float = Query(0.02, ge=0.01, le=1.0),
    min_confidence: float = Query(0.3, ge=0.01, le=1.0),
    top_n: int = Query(20, ge=1, le=50),
):
    """Create a new MBA analysis job."""
    pool = await get_pool()

    job_id = await pool.fetchval(
        """INSERT INTO mba_jobs (status) VALUES ('running') RETURNING id"""
    )

    asyncio.create_task(_run_job(job_id, min_support, min_confidence, top_n))

    return {"job_id": job_id, "status": "running"}


async def _run_job(job_id: int, min_support: float, min_confidence: float, top_n: int):
    """Background task to run MBA analysis and save results."""
    try:
        result = await run_market_basket_analysis(
            min_support=min_support,
            min_confidence=min_confidence,
            top_n=top_n,
        )
        await save_results_to_db(
            job_id=job_id,
            rules_list=result["rules"],
            stats=result["stats"],
        )
    except Exception as e:
        await mark_job_failed(job_id, str(e))


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


@router.get("/jobs/{job_id}")
async def get_job(job_id: int):
    """Get a specific MBA job with its rules."""
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
        rule_rows = await pool.fetch(
            """SELECT r.id, r.product_name_a, r.product_name_b, r.product_id_a, r.product_id_b,
                      r.variant_id_a, r.variant_id_b, r.size_name_a, r.size_name_b,
                      r.support, r.confidence, r.lift, r.is_combo, r.explanation, r.suggested_name,
                      r.merged_ingredients, r.pricing,
                      EXISTS (
                        SELECT 1 FROM combo_created_pairs c
                        WHERE c.product_name_a = r.product_name_a
                          AND c.product_name_b = r.product_name_b
                      ) AS combo_exists
               FROM mba_rules r
               WHERE r.job_id = $1
               ORDER BY r.lift DESC""",
            job_id,
        )
        for r in rule_rows:
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
                "is_combo": r["is_combo"],
                "combo_exists": bool(r["combo_exists"]),
                "explanation": r["explanation"],
                "suggested_name": r["suggested_name"],
                "merged_ingredients": merged_ings,
                "pricing": pricing,
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
    """Mark a product pair as having a combo created."""
    pool = await get_pool()
    await pool.execute(
        """INSERT INTO combo_created_pairs (product_name_a, product_name_b, product_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (product_name_a, product_name_b) DO UPDATE SET
             product_id = EXCLUDED.product_id,
             created_at = NOW()""",
        body.product_name_a,
        body.product_name_b,
        body.product_id,
    )
    return {"marked": True}
