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


# ── Log channel queue — FLOOD_WAIT se bachne ke liye ────────────────────────
import asyncio as _asyncio
_log_queue = _asyncio.Queue()
_log_task_started = False

async def _log_channel_worker():
    """
    Background worker — ek queue se ek ek message bhejo, 5 second gap ke saath.
    Telegram flood wait se permanently bach jayenge.
    """
    while True:
        msg = await _log_queue.get()
        try:
            await Codeflix.send_message(LOG_CHANNEL, msg, disable_web_page_preview=False)
        except Exception as e:
            logging.warning(f"Log queue send failed: {e}")
        finally:
            _log_queue.task_done()
        await _asyncio.sleep(5)  # 5 second gap — Telegram rate limit safe

def _ensure_log_worker():
    global _log_task_started
    if not _log_task_started:
        _asyncio.get_event_loop().create_task(_log_channel_worker())
        _log_task_started = True

def _enqueue_log(msg: str):
    """Non-blocking — queue mein daal do, worker bhej dega."""
    _ensure_log_worker()
    try:
        _log_queue.put_nowait(msg)
    except Exception:
        pass  # Queue full ho toh silently drop karo


# ── /api/poster-cache POST — TMDB result save karo + log channel pe bhejo ────
@routes.post("/api/poster-cache")
async def api_poster_cache_post(request: web.Request):
    """
    Frontend TMDB se fetch karne ke baad yahan bheje —
    MongoDB mein save hoga aur LOG_CHANNEL pe queue message jayega.
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

        # 2. Queue mein daal do — worker 5sec gap se bhejega (no flood wait!)
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
                _enqueue_log(msg)  # ✅ Queue — no direct send, no flood wait
            except Exception as log_err:
                logging.warning(f"Log enqueue failed (ignored): {log_err}")

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


# ── Expiry Link Store (in-memory) ─────────────────────────────────────────────
# token -> {"watch_url": ..., "download_url": ..., "expires_at": float}
_expiry_store: dict = {}

def _cleanup_expired():
    """Purane expired tokens hata do."""
    now = time.time()
    expired = [k for k, v in _expiry_store.items() if v["expires_at"] < now]
    for k in expired:
        del _expiry_store[k]

# ── /api/check-fsub — Website ke liye FSub status check ──────────────────────
@routes.get("/api/check-fsub")
async def api_check_fsub(request: web.Request):
    """
    Website se call hota hai watch/download se pehle.
    user_id pass karo — agar fsub join nahi kiya toh channels list return karo.

    Response:
      { "ok": true }                         → user joined hai, proceed karo
      { "ok": false, "channels": [...] }     → user ne join nahi kiya, channels dikhao
    """
    try:
        user_id_str = request.rel_url.query.get("user_id", "").strip()
        if not user_id_str:
            return web.json_response({"ok": True})  # user_id nahi diya — bypass

        try:
            user_id = int(user_id_str)
        except ValueError:
            return web.json_response({"ok": True})

        from database.users_chats_db import db as _db
        from info import MULTI_FSUB

        # Premium bypass
        if await _db.has_premium_access(user_id):
            return web.json_response({"ok": True})

        db_channels = await _db.get_fsub_channels()
        channels = db_channels if db_channels else MULTI_FSUB
        if not channels:
            return web.json_response({"ok": True})

        from pyrogram.errors.exceptions.bad_request_400 import UserNotParticipant
        from pyrogram.enums import ChatMemberStatus as CMS

        not_joined = []
        for ch_id in channels:
            try:
                mode = await _db.get_channel_mode(ch_id)
                # Request mode: DB check pehle
                if mode == "on" and await _db.req_user_exist(ch_id, user_id):
                    continue
                m = await Codeflix.get_chat_member(ch_id, user_id)
                if m.status == CMS.BANNED:
                    not_joined.append(ch_id)
                elif m.status not in {CMS.OWNER, CMS.ADMINISTRATOR, CMS.MEMBER}:
                    not_joined.append(ch_id)
            except UserNotParticipant:
                not_joined.append(ch_id)
            except Exception:
                continue  # Error = assume joined

        if not not_joined:
            return web.json_response({"ok": True})

        # Channel info aur join links collect karo
        channel_list = []
        for ch_id in not_joined:
            try:
                chat_obj = await Codeflix.get_chat(ch_id)
                mode = await _db.get_channel_mode(ch_id)
                if mode == "on" and not chat_obj.username:
                    inv = await Codeflix.create_chat_invite_link(
                        chat_id=ch_id, creates_join_request=True
                    )
                    link = inv.invite_link
                elif chat_obj.username:
                    link = f"https://t.me/{chat_obj.username}"
                else:
                    inv = await Codeflix.create_chat_invite_link(chat_id=ch_id)
                    link = inv.invite_link
                custom_name = await _db.get_fsub_channel_name(ch_id)
                title = custom_name if custom_name else chat_obj.title
                channel_list.append({"title": title, "link": link})
            except Exception:
                channel_list.append({"title": "Join Channel", "link": "https://t.me/"})

        return web.json_response({"ok": False, "channels": channel_list})

    except Exception as e:
        logging.error(f"/api/check-fsub error: {e}")
        return web.json_response({"ok": True})  # Error hone pe block mat karo


# ── /api/get-links — Website ke liye Fast Download + Watch Online URLs ────────
from urllib.parse import quote_plus as _qp
from LucyBot.util.file_properties import get_name as _get_name, get_hash as _get_hash

@routes.get("/api/get-links")
async def api_get_links(request: web.Request):
    """
    file_id lekar LOG_CHANNEL mein forward karo,
    phir watch URL aur download URL return karo.

    Optional param: expiry=<minutes>  (default: 0 = no expiry)
    Agar expiry diya toh ek token-based URL milega jo X minutes baad dead ho jayega.

    Usage:
      /api/get-links?file_id=<id>            → normal (no expiry)
      /api/get-links?file_id=<id>&expiry=30  → 30 min expiry link
      /api/get-links?file_id=<id>&expiry=60  → 60 min expiry link
    """
    file_id     = request.rel_url.query.get("file_id", "").strip()
    expiry_mins = request.rel_url.query.get("expiry", "").strip()

    if not file_id:
        return web.json_response({"error": "file_id required"}, status=400)

    # Agar expiry param nahi diya toh LINK_EXPIRY_TIME (seconds) se default lo
    import info as _info_mod
    default_expiry_sec = _info_mod.LINK_EXPIRY_TIME  # runtime mein updated value milegi

    if expiry_mins == "":
        # Default: LINK_EXPIRY_TIME seconds (0 = no expiry)
        expiry_sec = default_expiry_sec
    else:
        try:
            expiry_sec = int(expiry_mins) * 60
        except ValueError:
            expiry_sec = default_expiry_sec

    try:
        log_msg = await Codeflix.send_cached_media(
            chat_id=LOG_CHANNEL,
            file_id=file_id,
        )
        file_name = _qp(_get_name(log_msg))
        hash_val  = _get_hash(log_msg)
        msg_id    = log_msg.id

        base = URL.rstrip("/")
        watch_url    = f"{base}/watch/{msg_id}/{file_name}?hash={hash_val}"
        download_url = f"{base}/dl/{msg_id}?hash={hash_val}"

        if expiry_sec > 0:
            # Expiry token generate karo
            _cleanup_expired()
            token = secrets.token_urlsafe(16)
            expires_at = time.time() + expiry_sec
            _expiry_store[token] = {
                "watch_url":    watch_url,
                "download_url": download_url,
                "expires_at":   expires_at,
            }
            # Token-wrapped URLs — inhi se access hoga
            watch_url    = f"{base}/tlink/{token}/watch"
            download_url = f"{base}/tlink/{token}/dl"
            expiry_mins_label = expiry_sec // 60
            expires_in_str = f"{expiry_mins_label} minute{'s' if expiry_mins_label != 1 else ''}" if expiry_mins_label >= 1 else f"{expiry_sec} seconds"
            return web.json_response({
                "watch_url":    watch_url,
                "download_url": download_url,
                "token":        token,
                "expires_in":   expiry_sec,
                "expires_label": expires_in_str,
                "note":         f"Link {expires_in_str} baad expire ho jayega ⏳",
            })

        return web.json_response({
            "watch_url":    watch_url,
            "download_url": download_url,
        })
    except Exception as e:
        logging.error(f"/api/get-links error: {e}")
        return web.json_response({"error": str(e)}, status=500)


# ── /tlink/<token>/<type> — Expiry token redirect handler ─────────────────────
@routes.get(r"/tlink/{token}/{link_type}", allow_head=True)
async def tlink_handler(request: web.Request):
    """
    Token-based expiry link handler.
    - Valid token + unexpired  → real URL pe redirect karo
    - Expired ya invalid token → 410 Gone return karo
    """
    token     = request.match_info.get("token", "")
    link_type = request.match_info.get("link_type", "watch")  # watch | dl

    entry = _expiry_store.get(token)

    if not entry:
        return web.Response(
            status=410,
            text="❌ Link expired ya invalid hai. Kripya dobara search karein.",
            content_type="text/plain",
        )

    if time.time() > entry["expires_at"]:
        # Expired — store se hata do
        _expiry_store.pop(token, None)
        return web.Response(
            status=410,
            text="⏳ Link ki validity khatam ho gayi. Kripya dobara search karein.",
            content_type="text/plain",
        )

    # Valid — actual URL pe redirect
    target = entry["watch_url"] if link_type == "watch" else entry["download_url"]
    raise web.HTTPFound(location=target)


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
