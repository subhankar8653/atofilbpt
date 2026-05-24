
import motor.motor_asyncio
from info import *
import datetime
import pytz  
from pymongo.errors import DuplicateKeyError
from pymongo import MongoClient

my_client = MongoClient(DATABASE_URI)
mydb = my_client["filename"]

async def add_name(user_id, filename):
    user_db = mydb[str(user_id)]
    user = {'_id': filename}
    existing_user = user_db.find_one({'_id': filename})
    if existing_user is not None:
        return False
    try:
        user_db.insert_one(user)
        return True
    except DuplicateKeyError:
        return False
      
async def delete_all_msg(user_id):
    user_db = mydb[str(user_id)]
    user_db.delete_many({})


class Database:
    
    def __init__(self, uri, database_name):
        self._client = motor.motor_asyncio.AsyncIOMotorClient(uri)
        self.db = self._client[database_name]
        self.col = self.db.users
        self.grp = self.db.groups
        self.users = self.db.uersz
        self.req = self.db.requests
        self.botcol = self.db["SuhaniBots"]  
        self.bot_id_col = self.db["bot_id"]
        # FSub channel collections (Link-sharing-bot style)
        self.fsub_data = self.db["fsub_channels"]
        self.rqst_fsub_data = self.db["request_fsub_users"]

    async def find_join_req(self, id):
        return bool(await self.req.find_one({'id': id})) 
     
    async def add_join_req(self, id):
        await self.req.insert_one({'id': id})

    async def del_join_req(self):
        await self.req.drop()

    def new_user(self, id, name):
        return dict(
            id = id,
            name = name,
            ban_status=dict(
                is_banned=False,
                ban_reason="",
            ),
        )

    def new_group(self, id, title):
        return dict(
            id = id,
            title = title,
            chat_status=dict(
                is_disabled=False,
                reason="",
            ),
        )

    async def update_verification(self, id, date, time):
        status = {
            'date': str(date),
            'time': str(time)
        }
        await self.col.update_one({'id': int(id)}, {'$set': {'verification_status': status}})

    async def get_verified(self, id):
        default = {
            'date': "1999-12-31",
            'time': "23:59:59"
        }
        user = await self.col.find_one({'id': int(id)})
        if user:
            return user.get("verification_status", default)
        return default    
    
    async def add_user(self, id, name):
        user = self.new_user(id, name)
        await self.col.insert_one(user)
    
    async def is_user_exist(self, id):
        user = await self.col.find_one({'id':int(id)})
        return bool(user)
    
    async def total_users_count(self):
        count = await self.col.count_documents({})
        return count
    
    async def remove_ban(self, id):
        ban_status = dict(
            is_banned=False,
            ban_reason=''
        )
        await self.col.update_one({'id': id}, {'$set': {'ban_status': ban_status}})
    
    async def ban_user(self, user_id, ban_reason="No Reason"):
        ban_status = dict(
            is_banned=True,
            ban_reason=ban_reason
        )
        await self.col.update_one({'id': user_id}, {'$set': {'ban_status': ban_status}})

    async def get_ban_status(self, id):
        default = dict(
            is_banned=False,
            ban_reason=''
        )
        user = await self.col.find_one({'id':int(id)})
        if not user:
            return default
        return user.get('ban_status', default)

    async def get_all_users(self):
        return self.col.find({})
    
    async def delete_user(self, user_id):
        await self.col.delete_many({'id': int(user_id)})
        
    async def delete_chat(self, id):
        await self.grp.delete_many({'id': int(id)})    

    async def get_banned(self):
        users = self.col.find({'ban_status.is_banned': True})
        chats = self.grp.find({'chat_status.is_disabled': True})
        b_chats = [chat['id'] async for chat in chats]
        b_users = [user['id'] async for user in users]
        return b_users, b_chats
    
    async def add_chat(self, chat, title):
        chat = self.new_group(chat, title)
        await self.grp.insert_one(chat)
    
    async def get_chat(self, chat):
        chat = await self.grp.find_one({'id':int(chat)})
        return False if not chat else chat.get('chat_status')
    
    async def re_enable_chat(self, id):
        chat_status=dict(
            is_disabled=False,
            reason="",
            )
        await self.grp.update_one({'id': int(id)}, {'$set': {'chat_status': chat_status}})
        
    async def update_settings(self, id, settings):
        await self.grp.update_one({'id': int(id)}, {'$set': {'settings': settings}})
            
    async def get_settings(self, id):
        default = {
            'button': SINGLE_BUTTON,
            'botpm': P_TTI_SHOW_OFF,
            'file_secure': PROTECT_CONTENT,
            'imdb': IMDB,
            'spell_check': SPELL_CHECK_REPLY,
            'welcome': MELCOW_NEW_USERS,
            'auto_delete': AUTO_DELETE,
            'auto_ffilter': AUTO_FFILTER,
            'max_btn': MAX_BTN,
            'template': IMDB_TEMPLATE,
            'shortlink': SHORTLINK_URL,
            'shortlink_api': SHORTLINK_API,
            'is_shortlink': IS_SHORTLINK,
            'tutorial': TUTORIAL,
            'is_tutorial': IS_TUTORIAL,
            'is_verify': VERIFY,
            'fsub': MULTI_FSUB,
        }
        chat = await self.grp.find_one({'id':int(id)})
        if chat:
            return chat.get('settings', default)
        return default
    
    async def disable_chat(self, chat, reason="No Reason"):
        chat_status=dict(
            is_disabled=True,
            reason=reason,
            )
        await self.grp.update_one({'id': int(chat)}, {'$set': {'chat_status': chat_status}})

    async def total_chat_count(self):
        count = await self.grp.count_documents({})
        return count
    
    async def get_all_chats(self):
        return self.grp.find({})

    async def get_db_size(self):
        return (await self.db.command("dbstats"))['dataSize']

    async def get_user(self, user_id):
        user_data = await self.users.find_one({"id": user_id})
        return user_data
    async def update_user(self, user_data):
        await self.users.update_one({"id": user_data["id"]}, {"$set": user_data}, upsert=True)

    async def has_premium_access(self, user_id):
        user_data = await self.get_user(user_id)
        if user_data:
            expiry_time = user_data.get("expiry_time")
            if expiry_time is None:
                return False
            elif isinstance(expiry_time, datetime.datetime) and datetime.datetime.now() <= expiry_time:
                return True
            else:
                await self.users.update_one({"id": user_id}, {"$set": {"expiry_time": None}})
        return False
        
    async def update_user(self, user_data):
        await self.users.update_one({"id": user_data["id"]}, {"$set": user_data}, upsert=True)

    async def update_one(self, filter_query, update_data):
        try:
            result = await self.users.update_one(filter_query, update_data)
            return result.matched_count == 1
        except Exception as e:
            print(f"Error updating document: {e}")
            return False

    async def get_expired(self, current_time):
        expired_users = []
        if data := self.users.find({"expiry_time": {"$lt": current_time}}):
            async for user in data:
                expired_users.append(user)
        return expired_users

    async def remove_premium_access(self, user_id):
        return await self.update_one(
            {"id": user_id}, {"$set": {"expiry_time": None}}
        )

    async def check_trial_status(self, user_id):
        user_data = await self.get_user(user_id)
        if user_data:
            return user_data.get("has_free_trial", False)
        return False

    async def give_free_trial(self, user_id):
        user_id = user_id
        seconds = 5*60         
        expiry_time = datetime.datetime.now() + datetime.timedelta(seconds=seconds)
        user_data = {"id": user_id, "expiry_time": expiry_time, "has_free_trial": True}
        await self.users.update_one({"id": user_id}, {"$set": user_data}, upsert=True)

    async def all_premium_users(self):
        count = await self.users.count_documents({
        "expiry_time": {"$gt": datetime.datetime.now()}
        })
        return count

    # ── Bot Mode: Link Count Tracking ──────────────────────────────────────────
    # Normal mode: 24hrs mein kitne links open kiye
    # Earn mode: 24hrs mein kitne shorteners complete kiye (per company)

    async def get_link_count(self, user_id: int) -> dict:
        """24 hours ke andar user ne kitne links access kiye - Normal mode ke liye."""
        user_data = await self.col.find_one({'id': int(user_id)})
        if not user_data:
            return {'count': 0, 'reset_at': None}
        lc = user_data.get('link_count', {})
        reset_at = lc.get('reset_at')
        if reset_at and datetime.datetime.now() > reset_at:
            # 24 hours guzar gaye, reset karo
            await self.col.update_one({'id': int(user_id)}, {'$set': {'link_count': {'count': 0, 'reset_at': None}}})
            return {'count': 0, 'reset_at': None}
        return {'count': lc.get('count', 0), 'reset_at': reset_at}

    async def increment_link_count(self, user_id: int):
        """Link access count badha do. Pehli baar 24hr timer start karo."""
        lc = await self.get_link_count(user_id)
        new_count = lc['count'] + 1
        reset_at = lc['reset_at'] or (datetime.datetime.now() + datetime.timedelta(hours=24))
        await self.col.update_one(
            {'id': int(user_id)},
            {'$set': {'link_count': {'count': new_count, 'reset_at': reset_at}}},
            upsert=True
        )

    async def get_earn_shortener_done(self, user_id: int) -> dict:
        """Earn mode: 24hrs mein user ne kaunse shortener company complete kiye."""
        user_data = await self.col.find_one({'id': int(user_id)})
        if not user_data:
            return {'done': [], 'reset_at': None}
        es = user_data.get('earn_shortener', {})
        reset_at = es.get('reset_at')
        if reset_at and datetime.datetime.now() > reset_at:
            await self.col.update_one({'id': int(user_id)}, {'$set': {'earn_shortener': {'done': [], 'reset_at': None}}})
            return {'done': [], 'reset_at': None}
        return {'done': es.get('done', []), 'reset_at': reset_at}

    async def mark_earn_shortener_done(self, user_id: int, shortener_url: str):
        """Earn mode: ek shortener URL complete mark karo."""
        es = await self.get_earn_shortener_done(user_id)
        done_list = es['done']
        if shortener_url not in done_list:
            done_list.append(shortener_url)
        reset_at = es['reset_at'] or (datetime.datetime.now() + datetime.timedelta(hours=24))
        await self.col.update_one(
            {'id': int(user_id)},
            {'$set': {'earn_shortener': {'done': done_list, 'reset_at': reset_at}}},
            upsert=True
        )

    # ── Fake Link (from linkbot logic) ────────────────────────────────────────
    async def get_fake_link(self):
        """Fake link config fetch karo (agar set kiya hua ho)."""
        try:
            config = await self.col.database['fake_link'].find_one({"_id": "fake_link_config"}) if hasattr(self.col, 'database') else None
            if config:
                return config
        except Exception:
            pass
        # Fallback: botcol mein check karo
        try:
            config = await self.botcol.find_one({"_id": "fake_link_config"})
            return config
        except Exception:
            return None

    async def set_fake_link(self, url: str, button_text: str) -> bool:
        """Fake link set karo."""
        try:
            await self.botcol.update_one(
                {"_id": "fake_link_config"},
                {"$set": {"_id": "fake_link_config", "url": url, "button_text": button_text}},
                upsert=True
            )
            return True
        except Exception:
            return False

    async def remove_fake_link(self) -> bool:
        """Fake link remove karo."""
        try:
            await self.botcol.delete_one({"_id": "fake_link_config"})
            return True
        except Exception:
            return False
    
    async def get_bot_setting(self, bot_id, setting_key, default_value):
        bot = await self.botcol.find_one({'id': int(bot_id)}, {setting_key: 1, '_id': 0})
        return bot[setting_key] if bot and setting_key in bot else default_value
    async def update_bot_setting(self, bot_id, setting_key, value):
        await self.botcol.update_one(
            {'id': int(bot_id)}, 
            {'$set': {setting_key: value}}, 
            upsert=True
        )

    async def pm_search_status(self, bot_id):
        return await self.get_bot_setting(bot_id, 'PM_SEARCH', PM_SEARCH)

    async def update_pm_search_status(self, bot_id, enable):
        await self.update_bot_setting(bot_id, 'PM_SEARCH', enable)

    async def movie_update_status(self, bot_id):
        return await self.get_bot_setting(bot_id, 'MOVIE_UPDATE_NOTIFICATION', MOVIE_UPDATE_NOTIFICATION)

    async def update_movie_update_status(self, bot_id, enable):
        await self.update_bot_setting(bot_id, 'MOVIE_UPDATE_NOTIFICATION', enable)


    # ═══════════════════════════════════════════════════════════
    # FSUB CHANNEL MANAGEMENT (Link-sharing-bot style)
    # mode "off" = normal join, mode "on" = request join
    # ═══════════════════════════════════════════════════════════

    async def add_fsub_channel(self, channel_id: int) -> bool:
        """FSub list mein channel add karo."""
        try:
            result = await self.fsub_data.update_one(
                {"channel_id": channel_id},
                {"$set": {"channel_id": channel_id, "status": "active", "mode": "off"}},
                upsert=True
            )
            return True
        except Exception as e:
            import logging
            logging.error(f"[FSUB] add_fsub_channel error: {e}")
            return False

    async def remove_fsub_channel(self, channel_id: int) -> bool:
        """FSub list se channel remove karo."""
        try:
            result = await self.fsub_data.delete_one({"channel_id": channel_id})
            return result.deleted_count > 0
        except Exception as e:
            import logging
            logging.error(f"[FSUB] remove_fsub_channel error: {e}")
            return False

    async def get_fsub_channels(self):
        """Saare active FSub channel IDs return karo."""
        try:
            docs = await self.fsub_data.find({"status": "active"}).to_list(None)
            return [d["channel_id"] for d in docs if "channel_id" in d]
        except Exception as e:
            import logging
            logging.error(f"[FSUB] get_fsub_channels error: {e}")
            return []

    async def set_fsub_channel_name(self, channel_id: int, custom_name: str) -> bool:
        """Channel button ka custom naam set karo."""
        try:
            await self.fsub_data.update_one(
                {"channel_id": channel_id},
                {"$set": {"custom_name": custom_name.strip()}},
                upsert=False
            )
            return True
        except Exception as e:
            import logging
            logging.error(f"[FSUB] set_fsub_channel_name error: {e}")
            return False

    async def get_fsub_channel_name(self, channel_id: int):
        """Channel ka custom naam lo — None agar set nahi hai."""
        try:
            doc = await self.fsub_data.find_one({"channel_id": channel_id})
            return doc.get("custom_name") if doc else None
        except Exception:
            return None

    async def clear_fsub_channel_name(self, channel_id: int) -> bool:
        """Custom naam hata do, wapas channel title use hoga."""
        try:
            await self.fsub_data.update_one(
                {"channel_id": channel_id},
                {"$unset": {"custom_name": ""}}
            )
            return True
        except Exception:
            return False

    async def get_channel_mode(self, channel_id: int) -> str:
        """Channel ka mode return karo: 'on' (request) ya 'off' (normal)."""
        try:
            doc = await self.fsub_data.find_one({"channel_id": channel_id})
            return doc.get("mode", "off") if doc else "off"
        except Exception:
            return "off"

    async def set_channel_mode(self, channel_id: int, mode: str):
        """Channel ka mode set karo ('on' ya 'off')."""
        await self.fsub_data.update_one(
            {"channel_id": channel_id},
            {"$set": {"mode": mode}},
            upsert=True
        )

    async def set_channel_mode_all(self, mode: str):
        """Saare active FSub channels ka mode ek saath set karo."""
        result = await self.fsub_data.update_many(
            {"status": "active"},
            {"$set": {"mode": mode}}
        )
        return result.modified_count

    # ── Request FSub user tracking ──────────────────────────────

    async def req_user_add(self, channel_id: int, user_id: int):
        """User ko request pending list mein daalo."""
        await self.rqst_fsub_data.update_one(
            {"channel_id": int(channel_id)},
            {"$addToSet": {"user_ids": int(user_id)}},
            upsert=True
        )

    async def req_user_exist(self, channel_id: int, user_id: int) -> bool:
        """Check karo user ne join request submit ki hai ya nahi."""
        try:
            doc = await self.rqst_fsub_data.find_one({
                "channel_id": int(channel_id),
                "user_ids": int(user_id)
            })
            return bool(doc)
        except Exception:
            return False

    async def req_user_del(self, channel_id: int, user_id: int):
        """User request approve hone ke baad list se hatao."""
        await self.rqst_fsub_data.update_one(
            {"channel_id": int(channel_id)},
            {"$pull": {"user_ids": int(user_id)}}
        )


db = Database(DATABASE_URI, DATABASE_NAME)
db2 = Database(DATABASE_URI2, DATABASE_NAME)
