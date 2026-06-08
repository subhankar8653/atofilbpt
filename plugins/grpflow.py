"""
grpflow.py — Group card button se DM mein multi-step flow:
  Step 1: Language select (agar >1 language available)
  Step 2: Quality select
  Step 3: 10 files send + More button

  Session: In-memory (_GF_SESSION) + MongoDB (grp_sessions collection) — bot restart safe.
"""
import asyncio
import base64
import json
import logging

from pyrogram import Client, filters
from pyrogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from database.ia_filterdb import get_search_results
from database.users_chats_db import db
from info import DELETE_TIME
from plugins.pmfilter import (
    LANGUAGES_LIST, QUALITIES_LIST, _LANG_SHORT,
    _sort_files_by_episode,
)
from info import LOG_CHANNEL, URL
from urllib.parse import quote_plus
from utils import get_size, get_time, temp

logger = logging.getLogger(__name__)

# ── In-memory session store (fast cache) ──────────────────────────────────────
# MongoDB se load hone ke baad yahan cache hota hai
_GF_SESSION = {}

FILES_PER_PAGE = 10

# ── Extra languages not in pmfilter's LANGUAGES_LIST ─────────────────────────
_EXTRA_LANGUAGES = ["multi", "dual"]

# Extended list = pmfilter list + our extras
def _full_lang_list():
    return LANGUAGES_LIST + [l for l in _EXTRA_LANGUAGES if l not in LANGUAGES_LIST]

# ── Language aliases — same language different names in filenames ──────────────
_LANG_ALIASES = {
    "hindi":     ["hindi", "hin", "hind"],
    "multi":     ["multi audio", "multi-audio", "multilingual", "multi lang", "multi language", "multi"],
    "dual":      ["dual audio", "dual-audio", "dubbed", "dual"],
    "english":   ["english", "eng"],
    "tamil":     ["tamil", "tam"],
    "telugu":    ["telugu", "tel"],
    "malayalam": ["malayalam", "mal"],
    "kannada":   ["kannada", "kan"],
    "gujarati":  ["gujarati", "guj"],
    "marathi":   ["marathi", "mar"],
    "punjabi":   ["punjabi", "pun"],
    "bengali":   ["bengali", "ben"],
    "odia":      ["odia", "odi"],
    "urdu":      ["urdu", "urd"],
    "bhojpuri":  ["bhojpuri", "bho"],
    "japanese":  ["japanese", "jpn"],
    "korean":    ["korean", "kor"],
    "chinese":   ["chinese", "chi"],
    "french":    ["french", "fre"],
    "spanish":   ["spanish", "spa"],
}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _extract_langs(files):
    seen = []
    for f in files:
        nl = f.file_name.lower()
        for lang in _full_lang_list():
            if lang not in seen:
                aliases = _LANG_ALIASES.get(lang, [lang])
                if any(alias in nl for alias in aliases):
                    seen.append(lang)
    if "hindi" in seen and seen[0] != "hindi":
        seen.remove("hindi")
        seen.insert(0, "hindi")
    return seen

def _extract_quals(files):
    seen = []
    for f in files:
        nl = f.file_name.lower()
        for q in QUALITIES_LIST:
            if q not in seen and q in nl:
                seen.append(q)
    return seen

def _filter_files(files, lang=None, qual=None):
    result = files
    if lang == "unknown":
        # Sirf wo files jo kisi bhi known language se match nahi karti
        filtered = []
        for f in files:
            nl = f.file_name.lower()
            matched = False
            for l in LANGUAGES_LIST:
                aliases = _LANG_ALIASES.get(l, [l])
                if any(alias in nl for alias in aliases):
                    matched = True
                    break
            if not matched:
                filtered.append(f)
        result = filtered
    elif lang:
        aliases = _LANG_ALIASES.get(lang, [lang])
        result = [f for f in result if any(alias in f.file_name.lower() for alias in aliases)]
    if qual:
        result = [f for f in result if qual in f.file_name.lower()]
    return result

def _session_key(user_id, msg_id=None):
    if msg_id:
        return f"gf_{user_id}_{msg_id}"
    return f"gf_{user_id}"

# ── Session save/load helpers ──────────────────────────────────────────────────

