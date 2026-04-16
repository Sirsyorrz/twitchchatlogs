import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Pull username from a twitch.tv URL or return as-is
function parseInput(val) {
  val = val.trim();
  try {
    const url = new URL(val.includes('://') ? val : `https://${val}`);
    if (url.hostname.includes('twitch.tv')) {
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'videos') return null; // VOD URL, not user
      return parts[0] || null;
    }
  } catch {}
  return val || null;
}

export default function SearchPage({ onUserFound }) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const inputRef = useRef();

  const { data, isLoading, error } = useQuery({
    queryKey: ['user', query],
    queryFn: () => axios.get(`${API}/api/user/${query}`).then(r => r.data),
    enabled: !!query,
    retry: false
  });

  const handleSearch = () => {
    const name = parseInput(input);
    if (!name) return;
    setQuery(name);
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  if (data) {
    onUserFound(data.user);
    return null;
  }

  return (
    <div className="search-page">
      <div className="search-hero">
        <h1>Twitch Chat Archive</h1>
        <p>Enter a Twitch username or channel URL to browse and download VOD chats</p>

        <div className="search-bar">
          <input
            ref={inputRef}
            type="text"
            placeholder="Username or twitch.tv/channel URL"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            autoFocus
          />
          <button
            className="btn-primary"
            onClick={handleSearch}
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? <span className="spinner" /> : 'Search →'}
          </button>
        </div>

        {error && (
          <div className="search-error">
            ❌ {error.response?.data?.error || error.message}
          </div>
        )}

        <div className="search-examples">
          <span>Try:</span>
          {['xqc', 'hasanabi', 'pokimane', 'ludwig'].map(name => (
            <button
              key={name}
              className="example-chip"
              onClick={() => { setInput(name); setQuery(name); }}
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
