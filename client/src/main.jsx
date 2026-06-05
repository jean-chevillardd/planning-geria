import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import LoginPage from './components/LoginPage';
import CongePublicPage from './components/CongePublicPage';
import * as api from './api';

// ── Routing SPA minimal ───────────────────────────────────────
const pathname = window.location.pathname;
const congeMatch = pathname.match(/^\/conge\/([a-f0-9]+)$/);

// ── Auth root ─────────────────────────────────────────────────
function Root() {
  const [auth, setAuth] = useState(() => {
    const token = sessionStorage.getItem('auth_token');
    if (!token) return null;
    try {
      // Décoder le payload JWT (sans vérification — le serveur vérifie)
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) { sessionStorage.removeItem('auth_token'); return null; }
      api.setToken(token);
      return { role: payload.role, token };
    } catch { sessionStorage.removeItem('auth_token'); return null; }
  });

  function handleLogout() {
    sessionStorage.removeItem('auth_token');
    api.setToken('');
    setAuth(null);
  }

  if (!auth) return <LoginPage onLogin={setAuth} />;
  return <App role={auth.role} onLogout={handleLogout} />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {congeMatch
      ? <CongePublicPage token={congeMatch[1]} />
      : <Root />
    }
  </StrictMode>
);