async def _save_session(uid: int, msg_id=None):
    """In-memory session ko MongoDB mein persist karo."""
    sk = _session_key(uid, msg_id)
    if sk not in _GF_SESSION:
        # Try without msg_id (backward compat)
        sk = _session_key(uid)
    sess = _GF_SESSION.get(sk)
    if not sess:
        return
    # all_files store nahi karte (too large) — sirf metadata save karo
    meta = {
        "search":  sess.get("search", ""),
        "chat_id": sess.get("chat_id", 0),
        "pre":     sess.get("pre", "file"),
        "lang":    sess.get("lang"),
        "qual":    sess.get("qual"),
        "offset":  sess.get("offset", 0),
        "msg_id":  sess.get("msg_id", 0),
    }
    try:
        await db.save_grp_session(uid, meta)
    except Exception as e:
        logger.warning(f"Session save failed: {e}")

async def _load_session(uid: int, msg_id=None) -> bool:
    """
    MongoDB se session load karo aur files rebuild karo.
    Returns True agar session successfully load + rebuild hua.
    """
    sk = _session_key(uid, msg_id)
    if sk in _GF_SESSION:
        return True  # already in memory

    try:
        doc = await db.get_grp_session(uid)
    except Exception as e:
        logger.warning(f"Session load failed: {e}")
        return False

    if not doc:
        return False

    search  = doc.get("search", "")
    chat_id = doc.get("chat_id", 0)
    pre     = doc.get("pre", "file")
    lang    = doc.get("lang")
    qual    = doc.get("qual")
    offset  = doc.get("offset", 0)

    if not search or not chat_id:
        return False

    # Files dobara DB se fetch karo
    try:
        files, _, total = await get_search_results(chat_id, search, offset=0, filter=True)
        files = _sort_files_by_episode(files)
    except Exception as e:
        logger.warning(f"Session rebuild files fetch failed: {e}")
        return False

    if not files:
        return False

    loaded_msg_id = doc.get("msg_id", 0) or msg_id or 0
    sk = _session_key(uid, loaded_msg_id)
    _GF_SESSION[sk] = {
        "search":    search,
        "chat_id":   chat_id,
        "pre":       pre,
        "lang":      lang,
        "qual":      qual,
        "all_files": files,
        "offset":    offset,
        "msg_id":    loaded_msg_id,
    }
    logger.info(f"Session rebuilt from MongoDB for uid={uid}, search='{search}'")
    return True

# ── Entry point (called from commands.py grpkey_ handler) ─────────────────────

async def start_grpflow(client, message: Message, search: str, chat_id: int):
    """grpkey_ payload decode ke baad yahan aao."""
    from utils import get_settings
    settings = await get_settings(chat_id)
    pre = "filep" if settings.get("file_secure") else "file"

    files, _, total = await get_search_results(chat_id, search, offset=0, filter=True)
    files = _sort_files_by_episode(files)

    # ── Fallback: agar is group mein file nahi mili, global search karo ─────
    if not files:
        logger.info(f"[grpflow] Group {chat_id} mein '{search}' nahi mila, global search try karo...")
        files, _, total = await get_search_results(None, search, max_results=200, filter=True)
        files = _sort_files_by_episode(files)

    if not files:
        return await message.reply_text("<b>❌ Koi file nahi mili. Group mein dobara search karo.</b>")

    uid = message.from_user.id
    # msg_id use karo taaki har search ka alag session ho — mix nahi ho
    msg_id = message.id
    sk = _session_key(uid, msg_id)
    _GF_SESSION[sk] = {
        "search": search, "chat_id": chat_id, "pre": pre,
        "lang": None, "qual": None,
        "all_files": files, "offset": 0,
        "msg_id": msg_id,
    }

    # MongoDB mein save karo immediately
    await _save_session(uid, msg_id)

    langs = _extract_langs(files)

    if len(langs) > 1:
        await _show_lang_step(client, message, uid, langs, send=True, msg_id=msg_id)
    else:
        if langs:
            _GF_SESSION[sk]["lang"] = langs[0]
            await _save_session(uid, msg_id)
        await _show_qual_step(client, message, uid, send=True, msg_id=msg_id)


# ── Step 1: Language ───────────────────────────────────────────────────────────

