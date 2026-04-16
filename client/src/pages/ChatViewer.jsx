import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Format offset seconds → h:mm:ss or m:ss
const fmtOffset = (s) => {
  if (s == null) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`;
};

// Convert offset seconds to Twitch URL timestamp param (e.g. 3725 → "1h2m5s")
const toTwitchTime = (s) => {
  if (!s) return '0s';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return [h && `${h}h`, m && `${m}m`, `${sec}s`].filter(Boolean).join('');
};

export default function ChatViewer() {
  const [selectedVOD, setSelectedVOD] = useState(null);
  const [input, setInput] = useState('');
  const [search, setSearch] = useState('');
  const [usernameFilter, setUsernameFilter] = useState('');
  const [sort, setSort] = useState('asc');
  const [page, setPage] = useState(0);
  const [collapsedStreamers, setCollapsedStreamers] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null); // { vodId, title }
  const LIMIT = 500;
  const topRef = useRef();
  const qc = useQueryClient();

  // VODs with chat — returned flat, we group by user_login client-side
  const { data: vodData } = useQuery({
    queryKey: ['chat-vods'],
    queryFn: () => axios.get(`${API}/api/chat/vods`).then(r => r.data.vods),
    staleTime: 10000
  });

  // Group vods by streamer
  const streamerGroups = groupByStreamer(vodData || []);
  const streamers = Object.keys(streamerGroups).sort();

  // Messages
  const { data: msgData, isLoading } = useQuery({
    queryKey: ['chat', selectedVOD, search, usernameFilter, sort, page],
    queryFn: () =>
      axios.get(`${API}/api/chat`, {
        params: {
          vodId: selectedVOD || undefined,
          search: search || undefined,
          username: usernameFilter || undefined,
          sort,
          limit: LIMIT,
          offset: page * LIMIT
        }
      }).then(r => r.data),
    keepPreviousData: true
  });

  // Stats for selected VOD (only when a specific VOD is chosen)
  const { data: stats } = useQuery({
    queryKey: ['stats', selectedVOD],
    queryFn: () => axios.get(`${API}/api/chat/stats/${selectedVOD}`).then(r => r.data),
    enabled: !!selectedVOD
  });

  // Find the VOD record for building Twitch URLs
  const selectedVodRecord = vodData?.find(v => v.id === selectedVOD);

  // Delete chat only (keep VOD record)
  const { mutate: deleteChat } = useMutation({
    mutationFn: (vodId) => axios.delete(`${API}/api/chat/vod/${vodId}`),
    onSuccess: (_, vodId) => {
      setConfirmDelete(null);
      if (selectedVOD === vodId) setSelectedVOD(null);
      qc.invalidateQueries({ queryKey: ['chat-vods'] });
      qc.invalidateQueries({ queryKey: ['chat'] });
    }
  });

  useEffect(() => { topRef.current?.scrollTo({ top: 0 }); }, [page, search, selectedVOD]);

  const doSearch = useCallback(() => {
    setSearch(input); setUsernameFilter(''); setPage(0);
  }, [input]);

  const filterByUser = (username) => {
    setUsernameFilter(username); setSearch(''); setInput(''); setPage(0);
  };

  const clearFilters = () => {
    setSearch(''); setUsernameFilter(''); setInput(''); setPage(0);
  };

  const selectVOD = (id) => { setSelectedVOD(id); setPage(0); };

  const toggleStreamer = (login) => {
    setCollapsedStreamers(prev => {
      const n = new Set(prev);
      n.has(login) ? n.delete(login) : n.add(login);
      return n;
    });
  };

  const messages = msgData?.messages || [];
  const total = msgData?.total || 0;
  const totalPages = Math.ceil(total / LIMIT);
  const totalVODMsgs = vodData?.reduce((a, v) => a + v.message_count, 0) || 0;

  return (
    <div className="chat-layout">

      {/* ── Left Sidebar: grouped by streamer ── */}
      <div className="chat-sidebar">

        {/* All VODs */}
        <div className="sidebar-section">
          <div
            className={`filter-item ${!selectedVOD ? 'active' : ''}`}
            onClick={() => selectVOD(null)}
          >
            <span className="filter-label">All VODs</span>
            <span className="filter-count">{totalVODMsgs.toLocaleString()}</span>
          </div>
        </div>

        {/* Grouped by streamer */}
        {streamers.length === 0 && (
          <p className="sidebar-empty">No chats downloaded yet.<br />Go to VODs tab.</p>
        )}

        {streamers.map(login => {
          const vods = streamerGroups[login];
          const streamerTotal = vods.reduce((a, v) => a + v.message_count, 0);
          const isCollapsed = collapsedStreamers.has(login);

          return (
            <div key={login} className="streamer-group">
              <div className="streamer-group-header" onClick={() => toggleStreamer(login)}>
                <span className="streamer-chevron">{isCollapsed ? '▶' : '▼'}</span>
                <span className="streamer-name">{login}</span>
                <span className="filter-count">{streamerTotal.toLocaleString()}</span>
              </div>

              {!isCollapsed && (
                <div className="streamer-vod-list">
                  {vods.map(v => (
                    <div
                      key={v.id}
                      className={`filter-item filter-item-vod ${selectedVOD === v.id ? 'active' : ''}`}
                      title={v.title}
                    >
                      <div className="filter-item-inner" onClick={() => selectVOD(v.id)}>
                        <span className="filter-label">{v.title}</span>
                        <span className="filter-count">{v.message_count.toLocaleString()}</span>
                        <span className="filter-meta">{new Date(v.created_at).toLocaleDateString()}</span>
                      </div>
                      <button
                        className="sidebar-delete-btn"
                        onClick={e => { e.stopPropagation(); setConfirmDelete({ vodId: v.id, title: v.title }); }}
                        title="Delete chat"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Sort */}
        <div className="sidebar-section" style={{ marginTop: '1rem' }}>
          <div className="sidebar-title">Sort</div>
          {[['asc', '⏱ Oldest first'], ['desc', '⏱ Newest first'], ['username', '🔤 By username']].map(([v, l]) => (
            <div key={v} className={`filter-item ${sort === v ? 'active' : ''}`} onClick={() => setSort(v)}>{l}</div>
          ))}
        </div>

        {/* Export */}
        {selectedVOD && (
          <div className="sidebar-section">
            <div className="sidebar-title">Export</div>
            <a className="btn-export" href={`${API}/api/chat/export/${selectedVOD}?format=csv`} target="_blank" rel="noreferrer">↓ CSV</a>
            <a className="btn-export" href={`${API}/api/chat/export/${selectedVOD}?format=json`} target="_blank" rel="noreferrer">↓ JSON</a>
          </div>
        )}
      </div>

      {/* ── Center: Messages ── */}
      <div className="chat-container">
        <div className="chat-search">
          <input
            type="text"
            placeholder="Search messages or username..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && doSearch()}
          />
          <button className="btn-primary" onClick={doSearch}>Search</button>
          {(search || usernameFilter) && (
            <button className="btn-secondary" onClick={clearFilters}>✕ Clear</button>
          )}
        </div>

        <div className="chat-messages-header">
          <span className="chat-count">
            {isLoading ? '…' : (
              <>
                <strong>{total.toLocaleString()}</strong> messages
                {usernameFilter && <span className="filter-pill">user: {usernameFilter}</span>}
                {search && <span className="filter-pill">"{search}"</span>}
                {selectedVodRecord && (
                  <span className="filter-pill vod-pill" title={selectedVodRecord.title}>
                    {truncate(selectedVodRecord.title, 28)}
                  </span>
                )}
              </>
            )}
          </span>
          {totalPages > 1 && (
            <div className="pagination">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>‹</button>
              <span>{page + 1} / {totalPages}</span>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>›</button>
            </div>
          )}
        </div>

        <div className="chat-messages" ref={topRef}>
          {isLoading ? (
            <div className="loading"><div className="spinner" /><p style={{ marginTop: '1rem' }}>Loading...</p></div>
          ) : messages.length ? (
            messages.map(msg => (
              <div key={msg.id} className="message">
                <div className="message-header">
                  {/* Username — click to filter */}
                  <span
                    className="username"
                    style={{ color: msg.color || 'var(--secondary)', cursor: 'pointer' }}
                    onClick={() => filterByUser(msg.username)}
                    title={`Filter by ${msg.username}`}
                  >
                    {msg.display_name || msg.username}
                  </span>

                  {/* Timestamp — click to open VOD at that time */}
                  <TwitchTimestamp
                    offsetSeconds={msg.offset_seconds}
                    vodId={msg.vod_id}
                    vodUrl={msg.vod_url}
                  />

                  {/* VOD badge (only when viewing all) */}
                  {!selectedVOD && msg.vod_title && (
                    <span
                      className="vod-badge"
                      onClick={() => selectVOD(msg.vod_id)}
                      title={msg.vod_title}
                      style={{ cursor: 'pointer' }}
                    >
                      {truncate(msg.vod_title, 22)}
                    </span>
                  )}
                </div>
                <div className="message-text">{msg.message}</div>
              </div>
            ))
          ) : (
            <div className="loading">
              <p>No messages found.</p>
              {!vodData?.length && <p style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>Download some VOD chats first.</p>}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Stats ── */}
      <div className="stats-panel">
        {stats ? (
          <>
            <div className="stat-item">
              <div className="stat-label">Messages</div>
              <div className="stat-value">{stats.totalMessages.toLocaleString()}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Unique Chatters</div>
              <div className="stat-value">{stats.uniqueChatters.toLocaleString()}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Msgs / Min</div>
              <div className="stat-value">{stats.messagesPerMinute}</div>
            </div>
            <div className="stat-item">
              <div className="stat-label">Duration</div>
              <div className="stat-value" style={{ fontSize: '1.1rem' }}>{stats.durationMinutes}m</div>
            </div>
            <div className="sidebar-section" style={{ marginTop: '1.5rem' }}>
              <div className="sidebar-title">Top Chatters</div>
              {stats.topChatters.map((c, i) => (
                <div key={c.username} className="top-chatter" onClick={() => filterByUser(c.username)}>
                  <span className="chatter-rank">#{i + 1}</span>
                  <span className="chatter-name">{c.display_name || c.username}</span>
                  <span className="chatter-count">{c.count}</span>
                  <div className="stat-bar">
                    <div className="stat-bar-fill" style={{ width: `${(c.count / stats.topChatters[0].count) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="sidebar-empty">Select a VOD to see stats.</p>
        )}
      </div>

      {/* ── Delete confirm modal ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete chat data?</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.9rem', lineHeight: 1.5 }}>
              {confirmDelete.title}
            </p>
            <p style={{ color: '#f87171', marginTop: '0.75rem', fontSize: '0.825rem' }}>
              This will permanently delete all downloaded chat messages for this VOD.
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button className="btn-danger" onClick={() => deleteChat(confirmDelete.vodId)}>
                Delete Chat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timestamp component: shows time, links to VOD if available ────────────────
function TwitchTimestamp({ offsetSeconds, vodId }) {
  const twitchTime = toTwitchTime(offsetSeconds);
  const vodUrl = vodId ? `https://www.twitch.tv/videos/${vodId}?t=${twitchTime}` : null;

  if (vodUrl) {
    return (
      <a
        className="timestamp timestamp-link"
        href={vodUrl}
        target="_blank"
        rel="noreferrer"
        onClick={e => e.stopPropagation()}
        title={`Open VOD at ${fmtOffset(offsetSeconds)}`}
      >
        {fmtOffset(offsetSeconds)} ↗
      </a>
    );
  }

  return <span className="timestamp">{fmtOffset(offsetSeconds)}</span>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function groupByStreamer(vods) {
  return vods.reduce((acc, v) => {
    const key = v.user_login || 'unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(v);
    return acc;
  }, {});
}

function truncate(s, n) { return s?.length > n ? s.slice(0, n) + '…' : s; }
