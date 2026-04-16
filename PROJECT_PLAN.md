# Twitch VOD Chat Downloader & Viewer
## Project Export Plan

---

## 1. STACK

**Backend:**
- Node.js + Express
- SQLite (local DB for chat + VOD metadata)
- TwitchAPI (OAuth + Helix endpoints)
- puppeteer/playwright OR TwitchDownloader CLI (chat extraction)

**Frontend:**
- React + TypeScript
- TanStack Query (data fetching)
- SQLite compiled to WASM (local browser queries)
- Electron OR Vite dev server (locally hosted)

**Storage:**
- SQLite file (user machine) → stores all chat + VOD metadata
- No cloud. Full control.

---

## 2. CORE FEATURES

### Phase 1: MVP
1. **Twitch Auth**
   - OAuth login (get user + access token)
   - Read VOD list for logged-in user

2. **VOD Discovery**
   - List recent VODs (user's broadcasts)
   - Show: title, date, duration, view count, thumbnail
   - Multi-select VODs for bulk download

3. **Chat Extraction**
   - Download chat JSON for selected VODs
   - Store in SQLite (VOD_ID, username, message, timestamp, emotes)
   - Show progress bar per VOD

4. **Chat Viewer**
   - View ALL messages (unified timeline, newest first or oldest first)
   - Filter by VOD
   - Search: username, keywords, timestamps
   - Export as CSV/JSON

### Phase 2: Polish
- Sort/order by: username, time, VOD
- Emote rendering (parse Twitch emotes)
- Message reactions (replies, threads)
- Chat stats: top chatters, message frequency by VOD
- Dark/light theme
- Bulk delete old chats

---

## 3. DATA SCHEMA

```sql
-- VODs
CREATE TABLE vods (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  duration INTEGER,
  created_at TEXT,
  view_count INTEGER,
  thumbnail_url TEXT,
  downloaded_at TEXT,
  url TEXT
);

-- Chat Messages
CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  vod_id TEXT,
  username TEXT,
  message TEXT,
  timestamp INTEGER,
  created_at TEXT,
  emotes TEXT,
  badges TEXT,
  FOREIGN KEY (vod_id) REFERENCES vods(id)
);

-- Indexes (fast search)
CREATE INDEX idx_username ON chat_messages(username);
CREATE INDEX idx_message ON chat_messages(message);
CREATE INDEX idx_vod_id ON chat_messages(vod_id);
CREATE INDEX idx_timestamp ON chat_messages(timestamp);
```

---

## 4. ARCHITECTURE

```
twitchchatlogs/
├── server/
│   ├── auth.js          (Twitch OAuth)
│   ├── api.js           (VOD list, chat download)
│   ├── db.js            (SQLite init + queries)
│   └── index.js         (Express server)
│
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── VODSelector.tsx    (List + select VODs)
│   │   │   ├── ChatViewer.tsx     (Search + display chat)
│   │   │   └── Stats.tsx          (Chat stats dashboard)
│   │   ├── components/
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── SearchBar.tsx
│   │   │   └── VODCard.tsx
│   │   ├── hooks/
│   │   │   ├── useChat.ts         (Local SQLite query)
│   │   │   └── useVODs.ts
│   │   └── App.tsx
│   └── public/
│
└── db.sqlite              (Local storage)
```

---

## 5. WORKFLOW

1. **User logs in** → Twitch OAuth
2. **Fetch VODs** → API call, show list
3. **Select VODs** → Checkbox multi-select
4. **Download chat** → 
   - Fetch from TwitchAPI OR extract via TwitchDownloader CLI
   - Insert into SQLite
   - Show progress
5. **View chat** → 
   - Query SQLite locally (instant, no server)
   - Filter by VOD, username, keyword
   - Sort by time/username
6. **Export** → CSV or JSON download

---

## 6. TECH CHOICES RATIONALE

| Tech | Why |
|------|-----|
| Electron | Desktop app, no server needed, full local control |
| SQLite | Zero setup, single file, full-text search, WASM support |
| TwitchAPI Helix | Official, reliable, VOD + user data |
| React | Fast UI, component reuse, good ecosystem |
| TanStack Query | Caching, state management, syncing |

**Alternative:** Vite + Node.js dev server (simpler, no Electron packaging)

---

## 7. API ENDPOINTS

```
POST /auth/login
GET  /api/vods                (list user's VODs)
POST /api/download-chat       (queue chat download)
GET  /api/download-status     (progress check)
GET  /api/chat                (query chat from DB)
POST /api/chat/search         (keyword search)
POST /api/export              (CSV/JSON export)
```

---

## 8. CHAT EXTRACTION METHOD

**Option A: TwitchAPI Helix (Recommended)**
- No API call limits for chat history (public endpoint)
- Returns JSON directly
- Reliable, official

**Option B: TwitchDownloader CLI**
- External tool, must install
- More robust, handles edge cases
- CLI wrapper in Node.js

**Option C: Selenium/Puppeteer**
- Slow, unreliable
- Avoid

Pick **Option A** (TwitchAPI Helix) + fallback to **Option B** if API limits hit.

---

## 9. UI FLOW (Caveman Describe)

**Login Page:**
- Big "Login with Twitch" button
- Clean, minimal

**VOD Selector:**
- Grid of recent VODs (cards: thumbnail, title, date, duration)
- Checkboxes for multi-select
- "Download Chat" button triggers batch job
- Progress bar shows download status

**Chat Viewer:**
- Search bar (top): username, keyword, date range
- Filters (left sidebar): VOD, sort order, message count
- Chat list (center): message, username, time, VOD badge
- Click message → expand details (emotes, badges, replies)
- Right sidebar: stats (top users, message count, time range)

**Export:**
- Button → download CSV/JSON with selected filters

---

## 10. MVPS (BUILD ORDER)

1. **Week 1:** Twitch auth + VOD list
2. **Week 2:** Chat extraction + SQLite storage
3. **Week 3:** Chat viewer + basic search
4. **Week 4:** Polish UI, export, stats

---

## 11. DEPLOYMENT (LOCAL)

```bash
# Install
npm install

# Dev mode (Electron)
npm run dev

# Build standalone
npm run build

# Result: single .exe or .app file
```

No server needed. Everything on user machine. Perfect for local use.

---

## 12. FUTURE FEATURES

- Multi-user (non-Twitch) chat (YouTube, Discord exports)
- Chat sentiment analysis
- Emote frequency charts
- Subscriber/mod filtering
- Moderation timeline
- Chat comparison (side-by-side VODs)
- Auto-refresh when new VODs detected

---

## NEXT STEP

1. Set up Node backend + SQLite
2. Implement Twitch OAuth
3. Build React frontend skeleton
4. Connect API endpoints
5. Design & implement UI
