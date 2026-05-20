from aiohttp import web
import re
import math
import logging
import secrets
import time
import mimetypes
import aiohttp as aiohttp_client
from aiohttp.http_exceptions import BadStatusLine
from LucyBot.Bot import multi_clients, work_loads, Codeflix
from LucyBot.server.exceptions import FIleNotFound, InvalidHash
from LucyBot.zzint import StartTime, __version__
from LucyBot.util.custom_dl import ByteStreamer
from LucyBot.util.time_format import get_readable_time
from LucyBot.util.render_template import render_page
from database.ia_filterdb import get_search_results
from database.poster_cache_db import get_cached_poster, save_poster_cache, get_cache_stats, ensure_index
from info import *


routes = web.RouteTableDef()

# ── CORS middleware — website se API call ke liye zaroori ─────────────────────
@web.middleware
async def cors_middleware(request, handler):
    if request.method == "OPTIONS":
        return web.Response(headers={
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        })
    response = await handler(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

# ── /api/search — website ke liye file search endpoint ───────────────────────
@routes.get("/api/search")
async def api_search_handler(request: web.Request):
    try:
        q        = request.rel_url.query.get("q", "").strip()
        quality  = request.rel_url.query.get("quality",  "All")
        language = request.rel_url.query.get("language", "All")
        limit    = min(int(request.rel_url.query.get("limit", "20")), 50)

        # Multi-word search ke liye smart approach:
        # Pehle exact query try karo, agar 0 results aaye to
        # har word alag alag search karo aur intersection lo
        search_q = q or "."
        files, _, total = await get_search_results(None, search_q, max_results=limit * 3)

        # Agar results nahi mile aur query multi-word hai,
        # to words ko individually match karo (fuzzy approach)
        if total == 0 and q and " " in q:
            words = [w for w in q.split() if len(w) > 2]
            if words:
                # Sabse unique/rare word se search karo
                best_word = max(words, key=len)
                files, _, total = await get_search_results(None, best_word, max_results=limit * 5)
                # Ab filter karo — sirf woh results rakho jisme baaki words bhi hain
                remaining_words = [w for w in words if w != best_word]
                filtered = []
                for f in files:
                    fname = (f.file_name or "").lower()
                    cap = (f.caption or "").lower()
                    combined = fname + " " + cap
                    if all(w.lower() in combined for w in remaining_words):
                        filtered.append(f)
                files = filtered

        def clean_file_name(name):
            """@ username aur channel promotion remove karo"""
            # @username patterns remove karo
            name = re.sub(r'@\S+', '', name)
            # [channel] ya (channel) patterns remove karo
            name = re.sub(r'\[.*?@.*?\]|\(.*?@.*?\)', '', name)
            # www.domain.com patterns remove karo
            name = re.sub(r'www\.\S+', '', name, flags=re.IGNORECASE)
            # t.me links remove karo
            name = re.sub(r't\.me/\S+', '', name, flags=re.IGNORECASE)
            # Extra spaces clean karo
            name = re.sub(r'\s+', ' ', name).strip()
            return name

        result = []
        seen_names = set()  # Duplicate results avoid karne ke liye
        for f in files:
            raw_name = f.file_name or ""
            name = clean_file_name(raw_name)
            if quality != "All":
                if not re.search(quality, raw_name, re.IGNORECASE):
                    continue
            if language != "All":
                if not re.search(language, raw_name, re.IGNORECASE):
                    continue
            result.append({
                "file_id":   f.file_id,
                "file_name": name,
                "file_size": f.file_size or 0,
                "caption":   f.caption or "",
            })

        return web.json_response({"files": result, "total": len(result)})

    except Exception as e:
        logging.error(f"API search error: {e}")
        return web.json_response({"files": [], "total": 0}, status=500)


# ── /api/poster — TMDB se movie poster fetch karna ───────────────────────────
@routes.get("/api/poster")
async def api_poster_handler(request: web.Request):
    """
    TMDB API se movie/series poster fetch karta hai.
    Usage: /api/poster?title=Inception&year=2010
    TMDB_API_KEY env variable mein set karo Railway mein.
    """
    try:
        title = request.rel_url.query.get("title", "").strip()
        year  = request.rel_url.query.get("year", "").strip()
        if not title:
            return web.json_response({"poster": None, "error": "title required"}, status=400)

        tmdb_key = getattr(__import__('info'), 'TMDB_API_KEY', '') or ""
        if not tmdb_key:
            return web.json_response({"poster": None, "error": "TMDB_API_KEY not set"}, status=200)

        headers = {"Authorization": f"Bearer {tmdb_key}", "accept": "application/json"}
        base_img = "https://image.tmdb.org/t/p/w500"

        async with aiohttp_client.ClientSession() as session:
            # Search movie first
            params = {"query": title, "language": "en-US", "page": 1}
            if year:
                params["year"] = year

            result = None

            # Try movie search
            async with session.get(
                "https://api.themoviedb.org/3/search/movie",
                params=params, headers=headers,
                timeout=aiohttp_client.ClientTimeout(total=6)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    results = data.get("results", [])
                    if results:
                        result = results[0]
                        media_type = "movie"

            # If not found, try TV search
            if not result:
                tv_params = {"query": title, "language": "en-US", "page": 1}
                async with session.get(
                    "https://api.themoviedb.org/3/search/tv",
                    params=tv_params, headers=headers,
                    timeout=aiohttp_client.ClientTimeout(total=6)
                ) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        results = data.get("results", [])
                        if results:
                            result = results[0]
                            media_type = "tv"

            if not result:
                return web.json_response({"poster": None})

            poster_path = result.get("poster_path")
            poster_url  = f"{base_img}{poster_path}" if poster_path else None
            rating      = result.get("vote_average")
            imdb_rating = f"{rating:.1f}" if rating else "N/A"
            plot        = result.get("overview", "")
            genre       = ""

            # Fetch genre names
            item_id = result.get("id")
            if item_id:
                detail_url = f"https://api.themoviedb.org/3/{media_type}/{item_id}"
                async with session.get(
                    detail_url, headers=headers,
                    timeout=aiohttp_client.ClientTimeout(total=5)
                ) as dresp:
                    if dresp.status == 200:
                        ddata = await dresp.json()
                        genres = ddata.get("genres", [])
                        genre  = ", ".join(g["name"] for g in genres[:3])

            return web.json_response({
                "poster":      poster_url,
                "imdb_rating": imdb_rating,
                "genre":       genre,
                "plot":        plot,
            })

    except Exception as e:
        logging.error(f"Poster API error: {e}")
        return web.json_response({"poster": None})


# ── /api/poster-cache GET — MongoDB se cached poster check karo ──────────────
@routes.get("/api/poster-cache")
async def api_poster_cache_get(request: web.Request):
    """
    Pehle MongoDB check karo — agar cached hai toh TMDB call mat karo.
    Usage: /api/poster-cache?title=Inception&year=2010
    """
    try:
        title = request.rel_url.query.get("title", "").strip()
        year  = request.rel_url.query.get("year",  "").strip() or None
        if not title:
            return web.json_response({"cached": False, "data": None}, status=400)

        data = await get_cached_poster(title, year)
        if data:
            return web.json_response({"cached": True, "data": data})
        return web.json_response({"cached": False, "data": None})

    except Exception as e:
        logging.error(f"poster-cache GET error: {e}")
        return web.json_response({"cached": False, "data": None}, status=500)


# ── /api/poster-cache POST — TMDB result save karo + log channel pe bhejo ────
@routes.post("/api/poster-cache")
async def api_poster_cache_post(request: web.Request):
    """
    Frontend TMDB se fetch karne ke baad yahan bheje —
    MongoDB mein save hoga aur LOG_CHANNEL pe message jayega.
    Body: { title, year, tmdb_data: { poster, posterMd, rating, ... } }
    """
    try:
        body = await request.json()
        title     = (body.get("title") or "").strip()
        year      = str(body.get("year") or "").strip() or None
        tmdb_data = body.get("tmdb_data") or {}

        if not title or not tmdb_data.get("poster"):
            return web.json_response({"saved": False, "reason": "title/poster missing"}, status=400)

        # 1. MongoDB mein save karo
        saved = await save_poster_cache(title, year, tmdb_data)

        # 2. LOG_CHANNEL pe message bhejo (sirf agar save hua)
        if saved:
            try:
                rating   = tmdb_data.get("rating") or "N/A"
                mtype    = tmdb_data.get("type", "movie").capitalize()
                year_str = tmdb_data.get("year") or year or "?"
                poster   = tmdb_data.get("poster") or ""
                stats    = await get_cache_stats()
                total    = stats.get("total_cached", "?")

                msg = (
                    f"🎬 **Poster Cached!**\n\n"
                    f"**Title:** {title}\n"
                    f"**Year:** {year_str}\n"
                    f"**Type:** {mtype}\n"
                    f"**Rating:** ⭐ {rating}\n"
                    f"**Poster:** [Link]({poster})\n\n"
                    f"📦 **Total Cached:** {total}"
                )
                await Codeflix.send_message(LOG_CHANNEL, msg, disable_web_page_preview=False)
            except Exception as log_err:
                logging.warning(f"Log channel send failed (ignored): {log_err}")

        return web.json_response({"saved": saved})

    except Exception as e:
        logging.error(f"poster-cache POST error: {e}")
        return web.json_response({"saved": False}, status=500)



# ── /api/trending — trending/latest files fetch karna ────────────────────────
@routes.get("/api/trending")
async def api_trending_handler(request: web.Request):
    """
    Latest indexed files return karta hai — homepage categories ke liye.
    category param: all | series | movies | hindi | malayalam | tamil
    """
    try:
        category = request.rel_url.query.get("category", "all").lower()
        limit    = min(int(request.rel_url.query.get("limit", "12")), 30)

        # Category ke hisaab se search query set karo
        query_map = {
            "series":   "S0",          # S01, S02 etc wale series hain
            "movies":   ".",
            "hindi":    "Hindi",
            "malayalam":"Malayalam",
            "tamil":    "Tamil",
            "telugu":   "Telugu",
            "all":      ".",
        }
        q = query_map.get(category, ".")
        files, _, total = await get_search_results(None, q, max_results=limit)

        result = []
        for f in files:
            name = f.file_name or ""
            result.append({
                "file_id":   f.file_id,
                "file_name": name,
                "file_size": f.file_size or 0,
                "caption":   f.caption or "",
            })

        return web.json_response({"files": result, "total": len(result)})

    except Exception as e:
        logging.error(f"Trending API error: {e}")
        return web.json_response({"files": [], "total": 0}, status=500)


@routes.get("/", allow_head=True)
async def root_route_handler(_):
    return web.json_response({
        "server_status": "running",
        "uptime": get_readable_time(time.time() - StartTime),
        "connected_bots": len(multi_clients),
        "version": __version__,
    })


@routes.get(r"/watch/{path:\S+}", allow_head=True)
async def stream_watch_handler(request: web.Request):
    try:
        path = request.match_info["path"]
        match = re.search(r"^([a-zA-Z0-9_-]{6})(\d+)$", path)
        if match:
            secure_hash = match.group(1)
            id = int(match.group(2))
        else:
            id = int(re.search(r"(\d+)(?:\/\S+)?", path).group(1))
            secure_hash = request.rel_url.query.get("hash")
        return web.Response(
            text=await render_page(id, secure_hash), content_type="text/html"
        )
    except InvalidHash as e:
        raise web.HTTPForbidden(text=e.message)
    except FIleNotFound as e:
        raise web.HTTPNotFound(text=e.message)
    except (AttributeError, BadStatusLine, ConnectionResetError):
        return web.Response(status=400, text="Bad Request")
    except Exception as e:
        logging.critical(e)
        raise web.HTTPInternalServerError(text=str(e))


@routes.get(r"/dl/{path:\S+}", allow_head=True)
async def download_handler(request: web.Request):
    try:
        path = request.match_info["path"]
        match = re.search(r"^([a-zA-Z0-9_-]{6})(\d+)$", path)
        if match:
            secure_hash = match.group(1)
            id = int(match.group(2))
        else:
            id = int(re.search(r"(\d+)(?:\/\S+)?", path).group(1))
            secure_hash = request.rel_url.query.get("hash")
        return await media_streamer(request, id, secure_hash, disposition="attachment")
    except InvalidHash as e:
        raise web.HTTPForbidden(text=e.message)
    except FIleNotFound as e:
        raise web.HTTPNotFound(text=e.message)
    except (AttributeError, BadStatusLine, ConnectionResetError):
        return web.Response(status=400, text="Bad Request")
    except Exception as e:
        logging.critical(e)
        raise web.HTTPInternalServerError(text=str(e))


@routes.get(r"/{path:\S+}", allow_head=True)
async def stream_handler(request: web.Request):
    try:
        path = request.match_info["path"]
        match = re.search(r"^([a-zA-Z0-9_-]{6})(\d+)$", path)
        if match:
            secure_hash = match.group(1)
            id = int(match.group(2))
        else:
            id = int(re.search(r"(\d+)(?:\/\S+)?", path).group(1))
            secure_hash = request.rel_url.query.get("hash")
        return await media_streamer(request, id, secure_hash)
    except InvalidHash as e:
        raise web.HTTPForbidden(text=e.message)
    except FIleNotFound as e:
        raise web.HTTPNotFound(text=e.message)
    except (AttributeError, BadStatusLine, ConnectionResetError):
        return web.Response(status=400, text="Bad Request")
    except Exception as e:
        logging.critical(e)
        raise web.HTTPInternalServerError(text=str(e))


class_cache = {}


async def media_streamer(request: web.Request, id: int, secure_hash: str, disposition: str = "inline"):
    range_header = request.headers.get("Range", None)

    index = min(work_loads, key=work_loads.get)
    faster_client = multi_clients[index]

    if MULTI_CLIENT:
        logging.info(f"Client {index} is now serving: {request.remote}")

    tg_connect = class_cache.get(faster_client) or ByteStreamer(faster_client)
    class_cache[faster_client] = tg_connect

    file_id = await tg_connect.get_file_properties(id)

    if file_id.unique_id[:6] != secure_hash:
        logging.debug(f"Invalid hash for message with ID {id}")
        raise InvalidHash

    file_size = file_id.file_size

    if range_header:
        try:
            match = re.match(r"bytes=(\d+)-(\d*)", range_header)
            from_bytes = int(match.group(1))
            until_bytes = int(match.group(2)) if match.group(2) else file_size - 1
        except Exception:
            return web.Response(status=400, text="Invalid Range header")
    else:
        from_bytes = 0
        until_bytes = file_size - 1

    if until_bytes >= file_size or from_bytes < 0 or until_bytes < from_bytes:
        return web.Response(
            status=416,
            text="416: Range Not Satisfiable",
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    chunk_size = 1024 * 1024
    offset = from_bytes - (from_bytes % chunk_size)
    first_part_cut = from_bytes - offset
    last_part_cut = until_bytes % chunk_size + 1
    part_count = math.ceil(until_bytes / chunk_size) - math.floor(offset / chunk_size)
    req_length = until_bytes - from_bytes + 1

    mime_type = file_id.mime_type or "application/octet-stream"
    file_name = file_id.file_name
    if not file_name:
        try:
            file_name = f"{secrets.token_hex(2)}.{mime_type.split('/')[1]}"
        except (IndexError, AttributeError):
            file_name = f"{secrets.token_hex(2)}.unknown"

    response = web.StreamResponse(
        status=206 if range_header else 200,
        reason="Partial Content" if range_header else "OK",
        headers={
            "Content-Type": mime_type,
            "Content-Length": str(req_length),
            "Content-Range": f"bytes {from_bytes}-{until_bytes}/{file_size}",
            "Content-Disposition": f'{disposition}; filename="{file_name}"',
            "Accept-Ranges": "bytes",
        },
    )

    await response.prepare(request)

    try:
        async for chunk in tg_connect.yield_file(
            file_id, index, offset, first_part_cut, last_part_cut, part_count, chunk_size
        ):
            await response.write(chunk)
    except Exception as e:
        logging.exception(f"Error streaming file: {e}")
    finally:
        await response.write_eof()

    return response
