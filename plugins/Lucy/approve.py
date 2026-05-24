# Auto-approve DISABLED — FSub request mode ke liye approve nahi hona chahiye
# Request DB mein track hoti hai, file milne ke liye approve ki zaroorat nahi

from pyrogram import Client, filters
from pyrogram.types import Message
from info import ADMINS

@Client.on_message(filters.command("reqtime") & filters.user(ADMINS))
async def set_reqtime(client, message: Message):
    await message.reply_text("ℹ️ Auto-approve disabled hai. Request mode mein approve nahi hota.")

@Client.on_message(filters.command("reqmode") & filters.user(ADMINS))
async def toggle_reqmode(client, message: Message):
    await message.reply_text("ℹ️ Auto-approve disabled hai. Request mode mein approve nahi hota.")
