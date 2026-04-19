# VodChatArchive - Twitch VOD Chat Downloader & Archive

Download, search, and export Twitch chat logs from any streamer's VODs — fully local, no login required.

## Overview

- 🔍 Look up any Twitch streamer by username
- 📼 Browse their last 50 VODs
- ⬇️ Download chat from one or multiple VODs at once
- 💬 Browse, filter, and search downloaded messages
- 📊 Per-VOD stats (top chatters, msgs/min, unique chatters)
- 📤 Export chat as CSV or JSON
- 🔒 Fully local — all data in a single SQLite file, nothing uploaded

No Twitch account needed. Just a Twitch developer app (Client ID + Secret).

---

## Requirements

- **Node.js** 18 or newer (includes `npm`) — [download](https://nodejs.org/)
- **Git**
- A **Twitch account** (only to register a dev app — not used for login)
- ~Disk space for chat logs (SQLite DB grows with each VOD downloaded)
- Works on Windows, macOS, and Linux

---

## Setup

### 1. Get Twitch Credentials

1. Go to [dev.twitch.tv/console/apps](https://dev.twitch.tv/console/apps)
2. Click **Register Your Application**
3. Fill in:
   - **Name:** anything (e.g. `VodArchive`)
   - **OAuth Redirect URL:** `http://localhost:3001/auth/callback`
   - **Category:** Application Integration
4. Click **Create**, then **Manage**
5. Copy your **Client ID** and click **New Secret**

### 2. Run Setup

```bash
git clone https://github.com/yourusername/twitchchatlogs.git
cd twitchchatlogs
npm install
node setup.js
```

The setup script prompts for your Client ID + Secret, writes `server/.env` and `client/.env.local`, and installs dependencies for both `server/` and `client/`.

> If `setup.js` doesn't install deps for you, run `npm run install:all` manually.

### 3. Start

```bash
npm run dev
```

This launches the Express backend (port **3001**) and the Vite frontend (port **5173**) concurrently.

Open **http://localhost:5173**

---

## Usage

1. **Search** for any Twitch streamer by username
2. **Select** one or more VODs from their archive list
3. **Click "Download Chat"** — progress shown per-VOD in real time
4. **Switch to Chat Archive** to browse, search, and filter messages
5. **Export** as CSV or JSON, or delete logs when done

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/user/:username` | Look up user + fetch their VODs |
| `POST` | `/api/download-chat` | Queue chat download for VOD IDs |
| `GET` | `/api/download-status?vodIds=…` | Poll download progress |
| `GET` | `/api/chat` | Query messages (`vodId`, `search`, `username`, `sort`, `limit`, `offset`) |
| `GET` | `/api/chat/vods` | List VODs with downloaded chat |
| `GET` | `/api/chat/stats/:vodId` | Stats for a VOD |
| `GET` | `/api/chat/export/:vodId?format=csv\|json` | Export chat |
| `DELETE` | `/api/chat/vod/:vodId` | Delete chat only |
| `DELETE` | `/api/chat/vod-full/:vodId` | Delete VOD + chat |

---

## Database Schema

```sql
vods (id, user_id, user_login, title, duration, created_at, view_count, thumbnail_url, url, downloaded_at, added_on)

chat_messages (id, vod_id, username, display_name, message, offset_seconds, color, emotes, badges)
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TanStack Query, Vite |
| Backend | Node.js, Express |
| Database | SQLite |
| Chat API | Twitch GQL (no user auth needed) |
| VOD/User API | Twitch Helix (app token) |

---

## Troubleshooting

**"User not found"** — Check the username spelling. The streamer must have public VODs.

**Chat download stays at 0** — The VOD may have no chat replay (sub-only, deleted, or expired). Check server logs for details.

**Database locked** — Ensure only one server instance is running, then restart.

**Backend not reachable** — Confirm it's running: `curl http://localhost:3001/health`

---

## License

MIT