async def _show_lang_step(client, target, uid, langs, send=False, msg_id=None):
    # msg_id wala sk dhundho pehle, fallback to uid-only
    if msg_id:
        sk = _session_key(uid, msg_id)
    else:
        # Koi bhi matching session lo (msg_id wala prefer karo)
        matching = [k for k in _GF_SESSION if k.startswith(f"gf_{uid}")]
        sk = max(matching, key=lambda k: _GF_SESSION[k].get("msg_id", 0)) if matching else _session_key(uid)
    sess = _GF_SESSION.get(sk, {})
    search = sess.get("search", "")
    chat_id = sess.get("chat_id")

    # Is group ke files mein detected languages
    group_detected = set(langs)

    # Global detected — ALL groups mein search karo
    global_detected = set()
    try:
        global_files, _, _ = await get_search_results(None, search, max_results=200, filter=True)
        global_detected = set(_extract_langs(global_files))
    except Exception:
        global_detected = group_detected.copy()

    btn = []
    row = []
    for lang in _full_lang_list():
        full = lang.capitalize()
        if lang in group_detected:
            label = f"✅ {full}"
        elif lang in global_detected:
            label = f"✅ {full}"
        else:
            label = f"❌ {full}"
        row.append(InlineKeyboardButton(label, callback_data=f"gf_lang#{uid}#{lang}#{chat_id}#{sess.get('msg_id', 0)}"))
        if len(row) == 3:
            btn.append(row)
            row = []
    if row:
        btn.append(row)

    # Unknown language — jo kisi known language se match nahi karta
    unknown_files = []
    for f in sess.get("all_files", []):
        nl = f.file_name.lower()
        matched = any(
            any(alias in nl for alias in _LANG_ALIASES.get(l, [l]))
            for l in LANGUAGES_LIST
        )
        if not matched:
            unknown_files.append(f)

    if unknown_files:
        btn.append([InlineKeyboardButton(
            f"❓ Unknown Language ({len(unknown_files)} files)",
            callback_data=f"gf_lang#{uid}#unknown#{chat_id}#{sess.get('msg_id', 0)}"
        )])

    # "All Languages" button — no filter
    btn.append([InlineKeyboardButton(
        "🌐 All Languages (No Filter)",
        callback_data=f"gf_lang#{uid}#all#{chat_id}#{sess.get('msg_id', 0)}"
    )])

    text = (
        f"<b>🎬 {search.title()}</b>\n\n"
        f"<b>🌐 Select your language:</b>\n"
        f"<b>✅ = Available</b>\n"
        f"<b>❌ = Not available</b>"
    )
    markup = InlineKeyboardMarkup(btn)

    if send:
        if isinstance(target, Message):
            await target.reply_text(text, reply_markup=markup)
        else:
            # CallbackQuery — delete ke baad naya message bhejo (edit nahi)
            await target.message.reply_text(text, reply_markup=markup)
    else:
        await target.message.edit_text(text, reply_markup=markup)


# ── Step 2: Quality ────────────────────────────────────────────────────────────

async def _show_qual_step(client, target, uid, send=False, msg_id=None):
    # msg_id wala sk dhundho pehle, fallback to any matching
    if msg_id:
        sk = _session_key(uid, msg_id)
    else:
        matching = [k for k in _GF_SESSION if k.startswith(f"gf_{uid}")]
        sk = max(matching, key=lambda k: _GF_SESSION[k].get("msg_id", 0)) if matching else _session_key(uid)
    sess = _GF_SESSION.get(sk, {})
    search = sess.get("search", "")
    lang   = sess.get("lang")
    files  = sess.get("all_files", [])

    filtered = _filter_files(files, lang=lang)
    avail_quals = _extract_quals(filtered)

    msg_id = sess.get("msg_id", 0)
    btn = []
    row = []
    for q in QUALITIES_LIST:
        label = f"✅ {q.upper()}" if q in avail_quals else f"❌ {q.upper()}"
        row.append(InlineKeyboardButton(label, callback_data=f"gf_qual#{uid}#{q}#{msg_id}"))
        if len(row) == 3:
            btn.append(row)
            row = []
    if row:
        btn.append(row)

    lang_line = f"\n🌐 Language: <b>{lang.upper()}</b>" if lang else ""
    text = f"<b>🎬 {search.title()}{lang_line}\n\n📹 Quality select karo:\n✅ = Available  ❌ = Nahi hai</b>"
    btn.append([InlineKeyboardButton(
        "🔙 Back (Language select karo)",
        callback_data=f"gf_back_lang#{uid}#{msg_id}"
    )])
    markup = InlineKeyboardMarkup(btn)

    if send:
        if isinstance(target, Message):
            await target.reply_text(text, reply_markup=markup)
        else:
            # CallbackQuery — delete ke baad naya message bhejo (edit nahi)
            await target.message.reply_text(text, reply_markup=markup)
    else:
        await target.message.edit_text(text, reply_markup=markup)


