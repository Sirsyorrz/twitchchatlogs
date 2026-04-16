import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SearchPage from './pages/SearchPage';
import VODSelector from './pages/VODSelector';
import ChatViewer from './pages/ChatViewer';
import './App.css';

const queryClient = new QueryClient();

export default function App() {
  const [page, setPage] = useState('search');
  const [currentUser, setCurrentUser] = useState(null);

  const handleUserFound = (user) => {
    setCurrentUser(user);
    setPage('vods');
  };

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-container">
        <header className="app-header">
          <div className="logo" onClick={() => setPage('search')} style={{ cursor: 'pointer' }}>
            🎬 VodArchive
          </div>
          <div className="header-right">
            {currentUser && (
              <div className="current-user-badge">
                <img src={currentUser.profileImageUrl} alt={currentUser.login} />
                <span>{currentUser.displayName}</span>
              </div>
            )}
            {currentUser && (
              <nav className="nav-tabs">
                <button
                  className={`nav-tab ${page === 'vods' ? 'active' : ''}`}
                  onClick={() => setPage('vods')}
                >
                  VODs
                </button>
                <button
                  className={`nav-tab ${page === 'chat' ? 'active' : ''}`}
                  onClick={() => setPage('chat')}
                >
                  Chat Archive
                </button>
              </nav>
            )}
            <button className="btn-secondary" onClick={() => setPage('search')}>
              {currentUser ? '⌕ New Search' : '⌕ Search'}
            </button>
          </div>
        </header>

        <div className="content">
          {page === 'search' && (
            <SearchPage onUserFound={handleUserFound} />
          )}
          {page === 'vods' && currentUser && (
            <VODSelector user={currentUser} onViewChat={() => setPage('chat')} />
          )}
          {page === 'chat' && (
            <ChatViewer onSearchUser={(login) => { /* could search another user */ }} />
          )}
        </div>
      </div>
    </QueryClientProvider>
  );
}
