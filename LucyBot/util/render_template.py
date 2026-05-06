import jinja2
import aiofiles
import os
import urllib.parse
import logging
import aiohttp
from info import *
from LucyBot.Bot import Codeflix
from LucyBot.util.human_readable import humanbytes
from LucyBot.util.file_properties import get_file_ids
from LucyBot.server.exceptions import InvalidHash


# Bot ka naam aur info yahan customize karo
BOT_NAME = "SuhaniBots"
DISCLAIMER = (
    "This platform provides high-speed streaming and download services. "
    "Strictly for personal use."
)
REPORT_LINK = "https://t.me/SuhaniBots"


async def render_page(id, secure_hash, src=None):
    try:
        file_data = await get_file_ids(Codeflix, int(LOG_CHANNEL), int(id))
    except Exception as e:
        logging.error(f"Error fetching file info: {e}")
        raise

    if file_data.unique_id[:6] != secure_hash:
        logging.debug(f"Invalid hash for message with ID {id}")
        raise InvalidHash

    # File URL banao
    if not URL.endswith("/"):
        url_base = URL + "/"
    else:
        url_base = URL

    src = urllib.parse.urljoin(url_base, f"{id}?hash={secure_hash}")

    tag = file_data.mime_type.split("/")[0].strip()
    file_size = humanbytes(file_data.file_size)

    if tag in ["video", "audio"]:
        template_file = "LucyBot/template/req.html"
    else:
        template_file = "LucyBot/template/dl.html"
        try:
            async with aiohttp.ClientSession() as s:
                async with s.get(src) as u:
                    if u.status == 200:
                        content_length = u.headers.get("Content-Length")
                        file_size = humanbytes(int(content_length)) if content_length else "Unknown"
                    else:
                        file_size = "Unknown"
        except Exception as e:
            logging.error(f"Failed to fetch file size: {e}")
            file_size = "Unknown"

    try:
        async with aiofiles.open(template_file, mode='r') as f:
            content = await f.read()
        template = jinja2.Template(content)
    except Exception as e:
        logging.error(f"Error reading template: {e}")
        return "Template Error"

    file_name = file_data.file_name.replace("_", " ") if file_data.file_name else f"File_{id}.mkv"

    # BOT_USERNAME nahi hai is bot mein, isliye hardcode kar rahe hain
    tg_link = f"https://t.me/SuhaniBots"

    return template.render(
        file_name=file_name,
        file_url=src,
        file_size=file_size,
        file_unique_id=file_data.unique_id,
        template_ne=BOT_NAME,
        disclaimer=DISCLAIMER,
        report_link=REPORT_LINK,
        colours={},
        tg_button=tg_link,
    )