# ── Step 3: Send files ─────────────────────────────────────────────────────────

async def _send_files(client, target, uid, is_more=False, msg_id=None):
    sk = _session_key(uid, msg_id) if msg_id else _session_key(uid)
    # Fallback: kisi bhi matching session se lo
    if sk not in _GF_SESSION:
        matching = [k for k in _GF_SESSION if k.startswith(f"gf_{uid}")]
        sk = matching[0] if matching else sk
    sess = _GF_SESSION.get(sk)
    if not sess:
        return

    search = sess["search"]
    pre    = sess["pre"]
    lang   = sess["lang"]
    qual   = sess["qual"]
    offset = sess["offset"]
    files  = sess["all_files"]

    filtered = _filter_files(files, lang=lang, qual=qual)

    if not filtered:
        await target.answer(
            f"❌ '{qual.upper()}' quality available nahi hai!\nDusri quality try karo.",
            show_alert=True
        )
        return

    page = filtered[offset: offset + FILES_PER_PAGE]
    total_filtered = len(filtered)

    lang_line = f" | 🌐 {lang.upper()}" if lang else ""
    qual_line = f" | 📹 {qual.upper()}" if qual else ""
    del_min = DELETE_TIME // 60
    cap = f"<b>🎬 {search.title()}{lang_line}{qual_line}</b>\n"
    cap += f"<b>📂 Files: {offset+1}–{min(offset+FILES_PER_PAGE, total_filtered)} of {total_filtered}</b>\n\n"
    cap += "<b>📚 <u>Your Requested Files</u> 👇\n\n</b>"

    for f in page:
        clean_name = ' '.join(
            x for x in f.file_name.split()
            if not x.startswith('[') and not x.startswith('@') and not x.startswith('www.')
        )
        cap += f"<b>\n<a href='https://telegram.me/{temp.U_NAME}?start={pre}_{f.file_id}'> 📁 {get_size(f.file_size)} ▷ {clean_name}\n</a></b>"

    if len(cap) > 4096:
        cap = cap[:4090] + "…</b>"

    new_offset = offset + FILES_PER_PAGE
    sess["offset"] = new_offset
    _GF_SESSION[sk] = sess
    await _save_session(uid)  # offset update MongoDB mein bhi

    btn = []
    msg_id_for_btn = sess.get("msg_id", 0)
    if new_offset < total_filtered:
        btn.append([InlineKeyboardButton(
            f"📂 More Files ({total_filtered - new_offset} remaining)",
            callback_data=f"gf_more#{uid}#{msg_id_for_btn}"
        )])

    btn.append([InlineKeyboardButton(
        "🔍 Search in Website",
        url=f"https://suhani-search.vercel.app/?search={search.replace(' ', '+')}"
    )])

    del_min = DELETE_TIME // 60
    btn.append([InlineKeyboardButton(
        "🔙 Back (Quality select karo)",
        callback_data=f"gf_back_qual#{uid}#{msg_id_for_btn}"
    )])

    markup = InlineKeyboardMarkup(btn) if btn else None
    sent_msgs = []

    for f in page:
        clean_name = ' '.join(
            x for x in f.file_name.split()
            if not x.startswith('[') and not x.startswith('@') and not x.startswith('www.')
        )
        try:
            file_btn = InlineKeyboardMarkup([[
                InlineKeyboardButton("🚀 FAST DOWNLOAD / WATCH ONLINE 🖥️", callback_data=f"generate_stream_link:{f.file_id}")
            ],[
                InlineKeyboardButton("📊 Media Info", callback_data=f"gf_minfo#{f.file_id}")
            ]])

            m = await client.send_cached_media(
                chat_id=uid,
                file_id=f.file_id,
                caption=f"<b>📁 {clean_name}</b>",
                protect_content=False,
                reply_markup=file_btn,
            )
            sent_msgs.append(m)
        except Exception as e:
            logger.warning(f"send_cached_media failed: {e}")
        await asyncio.sleep(0.3)

    summary = await client.send_message(
        chat_id=uid,
        text=cap,
        reply_markup=markup,
        disable_web_page_preview=True
    )
    sent_msgs.append(summary)

    # Warning message alag se — English mein
    warning_msg = await client.send_message(
        chat_id=uid,
        text=(
            f"<b>❗️❗️❗️ IMPORTANT ❗️❗️❗️</b>\n\n"
            f"<b>These files will be <u>DELETED in {del_min} minutes</u> due to copyright issues.</b>\n\n"
            f"<i>Please forward the files to your Saved Messages and start downloading from there before they get deleted!</i>"
        ),
        disable_web_page_preview=True
    )
    sent_msgs.append(warning_msg)

    async def _auto_del():
        await asyncio.sleep(DELETE_TIME)
        for m in sent_msgs:
            try:
                await m.delete()
            except Exception:
                pass
    asyncio.create_task(_auto_del())

    if hasattr(target, 'answer'):
        try:
            await target.answer()
        except Exception:
            pass


