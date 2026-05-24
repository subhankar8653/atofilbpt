"""
Bot Mode Manager Plugin
=======================
Admin commands to manage BOT_MODE and shorteners directly from bot.
No env var changes needed!

Commands:
  /setmode free|normal|earn     - Bot ka mode change karo
  /setshortener <api> <url>     - Single shortener set karo
  /addshortener <api> <url>     - Multi shortener mein add karo (max 3)
  /removeshortener <url>        - Ek shortener remove karo
  /clearshorteners              - Sab shorteners hata do
  /setfakelink <url> <btn_text> - Fake link set karo (FSub ke upar)
  /removefakelink               - Fake link hata do
  /modesettings                 - Current settings dekho
"""

from pyrogram import Client, filters
from pyrogram.types import InlineKeyboardButton, InlineKeyboardMarkup, CallbackQuery
from database.config_db import mdb
from database.users_chats_db import db
from info import ADMINS
import logging

logger = logging.getLogger(__name__)

# ── DB Keys ───────────────────────────────────────────────────────────────────
_KEY_MODE        = "bot_mode"          # "free" | "normal" | "earn"
_KEY_SHORTENERS  = "multi_shortlink"   # list of {"api": ..., "url": ...}
_KEY_FAKE_LINK   = "fake_link_config"  # {"url": ..., "button_text": ...}

# ── Helpers ───────────────────────────────────────────────────────────────────

async def get_bot_mode() -> str:
    """DB se bot mode lo. Default = env var BOT_MODE."""
    from info import BOT_MODE as _DEFAULT
    val = await mdb.get_configuration_value(_KEY_MODE)
    return val if val else _DEFAULT

async def get_shorteners() -> list:
    """DB se shortener list lo."""
    from info import MULTI_SHORTLINK as _ML, IS_SHORTLINK as _IS, SHORTLINK_URL as _URL, SHORTLINK_API as _API
    val = await mdb.get_configuration_value(_KEY_SHORTENERS)
    if val:
        return val
    # Fallback: env vars se lo
    if _ML:
        return _ML
    if _IS and _URL and _API:
        return [{"api": _API, "url": _URL}]
    return []

async def get_fake_link_cfg() -> dict:
    """DB se fake link config lo."""
    val = await mdb.get_configuration_value(_KEY_FAKE_LINK)
    return val if val else {}

# ── Public helpers (commands.py import karega) ────────────────────────────────

async def runtime_get_mode() -> str:
    return await get_bot_mode()

async def runtime_get_shorteners() -> list:
    return await get_shorteners()

async def runtime_get_fake_link() -> dict:
    return await get_fake_link_cfg()

# ══════════════════════════════════════════════════════════════════════════════
# /setmode
# ══════════════════════════════════════════════════════════════════════════════

@Client.on_message(filters.command("setmode") & filters.user(ADMINS) & filters.private)
async def cmd_set_mode(client, message):
    args = message.command
    if len(args) < 2 or args[1].lower() not in ("free", "normal", "earn"):
        return await message.reply_text(
            "<b>Usage:</b> <code>/setmode free</code> | <code>/setmode normal</code> | <code>/setmode earn</code>\n\n"
            "<b>🆓 free</b> — FSub + Verify (24hr once), phir seedha file\n"
            "<b>📊 normal</b> — 1st link: FSub+Verify | 2nd link: Shortener | 3rd+: Free\n"
            "<b>💰 earn</b> — Har baar: FSub + Sab shorteners | Baad mein 24hr free"
        )
    new_mode = args[1].lower()
    await mdb.update_configuration(_KEY_MODE, new_mode)
    icons = {"free": "🆓", "normal": "📊", "earn": "💰"}
    await message.reply_text(
        f"✅ <b>Bot mode set to: {icons[new_mode]} <code>{new_mode.upper()}</code></b>\n\n"
        "Changes are live immediately! ⚡"
    )

# ══════════════════════════════════════════════════════════════════════════════
# /setshortener — single shortener (replaces all)
# ══════════════════════════════════════════════════════════════════════════════

@Client.on_message(filters.command("setshortener") & filters.user(ADMINS) & filters.private)
async def cmd_set_shortener(client, message):
    args = message.command
    if len(args) < 3:
        return await message.reply_text(
            "<b>Usage:</b> <code>/setshortener API_KEY website.com</code>\n\n"
            "<b>Example:</b> <code>/setshortener abc123 inshorturl.com</code>\n\n"
            "⚠️ Yeh sab purane shorteners replace kar dega."
        )
    api_key = args[1]
    url = args[2]
    new_list = [{"api": api_key, "url": url}]
    await mdb.update_configuration(_KEY_SHORTENERS, new_list)
    await message.reply_text(
        f"✅ <b>Shortener set!</b>\n\n"
        f"🔗 URL: <code>{url}</code>\n"
        f"🔑 API: <code>{api_key}</code>"
    )

# ══════════════════════════════════════════════════════════════════════════════
# /addshortener — multi shortener mein add (max 3)
# ══════════════════════════════════════════════════════════════════════════════

