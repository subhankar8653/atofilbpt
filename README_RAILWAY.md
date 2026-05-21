# SuhaniBots - AutoFilter Bot

**Channel:** https://t.me/SuhaniBots

## Railway Deployment Guide

### Step 1: Fork/Upload to GitHub
1. Create a new GitHub repository

### Step 2: Deploy on Railway
1. Go to [railway.app](https://railway.app)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your repository
4. Railway will auto-detect the Dockerfile

### Step 3: Set Environment Variables
In Railway dashboard → Variables, add these:

| Variable | Description |
|----------|-------------|
| `API_ID` | Your Telegram API ID (from my.telegram.org) |
| `API_HASH` | Your Telegram API Hash |
| `BOT_TOKEN` | Your Bot Token from @BotFather |
| `DATABASE_URI` | MongoDB URI
| `DATABASE_NAME` | MongoDB database name |
| `LOG_CHANNEL` | Your log channel ID (e.g. -1001234567890) |
| `ADMINS` | Your Telegram user ID |
| `CHANNELS` | Channel ID for auto-indexing |
| `PORT` | 8080 (default) |
| `NO_PORT` | True |

### Optional Variables
| Variable | Description |
|----------|-------------|
| `OWNERID` | Your Telegram user ID |
| `AUTH_CHANNEL` | Force subscribe channel ID |
| `SUPPORT_CHAT` | https://t.me/SuhaniBots |
| `CHNL_LNK` | https://t.me/SuhaniBots |
| `OWNER_LNK` | Your Telegram link |

### Step 4: Deploy
Click **Deploy** - Railway will build using Dockerfile automatically!

---
Powered by **SuhaniBots** | https://t.me/SuhaniBots