# ── Callback handlers ──────────────────────────────────────────────────────────

@Client.on_callback_query(filters.regex(r"^gf_lang#"))
async def gf_lang_cb(client: Client, query: CallbackQuery):
    parts = query.data.split("#")
    uid = int(parts[1])
    lang = parts[2]
    btn_chat_id = int(parts[3]) if len(parts) > 3 else None
    btn_msg_id  = int(parts[4]) if len(parts) > 4 else None

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    # msg_id se exact session key banao — har search ka alag session
    sk = _session_key(uid, btn_msg_id) if btn_msg_id else _session_key(uid)

    if sk not in _GF_SESSION:
        # MongoDB se load karne ki koshish karo
        loaded = await _load_session(uid, btn_msg_id)
        if not loaded:
            return await query.answer(
                "⏰ Session expire ho gaya.\nGroup mein dobara Send All button dabao.",
                show_alert=True
            )

    sess = _GF_SESSION.get(sk)
    if not sess:
        return await query.answer(
            "⏰ Session expire ho gaya.\nGroup mein dobara Send All button dabao.",
            show_alert=True
        )
    # "all" = no language filter
    # "all" = no filter
    if lang == "all":
        sess["lang"] = None
        sess["offset"] = 0
        _GF_SESSION[sk] = sess
        await _save_session(uid)
        await query.answer("✅ All Languages selected!")
        return await _show_qual_step(client, query, uid, send=False, msg_id=btn_msg_id)

    # "unknown" = files jisme koi known language nahi hai
    if lang == "unknown":
        sess["lang"] = "unknown"
        sess["offset"] = 0
        _GF_SESSION[sk] = sess
        await _save_session(uid)
        await query.answer("✅ Unknown Language selected!")
        return await _show_qual_step(client, query, uid, send=False, msg_id=btn_msg_id)

    # Check if this language has files in this group
    all_files = sess.get("all_files", [])
    avail_langs = _extract_langs(all_files)

    if lang not in avail_langs:
        # Global check — kisi aur group mein hai?
        try:
            search = sess.get("search", "")
            global_files, _, _ = await get_search_results(None, search, max_results=200, filter=True)
            global_langs = _extract_langs(global_files)
            if lang in global_langs:
                lang_filtered = _filter_files(global_files, lang=lang)
                if lang_filtered:
                    sess["all_files"] = lang_filtered
                    sess["lang"] = lang
                    sess["offset"] = 0
                    _GF_SESSION[sk] = sess
                    await _save_session(uid)
                    await query.answer(f"⚠️ {lang.capitalize()} files dusre group se mil rahi hain!")
                    return await _show_qual_step(client, query, uid, send=False, msg_id=btn_msg_id)
        except Exception:
            pass
        return await query.answer(
            f"❌ {lang.capitalize()} mein koi file nahi hai!\nDusri language choose karo.",
            show_alert=True
        )

    sess["lang"] = lang
    sess["offset"] = 0
    _GF_SESSION[sk] = sess
    await _save_session(uid)

    await query.answer(f"✅ {lang.upper()} selected!")
    await _show_qual_step(client, query, uid, send=False, msg_id=btn_msg_id)