@Client.on_message(filters.command("addshortener") & filters.user(ADMINS) & filters.private)
async def cmd_add_shortener(client, message):
    args = message.command
    if len(args) < 3:
        return await message.reply_text(
            "<b>Usage:</b> <code>/addshortener API_KEY website.com</code>\n\n"
            "<b>Example:</b> <code>/addshortener xyz789 mdiskshort.com</code>\n\n"
            "Max 3 shorteners add kar sakte ho (EarnMode ke liye)."
        )
    api_key = args[1]
    url = args[2]
    current = await get_shorteners()
    # Duplicate check
    for sh in current:
        if sh["url"] == url:
            return await message.reply_text(f"⚠️ <code>{url}</code> already added hai!")
    if len(current) >= 3:
        return await message.reply_text(
            "❌ Maximum 3 shorteners allowed!\n\n"
            "Ek hatao pehle: <code>/removeshortener website.com</code>"
        )
    current.append({"api": api_key, "url": url})
    await mdb.update_configuration(_KEY_SHORTENERS, current)
    lines = "\n".join([f"  {i+1}. <code>{s['url']}</code>" for i, s in enumerate(current)])
    await message.reply_text(
        f"✅ <b>Shortener added!</b>\n\n"
        f"📋 <b>Current list ({len(current)}/3):</b>\n{lines}"
    )

# ══════════════════════════════════════════════════════════════════════════════
# /removeshortener
# ══════════════════════════════════════════════════════════════════════════════

@Client.on_message(filters.command("removeshortener") & filters.user(ADMINS) & filters.private)
async def cmd_remove_shortener(client, message):
    args = message.command
    if len(args) < 2:
        current = await get_shorteners()
        if not current:
            return await message.reply_text("❌ Koi shortener set nahi hai.")
        lines = "\n".join([f"  {i+1}. <code>{s['url']}</code>" for i, s in enumerate(current)])
        return await message.reply_text(
            f"<b>Usage:</b> <code>/removeshortener website.com</code>\n\n"
            f"📋 <b>Current shorteners:</b>\n{lines}"
        )
    url = args[1]
    current = await get_shorteners()
    new_list = [s for s in current if s["url"] != url]
    if len(new_list) == len(current):
        return await message.reply_text(f"⚠️ <code>{url}</code> list mein nahi mila!")
    await mdb.update_configuration(_KEY_SHORTENERS, new_list)
    await message.reply_text(f"✅ <code>{url}</code> removed!\n\nRemaining: {len(new_list)} shortener(s)")

# ══════════════════════════════════════════════════════════════════════════════
# /clearshorteners
# ══════════════════════════════════════════════════════════════════════════════

@Client.on_message(filters.command("clearshorteners") & filters.user(ADMINS) & filters.private)
async def cmd_clear_shorteners(client, message):
    await mdb.update_configuration(_KEY_SHORTENERS, [])
    await message.reply_text("✅ Sab shorteners clear ho gaye!")

# ══════════════════════════════════════════════════════════════════════════════
# /setfakelink
# ══════════════════════════════════════════════════════════════════════════════

@Client.on_message(filters.command("setfakelink") & filters.user(ADMINS) & filters.private)
async def cmd_set_fake_link(client, message):
    """
    /setfakelink https://url.com Button Text
    Fake link jo FSub buttons ke upar dikhega (LinkBot wala logic).
    """
    args = message.text.split(None, 2)
    if len(args) < 3:
        return await message.reply_text(
            "<b>Usage:</b> <code>/setfakelink https://example.com Button Text</code>\n\n"
            "<b>Example:</b> <code>/setfakelink https://t.me/mychannel Join Channel</code>\n\n"
            "Yeh button FSub join buttons ke upar dikhega — user sochega yahi asli button hai! 😄"
        )
    url = args[1]
    btn_text = args[2]
    await mdb.update_configuration(_KEY_FAKE_LINK, {"url": url, "button_text": btn_text})
    await message.reply_text(
        f"✅ <b>Fake link set!</b>\n\n"
        f"🔗 URL: <code>{url}</code>\n"
        f"🔘 Button text: <b>{btn_text}</b>"
    )

# ══════════════════════════════════════════════════════════════════════════════
# /removefakelink
# ══════════════════════════════════════════════════════════════════════════════

@Client.on_message(filters.command("removefakelink") & filters.user(ADMINS) & filters.private)
async def cmd_remove_fake_link(client, message):
    await mdb.update_configuration(_KEY_FAKE_LINK, {})
    await message.reply_text("✅ Fake link remove ho gaya!")

# ══════════════════════════════════════════════════════════════════════════════
# /modesettings — sab current settings ek jagah
# ══════════════════════════════════════════════════════════════════════════════

