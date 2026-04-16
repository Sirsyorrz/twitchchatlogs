# VodArchive - Twitch VOD Chat Downloader & Archive

Download, extract, and search Twitch chat from all your VODs in one powerful, local tool.

## 📋 Overview

**VodArchive** lets you:
- ✅ Login via Twitch OAuth
- ✅ View all recent VODs from your channel
- ✅ Download chat from multiple VODs at once
- ✅ Search chat by username or keyword
- ✅ View all chat messages unified across VODs
- ✅ Export chat as CSV or JSON
- ✅ View chat statistics (top chatters, message frequency, etc.)
- ✅ Fully local - all data stored on your machine

## 🏗️ Architecture

**Backend:** Node.js + Express + SQLite  
**Frontend:** React + TanStack Query  
**Storage:** SQLite (local file database)  
**Auth:** Twitch OAuth 2.0

All data is stored locally. No cloud uploads. Full privacy.

---

## 🚀 Setup

### Prerequisites
- [Node.js 18+](https://nodejs.org) and npm
- A Twitch account (to create a free developer app)

### Quick Setup (recommended)

```bash
git clone https://github.com/yourusername/twitchchatlogs.git
cd twitchchatlogs
node setup.js
```

The setup script will:
1. Ask for your Twitch Client ID + Secret
2. Write both `.env` files automatically
3. Run `npm install` for all packages

### Get Twitch Credentials

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)
2. Click **Register Your Application**
3. Fill in:
   - Name: anything (e.g. `VodArchive`)
   - OAuth Redirect URL: `http://localhost:3001/auth/callback`
   - Category: Application Integration
4. Click **Create**, then **Manage**
5. Copy **Client ID** and click **New Secret**

### Manual Setup (alternative)

```bash
# Install all deps
npm run install:all

# Server env
cp server/.env.example server/.env
# Edit server/.env with your credentials

# Client env  
cp client/.env.example client/.env.local
# Edit client/.env.local with your Client ID
```

---

## 📝 Usage

1. **Open** `http://localhost:5173` in your browser
2. **Click** "Login with Twitch"
3. **Authorize** the application
4. **Select** VODs from your recent broadcasts
5. **Click** "Download Chat" to extract chat messages
6. **View** all chat in the Chat Archive tab
7. **Search** by username or keywords
8. **Export** as CSV or JSON

---

## 🗄️ Database Schema

### `vods` table
```sql
id TEXT PRIMARY KEY
user_id TEXT
title TEXT
duration INTEGER
created_at TEXT
view_count INTEGER
thumbnail_url TEXT
url TEXT
downloaded_at TEXT
```

### `chat_messages` table
```sql
id TEXT PRIMARY KEY
vod_id TEXT (FK)
username TEXT
message TEXT
timestamp INTEGER
emotes TEXT
badges TEXT
created_at TEXT
```

### `users` table
```sql
id TEXT PRIMARY KEY
login TEXT UNIQUE
display_name TEXT
profile_image_url TEXT
access_token TEXT
refresh_token TEXT
expires_at INTEGER
```

---

## 📡 API Endpoints

### Auth
- `POST /auth/login` - Exchange code for JWT token

### VODs
- `GET /api/vods` - List user's VODs
- `POST /api/vods/download-chat` - Queue chat downloads

### Chat
- `GET /api/chat` - Get chat messages (filterable, searchable)
- `POST /api/chat/search` - Full-text search
- `GET /api/chat/stats/:vodId` - Get chat statistics
- `GET /api/chat/export/:vodId` - Export as CSV/JSON

---

## 🎨 UI Features

### VOD Selector
- Grid view of recent VODs
- Multi-select with checkboxes
- Real-time search filter
- Refresh button to fetch new VODs

### Chat Viewer
- Unified timeline of all chat messages
- Filter by VOD
- Sort by timestamp, username, or custom order
- Real-time search across usernames & messages
- Right sidebar with live stats (total messages, top chatters, etc.)
- Export to CSV or JSON

### Statistics Dashboard
- Total message count
- Unique chatter count
- Top 10 chatters with message counts
- Messages per minute
- Time span duration

---

## 🔄 Workflow

```
User logs in with Twitch OAuth
    ↓
Fetch list of recent VODs
    ↓
Select VOD(s) to download
    ↓
Download chat (stored in SQLite)
    ↓
View/search all chat messages
    ↓
Export or analyze
```

---

## 📦 Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TanStack Query, Vite |
| Backend | Node.js, Express, SQLite |
| Auth | Twitch OAuth 2.0, JWT |
| Styling | CSS (Dark theme, responsive) |

---

## 🛠️ Development

### Run both servers simultaneously:

```bash
# Terminal 1: Backend
cd server && npm run dev

# Terminal 2: Frontend
cd client && npm run dev
```

### Build for production:

```bash
# Frontend
cd client
npm run build

# Output: client/dist/
```

---

## 📋 Project Plan

See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for detailed architecture, data schema, and feature roadmap.

---

## 🎯 Roadmap

### Phase 1 (MVP) ✅
- Twitch auth + VOD list
- Chat extraction
- Basic chat viewer
- Search functionality

### Phase 2 (Planned)
- Emote rendering
- Chat reaction/reply threading
- Moderation timeline
- Bulk chat delete
- Dark/light theme toggle

### Phase 3 (Future)
- Multi-user support
- YouTube chat import
- Sentiment analysis
- Chat comparison (side-by-side VODs)
- Auto-refresh new VODs

---

## 🐛 Troubleshooting

### "Invalid token" error
- Make sure your Twitch credentials are correct in `.env`
- Check that OAuth redirect URL matches in Twitch Console

### "Failed to fetch VODs"
- Verify backend is running on port 3001
- Check that your token hasn't expired

### Database locked error
- Restart the backend server
- Ensure only one instance is running

---

## 📄 License

MIT

---

## 🙋 Support

Open an issue on GitHub for bugs or feature requests.

---

**Made with 💜 for streamers**
