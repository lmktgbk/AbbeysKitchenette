"""Manage one bounded asyncpg pool per process; child workers never share API connections."""
import asyncio
import asyncpg
from config import DATABASE_URL

_pool: asyncpg.Pool | None = None
_pool_lock = asyncio.Lock()


async def get_pool() -> asyncpg.Pool:
    """Serialize lazy initialization; failed creation leaves the pool unset for a later retry."""
    global _pool
    async with _pool_lock:
        if _pool is None:
            # Disable prepared-statement caching for Supabase transaction-pooler compatibility.
            _pool = await asyncpg.create_pool(
                DATABASE_URL, min_size=1, max_size=5, statement_cache_size=0,
                timeout=10, command_timeout=30,
            )
        return _pool


async def close_pool():
    """Detach and close once; force termination if graceful closure times out or is cancelled."""
    global _pool
    async with _pool_lock:
        pool, _pool = _pool, None
        if pool is not None:
            try:
                await asyncio.wait_for(pool.close(), timeout=10)
            except (TimeoutError, asyncio.CancelledError):
                pool.terminate()
                raise
