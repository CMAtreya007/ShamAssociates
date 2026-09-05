import time
import logging
from typing import Any, Optional, Dict, Tuple

logger = logging.getLogger("cache_manager")

class FastRamCache:
    """
    Ultra-low latency in-memory TTL RAM cache for market data endpoints.
    Allows GET queries to return in sub-milliseconds (< 1ms).
    """
    def __init__(self, default_ttl: float = 60.0):
        self._cache: Dict[str, Tuple[float, Any]] = {}
        self._default_ttl = default_ttl

    def get(self, key: str) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        expires_at, val = entry
        if time.time() > expires_at:
            # Expired
            try:
                del self._cache[key]
            except KeyError:
                pass
            return None
        return val

    def set(self, key: str, value: Any, ttl: Optional[float] = None) -> None:
        duration = ttl if ttl is not None else self._default_ttl
        self._cache[key] = (time.time() + duration, value)

    def invalidate(self, prefix: Optional[str] = None) -> None:
        if not prefix:
            self._cache.clear()
            logger.info("FastRamCache cleared completely.")
        else:
            keys_to_delete = [k for k in self._cache if k.startswith(prefix)]
            for k in keys_to_delete:
                self._cache.pop(k, None)
            logger.info(f"FastRamCache cleared for prefix '{prefix}' ({len(keys_to_delete)} entries removed).")

# Global singleton cache instance
ram_cache = FastRamCache(default_ttl=45.0)

def get_ram_cache() -> FastRamCache:
    return ram_cache

def clear_all_data_caches():
    """Invalidates in-memory RAM cache across all data endpoints."""
    ram_cache.invalidate()