@Client.on_callback_query(filters.regex(r"^gf_qual#"))
async def gf_qual_cb(client: Client, query: CallbackQuery):
    parts = query.data.split("#")
    uid = int(parts[1])
    qual = parts[2]
    btn_msg_id = int(parts[3]) if len(parts) > 3 else None

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid, btn_msg_id) if btn_msg_id else _session_key(uid)
    if sk not in _GF_SESSION:
        loaded = await _load_session(uid, btn_msg_id)
        if not loaded:
            return await query.answer(
                "⏰ Session expire ho gaya.\nGroup mein dobara Send All button dabao.",
                show_alert=True
            )

    sess = _GF_SESSION[sk]
    files    = sess["all_files"]
    lang     = sess["lang"]
    filtered = _filter_files(files, lang=lang)
    avail    = _extract_quals(filtered)

    if qual not in avail:
        return await query.answer(
            f"❌ '{qual.upper()}' quality available nahi hai!\nKoi aur quality choose karo.",
            show_alert=True
        )

    sess["qual"] = qual
    sess["offset"] = 0
    _GF_SESSION[sk] = sess
    await _save_session(uid)

    await query.answer(f"✅ {qual.upper()} selected!")
    try:
        await query.message.delete()
    except Exception:
        pass

    await _send_files(client, query, uid, msg_id=btn_msg_id)


@Client.on_callback_query(filters.regex(r"^gf_more#"))
async def gf_more_cb(client: Client, query: CallbackQuery):
    parts = query.data.split("#")
    uid = int(parts[1])
    btn_msg_id = int(parts[2]) if len(parts) > 2 else None

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid, btn_msg_id) if btn_msg_id else _session_key(uid)
    if sk not in _GF_SESSION:
        loaded = await _load_session(uid, btn_msg_id)
        if not loaded:
            return await query.answer(
                "⏰ Session expire ho gaya.\nGroup mein dobara Send All button dabao.",
                show_alert=True
            )

    await _send_files(client, query, uid, is_more=True, msg_id=btn_msg_id)


@Client.on_callback_query(filters.regex(r"^gf_noop$"))
async def gf_noop_cb(client: Client, query: CallbackQuery):
    await query.answer()


@Client.on_callback_query(filters.regex(r"^gf_back_lang#"))
async def gf_back_lang_cb(client: Client, query: CallbackQuery):
    """Back to language selection"""
    parts = query.data.split("#")
    uid = int(parts[1])
    btn_msg_id = int(parts[2]) if len(parts) > 2 else None

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid, btn_msg_id) if btn_msg_id else _session_key(uid)
    if sk not in _GF_SESSION:
        loaded = await _load_session(uid, btn_msg_id)
        if not loaded:
            return await query.answer(
                "⏰ Session expire ho gaya. Group mein dobara search karo.",
                show_alert=True
            )

    # Lang aur qual reset karo
    sess = _GF_SESSION.get(sk, {})
    sess["lang"] = None
    sess["qual"] = None
    sess["offset"] = 0
    _GF_SESSION[sk] = sess

    # Langs compute karo
    all_files = sess.get("all_files", [])
    langs = _extract_langs(all_files)

    # Quality panel delete karo, naya lang panel bhejo
    try:
        await query.message.delete()
    except Exception:
        pass
    await _show_lang_step(client, query, uid, langs, send=True, msg_id=btn_msg_id)


@Client.on_callback_query(filters.regex(r"^gf_back_qual#"))
async def gf_back_qual_cb(client: Client, query: CallbackQuery):
    """Files screen se Back → Quality selection"""
    parts = query.data.split("#")
    uid = int(parts[1])
    btn_msg_id = int(parts[2]) if len(parts) > 2 else None

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid, btn_msg_id) if btn_msg_id else _session_key(uid)
    if sk not in _GF_SESSION:
        loaded = await _load_session(uid, btn_msg_id)
        if not loaded:
            return await query.answer(
                "⏰ Session expire ho gaya. Group mein dobara search karo.",
                show_alert=True
            )

    # Sirf qual aur offset reset karo, lang raho
    sess = _GF_SESSION.get(sk, {})
    sess["qual"] = None
    sess["offset"] = 0
    _GF_SESSION[sk] = sess

    # Files summary message delete karo, naya qual panel bhejo
    try:
        await query.message.delete()
    except Exception:
        pass
    await _show_qual_step(client, query, uid, send=True, msg_id=btn_msg_id)


