import express from 'express';
import { getDB } from '../db.js';

const router = express.Router();

// ─── GET /api/chat/vods ───────────────────────────────────────────────────────
// All VODs that have downloaded chat (for sidebar)
router.get('/vods', async (req, res) => {
  try {
    const db = await getDB();
    const vods = await db.all(
      `SELECT v.id, v.user_login, v.title, v.created_at, v.duration,
              COUNT(cm.id) as message_count
       FROM vods v
       INNER JOIN chat_messages cm ON cm.vod_id = v.id
       GROUP BY v.id
       ORDER BY v.created_at DESC`
    );
    res.json({ vods });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chat ────────────────────────────────────────────────────────────
// Query messages with optional filters
router.get('/', async (req, res) => {
  const { vodId, search, username, sort = 'asc', limit = 500, offset = 0 } = req.query;

  try {
    const db = await getDB();

    let where = [];
    let params = [];

    if (vodId) { where.push('cm.vod_id = ?'); params.push(vodId); }
    if (username) { where.push('cm.username = ?'); params.push(username.toLowerCase()); }
    if (search) {
      where.push('(cm.username LIKE ? OR cm.display_name LIKE ? OR cm.message LIKE ?)');
      const t = `%${search}%`;
      params.push(t, t, t);
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const orderMap = {
      asc: 'cm.offset_seconds ASC',
      desc: 'cm.offset_seconds DESC',
      username: 'cm.username ASC, cm.offset_seconds ASC'
    };
    const orderClause = orderMap[sort] || orderMap.asc;

    const messages = await db.all(
      `SELECT cm.id, cm.vod_id, cm.username, cm.display_name,
              cm.message, cm.offset_seconds, cm.color, cm.emotes, cm.badges,
              v.title as vod_title, v.user_login, v.url as vod_url
       FROM chat_messages cm
       LEFT JOIN vods v ON v.id = cm.vod_id
       ${whereClause}
       ORDER BY ${orderClause}
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), Number(offset)]
    );

    // Total count for pagination
    const countRow = await db.get(
      `SELECT COUNT(*) as total FROM chat_messages cm
       LEFT JOIN vods v ON v.id = cm.vod_id
       ${whereClause}`,
      params
    );

    res.json({ messages, total: countRow.total });
  } catch (err) {
    console.error('Chat fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chat/stats/:vodId ───────────────────────────────────────────────
router.get('/stats/:vodId', async (req, res) => {
  const { vodId } = req.params;
  try {
    const db = await getDB();

    const [total, unique, topChatters, timespan, vod] = await Promise.all([
      db.get('SELECT COUNT(*) as count FROM chat_messages WHERE vod_id = ?', [vodId]),
      db.get('SELECT COUNT(DISTINCT username) as count FROM chat_messages WHERE vod_id = ?', [vodId]),
      db.all(
        `SELECT username, display_name, COUNT(*) as count
         FROM chat_messages WHERE vod_id = ?
         GROUP BY username ORDER BY count DESC LIMIT 15`,
        [vodId]
      ),
      db.get(
        `SELECT MIN(offset_seconds) as min_t, MAX(offset_seconds) as max_t
         FROM chat_messages WHERE vod_id = ?`,
        [vodId]
      ),
      db.get('SELECT title, user_login FROM vods WHERE id = ?', [vodId])
    ]);

    const durationSecs = (timespan?.max_t || 0) - (timespan?.min_t || 0);
    const durationMins = durationSecs / 60 || 1;

    res.json({
      vodId,
      vodTitle: vod?.title,
      userLogin: vod?.user_login,
      totalMessages: total.count,
      uniqueChatters: unique.count,
      topChatters,
      durationMinutes: Math.round(durationMins),
      messagesPerMinute: Math.round((total.count / durationMins) * 10) / 10
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/chat/export/:vodId ─────────────────────────────────────────────
router.get('/export/:vodId', async (req, res) => {
  const { vodId } = req.params;
  const fmt = req.query.format || 'csv';
  try {
    const db = await getDB();
    const messages = await db.all(
      `SELECT username, display_name, offset_seconds, message, badges, color
       FROM chat_messages WHERE vod_id = ? ORDER BY offset_seconds ASC`,
      [vodId]
    );

    if (fmt === 'json') {
      res.setHeader('Content-Disposition', `attachment; filename="chat-${vodId}.json"`);
      return res.json(messages);
    }

    const csv = [
      ['username', 'display_name', 'offset_seconds', 'message', 'badges', 'color'].join(','),
      ...messages.map(m =>
        [m.username, m.display_name, m.offset_seconds, csvEsc(m.message), csvEsc(m.badges || ''), m.color || ''].join(',')
      )
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="chat-${vodId}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/chat/vod/:vodId ─── wipe chat only, keep VOD record
router.delete('/vod/:vodId', async (req, res) => {
  try {
    const db = await getDB();
    await db.run('DELETE FROM chat_messages WHERE vod_id = ?', [req.params.vodId]);
    await db.run('UPDATE vods SET downloaded_at = NULL WHERE id = ?', [req.params.vodId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /api/vod/:vodId ─── remove VOD + chat entirely
router.delete('/vod-full/:vodId', async (req, res) => {
  try {
    const db = await getDB();
    await db.run('DELETE FROM chat_messages WHERE vod_id = ?', [req.params.vodId]);
    await db.run('DELETE FROM vods WHERE id = ?', [req.params.vodId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function csvEsc(v) {
  if (!v) return '';
  if (/[,"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export default router;
