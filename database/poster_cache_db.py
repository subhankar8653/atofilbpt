"""
poster_cache_db.py
==================
TMDB poster results ko MongoDB mein cache karta hai.
Har movie/series ka poster URL, rating, overview ek baar fetch karke
save ho jaata hai — next time seedha DB se milega, TMDB call nahi hoga.
"""

import logging
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from info import DATABASE_URI, DATABASE_NAME

logger = logging.getLogger(__name__)

# ── MongoDB connection ────────────────────────────────────────────────
_client = AsyncIOMotorClient(DATABASE_URI)
_db     = _client[DATABASE_NAME]
poster_col = _db["tmdb_poster_cache"]  # collection name


async def ensure_index():
    """Startup pe index banao — title+year pe fast lookup ke liye."""
    try:
        await poster_col.create_index(
            [("title_key", 1)],
            unique=True,
            background=True
        )
        logger.info("poster_cache: index ready")
    except Exception as e:
        logger.warning(f"poster_cache index error (ignored): {e}")


def _make_key(title: str, year: str | None) -> str:
    """Consistent lowercase key — spaces & special chars normalize karo."""
    t = (title or "").lower().strip().replace(" ", "_")
    y = str(year).strip() if year else "0"
    return f"{t}_{y}"


async def get_cached_poster(title: str, year: str | None) -> dict | None:
    """
    MongoDB se cached poster data fetch karo.
    Returns dict with keys: poster, posterMd, backdrop, rating, overview, type
    Returns None agar cache miss ho.
    """
    try:
        key = _make_key(title, year)
        doc = await poster_col.find_one({"title_key": key})
        if doc:
            logger.debug(f"poster_cache HIT: {title} ({year})")
            return {
                "id":       doc.get("tmdb_id"),
                "tmdbId":   doc.get("tmdb_id"),
                "title":    doc.get("title", title),
                "poster":   doc.get("poster"),
                "posterMd": doc.get("poster_md"),
                "backdrop": doc.get("backdrop"),
                "rating":   doc.get("rating"),
                "overview": doc.get("overview"),
                "type":     doc.get("media_type", "movie"),
                "year":     doc.get("year", year),
                "genreIds": doc.get("genre_ids", []),
            }
        return None
    except Exception as e:
        logger.error(f"poster_cache get error: {e}")
        return None


async def save_poster_cache(
    title: str,
    year: str | None,
    tmdb_data: dict
) -> bool:
    """
    TMDB se aaya data MongoDB mein save karo.
    Duplicate hone pe silently ignore karo (upsert).
    Returns True agar save hua.
    """
    try:
        key = _make_key(title, year)
        doc = {
            "title_key":  key,
            "title":      tmdb_data.get("title", title),
            "year":       tmdb_data.get("year", year),
            "tmdb_id":    tmdb_data.get("id"),
            "poster":     tmdb_data.get("poster"),
            "poster_md":  tmdb_data.get("posterMd"),
            "backdrop":   tmdb_data.get("backdrop"),
            "rating":     tmdb_data.get("rating"),
            "overview":   tmdb_data.get("overview"),
            "media_type": tmdb_data.get("type", "movie"),
            "genre_ids":  tmdb_data.get("genreIds", []),
            "cached_at":  datetime.now(timezone.utc),
        }
        await poster_col.update_one(
            {"title_key": key},
            {"$set": doc},
            upsert=True
        )
        logger.debug(f"poster_cache SAVED: {title} ({year})")
        return True
    except Exception as e:
        logger.error(f"poster_cache save error: {e}")
        return False


async def get_cache_stats() -> dict:
    """Total cached posters ka count return karo."""
    try:
        total = await poster_col.count_documents({})
        return {"total_cached": total}
    except Exception as e:
        logger.error(f"poster_cache stats error: {e}")
        return {"total_cached": 0}
