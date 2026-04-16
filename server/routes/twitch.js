import express from 'express';
import axios from 'axios';
import { getDB } from '../db.js';
import { getAppToken } from '../twitchAuth.js';

const router = express.Router();
const HELIX = 'https://api.twitch.tv/helix';
const GQL = 'https://gql.twitch.tv/gql';
const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko';
const GQL_HASH = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a';

// In-memory download progress: vodId -> { status, count, error }
export const downloadProgress = new Map();

// ─── GET /api/user/:username ──────────────────────────────────────────────────
router.get('/user/:username', async (req, res) => {
  try {
    const token = await getAppToken();
    const headers = {
      'Client-ID': process.env.TWITCH_CLIENT_ID,
      'Authorization': `Bearer ${token}`
    };

    const userRes = await axios.get(`${HELIX}/users`, {
      params: { login: req.params.username.toLowerCase().trim() },
      headers
    });

    if (!userRes.data.data.length) {
      return res.status(404).json({ error: `User "${req.params.username}" not found` });
    }

    const user = userRes.data.data[0];

    const vodsRes = await axios.get(`${HELIX}/videos`, {
      params: { user_id: user.id, first: 50, sort: 'time', type: 'archive' },
      headers
    });

    const db = await getDB();

    for (const vod of vodsRes.data.data) {
      await db.run(
        `INSERT OR IGNORE INTO vods (id, user_id, user_login, title, duration, created_at, view_count, thumbnail_url, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [vod.id, user.id, user.login, vod.title, vod.duration,
         vod.created_at, vod.view_count, vod.thumbnail_url, vod.url]
      );
    }

    const localVods = await db.all(
      `SELECT v.*, COUNT(cm.id) as message_count
       FROM vods v
       LEFT JOIN chat_messages cm ON cm.vod_id = v.id
       WHERE v.user_id = ?
       GROUP BY v.id
       ORDER BY v.created_at DESC`,
      [user.id]
    );

    res.json({
      user: {
        id: user.id,
        login: user.login,
        displayName: user.display_name,
        profileImageUrl: user.profile_image_url,
        description: user.description,
        viewCount: user.view_count
      },
      vods: localVods.map(v => ({
        id: v.id,
        title: v.title,
        duration: v.duration,
        createdAt: v.created_at,
        viewCount: v.view_count,
        thumbnailUrl: v.thumbnail_url
          ? v.thumbnail_url.replace('%{width}', '440').replace('%{height}', '248')
          : null,
        url: v.url,
        downloadedAt: v.downloaded_at,
        messageCount: v.message_count,
        progress: downloadProgress.get(v.id) || null
      }))
    });
  } catch (err) {
    console.error('User lookup error:', err.response?.data || err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/download-chat ──────────────────────────────────────────────────
router.post('/download-chat', async (req, res) => {
  const { vodIds } = req.body;
  if (!vodIds?.length) return res.status(400).json({ error: 'Missing vodIds' });

  for (const id of vodIds) {
    downloadProgress.set(id, { status: 'queued', count: 0, error: null });
  }

  setImmediate(async () => {
    for (const id of vodIds) {
      await downloadVODChat(id);
    }
  });

  res.json({ status: 'queued', vodIds });
});

// ─── GET /api/download-status ─────────────────────────────────────────────────
router.get('/download-status', (req, res) => {
  const ids = req.query.vodIds ? String(req.query.vodIds).split(',') : [];
  const progress = {};
  for (const id of ids) progress[id] = downloadProgress.get(id) || null;
  res.json({ progress });
});

// ─── Core: Twitch GQL offset-based pagination with ID deduplication ───────────
// Twitch's GQL cursor pagination requires an integrity token (returns
// "failed integrity check" error). Instead we paginate by re-requesting
// from the last message's contentOffsetSeconds and dedup by message ID.
async function downloadVODChat(vodId) {
  downloadProgress.set(vodId, { status: 'downloading', count: 0, error: null });
  console.log(`⬇️  VOD ${vodId}: starting`);

  const db = await getDB();

  try {
    // Ensure VOD row exists (FK constraint)
    const existing = await db.get('SELECT id FROM vods WHERE id = ?', [vodId]);
    if (!existing) {
      const token = await getAppToken();
      const vodRes = await axios.get(`${HELIX}/videos`, {
        params: { id: vodId },
        headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, 'Authorization': `Bearer ${token}` }
      });
      const v = vodRes.data.data[0];
      if (!v) throw new Error(`VOD ${vodId} not found on Twitch`);
      await db.run(
        `INSERT OR IGNORE INTO vods (id, user_id, user_login, title, duration, created_at, view_count, thumbnail_url, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [v.id, v.user_id, v.user_login, v.title, v.duration, v.created_at, v.view_count, v.thumbnail_url, v.url]
      );
    }

    await db.run('DELETE FROM chat_messages WHERE vod_id = ?', [vodId]);

    const seen = new Set();  // dedup by message ID
    let total = 0;
    let offset = 0;       // contentOffsetSeconds for next request
    let lastOffset = -1;  // track if we're advancing
    let stuckCount = 0;
    let pages = 0;

    while (true) {
      const res = await axios.post(GQL, {
        operationName: 'VideoCommentsByOffsetOrCursor',
        variables: { videoID: vodId, contentOffsetSeconds: offset },
        extensions: { persistedQuery: { version: 1, sha256Hash: GQL_HASH } }
      }, {
        headers: { 'Client-ID': GQL_CLIENT_ID, 'Content-Type': 'application/json' },
        timeout: 15000
      });

      const comments = res.data?.data?.video?.comments;
      if (!comments?.edges?.length) break;

      const edges = comments.edges;
      const hasNext = comments.pageInfo?.hasNextPage;

      // Batch insert only unseen messages
      const newRows = edges.filter(e => !seen.has(e.node.id));
      if (newRows.length > 0) {
        const stmt = await db.prepare(
          `INSERT OR IGNORE INTO chat_messages
             (id, vod_id, username, display_name, message, offset_seconds, color, emotes, badges)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        );
        for (const { node: c } of newRows) {
          seen.add(c.id);
          const msgText = (c.message?.fragments || []).map(f => f.text || '').join('');
          const emotes = (c.message?.fragments || []).filter(f => f.emote).map(f => ({ id: f.emote.emoteID, text: f.text }));
          await stmt.run(
            c.id, vodId,
            c.commenter?.login || 'unknown',
            c.commenter?.displayName || c.commenter?.login || 'unknown',
            msgText,
            Math.floor(c.contentOffsetSeconds || 0),
            c.message?.userColor || null,
            emotes.length ? JSON.stringify(emotes) : null,
            c.message?.userBadges?.length ? JSON.stringify(c.message.userBadges) : null
          );
        }
        await stmt.finalize();
        total += newRows.length;
      }

      pages++;
      const newOffset = edges[edges.length - 1].node.contentOffsetSeconds;

      if (!hasNext) break;  // reached end of VOD chat

      // Advance offset. If stuck (offset not moving), force +1s to unstick.
      if (newOffset <= lastOffset) {
        stuckCount++;
        if (stuckCount >= 3) {
          offset = Math.ceil(newOffset) + 1;
          stuckCount = 0;
          console.log(`  ↷ VOD ${vodId}: force-advancing to ${offset}s (was stuck)`);
        }
        // else: keep same offset, try again (may get next page of same-second msgs)
      } else {
        stuckCount = 0;
        lastOffset = newOffset;
        offset = newOffset;
      }

      downloadProgress.set(vodId, { status: 'downloading', count: total, error: null });

      if (pages % 500 === 0) {
        console.log(`  … VOD ${vodId}: ${total} msgs, offset ${Math.floor(offset)}s`);
      }
      if (pages >= 50000) { console.warn(`Page limit hit at ${total} msgs`); break; }

      await sleep(80); // ~12 req/s
    }

    await db.run('UPDATE vods SET downloaded_at = CURRENT_TIMESTAMP WHERE id = ?', [vodId]);
    downloadProgress.set(vodId, { status: 'done', count: total, error: null });
    console.log(`✅  VOD ${vodId}: ${total} messages in ${pages} pages`);

  } catch (err) {
    const msg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message;
    console.error(`❌  VOD ${vodId} failed:`, msg);
    downloadProgress.set(vodId, { status: 'error', count: 0, error: msg });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export default router;
