import asyncio
import asyncpg
from config import DATABASE_URL

_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def get_pool() -> asyncpg.Pool:
    global _pool
    async with _pool_lock:
        if _pool is None:
            _pool = await asyncpg.create_pool(
                DATABASE_URL, min_size=1, max_size=5, statement_cache_size=0,
                timeout=10, command_timeout=30,
            )
        return _pool


async def close_pool():
    global _pool
    async with _pool_lock:
        pool, _pool = _pool, None
        if pool is not None:
            try:
                await asyncio.wait_for(pool.close(), timeout=10)
            except (TimeoutError, asyncio.CancelledError):
                pool.terminate()
                raise