@Client.on_callback_query(filters.regex(r"^gf_minfo#"))
async def gf_mediainfo_cb(client: Client, query: CallbackQuery):
    """Media Info — LOG_CHANNEL mein bhejo, stream URL banao, mediainfo/ffprobe run karo"""
    parts = query.data.split("#")
    file_id = parts[1]

    await query.answer("📊 Media info extract ho rahi hai...", show_alert=False)
    status = await query.message.reply_text("⏳ <b>[░░░░░░░░░░] 0% — Shuru ho raha hai...</b>")

    try:
        import shutil, asyncio as _aio, json as _json, io
        from LucyBot.util.file_properties import get_name, get_hash

        await status.edit_text("⏳ <b>[██░░░░░░░░] 20% — File LOG_CHANNEL mein bhej raha hai...</b>")
        log_msg = await client.send_cached_media(chat_id=LOG_CHANNEL, file_id=file_id)
        media = log_msg.video or log_msg.audio or log_msg.document
        if not media:
            return await status.edit_text("❌ File nahi mili.")

        # Caption se file name lo (jo user ko dikhta hai), fallback get_name
        raw_caption = query.message.caption or query.message.text or ""
        # "📁 Dangal..." format — emoji/prefix hata do
        caption_clean = raw_caption.strip().lstrip("📁").strip()
        file_name = caption_clean if caption_clean else get_name(log_msg)
        f_hash = get_hash(log_msg)
        stream_url = f"{URL}dl/{log_msg.id}?hash={f_hash}"

        await status.edit_text("⏳ <b>[████░░░░░░] 40% — Stream URL ready, tool run ho raha hai...</b>")

        async def _run(cmd):
            proc = await _aio.create_subprocess_exec(
                *cmd,
                stdout=_aio.subprocess.PIPE,
                stderr=_aio.subprocess.PIPE
            )
            out, err = await proc.communicate()
            if proc.returncode != 0:
                raise Exception(err.decode().strip() or "Unknown error")
            return _json.loads(out.decode())

        if shutil.which("mediainfo"):
            await status.edit_text("⏳ <b>[██████░░░░] 60% — mediainfo se data extract ho raha hai...</b>")
            raw = await _run(["mediainfo", "--Output=JSON", stream_url])
            await status.edit_text("⏳ <b>[████████░░] 80% — Data format ho raha hai...</b>")
            tracks = (raw or {}).get("media", {}).get("track", [])
            text = _format_mediainfo(tracks)
        elif shutil.which("ffprobe"):
            await status.edit_text("⏳ <b>[██████░░░░] 60% — ffprobe se data extract ho raha hai...</b>")
            raw = await _run([
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format", "-show_streams",
                stream_url
            ])
            await status.edit_text("⏳ <b>[████████░░] 80% — Data format ho raha hai...</b>")
            text = _format_ffprobe(raw or {})
        else:
            return await status.edit_text("❌ mediainfo/ffprobe server pe install nahi hai.")

        if not text.strip():
            await status.delete()
            return await query.message.reply_text("❌ Media info extract nahi ho saka.", quote=True)

        await status.edit_text("⏳ <b>[██████████] 100% — Done! Bhej raha hai...</b>")
        await _aio.sleep(0.5)

        full = f"📊 <b>Media Info:</b> <code>{file_name}</code>\n\n<pre>{text}</pre>"

        await status.delete()
        if len(full) > 4096:
            bio = io.BytesIO(text.encode())
            bio.name = f"{file_name}.txt"
            await query.message.reply_document(bio, caption=f"📊 <b>Media Info:</b> <code>{file_name}</code>", quote=True)
        else:
            await query.message.reply_text(full, quote=True)

    except Exception as e:
        await status.delete()
        await query.message.reply_text(f"❌ <b>Error:</b> <code>{e}</code>", quote=True)


# ISO 639 language code → full name
_LANG_NAMES = {
    "hi": "Hindi", "en": "English", "ta": "Tamil", "te": "Telugu",
    "ml": "Malayalam", "kn": "Kannada", "mr": "Marathi", "gu": "Gujarati",
    "pa": "Punjabi", "bn": "Bengali", "or": "Odia", "ur": "Urdu",
    "bho": "Bhojpuri", "ja": "Japanese", "ko": "Korean", "zh": "Chinese",
    "fr": "French", "es": "Spanish", "de": "German", "ru": "Russian",
    "ar": "Arabic", "pt": "Portuguese", "it": "Italian", "tr": "Turkish",
    "mul": "Multiple", "und": "Unknown",
}

def _lang_name(code):
    if not code:
        return "Unknown"
    return _LANG_NAMES.get(code.lower(), code.capitalize())

def _align(key, value, width=20):
    if not value or str(value) in ("N/A", "None", ""):
        return ""
    return f"{key:<{width}}: {value}\n"

