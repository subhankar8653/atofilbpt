import asyncio
import os
import json
from pyrogram import filters
from pyrogram.errors import FloodWait, ChannelInvalid, ChatAdminRequired
from pyrogram.types import Message
from LucyBot.Bot import Codeflix
from info import ADMINS

PROGRESS_FILE = "forward_progress.json"
is_forwarding = False

# ============================================================
# Railway pe max kitne messages ek session mein forward kare
# 1 ghante mein ~1800 msg (30/min) — safety ke liye 1500 rakha
# ============================================================
BATCH_SIZE = 1500


def save_progress(data: dict):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(data, f)


def load_progress() -> dict:
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r") as f:
            return json.load(f)
    return {}


def clear_progress():
    if os.path.exists(PROGRESS_FILE):
        os.remove(PROGRESS_FILE)


# ============================================================
# BOT START HONE PE AUTO RESUME CHECK
# ============================================================
async def auto_resume_on_start(client):
    """Railway restart hone pe automatically resume karega"""
    await asyncio.sleep(10)  # Bot fully start hone do pehle
    saved = load_progress()
    if saved and saved.get("auto_resume"):
        remaining = saved['end'] - saved['current'] + 1
        try:
            await client.send_message(
                chat_id=int(saved['admin_id']),
                text=(
                    f"♻️ **Railway Restart Detected!**\n\n"
                    f"📂 Saved progress mila:\n"
                    f"📥 Source: `{saved['source']}`\n"
                    f"📤 Dest: `{saved['dest']}`\n"
                    f"🔖 Last ID: `{saved['current']}`\n"
                    f"📦 Remaining: `{remaining:,}`\n\n"
                    f"▶️ /resume_forward se continue karo!"
                )
            )
        except Exception:
            pass


# ============================================================
# /forward_db COMMAND
# ============================================================
@Codeflix.on_message(filters.command("forward_db") & filters.user(ADMINS))
async def forward_db_handler(client, message: Message):
    global is_forwarding

    if is_forwarding:
        await message.reply("⚠️ Forwarding chal raha hai!\n/cancel_forward se roko.")
        return

    args = message.text.split()

    if len(args) != 5:
        saved = load_progress()
        if saved:
            remaining = saved['end'] - saved['current'] + 1
            batches_left = (remaining + BATCH_SIZE - 1) // BATCH_SIZE
            await message.reply(
                f"📂 **Saved Progress Mila!**\n\n"
                f"📥 Source: `{saved['source']}`\n"
                f"📤 Dest: `{saved['dest']}`\n"
                f"🔖 Last ID: `{saved['current']}`\n"
                f"📦 Remaining: `{remaining:,}`\n"
                f"🔢 Batches left: `~{batches_left}`\n\n"
                f"▶️ /resume_forward — continue karo\n"
                f"🗑 /clear_forward — progress delete karo"
            )
        else:
            await message.reply(
                "**Usage:**\n"
                "`/forward_db <source_id> <start_id> <end_id> <dest_id>`\n\n"
                "**Example:**\n"
                "`/forward_db -1001234567890 1 1000000 -1009876543210`\n\n"
                "**Note:** 10 lakh files ke liye Railway pe\n"
                "ruk ruk ke karna hoga. Har session mein\n"
                f"`{BATCH_SIZE:,}` messages forward honge.\n"
                "Phir /resume_forward karo."
            )
        return

    _, source_id, start_id, end_id, dest_id = args
    try:
        source_id = int(source_id)
        start_id = int(start_id)
        end_id = int(end_id)
        dest_id = int(dest_id)
    except ValueError:
        await message.reply("❌ IDs numbers mein dalo!")
        return

    total = end_id - start_id + 1
    batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
    eta_days = (total * 2) // 86400

    save_progress({
        "source": source_id,
        "dest": dest_id,
        "start": start_id,
        "end": end_id,
        "current": start_id,
        "total_forwarded": 0,
        "total_skipped": 0,
        "auto_resume": True,
        "admin_id": message.from_user.id
    })

    status_msg = await message.reply(
        f"🚀 **Forward DB Setup Complete!**\n\n"
        f"📥 Source: `{source_id}`\n"
        f"📤 Destination: `{dest_id}`\n"
        f"📊 Total: `{total:,}` messages\n"
        f"🔢 Total Batches: `~{batches:,}`\n"
        f"⏱ Est. Time: `~{eta_days} din`\n\n"
        f"▶️ Pehla batch shuru ho raha hai...\n"
        f"Har `{BATCH_SIZE:,}` messages ke baad ruk jaayega.\n"
        f"Phir /resume_forward karo!"
    )

    await do_forward(client, message, status_msg)


# ============================================================
# /resume_forward COMMAND
# ============================================================
@Codeflix.on_message(filters.command("resume_forward") & filters.user(ADMINS))
async def resume_forward_handler(client, message: Message):
    global is_forwarding

    if is_forwarding:
        await message.reply("⚠️ Already chal raha hai!")
        return

    saved = load_progress()
    if not saved:
        await message.reply("❌ Koi saved progress nahi!\n/forward_db se shuru karo.")
        return

    remaining = saved['end'] - saved['current'] + 1
    if remaining <= 0:
        await message.reply("✅ Sab forward ho chuka hai!")
        clear_progress()
        return

    status_msg = await message.reply(
        f"▶️ **Resuming...**\n\n"
        f"🔖 From ID: `{saved['current']}`\n"
        f"📦 Remaining: `{remaining:,}`\n"
        f"✅ Total forwarded so far: `{saved.get('total_forwarded', 0):,}`"
    )

    await do_forward(client, message, status_msg)


