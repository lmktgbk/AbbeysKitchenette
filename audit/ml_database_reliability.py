"""Exercise actual ML SQL in a disposable PostgreSQL schema, never public data."""
import asyncio
import re
import sys
from contextvars import ContextVar
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4
import asyncpg
import pandas as pd
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "ml-service"))
import jobs
from forecasting.services import demand_forecast as forecast
from forecasting.routers import demand
from forecasting.services import data_loader
from mba.services import fpgrowth as mba


async def verify():
    schema = "ml_check_" + uuid4().hex
    assert re.fullmatch(r"ml_check_[a-f0-9]{32}", schema)
    url = dotenv_values(ROOT / "server" / ".env")["DIRECT_URL"]
    admin = await asyncpg.connect(url, timeout=10, command_timeout=30, statement_cache_size=0)
    pools = []
    selected_pool = ContextVar("isolated_ml_test_pool")
    try:
        await admin.execute(f'CREATE SCHEMA "{schema}"')
        baseline = (ROOT / "server/prisma/migrations/00000000000000_baseline/migration.sql").read_text()
        for table in ["forecast_jobs", "forecast_results", "mba_jobs", "mba_rules", "product_variants", "products"]:
            ddl = re.search(r'CREATE TABLE "public"\."' + table + r'" \([\s\S]*?\n\);', baseline).group(0)
            await admin.execute(ddl.replace('"public"', f'"{schema}"'))
        effects = (ROOT / "server/prisma/migrations/20261004000000_domain_effects/migration.sql").read_text(encoding="utf-8")
        ddl = re.search(r"CREATE TABLE domain_effects \([\s\S]*?\n\);", effects).group(0)
        await admin.execute(ddl.replace("CREATE TABLE domain_effects", f'CREATE TABLE "{schema}".domain_effects'))
        product_id = uuid4()
        await admin.execute(f'INSERT INTO "{schema}".products(product_id,product_name,subcategory_id,updated_at) VALUES($1,\'Fixture\',1,NOW())', product_id)
        await admin.execute(f'INSERT INTO "{schema}".product_variants(variant_id,product_id,size_name,price) VALUES(1,$1,\'Small\',10)', product_id)
        await admin.execute(f'INSERT INTO "{schema}".forecast_jobs(status) VALUES(\'completed\')')
        await admin.execute(f'INSERT INTO "{schema}".forecast_results(job_id,variant_id,product_id,product_name,size_name,price,category_id,daily_data) VALUES(1,1,123,\'Fixture\',\'Small\',10,1,\'[]\')')
        for name in ["20261003030000_ml_job_leases", "20261003040000_forecast_product_ids"]:
            migration = (ROOT / "server/prisma/migrations" / name / "migration.sql").read_text()
            await admin.execute(migration.replace("public.", f'"{schema}".'))
        legacy = await admin.fetchrow(f'SELECT legacy_product_id,product_id FROM "{schema}".forecast_results WHERE id=1')
        assert legacy["legacy_product_id"] == 123 and legacy["product_id"] == product_id
        print("PASS: UUID migration preserves legacy identifiers and restores catalog identity")
        await admin.execute(f'CREATE UNIQUE INDEX results_variant ON "{schema}".forecast_results(job_id,variant_id)')
        for table, parent in [("forecast_results", "forecast_jobs"), ("mba_rules", "mba_jobs")]:
            await admin.execute(f'ALTER TABLE "{schema}".{table} ADD FOREIGN KEY(job_id) REFERENCES "{schema}".{parent}(id) ON DELETE CASCADE')
        for _ in range(2):
            pools.append(await asyncpg.create_pool(url, min_size=1, max_size=2, command_timeout=30,
                                                  statement_cache_size=0, server_settings={"search_path": f'"{schema}",pg_catalog'}))

        async def get_test_pool():
            return selected_pool.get(pools[0])

        # Minimal sales tables exercise the real loader query without public-table access.
        await admin.execute(f'CREATE TABLE "{schema}".subcategories(subcategory_id int,category_id int)')
        await admin.execute(f'CREATE TABLE "{schema}".orders(order_id uuid,order_date date,status text)')
        await admin.execute(f'CREATE TABLE "{schema}".order_items(order_id uuid,variant_id int,quantity int,removed_at timestamptz)')
        await admin.execute(f'INSERT INTO "{schema}".subcategories VALUES(1,1)')
        async with pools[0].acquire() as connection:
            await connection.execute("INSERT INTO product_variants(variant_id,product_id,size_name,price,is_available) VALUES(2,$1,'Unavailable',20,FALSE),(3,$1,'Never sold',30,TRUE)", product_id)
            for variant, days_ago, status, quantity, removed in [(1, 2, 'completed', 3, False), (2, 1, 'completed', 4, False),
                                                               (1, 0, 'completed', 100, False), (1, 1, 'cancelled', 100, False),
                                                               (1, 1, 'completed', 100, True)]:
                order_id = uuid4()
                await connection.execute("INSERT INTO orders VALUES($1,(NOW() AT TIME ZONE 'Asia/Manila')::date - $2::int,$3)", order_id, days_ago, status)
                await connection.execute("INSERT INTO order_items VALUES($1,$2,$3,CASE WHEN $4 THEN NOW() ELSE NULL END)", order_id, variant, quantity, removed)
        with patch.object(data_loader, "get_pool", get_test_pool):
            sales = await data_loader.load_variant_daily_sales()
            assert sales.groupby("variant_id")["units"].sum().to_dict() == {1: 3, 2: 4, 3: 0}
        print("PASS: actual loader retains unavailable history, excludes incomplete/removed/cancelled sales and includes never-sold variants")

        # Isolate advisory keys too, so test traffic cannot block a real ML submission.
        key = int(uuid4().hex[:7], 16)
        kinds = {kind: (table, results, key + index) for index, (kind, (table, results, _)) in enumerate(jobs.KINDS.items())}
        with patch.object(jobs, "get_pool", get_test_pool), patch.object(forecast, "get_pool", get_test_pool), patch.dict(jobs.KINDS, kinds):
            async def submit(kind, index):
                selected_pool.set(pools[index % 2])
                return await jobs.admit_job(kind)

            claimed = {}
            for kind in kinds:
                results = await asyncio.gather(*[submit(kind, index) for index in range(10)])
                assert len({job_id for job_id, _ in results}) == 1
                assert sum(owner is not None for _, owner in results) == 1
                claimed[kind] = next(result for result in results if result[1] is not None)
            print("PASS: twenty concurrent admissions across two pools admit one job per kind")

            f_id, f_owner = claimed["forecast"]
            m_id, m_owner = claimed["mba"]
            assert not await jobs.renew_lease("forecast", f_id, uuid4())
            assert await jobs.renew_lease("forecast", f_id, f_owner)
            async with pools[0].acquire() as conn:
                try:
                    async with conn.transaction():
                        await conn.execute("INSERT INTO forecast_jobs(status,lease_owner,lease_expires_at) VALUES('running',$1,now()+interval '2 minutes')", uuid4())
                    raise AssertionError("Unique admission backstop did not reject a duplicate")
                except asyncpg.UniqueViolationError:
                    pass
                await conn.execute("UPDATE forecast_jobs SET lease_expires_at=now()-interval '1 second', completed=2 WHERE id=$1", f_id)
                await conn.execute("INSERT INTO forecast_results(job_id,variant_id,product_name,size_name,price,category_id,daily_data) VALUES($1,1,'Fixture','Small',1,1,'[]')", f_id)
            assert not await jobs.renew_lease("forecast", f_id, f_owner)
            jobs.WORKER_OWNER.set(f_owner)
            try:
                async with jobs.job_connection("forecast", f_id):
                    raise AssertionError("Expired owner was allowed to write")
            except jobs.LeaseLostError:
                pass
            await jobs.recover_expired_jobs()
            await jobs.recover_expired_jobs()
            assert await pools[0].fetchval("SELECT status FROM mba_jobs WHERE id=$1", m_id) == "running"
            assert await pools[0].fetchval("SELECT status FROM forecast_jobs WHERE id=$1", f_id) == "failed"
            assert await pools[0].fetchval("SELECT completed FROM forecast_jobs WHERE id=$1", f_id) == 0
            assert await pools[0].fetchval("SELECT count(*) FROM forecast_results WHERE job_id=$1", f_id) == 0
            f_id, f_owner = await jobs.admit_job("forecast")
            print("PASS: expiry recovery removes partial results and preserves healthy owners")

            rule = {"product_a": "Fixture A", "product_b": "Fixture B", "support": 0.1, "confidence": 0.2, "lift": 2.0}
            stats = {"total_orders": 100, "products_analyzed": 2, "combos_found": 2}
            jobs.WORKER_OWNER.set(uuid4())
            try:
                await mba.save_results_to_db(m_id, [rule], stats)
                raise AssertionError("Incorrect owner published MBA rules")
            except jobs.LeaseLostError:
                pass
            jobs.WORKER_OWNER.set(m_owner)
            try:
                await mba.save_results_to_db(m_id, [rule, {**rule, "product_a": None}], stats)
                raise AssertionError("Invalid rule did not fail")
            except asyncpg.NotNullViolationError:
                pass
            assert await pools[0].fetchval("SELECT count(*) FROM mba_rules WHERE job_id=$1", m_id) == 0
            assert await pools[0].fetchval("SELECT status FROM mba_jobs WHERE id=$1", m_id) == "running"
            await mba.save_results_to_db(m_id, [rule, rule], stats)
            assert await pools[0].fetchval("SELECT count(*) FROM mba_rules WHERE job_id=$1", m_id) == 2
            assert await pools[0].fetchval("SELECT status FROM mba_jobs WHERE id=$1", m_id) == "completed"
            await jobs.fail_owned_job("mba", m_id, m_owner, "Late worker failure")
            assert await pools[0].fetchval("SELECT status FROM mba_jobs WHERE id=$1", m_id) == "completed"
            print("PASS: MBA rollback, complete publication and stale failure protection")

            jobs.WORKER_OWNER.set(f_owner)
            await forecast.save_result(f_id, 1, str(product_id), "Fixture", "Small", 10, 1, [{"date": "2026-10-03", "units": 2, "revenue": 20}], 2, 20, 10, 1)
            await forecast.save_skipped(f_id, 1, "Fixture", "Small", 10, 1, 10, "Fixture skip")
            row = await pools[0].fetchrow("SELECT total_units,total_revenue,skipped FROM forecast_results WHERE job_id=$1", f_id)
            assert row["skipped"] and row["total_units"] == 0 and row["total_revenue"] == 0
            await forecast.save_skipped(f_id, 2, "Fixture", "Large", 20, 1, 2, "Insufficient history", str(product_id))
            assert await pools[0].fetchval("SELECT product_id FROM forecast_results WHERE job_id=$1 AND variant_id=2", f_id) == product_id
            try:
                await forecast.complete_job(f_id, 1, 0, 1, ["Fixture skip"], [object()])
                raise AssertionError("Unserializable metrics did not fail")
            except TypeError:
                pass
            assert await pools[0].fetchval("SELECT status FROM forecast_jobs WHERE id=$1", f_id) == "running"
            score = {"product_id": str(product_id), "product_name": "Fixture", "variants": 1, "rmse": 1, "mae": 1, "mse": 1, "r_squared": 0.5}
            await forecast.complete_job(f_id, 1, 0, 1, ["Fixture skip"], [score])
            row = await pools[0].fetchrow("SELECT status,product_scores,lease_owner FROM forecast_jobs WHERE id=$1", f_id)
            assert row["status"] == "completed" and row["product_scores"] and row["lease_owner"] is None
            with patch.object(demand, "get_pool", get_test_pool):
                response = await demand.demand_results(f_id)
                payload = response.model_dump(mode="json")
                assert payload["job"]["product_scores"][0]["product_id"] == str(product_id)
                assert payload["skipped"][0]["product_id"] == str(product_id)
            print("PASS: forecast writes are fenced and final metrics/status commit together")

            for fail in [False, True]:
                job_id, owner = await jobs.admit_job("forecast")
                jobs.WORKER_OWNER.set(owner)
                loader = AsyncMock(side_effect=RuntimeError("Fixture data failure")) if fail else AsyncMock(return_value=pd.DataFrame())
                with patch.object(forecast, "load_variant_daily_sales", loader):
                    if fail:
                        try:
                            await forecast.run_demand_forecast(job_id)
                            raise AssertionError("Pipeline failure was swallowed")
                        except RuntimeError:
                            pass
                    else:
                        await forecast.run_demand_forecast(job_id)
                assert await pools[0].fetchval("SELECT status FROM forecast_jobs WHERE id=$1", job_id) == ("failed" if fail else "completed")
            print("PASS: actual forecast pipeline handles empty datasets and loader failures")
    finally:
        for pool in pools:
            await pool.close()
        # Only the exact random test namespace can be dropped; public is never selected.
        await admin.execute(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE')
        await admin.close()
        print("Disposable ML schema removed; no public business data modified.")


if __name__ == "__main__":
    asyncio.run(verify())
