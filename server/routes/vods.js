import express from 'express';
import axios from 'axios';
import { getDB } from '../db.js';
import { verifyToken } from './auth.js';

const router = express.Router();
const TWITCH_API_URL = 'https://api.twitch.tv/helix';
const TWITCH_V5_URL = 'https://api.twitch.tv/v5';

// In-memory download progress store: { vodId -> { status, count, error } }
export const downloadProgress = new Map();

// ─── GET /api/vods ─── List user's VODs (Twitch + local DB)
router.get('/', verifyToken, async (req, res) => {
  try {
    const db = await getDB();
    const user = await db.get('SELECT access_token FROM users WHERE id = ?', req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fetch from Twitch Helix
    const response = await axios.get(`${TWITCH_API_URL}/videos`, {
      params: { user_id: req.userId, first: 20, sort: 'time', type: 'archive' },
      headers: {
        'Client-ID': process.env.TWITCH_CLIENT_ID,
        'Authorization': `Bearer ${user.access_token}`
      }
    });

    const twitchVods = response.data.data;

    // Upsert into local DB
    for (const vod of twitchVods) {
      await db.run(
        `INSERT OR IGNORE INTO vods (id, user_id, title, duration, created_at, view_count, thumbnail_url, url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [vod.id, req.userId, vod.title, vod.duration, vod.created_at,
         vod.view_count, vod.thumbnail_url, vod.url]
      );
    }

    // Fetch local records (to get downloaded_at status + message counts)
    const localVods = await db.all(
      `SELECT v.*, COUNT(cm.id) as message_count
       FROM vods v
       LEFT JOIN chat_messages cm ON cm.vod_id = v.id
       WHERE v.user_id = ?
       GROUP BY v.id
       ORDER BY v.created_at DESC`,
      [req.userId]
    );

    // Merge with in-memory progress
    const vods = localVods.map(v => ({
      id: v.id,
      title: v.title,
      duration: v.duration,
      createdAt: v.created_at,
      viewCount: v.view_count,
      thumbnailUrl: v.thumbnail_url ? v.thumbnail_url.replace('%{width}', '320').replace('%{height}', '180') : null,
      url: v.url,
      downloadedAt: v.downloaded_at,
      messageCount: v.message_count,
      progress: downloadProgress.get(v.id) || null
    }));

    res.json({ vods });
  } catch (error) {
    console.error('VOD fetch error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to fetch VODs' });
  }
});

// ─── POST /api/vods/download-chat ─── Queue chat extraction
router.post('/download-chat', verifyToken, async (req, res) => {
  const { vodIds } = req.body;
  if (!vodIds?.length) return res.status(400).json({ error: 'Missing vodIds' });

  const db = await getDB();
  const user = await db.get('SELECT access_token FROM users WHERE id = ?', req.userId);

  // Mark all as queued immediately
  for (const vodId of vodIds) {
    downloadProgress.set(vodId, { status: 'queued', count: 0, error: null });
  }

  // Run in background (sequential to avoid rate limits)
  setImmediate(async () => {
    for (const vodId of vodIds) {
      await downloadVODChat(vodId, user.access_token, db);
    }
  });

  res.json({ status: 'queued', message: `Queued ${vodIds.length} VOD(s)`, vodIds });
});

// ─── GET /api/vods/download-status ─── Poll progress for multiple VODs
router.get('/download-status', verifyToken, async (req, res) => {
  const { vodIds } = req.query;
  if (!vodIds) return res.json({ progress: {} });

  const ids = Array.isArray(vodIds) ? vodIds : vodIds.split(',');
  const progress = {};
  for (const id of ids) {
    progress[id] = downloadProgress.get(id) || null;
  }
  res.json({ progress });
});

// ─── Core: Download VOD chat via Twitch v5 API ───────────────────────────────
async function downloadVODChat(vodId, accessToken, db) {
  downloadProgress.set(vodId, { status: 'downloading', count: 0, error: null });
  console.log(`⬇️  Starting chat download: ${vodId}`);

  try {
    // Clear existing messages for re-download
    await db.run('DELETE FROM chat_messages WHERE vod_id = ?', [vodId]);

    let cursor = null;
    let totalInserted = 0;
    let page = 0;

    do {
      const params = cursor
        ? { cursor }
        : { content_offset_seconds: 0 };

      const response = await axios.get(`${TWITCH_V5_URL}/videos/${vodId}/comments`, {
        params,
        headers: {
          'Client-ID': process.env.TWITCH_CLIENT_ID,
          'Accept': 'application/vnd.twitchtv.v5+json'
        },
        timeout: 15000
      });

      const { comments, _next } = response.data;
      if (!comments || comments.length === 0) break;

      // Batch insert messages
      const stmt = await db.prepare(
        `INSERT OR IGNORE INTO chat_messages (id, vod_id, username, message, timestamp, emotes, badges)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const comment of comments) {
        const emotes = comment.message?.emoticons
          ? JSON.stringify(comment.message.emoticons)
          : null;
        const badges = comment.message?.user_badges
          ? JSON.stringify(comment.message.user_badges)
          : null;

        await stmt.run(
          comment._id,
          vodId,
          comment.commenter?.name || 'unknown',
          comment.message?.body || '',
          Math.floor(comment.content_offset_seconds || 0),
          emotes,
          badges
        );
      }

      await stmt.finalize();
      totalInserted += comments.length;
      cursor = _next || null;
      page++;

      // Update progress
      downloadProgress.set(vodId, { status: 'downloading', count: totalInserted, error: null });

      // Small delay between pages to be nice to Twitch API
      if (cursor) await sleep(200);

      // Safety limit: stop at 200 pages (~20k messages)
      if (page >= 200) {
        console.warn(`⚠️  Hit page limit for VOD ${vodId} at ${totalInserted} messages`);
        break;
      }
    } while (cursor);

    // Mark done
    await db.run('UPDATE vods SET downloaded_at = CURRENT_TIMESTAMP WHERE id = ?', [vodId]);
    downloadProgress.set(vodId, { status: 'done', count: totalInserted, error: null });
    console.log(`✅  Finished VOD ${vodId}: ${totalInserted} messages`);

  } catch (error) {
    const msg = error.response?.data?.message || error.message;
    console.error(`❌  Chat download failed for ${vodId}:`, msg);
    downloadProgress.set(vodId, { status: 'error', count: 0, error: msg });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default router;
