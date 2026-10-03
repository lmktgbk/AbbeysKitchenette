"""Pool failure, worker lifecycle and health responsiveness regressions."""
import asyncio
import multiprocessing
import sys
import time
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID, uuid4
import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml-service"))
import database
import jobs
import workers
from main import app
from config import ML_SERVICE_KEY
from ml_worker_fixture import burn_cpu, forecast_fixture, mba_fixture


class Reliability(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        database._pool = None
        database._pool_lock = asyncio.Lock()

    async def asyncTearDown(self):
        await workers.stop_workers()
        database._pool = None

    async def test_pool_initialization_retries_after_failure(self):
        pool = object()
        with patch.object(database.asyncpg, "create_pool", AsyncMock(side_effect=[RuntimeError("Fixture"), pool])) as create:
            with self.assertRaises(RuntimeError):
                await database.get_pool()
            self.assertIs(await database.get_pool(), pool)
            self.assertEqual(create.await_count, 2)

    async def test_pool_close_is_idempotent(self):
        pool = Mock(close=AsyncMock())
        database._pool = pool
        await asyncio.gather(database.close_pool(), database.close_pool())
        pool.close.assert_awaited_once()
        self.assertIsNone(database._pool)

    async def test_pool_close_timeout_terminates_connections(self):
        pool = Mock(close=Mock(return_value=None))
        database._pool = pool
        with patch.object(database.asyncio, "wait_for", AsyncMock(side_effect=TimeoutError)):
            with self.assertRaises(TimeoutError):
                await database.close_pool()
        pool.terminate.assert_called_once()
        self.assertIsNone(database._pool)

    async def test_start_failure_compensates_owned_job(self):
        owner = uuid4()
        with patch.object(workers, "_new_process", side_effect=OSError("Fixture start failure")), patch.object(workers, "fail_owned_job", AsyncMock()) as fail, patch.object(workers.logger, "exception"):
            await workers.launch_job("forecast", 1, owner)
            fail.assert_awaited_once_with("forecast", 1, owner, "ML worker stopped before publishing results")

    async def test_shutdown_stops_process_before_failing_job(self):
        process = Mock()
        process.is_alive.return_value = True
        process.pid = 999999
        order = []
        async def stop(_):
            order.append("stop")
        async def fail(*_):
            order.append("fail")
        with patch.object(workers, "_new_process", return_value=process), patch.object(workers, "_stop_process", stop), patch.object(workers, "fail_owned_job", fail):
            task = workers.launch_job("mba", 2, uuid4())
            await asyncio.sleep(0)
            await workers.stop_workers()
            self.assertTrue(task.cancelled())
            self.assertEqual(order, ["stop", "fail"])

    async def test_lost_lease_stops_worker_and_attempts_conditional_failure(self):
        process = Mock()
        process.is_alive.return_value = True
        with patch.object(workers, "HEARTBEAT_SECONDS", 0), patch.object(workers, "_new_process", return_value=process), patch.object(workers, "_stop_process", AsyncMock()) as stop, patch.object(workers, "renew_lease", AsyncMock(return_value=False)), patch.object(workers, "fail_owned_job", AsyncMock()) as fail:
            await workers.launch_job("forecast", 1, uuid4())
            stop.assert_awaited_once_with(process)
            self.assertEqual(fail.call_args.args[-1], "ML worker lost execution ownership")

    async def test_execution_deadline_stops_worker(self):
        process = Mock()
        process.is_alive.return_value = True
        with patch.object(workers, "ML_JOB_TIMEOUT_SECONDS", 0), patch.object(workers, "_new_process", return_value=process), patch.object(workers, "_stop_process", AsyncMock()) as stop, patch.object(workers, "fail_owned_job", AsyncMock()) as fail:
            await workers.launch_job("mba", 1, uuid4())
            stop.assert_awaited_once_with(process)
            self.assertEqual(fail.call_args.args[-1], "ML worker exceeded its execution deadline")

    async def test_health_remains_responsive_during_real_cpu_worker(self):
        context = multiprocessing.get_context("spawn")
        started = context.Event()
        process = context.Process(target=burn_cpu, args=(started,))
        with patch.object(workers, "_new_process", return_value=process), patch.object(workers, "fail_owned_job", AsyncMock()):
            task = workers.launch_job("mba", 1, uuid4())
            self.assertTrue(await asyncio.to_thread(started.wait, 10))
            timings = []
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                for _ in range(10):
                    start = time.perf_counter()
                    response = await client.get("/health", headers={"X-ML-Service-Key": ML_SERVICE_KEY})
                    timings.append(time.perf_counter() - start)
                    self.assertEqual(response.status_code, 200)
                self.assertLess(max(timings), 1.0)
                print(f"Health during CPU work: mean={sum(timings)/len(timings)*1000:.1f}ms max={max(timings)*1000:.1f}ms (in-process ASGI)")
            await task

    async def test_shutdown_terminates_real_cpu_worker(self):
        context = multiprocessing.get_context("spawn")
        started = context.Event()
        process = context.Process(target=burn_cpu, args=(started,))
        with patch.object(workers, "_new_process", return_value=process), patch.object(workers, "fail_owned_job", AsyncMock()) as fail:
            task = workers.launch_job("mba", 1, uuid4())
            self.assertTrue(await asyncio.to_thread(started.wait, 10))
            await workers.stop_workers()
            self.assertTrue(task.cancelled())
            self.assertTrue(process._closed)
            fail.assert_awaited_once()

    async def run_fixture(self, target):
        context = multiprocessing.get_context("spawn")
        output = context.Queue()
        process = context.Process(target=target, args=(output,))
        process.start()
        try:
            result = await asyncio.to_thread(output.get, True, 45)
            await asyncio.to_thread(process.join, 10)
            self.assertEqual(process.exitcode, 0)
            return result
        finally:
            if process.is_alive():
                await workers._stop_process(process)
            else:
                process.close()
            output.close()
            output.join_thread()

    async def test_real_prophet_worker_preserves_uuid_and_variant_totals(self):
        result = await self.run_fixture(forecast_fixture)
        self.assertEqual(result["completion"][0]["completed"], 1)
        self.assertEqual(result["completion"][0]["failed"], 0)
        from forecasting.models.demand import ProductScore
        scores = result["completion"][0]["scores"]
        self.assertEqual(len(scores), 1)
        score = ProductScore.model_validate(scores[0])
        self.assertEqual(score.variants, 2)
        self.assertEqual(str(UUID(score.product_id)), score.product_id)
        self.assertEqual(len(result["results"]), 2)
        for variant in result["results"]:
            self.assertEqual(len(variant["days"]), 7)
            self.assertEqual(variant["units"], sum(day["units"] for day in variant["days"]))
            self.assertAlmostEqual(variant["revenue"], sum(day["revenue"] for day in variant["days"]))
            self.assertTrue(all(day["units"] >= 0 and day["revenue"] == day["units"] * variant["price"] for day in variant["days"]))

    async def test_real_mba_worker_preserves_rule_identity_recipes_and_pricing(self):
        result = await self.run_fixture(mba_fixture)
        self.assertEqual(result["stats"], {"total_orders": 80, "products_analyzed": 3, "combos_found": 1})
        self.assertEqual(len(result["rules"]), 1)
        rule = result["rules"][0]
        self.assertEqual(rule["confidence"], 1)
        self.assertEqual(rule["lift"], 2)
        self.assertIsNone(rule["conviction"])
        self.assertTrue(rule["stable"])
        self.assertEqual(str(UUID(rule["product_a_id"])), rule["product_a_id"])
        self.assertEqual(len(rule["merged_ingredients"]), 1)
        self.assertEqual(rule["merged_ingredients"][0]["quantity_needed"], 2)
        self.assertGreaterEqual(rule["pricing"]["suggested_price"], rule["pricing"]["min_price"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
