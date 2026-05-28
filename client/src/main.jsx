import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import App from './App';
import CongePublicPage from './components/CongePublicPage';

// ── Routing SPA minimal ───────────────────────────────────────
// Si l'URL commence par /conge/<token>, on affiche la page publique.
// Sinon, on affiche l'application principale.
const pathname = window.location.pathname;
const congeMatch = pathname.match(/^\/conge\/([a-f0-9]+)$/);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {congeMatch
      ? <CongePublicPage token={congeMatch[1]} />
      : <App />
    }
  </StrictMode>
);