# ============================================================
# /cancel_forward COMMAND
# ============================================================
@Codeflix.on_message(filters.command("cancel_forward") & filters.user(ADMINS))
async def cancel_forward_handler(client, message: Message):
    global is_forwarding
    if is_forwarding:
        is_forwarding = False
        await message.reply(
            "🛑 **Cancelling...**\n"
            "Progress save hai — /resume_forward se wapas shuru karo!"
        )
    else:
        await message.reply("⚠️ Koi forwarding nahi chal rahi.")


# ============================================================
# /forward_status COMMAND
# ============================================================
@Codeflix.on_message(filters.command("forward_status") & filters.user(ADMINS))
async def forward_status_handler(client, message: Message):
    saved = load_progress()
    if not saved:
        await message.reply("❌ Koi active forward task nahi.")
        return

    done = saved['current'] - saved['start']
    total = saved['end'] - saved['start'] + 1
    remaining = saved['end'] - saved['current'] + 1
    percent = (done / total) * 100 if total > 0 else 0

    await message.reply(
        f"📊 **Forward Status**\n\n"
        f"✅ Done: `{done:,}` ({percent:.1f}%)\n"
        f"📦 Remaining: `{remaining:,}`\n"
        f"🔖 Current ID: `{saved['current']}`\n"
        f"📤 Total Forwarded: `{saved.get('total_forwarded', 0):,}`\n"
        f"⏭ Total Skipped: `{saved.get('total_skipped', 0):,}`\n"
        f"🔄 Status: `{'Running ✅' if is_forwarding else 'Paused ⏸'}`"
    )


# ============================================================
# /clear_forward COMMAND
# ============================================================
@Codeflix.on_message(filters.command("clear_forward") & filters.user(ADMINS))
async def clear_forward_handler(client, message: Message):
    global is_forwarding
    is_forwarding = False
    clear_progress()
    await message.reply("🗑 Progress clear ho gaya!")


# ============================================================
# MAIN FORWARD LOGIC
# ============================================================
async def do_forward(client, message, status_msg):
    global is_forwarding
    is_forwarding = True

    saved = load_progress()
    source_id = saved['source']
    dest_id = saved['dest']
    end_id = saved['end']
    current_id = saved['current']
    total_forwarded = saved.get('total_forwarded', 0)
    total_skipped = saved.get('total_skipped', 0)

    batch_forwarded = 0
    batch_skipped = 0
    errors = 0
    batch_end = min(current_id + BATCH_SIZE - 1, end_id)
    total = end_id - saved['start'] + 1

    try:
        while current_id <= batch_end:
            if not is_forwarding:
                break

            try:
                msg = await client.get_messages(source_id, current_id)

                if msg and not msg.empty and (
                    msg.video or msg.document or msg.audio or
                    msg.photo or msg.animation
                ):
                    await client.forward_messages(
                        chat_id=dest_id,
                        from_chat_id=source_id,
                        message_ids=current_id
                    )
                    batch_forwarded += 1
                    total_forwarded += 1
                else:
                    batch_skipped += 1
                    total_skipped += 1

            except FloodWait as fw:
                wait_time = fw.value + 5
                await status_msg.edit(
                    f"⏳ FloodWait! `{wait_time}s` ruk raha hoon...\n"
                    f"🔖 ID: `{current_id}`"
                )
                await asyncio.sleep(wait_time)
                continue

            except (ChannelInvalid, ChatAdminRequired) as e:
                await status_msg.edit(f"❌ **Error:** `{str(e)}`\nBot ko admin banao!")
                is_forwarding = False
                return

            except Exception:
                errors += 1
                if errors > 100:
                    await status_msg.edit("❌ Bahut zyada errors! Ruk gaya.")
                    is_forwarding = False
                    return

            # Progress save har message pe
            save_progress({
                **saved,
                "current": current_id + 1,
                "total_forwarded": total_forwarded,
                "total_skipped": total_skipped,
            })

            # Progress update har 200 messages pe
            if batch_forwarded > 0 and batch_forwarded % 200 == 0:
                done = current_id - saved['start']
                percent = (done / total) * 100
                await status_msg.edit(
                    f"🔄 **Forwarding...**\n\n"
                    f"📦 This batch: `{batch_forwarded}/{BATCH_SIZE}`\n"
                    f"✅ Total forwarded: `{total_forwarded:,}`\n"
                    f"📊 Overall: `{percent:.1f}%`\n"
                    f"🔖 ID: `{current_id}`\n\n"
                    f"🛑 /cancel_forward"
                )

            current_id += 1
            await asyncio.sleep(2)  # 30 msg/min rate limit safe

    finally:
        is_forwarding = False
        remaining = end_id - current_id + 1
        done = current_id - saved['start']
        percent = (done / total) * 100 if total > 0 else 0

        if remaining <= 0:
            # Sab complete!
            clear_progress()
            await status_msg.edit(
                f"🎉 **Sab Forward Ho Gaya!**\n\n"
                f"✅ Total Forwarded: `{total_forwarded:,}`\n"
                f"⏭ Total Skipped: `{total_skipped:,}`\n"
                f"🎊 Kaam khatam!"
            )
        else:
            # Batch complete, aur baki hai
            await status_msg.edit(
                f"⏸ **Batch Complete! Ruk Gaya.**\n\n"
                f"✅ Is batch mein: `{batch_forwarded:,}`\n"
                f"✅ Total forwarded: `{total_forwarded:,}`\n"
                f"📊 Overall: `{percent:.1f}%`\n"
                f"📦 Remaining: `{remaining:,}`\n\n"
                f"▶️ Aage karne ke liye:\n"
                f"/resume_forward\n\n"
                f"Railway restart ho toh bhi\n"
                f"/resume_forward karo — automatically resume hoga!"
            )
