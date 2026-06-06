
from aiohttp import web
from .route import routes, cors_middleware
from asyncio import sleep
from datetime import datetime, timedelta
from database.users_chats_db import db
from database.poster_cache_db import ensure_index
from info import LOG_CHANNEL

async def web_server():
    await ensure_index()  # poster cache ka MongoDB index ready karo
    web_app = web.Application(client_max_size=30000000, middlewares=[cors_middleware])
    web_app.add_routes(routes)
    return web_app

async def check_expired_premium(client):
    while 1:
        now = datetime.now()

        # ── 1) Already expired users — remove karo ─────────────────────────────
        data = await db.get_expired(now)
        for user in data:
            user_id = user["id"]
            await db.remove_premium_access(user_id)
            try:
                tg_user = await client.get_users(user_id)
                await client.send_message(
                    chat_id=user_id,
                    text=(
                        f"<b>ʜᴇʏ {tg_user.mention},\n\n"
                        f"Tᴜᴍʜᴀʀᴀ Pʀᴇᴍɪᴜᴍ ᴀᴄᴄᴇss ᴇxᴘɪʀᴇ ʜᴏ ɢᴀʏᴀ 😔\n\n"
                        f"Tʜᴀɴᴋ ʏᴏᴜ ꜰᴏʀ ᴜsɪɴɢ ᴏᴜʀ sᴇʀᴠɪᴄᴇ 😊\n"
                        f"Rᴇɴᴇᴡ ᴋᴀʀɴᴇ ᴋᴇ ʟɪʏᴇ /plan ᴅᴇᴋʜᴏ!</b>"
                    )
                )
                await client.send_message(
                    LOG_CHANNEL,
                    text=f"<b>#Premium_Expired\n\nUser: {tg_user.mention}\nID: <code>{user_id}</code></b>"
                )
            except Exception as e:
                print(e)
            await sleep(0.5)

        # ── 2) Expiry reminder — 1 din pehle warn karo ─────────────────────────
        remind_till = now + timedelta(hours=24)
        try:
            async for user in db.users.find({
                "expiry_time": {"$gt": now, "$lt": remind_till},
                "reminded_1d": {"$ne": True}
            }):
                user_id = user["id"]
                expiry = user.get("expiry_time")
                try:
                    tg_user = await client.get_users(user_id)
                    await client.send_message(
                        chat_id=user_id,
                        text=(
                            f"<b>\u26a0\ufe0f ʜᴇʏ {tg_user.mention},\n\n"
                            f"Tᴜᴍʜᴀʀᴀ Pʀᴇᴍɪᴜᴍ <u>ᴋᴀʟ</u> expire ho jaayega! \U0001f62d\n"
                            f"\U0001f5d3 Expiry: <code>{expiry.strftime('%d %b %Y, %I:%M %p')}</code>\n\n"
                            f"Renew karne ke liye /plan dekho \U0001f447</b>"
                        )
                    )
                    await db.users.update_one(
                        {"id": user_id},
                        {"$set": {"reminded_1d": True}}
                    )
                except Exception as e:
                    print(e)
                await sleep(0.5)
        except Exception as e:
            print(f"Reminder check error: {e}")

        await sleep(3600)  # har 1 ghante mein check (pehle har 1 second tha — fix)
