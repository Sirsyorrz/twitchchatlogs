import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const STATUS_COLOR = { queued: '#f59e0b', downloading: '#06b6d4', done: '#10b981', error: '#ef4444' };
const STATUS_LABEL = { queued: '⏳ Queued', downloading: '⬇️ Downloading', done: '✅ Done', error: '❌ Error' };

export default function VODSelector({ user, onViewChat }) {
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [activeDownloads, setActiveDownloads] = useState(new Set());
  const [confirmDelete, setConfirmDelete] = useState(null); // vodId pending confirm
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['vods', user.id],
    queryFn: () => axios.get(`${API}/api/user/${user.login}`).then(r => r.data),
    staleTime: 30000
  });

  const vods = data?.vods || [];
  const filtered = vods.filter(v => v.title?.toLowerCase().includes(search.toLowerCase()));

  // Poll download progress
  useEffect(() => {
    if (!activeDownloads.size) return;
    const ids = [...activeDownloads].join(',');
    const iv = setInterval(async () => {
      const res = await axios.get(`${API}/api/download-status?vodIds=${ids}`);
      const prog = res.data.progress;
      let stillActive = false;
      for (const [id, p] of Object.entries(prog)) {
        if (p?.status === 'done' || p?.status === 'error') {
          setActiveDownloads(prev => { const n = new Set(prev); n.delete(id); return n; });
        } else if (p) stillActive = true;
      }
      qc.invalidateQueries({ queryKey: ['vods', user.id] });
      if (!stillActive) clearInterval(iv);
    }, 1500);
    return () => clearInterval(iv);
  }, [activeDownloads, user.id, qc]);

  const { mutate: download, isLoading: queuing } = useMutation({
    mutationFn: (ids) => axios.post(`${API}/api/download-chat`, { vodIds: ids }).then(r => r.data),
    onSuccess: (data) => {
      setActiveDownloads(new Set(data.vodIds));
      setSelected(new Set());
    }
  });

  // Delete chat only
  const { mutate: deleteChat } = useMutation({
    mutationFn: (vodId) => axios.delete(`${API}/api/chat/vod/${vodId}`),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['vods', user.id] });
      qc.invalidateQueries({ queryKey: ['chat-vods'] });
    }
  });

  // Delete VOD + chat entirely
  const { mutate: deleteVOD } = useMutation({
    mutationFn: (vodId) => axios.delete(`${API}/api/chat/vod-full/${vodId}`),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ['vods', user.id] });
      qc.invalidateQueries({ queryKey: ['chat-vods'] });
    }
  });

  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const selectAll = () =>
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(v => v.id)));

  const fmtDur = (d) => {
    if (!d) return '?';
    if (typeof d === 'string') return d;
    const h = Math.floor(d / 3600), m = Math.floor((d % 3600) / 60);
    return h ? `${h}h ${m}m` : `${m}m`;
  };

  const getStatus = (vod) => {
    if (activeDownloads.has(vod.id)) return vod.progress?.status || 'queued';
    if (vod.progress?.status) return vod.progress.status;
    if (vod.downloadedAt) return 'done';
    return null;
  };

  const downloadedCount = vods.filter(v => v.downloadedAt || v.progress?.status === 'done').length;

  if (isLoading) return <div className="loading"><div className="spinner" /><p style={{ marginTop: '1rem' }}>Loading VODs...</p></div>;

  return (
    <div>
      {/* ── Top bar ── */}
      <div className="select-count">
        <div className="select-count-left">
          <div className="user-info-inline">
            <img src={user.profileImageUrl} alt={user.login} className="user-avatar-sm" />
            <span className="user-login-text">{user.displayName}</span>
            <span className="user-vod-count">{vods.length} VODs · {downloadedCount} downloaded</span>
          </div>
        </div>
        <div className="select-count-right">
          {activeDownloads.size > 0 && (
            <span className="downloading-indicator">⬇️ Downloading {activeDownloads.size}...</span>
          )}
          {downloadedCount > 0 && (
            <button className="btn-secondary" onClick={onViewChat}>View Chat Archive →</button>
          )}
          <button className="btn-secondary" onClick={selectAll}>
            {selected.size === filtered.length && filtered.length > 0 ? 'Deselect All' : 'Select All'}
          </button>
          <button
            className="btn-primary"
            onClick={() => download([...selected])}
            disabled={queuing || selected.size === 0}
          >
            {queuing ? 'Queuing...' : `⬇️ Download Chat (${selected.size})`}
          </button>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="vod-controls">
        <input
          type="text"
          className="search-input"
          placeholder="Filter VODs by title..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{filtered.length} VODs</span>
      </div>

      {/* ── Grid ── */}
      {filtered.length === 0 ? (
        <div className="loading"><p>No VODs found.</p></div>
      ) : (
        <div className="vod-grid">
          {filtered.map(vod => {
            const status = getStatus(vod);
            const isActive = activeDownloads.has(vod.id);
            const prog = vod.progress;
            const isSelected = selected.has(vod.id);
            const hasChat = vod.messageCount > 0;

            return (
              <div key={vod.id} className={`vod-card ${isSelected ? 'selected' : ''}`}>
                {/* Thumbnail — click to select */}
                <div className="vod-thumbnail" onClick={() => toggle(vod.id)}>
                  {vod.thumbnailUrl
                    ? <img src={vod.thumbnailUrl} alt={vod.title} />
                    : <span>📺</span>
                  }
                  {isSelected && <div className="vod-checkmark">✓</div>}
                  {status && (
                    <div className="vod-status-badge" style={{ background: STATUS_COLOR[status] }}>
                      {STATUS_LABEL[status]}
                      {isActive && prog?.count > 0 && ` · ${prog.count.toLocaleString()}`}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="vod-info" onClick={() => toggle(vod.id)}>
                  <div className="vod-title" title={vod.title}>{vod.title}</div>
                  <div className="vod-meta">
                    <span>{fmtDur(vod.duration)}</span>
                    <span>{vod.viewCount?.toLocaleString() || 0} views</span>
                    <span>{new Date(vod.createdAt).toLocaleDateString()}</span>
                  </div>
                  {hasChat && (
                    <div className="vod-msg-count">💬 {vod.messageCount.toLocaleString()} messages</div>
                  )}
                  {status === 'error' && prog?.error && (
                    <div className="vod-error">{prog.error}</div>
                  )}
                  {isActive && <div className="download-bar"><div className="download-bar-fill" /></div>}
                </div>

                {/* Action buttons row */}
                <div className="vod-actions">
                  <a
                    className="vod-action-btn"
                    href={vod.url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={e => e.stopPropagation()}
                    title="Open on Twitch"
                  >
                    ↗ Twitch
                  </a>
                  {hasChat && !isActive && (
                    <button
                      className="vod-action-btn vod-action-danger"
                      onClick={e => { e.stopPropagation(); setConfirmDelete(vod.id); }}
                      title="Delete downloaded chat"
                    >
                      🗑 Delete Chat
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Delete confirm modal ── */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>Delete chat data?</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem', fontSize: '0.9rem' }}>
              {vods.find(v => v.id === confirmDelete)?.title}
            </p>
            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
              <button
                className="btn-danger"
                onClick={() => deleteChat(confirmDelete)}
              >
                Delete Chat Only
              </button>
              <button
                className="btn-danger"
                onClick={() => deleteVOD(confirmDelete)}
              >
                Delete Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
