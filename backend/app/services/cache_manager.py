import time
import json
import logging
import asyncio
from typing import Any, Optional, Dict, Tuple, List
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger("cache_manager")

class HybridMultiTierCache:
    """
    High-Performance Multi-Tier Hybrid Cache System:
    - Layer 1 (L1): Ultra-fast In-Memory RAM Cache (< 0.05ms latency)
    - Layer 2 (L2): Distributed Redis Cache (async redis client with JSON serialization & auto TTL)
    - Layer 3 (L3): In-memory binary / export buffer cache for instant downloads
    """
    def __init__(self, default_ttl: float = 60.0):
        self._ram_cache: Dict[str, Tuple[float, Any]] = {}
        self._default_ttl = default_ttl
        self._redis_client = None
        self._redis_connected = False
        self._init_attempted = False

    async def _init_redis(self):
        """Asynchronously initializes the Redis connection if enabled."""
        if self._init_attempted:
            return
        self._init_attempted = True

        if not settings.ENABLE_REDIS or not settings.REDIS_URL:
            logger.info("Redis cache disabled by configuration. Operating in L1 FastRam mode.")
            return

        try:
            import redis.asyncio as aioredis
            self._redis_client = aioredis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_timeout=1.5,
                socket_connect_timeout=1.5
            )
            # Test ping
            await self._redis_client.ping()
            self._redis_connected = True
            logger.info(f"Connected to Redis cache at {settings.REDIS_URL}")
        except Exception as e:
            self._redis_connected = False
            self._redis_client = None
            logger.warning(f"Redis not reachable ({e}). Gracefully falling back to L1 in-memory RAM cache.")

    def _serialize(self, value: Any) -> str:
        """Serializes data structures and Pydantic models to JSON string."""
        def default_encoder(obj):
            if isinstance(obj, BaseModel):
                return obj.model_dump()
            if hasattr(obj, "isoformat"):
                return obj.isoformat()
            if hasattr(obj, "__dict__"):
                return obj.__dict__
            return str(obj)

        if isinstance(value, list) and value and isinstance(value[0], BaseModel):
            return json.dumps([item.model_dump() for item in value], default=default_encoder)
        elif isinstance(value, BaseModel):
            return json.dumps(value.model_dump(), default=default_encoder)
        return json.dumps(value, default=default_encoder)

    def get(self, key: str) -> Optional[Any]:
        """Synchronous L1 RAM lookup (sub-millisecond)."""
        entry = self._ram_cache.get(key)
        if entry is None:
            return None
        expires_at, val = entry
        if time.time() > expires_at:
            try:
                del self._ram_cache[key]
            except KeyError:
                pass
            return None
        return val

    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Synchronous L1 RAM set with background async Redis replication."""
        duration = ttl if ttl is not None else self._default_ttl
        self._ram_cache[key] = (time.time() + duration, value)

        # Trigger background task to replicate into Redis if available
        if self._redis_connected and self._redis_client:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self._set_redis(key, value, duration))
            except Exception:
                pass

    async def get_async(self, key: str) -> Optional[Any]:
        """Multi-Tier lookup: Checks L1 RAM first, then L2 Redis."""
        # 1. Check L1 RAM
        l1_val = self.get(key)
        if l1_val is not None:
            return l1_val

        # 2. Check L2 Redis
        if not self._init_attempted:
            await self._init_redis()

        if self._redis_connected and self._redis_client:
            try:
                cached_str = await self._redis_client.get(key)
                if cached_str:
                    parsed = json.loads(cached_str)
                    # Warm up L1 RAM from L2
                    self._ram_cache[key] = (time.time() + self._default_ttl, parsed)
                    return parsed
            except Exception as e:
                logger.debug(f"Redis get error for {key}: {e}")

        return None

    async def _set_redis(self, key: str, value: Any, ttl: float) -> None:
        """Helper to write to Redis asynchronously."""
        if not self._redis_connected or not self._redis_client:
            return
        try:
            val_str = self._serialize(value)
            await self._redis_client.set(key, val_str, ex=int(ttl))
        except Exception as e:
            logger.debug(f"Redis set error for {key}: {e}")

    async def set_async(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        """Multi-Tier set: Sets L1 RAM and L2 Redis simultaneously."""
        duration = ttl if ttl is not None else self._default_ttl
        self._ram_cache[key] = (time.time() + duration, value)
        await self._set_redis(key, value, duration)

    def invalidate(self, prefix: Optional[str] = None) -> None:
        """Invalidates L1 RAM cache and schedules L2 Redis invalidation."""
        if not prefix:
            self._ram_cache.clear()
            logger.info("MultiTierCache cleared L1 RAM completely.")
        else:
            keys_to_delete = [k for k in self._ram_cache if k.startswith(prefix)]
            for k in keys_to_delete:
                self._ram_cache.pop(k, None)
            logger.info(f"MultiTierCache cleared L1 RAM for prefix '{prefix}' ({len(keys_to_delete)} items).")

        if self._redis_connected and self._redis_client:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    loop.create_task(self._invalidate_redis(prefix))
            except Exception:
                pass

    async def _invalidate_redis(self, prefix: Optional[str] = None) -> None:
        """Asynchronously flushes Redis keys matching prefix."""
        if not self._redis_connected or not self._redis_client:
            return
        try:
            if not prefix:
                await self._redis_client.flushdb()
                logger.info("Flushed entire Redis cache database.")
            else:
                cursor = 0
                pattern = f"{prefix}*"
                while True:
                    cursor, keys = await self._redis_client.scan(cursor=cursor, match=pattern, count=100)
                    if keys:
                        await self._redis_client.delete(*keys)
                    if cursor == 0:
                        break
                logger.info(f"Deleted Redis keys matching pattern '{pattern}'.")
        except Exception as e:
            logger.warning(f"Error invalidating Redis cache: {e}")

# Global singleton hybrid cache instance
ram_cache = HybridMultiTierCache(default_ttl=60.0)

def get_ram_cache() -> HybridMultiTierCache:
    return ram_cache

def clear_all_data_caches():
    """Invalidates all multi-tier cache layers (L1 RAM + L2 Redis) across data endpoints."""
    ram_cache.invalidate()
