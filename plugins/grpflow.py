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
from utils import get_size, get_time, temp

logger = logging.getLogger(__name__)

# ── In-memory session store (fast cache) ──────────────────────────────────────
# MongoDB se load hone ke baad yahan cache hota hai
_GF_SESSION = {}

FILES_PER_PAGE = 10

# ── Language aliases — same language different names in filenames ──────────────
_LANG_ALIASES = {
    "hindi":     ["hindi", "hin", "hind", "multi audio", "multi-audio",
                  "dual audio", "dual-audio", "dubbed"],
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
        for lang in LANGUAGES_LIST:
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
    if lang:
        aliases = _LANG_ALIASES.get(lang, [lang])
        result = [f for f in result if any(alias in f.file_name.lower() for alias in aliases)]
    if qual:
        result = [f for f in result if qual in f.file_name.lower()]
    return result

def _session_key(user_id):
    return f"gf_{user_id}"

# ── Session save/load helpers ──────────────────────────────────────────────────

async def _save_session(uid: int):
    """In-memory session ko MongoDB mein persist karo."""
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
    }
    try:
        await db.save_grp_session(uid, meta)
    except Exception as e:
        logger.warning(f"Session save failed: {e}")

async def _load_session(uid: int) -> bool:
    """
    MongoDB se session load karo aur files rebuild karo.
    Returns True agar session successfully load + rebuild hua.
    """
    sk = _session_key(uid)
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

    _GF_SESSION[sk] = {
        "search":    search,
        "chat_id":   chat_id,
        "pre":       pre,
        "lang":      lang,
        "qual":      qual,
        "all_files": files,
        "offset":    offset,
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

    if not files:
        return await message.reply_text("<b>❌ Koi file nahi mili. Group mein dobara search karo.</b>")

    uid = message.from_user.id
    sk = _session_key(uid)
    _GF_SESSION[sk] = {
        "search": search, "chat_id": chat_id, "pre": pre,
        "lang": None, "qual": None,
        "all_files": files, "offset": 0,
    }

    # MongoDB mein save karo immediately
    await _save_session(uid)

    langs = _extract_langs(files)

    if len(langs) > 1:
        await _show_lang_step(client, message, uid, langs, send=True)
    else:
        if langs:
            _GF_SESSION[sk]["lang"] = langs[0]
            await _save_session(uid)
        await _show_qual_step(client, message, uid, send=True)


# ── Step 1: Language ───────────────────────────────────────────────────────────

async def _show_lang_step(client, target, uid, langs, send=False):
    sk = _session_key(uid)
    sess = _GF_SESSION.get(sk, {})
    search = sess.get("search", "")

    btn = []
    row = []
    for lang in langs:
        label = _LANG_SHORT.get(lang, lang[:3]).upper()
        row.append(InlineKeyboardButton(label, callback_data=f"gf_lang#{uid}#{lang}"))
        if len(row) == 3:
            btn.append(row)
            row = []
    if row:
        btn.append(row)

    text = f"<b>🎬 {search.title()}\n\n🌐 Language select karo:</b>"
    markup = InlineKeyboardMarkup(btn)

    if send:
        if isinstance(target, Message):
            await target.reply_text(text, reply_markup=markup)
        else:
            await target.message.edit_text(text, reply_markup=markup)
    else:
        await target.message.edit_text(text, reply_markup=markup)


# ── Step 2: Quality ────────────────────────────────────────────────────────────

async def _show_qual_step(client, target, uid, send=False):
    sk = _session_key(uid)
    sess = _GF_SESSION.get(sk, {})
    search = sess.get("search", "")
    lang   = sess.get("lang")
    files  = sess.get("all_files", [])

    filtered = _filter_files(files, lang=lang)
    avail_quals = _extract_quals(filtered)

    btn = []
    row = []
    for q in QUALITIES_LIST:
        label = f"✅ {q.upper()}" if q in avail_quals else f"❌ {q.upper()}"
        row.append(InlineKeyboardButton(label, callback_data=f"gf_qual#{uid}#{q}"))
        if len(row) == 3:
            btn.append(row)
            row = []
    if row:
        btn.append(row)

    lang_line = f"\n🌐 Language: <b>{lang.upper()}</b>" if lang else ""
    text = f"<b>🎬 {search.title()}{lang_line}\n\n📹 Quality select karo:\n✅ = Available  ❌ = Nahi hai</b>"
    markup = InlineKeyboardMarkup(btn)

    if send:
        if isinstance(target, Message):
            await target.reply_text(text, reply_markup=markup)
        else:
            await target.message.edit_text(text, reply_markup=markup)
    else:
        await target.message.edit_text(text, reply_markup=markup)


# ── Step 3: Send files ─────────────────────────────────────────────────────────

async def _send_files(client, target, uid, is_more=False):
    sk = _session_key(uid)
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
    if new_offset < total_filtered:
        btn.append([InlineKeyboardButton(
            f"📂 More Files ({total_filtered - new_offset} remaining)",
            callback_data=f"gf_more#{uid}"
        )])

    btn.append([InlineKeyboardButton(
        "🔍 Search in Website",
        url=f"https://suhani-search.vercel.app/?search={search.replace(' ', '+')}"
    )])

    del_min = DELETE_TIME // 60
    btn.append([InlineKeyboardButton(
        f"⏳ Files {del_min} min mein delete honge",
        callback_data="gf_noop"
    )])

    markup = InlineKeyboardMarkup(btn) if btn else None
    sent_msgs = []

    for f in page:
        clean_name = ' '.join(
            x for x in f.file_name.split()
            if not x.startswith('[') and not x.startswith('@') and not x.startswith('www.')
        )
        try:
            m = await client.send_cached_media(
                chat_id=uid,
                file_id=f.file_id,
                caption=f"<b>📁 {clean_name}</b>",
                protect_content=False,
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

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid)
    if sk not in _GF_SESSION:
        # MongoDB se load karne ki koshish karo
        loaded = await _load_session(uid)
        if not loaded:
            return await query.answer(
                "⏰ Session expire ho gaya.\nGroup mein dobara Send All button dabao.",
                show_alert=True
            )

    sess = _GF_SESSION[sk]
    sess["lang"] = lang
    sess["offset"] = 0
    _GF_SESSION[sk] = sess
    await _save_session(uid)

    await query.answer(f"✅ {lang.upper()} selected!")
    await _show_qual_step(client, query, uid, send=False)


@Client.on_callback_query(filters.regex(r"^gf_qual#"))
async def gf_qual_cb(client: Client, query: CallbackQuery):
    parts = query.data.split("#")
    uid = int(parts[1])
    qual = parts[2]

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid)
    if sk not in _GF_SESSION:
        loaded = await _load_session(uid)
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

    await _send_files(client, query, uid)


@Client.on_callback_query(filters.regex(r"^gf_more#"))
async def gf_more_cb(client: Client, query: CallbackQuery):
    _, uid_str = query.data.split("#", 1)
    uid = int(uid_str)

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid)
    if sk not in _GF_SESSION:
        loaded = await _load_session(uid)
        if not loaded:
            return await query.answer(
                "⏰ Session expire ho gaya.\nGroup mein dobara Send All button dabao.",
                show_alert=True
            )

    await _send_files(client, query, uid, is_more=True)


@Client.on_callback_query(filters.regex(r"^gf_noop$"))
async def gf_noop_cb(client: Client, query: CallbackQuery):
    await query.answer()
