import { useState, useEffect, useRef } from 'react';
import * as api from '../api.js';

/* ---------- SVG icons ---------- */
const IconUsers = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

const IconLock = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
  </svg>
);

const IconMail = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>
  </svg>
);

const IconEye = ({ muted }) => (
  <svg className="eye" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ opacity: muted ? 0.55 : 1 }}>
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);

const IconArrowRight = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
  </svg>
);

const IconArrowLeft = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>
  </svg>
);

/* ---------- CSS injecté (animations + pseudo-states impossibles en inline) ---------- */
const CSS = `
  @keyframes rise {
    from { opacity:0; transform:translateY(10px); }
    to   { opacity:1; transform:translateY(0);    }
  }
  @keyframes fade-in-right {
    from { opacity:0; transform:translateX(8px); }
    to   { opacity:1; transform:translateX(0);   }
  }
  @keyframes fade-in-left {
    from { opacity:0; transform:translateX(-8px); }
    to   { opacity:1; transform:translateX(0);    }
  }
  .login-card { animation: rise 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  .login-panel-team { animation: fade-in-left  0.28s ease both; }
  .login-panel-gest { animation: fade-in-right 0.28s ease both; }

  .login-input {
    width:100%; font-family:inherit; font-size:14.5px;
    color:#1a1917; background:#fff;
    border:1px solid #e0ddd5; border-radius:8px;
    padding:11px 12px;
    transition:border-color .12s, box-shadow .12s;
    box-sizing:border-box;
  }
  .login-input.has-lead  { padding-left:40px; }
  .login-input.has-trail { padding-right:44px; }
  .login-input::placeholder { color:#9a9890; }
  .login-input:hover  { border-color:#cfccc3; }
  .login-input:focus  { outline:none; border-color:#2563eb; box-shadow:0 0 0 3px rgba(37,99,235,.14); }

  .login-btn-primary {
    width:100%; font-family:inherit; font-size:14.5px; font-weight:600;
    letter-spacing:.01em; border-radius:8px; padding:12px 16px;
    cursor:pointer; border:1px solid transparent;
    background:#2563eb; color:#fff;
    box-shadow:0 1px 2px rgba(37,99,235,.3);
    display:inline-flex; align-items:center; justify-content:center; gap:8px;
    transition:background .12s, box-shadow .12s, transform .06s;
  }
  .login-btn-primary:hover:not(:disabled) { background:#1d4ed8; }
  .login-btn-primary:active:not(:disabled) { transform:translateY(1px); }
  .login-btn-primary:disabled { opacity:.7; cursor:not-allowed; }

  .login-switch-link {
    display:inline-flex; align-items:center; gap:5px;
    font-weight:600; color:#2563eb; cursor:pointer;
    background:none; border:none; font-family:inherit; font-size:13px;
    padding:4px; border-radius:6px;
    transition:color .12s, gap .12s;
  }
  .login-switch-link:hover { color:#1d4ed8; gap:8px; }

  .login-link {
    background:none; border:none; font-family:inherit;
    font-size:12.5px; font-weight:600; color:#2563eb;
    cursor:pointer; padding:0;
    transition:color .12s;
  }
  .login-link:hover { color:#1d4ed8; text-decoration:underline; }
  .login-link:disabled { color:#9a9890; cursor:default; }
`;

