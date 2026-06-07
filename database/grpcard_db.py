# database/grpcard_db.py
from pymongo import MongoClient
from info import DATABASE_URI, DATABASE_NAME

_client = MongoClient(DATABASE_URI)
_db = _client[DATABASE_NAME]
_col = _db["grp_card_store"]

def save_grp_card(key: str, search: str, chat_id: int, user_id: int):
    _col.update_one(
        {"_id": key},
        {"$set": {"search": search, "chat_id": chat_id, "user_id": user_id}},
        upsert=True
    )

def get_grp_card(key: str):
    doc = _col.find_one({"_id": key})
    if doc:
        return {"search": doc["search"], "chat_id": doc["chat_id"]}
    return None
