"""Audit characterizations. No real DB/ML runs; all DB operations are fake."""
import asyncio
import importlib
import sys
import types
import unittest
import httpx
from unittest.mock import patch, AsyncMock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ml-service"))
config = types.ModuleType("config")
config.DATABASE_URL = "postgresql://audit:fake@127.0.0.1/audit_not_connected"
config.CLIENT_URL = "http://127.0.0.1:5189"
config.FORECASTER_URL = "http://127.0.0.1:5000"
config.FORECAST_PORT = 8000
config.FORECAST_HOST = "127.0.0.1"
config.ML_SERVICE_KEY = "a" * 64
sys.modules["config"] = config

async def noop(*args, **kwargs):
    pass

fake_forecast = types.ModuleType("forecasting.services.demand_forecast")
fake_forecast.run_demand_forecast = noop
fake_forecast.cleanup_stale_jobs = noop
fake_forecast.fail_job = noop
sys.modules[fake_forecast.__name__] = fake_forecast
fake_data = types.ModuleType("forecasting.services.data_loader")
fake_data.load_recipe_map = noop
fake_data.load_current_stock = noop
sys.modules[fake_data.__name__] = fake_data
fake_mba = types.ModuleType("mba.services.fpgrowth")
fake_mba.run_market_basket_analysis = noop
fake_mba.save_results_to_db = noop
fake_mba.mark_job_failed = noop
sys.modules[fake_mba.__name__] = fake_mba

database = importlib.import_module("database")
demand = importlib.import_module("forecasting.routers.demand")
mba = importlib.import_module("mba.routers.association")
app = importlib.import_module("main").app

class Audit(unittest.IsolatedAsyncioTestCase):
    async def test_concurrent_pool_initialization_creates_two_pools(self):
        original = database.asyncpg.create_pool
        calls = []
        barrier = asyncio.Event()
        async def create(*args, **kwargs):
            calls.append(object())
            if len(calls) == 2:
                barrier.set()
            await barrier.wait()
            return calls[-1] if len(calls) == 1 else object()
        database._pool = None
        database.asyncpg.create_pool = create
        try:
            results = await asyncio.gather(database.get_pool(), database.get_pool())
            self.assertEqual(len(calls), 2)
            self.assertIsNot(results[0], results[1])
        finally:
            database._pool = None
            database.asyncpg.create_pool = original

    async def test_concurrent_forecast_run_creates_two_jobs(self):
        class Pool:
            def __init__(self):
                self.checks = 0
                self.next_id = 0
                self.barrier = asyncio.Event()
            async def fetchrow(self, sql, *args):
                if sql.startswith("SELECT"):
                    self.checks += 1
                    if self.checks == 2:
                        self.barrier.set()
                    await self.barrier.wait()
                    return None
                self.next_id += 1
                return {"id": self.next_id}
        pool = Pool()
        original = demand.get_pool
        async def fake_pool():
            return pool
        demand.get_pool = fake_pool
        demand._active_jobs.clear()
        try:
            results = await asyncio.gather(demand.start_demand_forecast(None), demand.start_demand_forecast(None))
            self.assertEqual(len(set(x.job_id for x in results)), 2)
            await asyncio.sleep(0)
        finally:
            demand.get_pool = original
            demand._active_jobs.clear()

    async def test_all_routes_reject_unauthenticated_requests_before_database_access(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            routes = list(demand.router.routes) + list(mba.router.routes) + [route for route in app.routes if getattr(route, "path", None) == "/health"]
            for route in routes:
                path = route.path.replace("{job_id}", "1")
                for method in route.methods:
                    with self.subTest(path=path, method=method):
                        with patch.object(demand, "get_pool", AsyncMock()) as forecast_pool, patch.object(mba, "get_pool", AsyncMock()) as mba_pool:
                            response = await client.request(method, path, json={})
                            self.assertEqual(response.status_code, 401, response.text)
                            forecast_pool.assert_not_awaited()
                            mba_pool.assert_not_awaited()
                        self.assertNotIn("access-control-allow-origin", response.headers)

    async def test_wrong_and_non_ascii_credentials_are_rejected(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            for key in [b"incorrect", b"\xff"]:
                response = await client.get("/health", headers={b"X-ML-Service-Key": key})
                self.assertEqual(response.status_code, 401)

    async def test_matching_credential_allows_health(self):
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/health", headers={"X-ML-Service-Key": config.ML_SERVICE_KEY})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], "ok")
            for path in ["/docs", "/redoc", "/openapi.json"]:
                self.assertEqual((await client.get(path)).status_code, 404)

    async def test_authorized_business_reads_flow_through_database_and_response(self):
        pool = types.SimpleNamespace(fetch=AsyncMock(return_value=[]))
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            for module, path in [(demand, "/forecast/demand/history"), (mba, "/mba/jobs")]:
                with patch.object(module, "get_pool", AsyncMock(return_value=pool)):
                    response = await client.get(path, headers={"X-ML-Service-Key": config.ML_SERVICE_KEY})
                    self.assertEqual(response.status_code, 200, response.text)
            self.assertEqual(pool.fetch.await_count, 2)

    async def test_missing_configuration_fails_closed_before_startup_cleanup(self):
        main = importlib.import_module("main")
        cleanup = AsyncMock()
        with patch("security.ML_SERVICE_KEY", ""), patch.object(fake_forecast, "cleanup_stale_jobs", cleanup):
            with self.assertRaisesRegex(RuntimeError, "ML_SERVICE_KEY"):
                async with main.lifespan(app):
                    self.fail("Startup must reject missing credentials")
            cleanup.assert_not_awaited()
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                self.assertEqual((await client.get("/health")).status_code, 503)

if __name__ == "__main__":
    unittest.main(verbosity=2)