/* ---------- Composant ---------- */
export default function LoginPage({ onLogin }) {
  const [mode,     setMode]     = useState('team');
  const [code,     setCode]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [showPwd,  setShowPwd]  = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [forgotSent, setForgotSent] = useState(false);

  const teamInputRef = useRef(null);
  const emailInputRef = useRef(null);

  // Focus automatique au changement de mode
  useEffect(() => {
    if (mode === 'team') teamInputRef.current?.focus({ preventScroll: true });
    else                 emailInputRef.current?.focus({ preventScroll: true });
  }, [mode]);

  function switchMode(target) { setError(''); setMode(target); }

  async function handleTeamSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { token } = await api.loginTeam(code);
      api.setToken(token);
      sessionStorage.setItem('auth_token', token);
      onLogin({ role: 'medecin', token });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleGestionnaireSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const { token, nom } = await api.loginGestionnaire(email, password);
      api.setToken(token);
      sessionStorage.setItem('auth_token', token);
      onLogin({ role: 'gestionnaire', token, nom });
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  return (
    <>
      <style>{CSS}</style>
      <div style={{
        fontFamily: '"DM Sans", system-ui, -apple-system, sans-serif',
        fontSize: 14, lineHeight: 1.5, color: '#1a1917',
        background: '#f4f3ef',
        backgroundImage: 'radial-gradient(circle at 12% 0%, rgba(37,99,235,.035), transparent 40%), radial-gradient(circle at 100% 100%, rgba(37,99,235,.03), transparent 45%)',
        minHeight: '100vh',
        WebkitFontSmoothing: 'antialiased',
      }}>

        {/* Header */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 10,
          height: 56, display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 20px',
          background: '#2563eb',
          backgroundImage: 'linear-gradient(180deg, #2f6cf0 0%, #2563eb 100%)',
          color: '#fff',
          boxShadow: '0 2px 14px rgba(37,99,235,.28)',
        }}>
          <div style={{
            flexShrink: 0, width: 34, height: 34, borderRadius: 9,
            background: 'rgba(255,255,255,.16)', border: '1px solid rgba(255,255,255,.28)',
            display: 'grid', placeItems: 'center',
            fontWeight: 700, fontSize: 12, letterSpacing: '0.04em', color: '#fff',
          }}>CHD</div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontWeight: 600, fontSize: 15, letterSpacing: '0.01em' }}>Planning Gériatrie</span>
            <span style={{ fontSize: 11.5, fontWeight: 500, color: 'rgba(255,255,255,.78)', letterSpacing: '0.02em' }}>
              CHD Vendée — Pôle de médecine gériatrique
            </span>
          </div>
        </header>

        {/* Stage */}
        <main style={{
          minHeight: 'calc(100vh - 56px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '32px 18px 48px',
        }}>
          <div>
            {/* Card */}
            <section className="login-card" style={{
              width: '100%', maxWidth: 416,
              background: '#fff', border: '1px solid #e0ddd5', borderRadius: 12,
              boxShadow: '0 1px 3px rgba(0,0,0,.07), 0 12px 32px rgba(26,25,23,.05)',
              overflow: 'hidden',
            }}>

              {/* Panel team */}
              {mode === 'team' && (
                <div className="login-panel-team">
                  <div style={{ padding: '30px 30px 26px' }}>
                    {/* Eyebrow */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: '#2563eb', background: '#eff6ff', border: '1px solid #dbe6fd',
                      padding: '4px 10px 4px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#2563eb', flexShrink: 0 }} />
                      Accès soignants
                    </span>

                    <h1 style={{ margin: '16px 0 5px', fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', color: '#1a1917' }}>
                      Accéder au planning
                    </h1>
                    <p style={{ margin: '0 0 22px', fontSize: 13.5, color: '#6a6860' }}>
                      Saisissez le code équipe partagé pour consulter le planning hebdomadaire du service.
                    </p>

                    <form onSubmit={handleTeamSubmit} autoComplete="off">
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1a1917', marginBottom: 6, letterSpacing: '0.005em' }}>
                          Code équipe
                        </label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <span style={{ position: 'absolute', left: 12, display: 'grid', placeItems: 'center', color: '#9a9890', pointerEvents: 'none' }}>
                            <IconUsers />
                          </span>
                          <input
                            ref={teamInputRef}
                            type={showCode ? 'text' : 'password'}
                            className="login-input has-lead has-trail"
                            value={code}
                            onChange={e => setCode(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="off"
                            required
                          />
                          <button type="button" onClick={() => setShowCode(v => !v)} aria-label={showCode ? 'Masquer' : 'Afficher'}
                            style={{ position: 'absolute', right: 6, border: 'none', background: 'transparent', cursor: 'pointer', padding: 7, borderRadius: 6, display: 'grid', placeItems: 'center', color: '#9a9890' }}>
                            <IconEye muted={showCode} />
                          </button>
                        </div>
                      </div>

                      {error && (
                        <p style={{ fontSize: 12, color: '#e11d48', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' }}>
                          {error}
                        </p>
                      )}

                      <button type="submit" className="login-btn-primary" disabled={loading}>
                        {loading ? 'Vérification…' : 'Accéder au planning'}
                        {!loading && <IconArrowRight />}
                      </button>
                    </form>

                    {/* Note magic link */}
                    <div style={{
                      marginTop: 16, display: 'flex', gap: 9, alignItems: 'flex-start',
                      background: '#eeecea', border: '1px solid #e0ddd5', borderRadius: 8,
                      padding: '11px 12px', fontSize: 12.5, lineHeight: 1.45, color: '#6a6860',
                    }}>
                      <span style={{ flexShrink: 0, marginTop: 1, color: '#9a9890' }}><IconMail /></span>
                      <span>Vous avez reçu un lien par email pour vos congés&nbsp;? Utilisez directement ce lien.</span>
                    </div>
                  </div>

                  {/* Footer */}
                  <div style={{
                    borderTop: '1px solid #e0ddd5', background: '#fbfaf8',
                    padding: '14px 30px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 7, fontSize: 13, color: '#6a6860',
                  }}>
                    <span>Vous gérez le planning&nbsp;?</span>
                    <button type="button" className="login-switch-link" onClick={() => switchMode('gest')}>
                      Connexion gestionnaire
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Panel gestionnaire */}
              {mode === 'gest' && (
                <div className="login-panel-gest">
                  <div style={{ padding: '30px 30px 26px' }}>
                    {/* Eyebrow gris */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
                      color: '#6a6860', background: '#eeecea', border: '1px solid #e0ddd5',
                      padding: '4px 10px 4px 8px', borderRadius: 999, whiteSpace: 'nowrap',
                    }}>
                      <span style={{ color: '#9a9890' }}><IconLock size={12} /></span>
                      Espace gestionnaire
                    </span>

                    <h1 style={{ margin: '16px 0 5px', fontSize: 21, fontWeight: 600, letterSpacing: '-0.01em', color: '#1a1917' }}>
                      Connexion gestionnaire
                    </h1>
                    <p style={{ margin: '0 0 22px', fontSize: 13.5, color: '#6a6860' }}>
                      Identifiez-vous avec votre adresse professionnelle pour modifier le planning.
                    </p>

                    <form onSubmit={handleGestionnaireSubmit} autoComplete="off">
                      {/* Email */}
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1a1917', marginBottom: 6, letterSpacing: '0.005em' }}>
                          Adresse email
                        </label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <span style={{ position: 'absolute', left: 12, display: 'grid', placeItems: 'center', color: '#9a9890', pointerEvents: 'none' }}>
                            <IconMail />
                          </span>
                          <input
                            ref={emailInputRef}
                            type="email"
                            className="login-input has-lead"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="prenom.nom@chd-vendee.fr"
                            autoComplete="username"
                            required
                          />
                        </div>
                      </div>

                      {/* Mot de passe */}
                      <div style={{ marginBottom: 16 }}>
                        <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#1a1917', marginBottom: 6, letterSpacing: '0.005em' }}>
                          Mot de passe
                        </label>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                          <span style={{ position: 'absolute', left: 12, display: 'grid', placeItems: 'center', color: '#9a9890', pointerEvents: 'none' }}>
                            <IconLock />
                          </span>
                          <input
                            type={showPwd ? 'text' : 'password'}
                            className="login-input has-lead has-trail"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                          />
                          <button type="button" onClick={() => setShowPwd(v => !v)} aria-label={showPwd ? 'Masquer' : 'Afficher'}
                            style={{ position: 'absolute', right: 6, border: 'none', background: 'transparent', cursor: 'pointer', padding: 7, borderRadius: 6, display: 'grid', placeItems: 'center', color: '#9a9890' }}>
                            <IconEye muted={showPwd} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                          <button type="button" className="login-link" disabled={forgotSent}
                            onClick={() => setForgotSent(true)}>
                            {forgotSent ? 'Lien envoyé par email ✓' : 'Mot de passe oublié ?'}
                          </button>
                        </div>
                      </div>

                      {error && (
                        <p style={{ fontSize: 12, color: '#e11d48', background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8, padding: '8px 12px', margin: '0 0 14px' }}>
                          {error}
                        </p>
                      )}

                      <button type="submit" className="login-btn-primary" disabled={loading}>
                        {loading ? 'Connexion…' : 'Se connecter'}
                      </button>
                    </form>
                  </div>

                  {/* Footer */}
                  <div style={{
                    borderTop: '1px solid #e0ddd5', background: '#fbfaf8',
                    padding: '14px 30px', display: 'flex', alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <button type="button" className="login-switch-link" onClick={() => switchMode('team')}>
                      <IconArrowLeft />
                      Retour à l'accès soignants
                    </button>
                  </div>
                </div>
              )}

            </section>

            {/* Footnote */}
            <p style={{ textAlign: 'center', margin: '18px auto 0', maxWidth: 416, fontSize: 11.5, color: '#9a9890', letterSpacing: '0.01em' }}>
              Application interne sécurisée · CHD Vendée · Accès réservé au personnel autorisé
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
