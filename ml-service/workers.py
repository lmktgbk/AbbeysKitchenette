"""Supervise bounded child processes; CPU/model work never runs in the API loop."""
import asyncio
import logging
import multiprocessing
import os
import signal
import subprocess
import threading
from config import ML_JOB_TIMEOUT_SECONDS
from database import close_pool
from jobs import HEARTBEAT_SECONDS, WORKER_OWNER, fail_owned_job, renew_lease, recover_expired_jobs

logger = logging.getLogger(__name__)
_tasks = set()


def _terminate_tree(pid):
    """Stop the worker and native model subprocesses using the platform process-tree mechanism."""
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True,
                       timeout=5, creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        os.killpg(pid, signal.SIGTERM)


def _worker_main(kind, job_id, owner, params):
    """Create an isolated event loop/pool and bind lease ownership before running the selected pipeline."""
    if os.name != "nt":
        os.setsid()
    parent = multiprocessing.parent_process()
    finished = threading.Event()
    def watch_parent():
        # The worker event loop can be occupied by native fitting; use a separate monitor.
        while not finished.wait(1):
            if parent is not None and not parent.is_alive():
                try:
                    _terminate_tree(os.getpid())
                finally:
                    os._exit(1)
    threading.Thread(target=watch_parent, daemon=True).start()
    async def run():
        WORKER_OWNER.set(owner)
        try:
            if kind == "forecast":
                from forecasting.services.demand_forecast import run_demand_forecast
                await run_demand_forecast(job_id=job_id)
            else:
                from mba.services.fpgrowth import run_market_basket_analysis, save_results_to_db
                result = await run_market_basket_analysis(**params)
                await save_results_to_db(job_id, result["rules"], result["stats"])
        finally:
            await close_pool()
    # Spawn gives each worker its own event loop and database connections on all platforms.
    try:
        asyncio.run(run())
    finally:
        finished.set()


def _new_process(kind, job_id, owner, params):
    """Spawn without inheriting an active API event loop or database pool."""
    return multiprocessing.get_context("spawn").Process(
        target=_worker_main, args=(kind, job_id, owner, params), daemon=True,
    )


async def _stop_process(process):
    """Attempt tree shutdown, join off the API loop, then kill a surviving worker and release its handle."""
    if process.is_alive():
        # Prophet starts native subprocesses; stop the worker's tree as well as Python.
        if os.name == "nt":
            try:
                await asyncio.to_thread(_terminate_tree, process.pid)
            except (OSError, subprocess.TimeoutExpired):
                process.terminate()
        else:
            try:
                _terminate_tree(process.pid)
            except ProcessLookupError:
                process.terminate()
    await asyncio.to_thread(process.join, 5)
    if process.is_alive():
        process.kill()
        await asyncio.to_thread(process.join, 5)
    process.close()


async def _supervise(kind, job_id, owner, params):
    """Renew ownership until completion, timeout, or lease loss; stop computation before conditional failure cleanup."""
    process = None
    started = False
    message = "ML worker stopped before publishing results"
    try:
        process = _new_process(kind, job_id, owner, params)
        process.start()
        started = True
        loop = asyncio.get_running_loop()
        started_at = loop.time()
        next_heartbeat = loop.time() + HEARTBEAT_SECONDS
        while process.is_alive():
            if loop.time() - started_at >= ML_JOB_TIMEOUT_SECONDS:
                message = "ML worker exceeded its execution deadline"
                break
            await asyncio.sleep(0.25)
            if loop.time() >= next_heartbeat:
                if not await renew_lease(kind, job_id, owner):
                    message = "ML worker lost execution ownership"
                    break
                next_heartbeat = loop.time() + HEARTBEAT_SECONDS
    except asyncio.CancelledError:
        message = "ML service shut down before job completion"
        raise
    except Exception:
        logger.exception("ML worker supervision failed: kind=%s job=%s", kind, job_id)
    finally:
        try:
            if started:
                await _stop_process(process)
            elif process is not None:
                process.close()
        except Exception:
            logger.error("ML worker termination failed: kind=%s job=%s", kind, job_id)
        # Conditional failure cannot overwrite successfully published work or another owner.
        try:
            await fail_owned_job(kind, job_id, owner, message)
        except Exception:
            logger.error("ML job recovery deferred until lease expiry: kind=%s job=%s", kind, job_id)


def launch_job(kind, job_id, owner, params=None):
    """Retain the supervisor for shutdown; its task represents supervision, not the model result."""
    task = asyncio.create_task(_supervise(kind, job_id, owner, params or {}))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
    return task


def start_recovery():
    """Schedule expired-lease cleanup; database failure defers recovery to the next cycle."""
    async def reap():
        while True:
            await asyncio.sleep(HEARTBEAT_SECONDS)
            try:
                await recover_expired_jobs()
            except Exception:
                logger.warning("ML lease recovery delayed: database unavailable")
    task = asyncio.create_task(reap())
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


async def stop_workers():
    """Cancel and await tracked tasks so child shutdown finishes before the API pool closes."""
    tasks = list(_tasks)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)
