"""
grpflow.py — Group card button se DM mein multi-step flow:
  Step 1: Language select (agar >1 language available)
  Step 2: Quality select
  Step 3: 10 files send + More button
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

# ── In-memory session store ────────────────────────────────────────────────────
# key = f"gf_{user_id}"
# value = {
#   "search": str, "chat_id": int, "pre": str,
#   "lang": str|None,   # chosen language filter
#   "qual": str|None,   # chosen quality filter
#   "all_files": list,  # full filtered file list
#   "offset": int,      # how many already sent
# }
_GF_SESSION = {}

FILES_PER_PAGE = 10

# ── Helpers ────────────────────────────────────────────────────────────────────

def _extract_langs(files):
    seen = []
    for f in files:
        nl = f.file_name.lower()
        for lang in LANGUAGES_LIST:
            if lang not in seen and lang in nl:
                seen.append(lang)
    # Hindi priority
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
        result = [f for f in result if lang in f.file_name.lower()]
    if qual:
        result = [f for f in result if qual in f.file_name.lower()]
    return result

def _session_key(user_id):
    return f"gf_{user_id}"

# ── Entry point (called from commands.py grpkey_ handler) ─────────────────────

async def start_grpflow(client, message: Message, search: str, chat_id: int):
    """
    grpkey_ payload decode ke baad yahan aao.
    """
    from database.users_chats_db import db as _db
    settings = await _db.get_settings(chat_id) if hasattr(_db, 'get_settings') else {}
    # get_settings is in utils
    from utils import get_settings
    settings = await get_settings(chat_id)
    pre = "filep" if settings.get("file_secure") else "file"

    # Full search
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

    langs = _extract_langs(files)

    if len(langs) > 1:
        # Step 1: Language select
        await _show_lang_step(client, message, uid, langs, send=True)
    else:
        # Only 1 (or 0) language — skip to quality
        if langs:
            _GF_SESSION[sk]["lang"] = langs[0]
        await _show_qual_step(client, message, uid, send=True)


# ── Step 1: Language ───────────────────────────────────────────────────────────

async def _show_lang_step(client, target, uid, langs, send=False):
    sk = _session_key(uid)
    sess = _GF_SESSION.get(sk, {})
    search = sess.get("search", "")

    btn = []
    row = []
    for i, lang in enumerate(langs):
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

    # Filter by chosen language first
    filtered = _filter_files(files, lang=lang)
    avail_quals = _extract_quals(filtered)
    all_quals   = QUALITIES_LIST

    btn = []
    row = []
    for q in all_quals:
        if q in avail_quals:
            label = f"✅ {q.upper()}"
        else:
            label = f"❌ {q.upper()}"
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
        # Ye quality available nahi
        await target.answer(
            f"❌ '{qual.upper()}' quality available nahi hai!\nDusri quality try karo.",
            show_alert=True
        )
        return

    page = filtered[offset: offset + FILES_PER_PAGE]
    total_filtered = len(filtered)

    # Build text
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

    # Buttons row
    new_offset = offset + FILES_PER_PAGE
    sess["offset"] = new_offset
    _GF_SESSION[sk] = sess

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

    chat_id_dm = uid
    sent_msgs = []

    # Send files as cached media (one by one)
    for f in page:
        clean_name = ' '.join(
            x for x in f.file_name.split()
            if not x.startswith('[') and not x.startswith('@') and not x.startswith('www.')
        )
        try:
            m = await client.send_cached_media(
                chat_id=chat_id_dm,
                file_id=f.file_id,
                caption=f"<b>📁 {clean_name}</b>",
                protect_content=False,
            )
            sent_msgs.append(m)
        except Exception as e:
            logger.warning(f"send_cached_media failed: {e}")
        await asyncio.sleep(0.3)

    # Summary message with buttons
    summary = await client.send_message(
        chat_id=chat_id_dm,
        text=cap,
        reply_markup=markup,
        disable_web_page_preview=True
    )
    sent_msgs.append(summary)

    # Auto delete after DELETE_TIME
    async def _auto_del():
        await asyncio.sleep(DELETE_TIME)
        for m in sent_msgs:
            try:
                await m.delete()
            except Exception:
                pass
    asyncio.create_task(_auto_del())

    # Agar "more" callback tha toh answer karo
    if hasattr(target, 'answer'):
        try:
            await target.answer()
        except Exception:
            pass


# ── Callback handlers ──────────────────────────────────────────────────────────

@Client.on_callback_query(filters.regex(r"^gf_lang#"))
async def gf_lang_cb(client: Client, query: CallbackQuery):
    _, uid_str, lang = query.data.split("#", 2)
    uid = int(uid_str)

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid)
    sess = _GF_SESSION.get(sk)
    if not sess:
        return await query.answer("⏰ Session expire. Group mein dobara search karo.", show_alert=True)

    sess["lang"] = lang
    sess["offset"] = 0
    _GF_SESSION[sk] = sess

    await query.answer(f"✅ {lang.upper()} selected!")
    await _show_qual_step(client, query, uid, send=False)


@Client.on_callback_query(filters.regex(r"^gf_qual#"))
async def gf_qual_cb(client: Client, query: CallbackQuery):
    _, uid_str, qual = query.data.split("#", 2)
    uid = int(uid_str)

    if query.from_user.id != uid:
        return await query.answer("❌ Ye tumhara result nahi hai!", show_alert=True)

    sk = _session_key(uid)
    sess = _GF_SESSION.get(sk)
    if not sess:
        return await query.answer("⏰ Session expire. Group mein dobara search karo.", show_alert=True)

    # Check availability
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

    await query.answer(f"✅ {qual.upper()} selected!")
    # Delete quality selection message
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
        return await query.answer("⏰ Session expire. Group mein dobara search karo.", show_alert=True)

    await _send_files(client, query, uid, is_more=True)


@Client.on_callback_query(filters.regex(r"^gf_noop$"))
async def gf_noop_cb(client: Client, query: CallbackQuery):
    await query.answer()