def _fmt_size(raw):
    """Bytes ko human readable mein convert karo"""
    try:
        b = int(raw)
        if b >= 1024**3: return f"{b/1024**3:.2f} GB"
        if b >= 1024**2: return f"{b/1024**2:.2f} MB"
        if b >= 1024:    return f"{b/1024:.2f} KB"
        return f"{b} B"
    except Exception:
        return str(raw)

def _fmt_dur(raw):
    """Seconds ko HH:MM:SS mein convert karo"""
    try:
        t = float(raw)
        h, rem = divmod(int(t), 3600)
        m, s = divmod(rem, 60)
        return f"{h:02d}:{m:02d}:{s:02d}"
    except Exception:
        return str(raw)

def _format_mediainfo(tracks):
    text = ""
    audio_count = 0
    sub_count = 0
    for track in tracks:
        t = track.get("@type")
        if t == "General":
            # File size — FileSize_String prefer karo, warna raw bytes convert karo
            raw_size = track.get("FileSize_String") or _fmt_size(track.get("FileSize", "0"))
            # Duration — Duration_String1 prefer karo (human readable), warna convert karo
            raw_dur  = track.get("Duration_String1") or track.get("Duration_String3") or _fmt_dur(track.get("Duration", "0"))
            text += "🗒 General\n"
            text += _align("Format",    track.get("Format"))
            text += _align("File size", raw_size)
            text += _align("Duration",  raw_dur)
            text += _align("Bitrate",   track.get("OverallBitRate_String"))
            text += "\n"
        elif t == "Video":
            text += "🎞 Video\n"
            text += _align("Format",   track.get("Format"))
            text += _align("Profile",  track.get("Format_Profile"))
            w, h = track.get("Width"), track.get("Height")
            if w and h: text += _align("Resolution", f"{w}x{h}")
            fps = track.get("FrameRate")
            if fps: text += _align("Frame rate", f"{fps} FPS")
            bd = track.get("BitDepth")
            if bd: text += _align("Bit depth", f"{bd} bits")
            text += "\n"
        elif t == "Audio":
            audio_count += 1
            lang_raw = track.get("Language_String") or track.get("Language") or ""
            lang = _lang_name(lang_raw)
            text += f"🔊 Audio #{audio_count}\n"
            text += _align("Format",   track.get("Format"))
            text += _align("Language", lang)
            text += "\n"
        elif t == "Text":
            sub_count += 1
            lang_raw = track.get("Language_String") or track.get("Language") or ""
            lang = _lang_name(lang_raw)
            text += f"🔠 Subtitle #{sub_count}\n"
            text += _align("Format",   track.get("Format"))
            text += _align("Language", lang)
            text += "\n"
    return text.strip()

def _format_ffprobe(data):
    text = ""
    fmt  = data.get("format", {})
    size = int(fmt.get("size", 0))
    dur  = float(fmt.get("duration", 0))
    h, rem = divmod(int(dur), 3600)
    m, s   = divmod(rem, 60)
    text += "🗒 General\n"
    text += _align("Format",    fmt.get("format_long_name"))
    text += _align("File size", f"{size/1024**3:.2f} GB" if size >= 1024**3 else f"{size/1024**2:.2f} MB")
    text += _align("Duration",  f"{h:02d}:{m:02d}:{s:02d}")
    br = int(fmt.get("bit_rate", 0))
    if br: text += _align("Bitrate", f"{br//1000} kbps")
    text += "\n"
    audio_n = sub_n = 0
    for stream in data.get("streams", []):
        stype = stream.get("codec_type")
        tags  = stream.get("tags", {})
        if stype == "video":
            text += "🎞 Video\n"
            text += _align("Format",     stream.get("codec_name", "").upper())
            w, h2 = stream.get("width"), stream.get("height")
            if w and h2: text += _align("Resolution", f"{w}x{h2}")
            text += _align("Frame rate", stream.get("avg_frame_rate"))
            text += "\n"
        elif stype == "audio":
            audio_n += 1
            text += f"🔊 Audio #{audio_n}\n"
            text += _align("Format",   stream.get("codec_name", "").upper())
            text += _align("Language", _lang_name(tags.get("language", "")))
            text += "\n"
        elif stype == "subtitle":
            sub_n += 1
            text += f"🔠 Subtitle #{sub_n}\n"
            text += _align("Format",   stream.get("codec_name", "").upper())
            text += _align("Language", _lang_name(tags.get("language", "")))
            text += "\n"
    return text.strip()
