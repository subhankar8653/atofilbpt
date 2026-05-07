<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=180&section=header&text=🤖%20SuhaniBot%20Auto%20Filter&fontSize=42&fontColor=fff&animation=twinkling&fontAlignY=32"/>
</p>

<h2 align="center">
  ━━━「 𝐒𝐔𝐇𝐀𝐍𝐈𝐁𝐎𝐓𝐒 — 𝐀𝐮𝐭𝐨 𝐅𝐢𝐥𝐭𝐞𝐫 𝐁𝐨𝐭 」━━━
</h2>

<p align="center">
  <a href="https://t.me/SuhaniBots"><img src="https://img.shields.io/badge/Channel-SuhaniBots-blue?style=for-the-badge&logo=telegram" /></a>
  <a href="https://t.me/SuhaniBotsSupport"><img src="https://img.shields.io/badge/Support-Group-green?style=for-the-badge&logo=telegram" /></a>
  <img src="https://img.shields.io/badge/Python-3.10+-yellow?style=for-the-badge&logo=python" />
  <img src="https://img.shields.io/badge/MongoDB-Database-brightgreen?style=for-the-badge&logo=mongodb" />
  <img src="https://img.shields.io/badge/License-MIT-red?style=for-the-badge" />
</p>

---

## ✨ Features

| Feature | Status |
|---|---|
| 🎬 Auto File Filtering | ✅ |
| 🔗 Shortener Support (Stream & Download) | ✅ |
| 📺 Online Streaming Website | ✅ |
| 👑 Premium Membership System | ✅ |
| 📌 Multi Force Subscribe (FSub) | ✅ |
| 🌅 Good Morning/Night Auto Wishes | ✅ |
| 🎭 IMDB Info + Poster Fetch | ✅ |
| 🗂️ Index Files above 2GB | ✅ |
| 🔍 AI Spelling Check | ✅ |
| 🔒 File Protection & Forward Restrict | ✅ |
| 📣 User & Group Broadcast | ✅ |
| 🗑️ Auto Delete + PreDVD/CamRip Delete | ✅ |
| 🎁 Redeem Code System | ✅ |
| 🔥 Top Trending & Most Searched | ✅ |
| 📊 Bot Stats & User Info | ✅ |
| 🔗 Refer System | ✅ |
| 🔧 Settings Menu | ✅ |
| 🌐 Inline Search | ✅ |

---

## ⚙️ Required Variables

> Inhe `.env` file ya Railway/Heroku config mein set karo

| Variable | Description |
|---|---|
| `API_ID` | Telegram API ID — [my.telegram.org](https://my.telegram.org) se lo |
| `API_HASH` | Telegram API Hash — same website |
| `BOT_TOKEN` | Bot token — [@BotFather](https://t.me/BotFather) se lo |
| `DATABASE_URI` | MongoDB connection URI |
| `DATABASE_NAME` | MongoDB database name (default: `yato`) |
| `ADMINS` | Admin user IDs (space separated) |
| `CHANNELS` | Channel IDs for auto file indexing |
| `LOG_CHANNEL` | Log channel ID |
| `BIN_CHANNEL` | Bin channel ID |
| `AUTH_CHANNEL` | Force Sub channel ID |

---

## 🔧 Optional Variables

| Variable | Description | Default |
|---|---|---|
| `MULTI_FSUB` | Multiple force subscribe channel IDs | — |
| `PICS` | Welcome image URLs (space separated) | Sample pics |
| `NOR_IMG` | Normal filter result image | Sample |
| `MELCOW_VID` | Welcome video URL | — |
| `SPELL_IMG` | Spelling check image | — |
| `CACHE_TIME` | Inline cache time (seconds) | `300` |
| `USE_CAPTION_FILTER` | Filter by caption too | `True` |
| `QR_CODE` | Payment QR code image URL | — |
| `OWNER_UPI_ID` | UPI ID for payments | — |
| `MOVIE_UPDATE_CHANNEL` | Movie update notification channel | — |
| `PREMIUM_LOGS` | Premium purchase log channel | — |
| `REQST_CHANNEL_ID` | Movie request channel ID | — |
| `SUPPORT_CHAT_ID` | Support group ID | — |
| `IMAGE_FETCH` | IMDB poster fetch karna hai ya nahi | `True` |
| `MOVIE_UPDATE_NOTIFICATION` | New movie notification on/off | `False` |

---

## 🚀 Deployment

### 🐳 Deploy on VPS / Local

```bash
# 1. Repo clone karo
git clone https://github.com/YourUsername/Auto_filter_bot.git
cd Auto_filter_bot

# 2. Dependencies install karo
pip install -r requirements.txt

# 3. .env file banao aur variables fill karo
cp sample.env .env
nano .env

# 4. Bot start karo
python bot.py
```

### 🐋 Docker se Deploy karo

```bash
docker-compose up -d
```

### ☁️ Heroku pe Deploy

<p align="center">
  <a href="https://dashboard.heroku.com/new?template=https://github.com/YourUsername/Auto_filter_bot">
    <img src="https://img.shields.io/badge/Deploy%20On%20Heroku-black?style=for-the-badge&logo=heroku" width="220"/>
  </a>
</p>

---

## 📜 Commands List

### 👤 User Commands

| Command | Kya karta hai |
|---|---|
| `/start` | Bot start karo |
| `/connect` | Group ko PM se connect karo |
| `/disconnect` | Group disconnect karo |
| `/connections` | Connected groups dekho |
| `/settings` | Bot settings change karo |
| `/plan` | Premium plans dekho |
| `/myplan` | Apna current plan dekho |
| `/id` | Telegram ID pata karo |
| `/info` | User info dekho |
| `/shortlink` | Shortener connect karo |
| `/link` | Single post ka link banao |
| `/batch` | Bulk posts ka link banao |

### 🛡️ Admin Commands

| Command | Kya karta hai |
|---|---|
| `/stats` | Database stats dekho |
| `/broadcast` | Sabko message bhejo |
| `/index` | Channel files index karo |
| `/ban` | User ban karo |
| `/unban` | User unban karo |
| `/leave` | Kisi chat se leave karo |
| `/disable` | Chat ko disable karo |

---

## 🗄️ Database Setup

1. [MongoDB Atlas](https://www.mongodb.com/atlas/database) pe jaao
2. Free cluster banao
3. Connection string copy karo
4. `DATABASE_URI` mein paste karo

---

## 🤝 Support

Koi bhi problem ho toh yahan aao:

<p align="center">
  <a href="https://t.me/SuhaniBotsSupport">
    <img src="https://img.shields.io/badge/Join%20Support%20Group-SuhaniBots-blue?style=for-the-badge&logo=telegram" />
  </a>
  &nbsp;
  <a href="https://t.me/SuhaniBots">
    <img src="https://img.shields.io/badge/Updates%20Channel-SuhaniBots-purple?style=for-the-badge&logo=telegram" />
  </a>
</p>

---

## 📄 License

Yeh project **MIT License** ke under hai. Details ke liye [LICENSE](LICENSE) file dekho.

---

<p align="center">
  Made with ❤️ by <b>SuhaniBots</b><br/>
  <i>Powered by Pyrogram & MongoDB</i>
</p>

<p align="center">
  <img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=100&section=footer"/>
</p>