@Client.on_message(filters.command("modesettings") & filters.user(ADMINS) & filters.private)
async def cmd_mode_settings(client, message):
    mode = await get_bot_mode()
    shorteners = await get_shorteners()
    fake = await get_fake_link_cfg()

    icons = {"free": "🆓", "normal": "📊", "earn": "💰"}
    mode_desc = {
        "free":   "FSub + Verify once/24hr → file",
        "normal": "1st: FSub+Verify | 2nd: Shortener | 3rd+: Free",
        "earn":   "FSub + All shorteners → 24hr free"
    }

    sh_lines = ""
    if shorteners:
        for i, s in enumerate(shorteners):
            sh_lines += f"\n  {i+1}. <code>{s['url']}</code>"
    else:
        sh_lines = "\n  ❌ Koi shortener set nahi"

    fake_line = f"\n  🔗 {fake.get('button_text','?')} → <code>{fake.get('url','?')}</code>" if fake.get("url") else "\n  ❌ Set nahi"

    text = (
        f"⚙️ <b>Bot Mode Settings</b>\n"
        f"{'━'*30}\n\n"
        f"<b>Mode:</b> {icons.get(mode,'❓')} <code>{mode.upper()}</code>\n"
        f"<i>{mode_desc.get(mode,'?')}</i>\n\n"
        f"<b>Shorteners ({len(shorteners)}/3):</b>{sh_lines}\n\n"
        f"<b>Fake Link:</b>{fake_line}\n\n"
        f"{'━'*30}\n"
        f"<b>Commands:</b>\n"
        f"• <code>/setmode free|normal|earn</code>\n"
        f"• <code>/addshortener API url.com</code>\n"
        f"• <code>/setshortener API url.com</code>\n"
        f"• <code>/removeshortener url.com</code>\n"
        f"• <code>/clearshorteners</code>\n"
        f"• <code>/setfakelink url.com Button Text</code>\n"
        f"• <code>/removefakelink</code>"
    )

    btns = [
        [
            InlineKeyboardButton("🆓 Free", callback_data="bm_set_free"),
            InlineKeyboardButton("📊 Normal", callback_data="bm_set_normal"),
            InlineKeyboardButton("💰 Earn", callback_data="bm_set_earn"),
        ],
        [InlineKeyboardButton("🔄 Refresh", callback_data="bm_refresh")]
    ]
    await message.reply_text(text, reply_markup=InlineKeyboardMarkup(btns))


# ── Inline buttons for quick mode switch ─────────────────────────────────────

@Client.on_callback_query(filters.regex(r"^bm_(set_|refresh)"))
async def cb_bot_mode(client, query: CallbackQuery):
    if query.from_user.id not in ADMINS:
        return await query.answer("❌ Admin only!", show_alert=True)

    data = query.data
    if data.startswith("bm_set_"):
        new_mode = data.replace("bm_set_", "")
        await mdb.update_configuration(_KEY_MODE, new_mode)
        await query.answer(f"✅ Mode set to {new_mode.upper()}!", show_alert=False)

    # Refresh message
    mode = await get_bot_mode()
    shorteners = await get_shorteners()
    fake = await get_fake_link_cfg()
    icons = {"free": "🆓", "normal": "📊", "earn": "💰"}
    mode_desc = {
        "free":   "FSub + Verify once/24hr → file",
        "normal": "1st: FSub+Verify | 2nd: Shortener | 3rd+: Free",
        "earn":   "FSub + All shorteners → 24hr free"
    }
    sh_lines = ""
    if shorteners:
        for i, s in enumerate(shorteners):
            sh_lines += f"\n  {i+1}. <code>{s['url']}</code>"
    else:
        sh_lines = "\n  ❌ Koi shortener set nahi"
    fake_line = f"\n  🔗 {fake.get('button_text','?')} → <code>{fake.get('url','?')}</code>" if fake.get("url") else "\n  ❌ Set nahi"
    text = (
        f"⚙️ <b>Bot Mode Settings</b>\n"
        f"{'━'*30}\n\n"
        f"<b>Mode:</b> {icons.get(mode,'❓')} <code>{mode.upper()}</code>\n"
        f"<i>{mode_desc.get(mode,'?')}</i>\n\n"
        f"<b>Shorteners ({len(shorteners)}/3):</b>{sh_lines}\n\n"
        f"<b>Fake Link:</b>{fake_line}\n\n"
        f"{'━'*30}\n"
        f"<b>Commands:</b>\n"
        f"• <code>/setmode free|normal|earn</code>\n"
        f"• <code>/addshortener API url.com</code>\n"
        f"• <code>/setshortener API url.com</code>\n"
        f"• <code>/removeshortener url.com</code>\n"
        f"• <code>/clearshorteners</code>\n"
        f"• <code>/setfakelink url.com Button Text</code>\n"
        f"• <code>/removefakelink</code>"
    )
    btns = [
        [
            InlineKeyboardButton("🆓 Free", callback_data="bm_set_free"),
            InlineKeyboardButton("📊 Normal", callback_data="bm_set_normal"),
            InlineKeyboardButton("💰 Earn", callback_data="bm_set_earn"),
        ],
        [InlineKeyboardButton("🔄 Refresh", callback_data="bm_refresh")]
    ]
    try:
        await query.message.edit_text(text, reply_markup=InlineKeyboardMarkup(btns))
    except Exception:
        pass
