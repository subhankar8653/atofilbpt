# SuhaniBots - https://t.me/SuhaniBots

from pyrogram import Client, filters, enums
from pyrogram.types import ChatJoinRequest
from database.users_chats_db import db
from info import ADMINS, AUTH_CHANNEL

# ── ALL channels join request track karo (DB + AUTH_CHANNEL dono) ──
# filters.chat() nahi use karte — saare channels ki requests chahiye
@Client.on_chat_join_request()
async def join_reqs(client, message: ChatJoinRequest):
    uid = message.from_user.id
    cid = message.chat.id

    # Naya: per-channel tracking (FSub multi-channel ke liye)
    await db.req_user_add(cid, uid)

    # Backward compat: purana global tracking (AUTH_CHANNEL ke liye)
    if AUTH_CHANNEL and cid == AUTH_CHANNEL:
        if not await db.find_join_req(uid):
            await db.add_join_req(uid)


@Client.on_message(filters.command("delreq") & filters.private & filters.user(ADMINS))
async def del_requests(client, message):
    await db.del_join_req()    
    await message.reply("<b>⚙ ꜱᴜᴄᴄᴇꜱꜱғᴜʟʟʏ ᴄʜᴀɴɴᴇʟ ʟᴇғᴛ ᴜꜱᴇʀꜱ ᴅᴇʟᴇᴛᴇᴅ</b>")
