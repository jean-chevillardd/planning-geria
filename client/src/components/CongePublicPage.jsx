// CongePublicPage.jsx — Page auto-service saisie de congés (accessible sans connexion via magic link)
import { useState, useEffect } from 'react';
import { validateCongeToken, submitCongeAbsences } from '../api';

const ABS_TYPES = [
  'Congé annuel (CA)',
  'RTT',
  'Récupération de garde',
  'Congé maladie',
  'Congé maternité',
  'Formation',
  'Activité hors site',
];

function EmptyRow(onAdd) {
  return { date_debut: '', date_fin: '', type_abs: 'Congé annuel (CA)' };
}

// ── Icône calendrier ─────────────────────────────────────────
function CalIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="3" width="15" height="13.5" rx="2"/>
      <path d="M1.5 7.5h15"/>
      <path d="M6 1.5v3M12 1.5v3"/>
    </svg>
  );
}

// ── Page d'erreur ────────────────────────────────────────────
function ErrorPage({ message }) {
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <Header />
        <div style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
          <p style={{ fontSize: 15, color: '#dc2626', fontWeight: 700, marginBottom: 8 }}>
            Lien invalide
          </p>
          <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6, margin: 0 }}>
            {message || 'Ce lien est invalide ou a expiré. Contactez le secrétariat pour en obtenir un nouveau.'}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Page de succès ────────────────────────────────────────────
function SuccessPage({ nom, count }) {
  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <Header />
        <div style={{ padding: '40px 32px', textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: '#dcfce7', border: '2px solid #16a34a',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 20px', fontSize: 28,
          }}>✓</div>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#15803d', marginBottom: 8 }}>
            Merci, {nom.split(' ')[0]} !
          </p>
          <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7, margin: 0 }}>
            {count === 1
              ? 'Votre demande de congé a bien été transmise.'
              : `Vos ${count} demandes de congé ont bien été transmises.`
            }
            <br/>
            Le secrétariat en sera informé.
          </p>
          <p style={{ fontSize: 12, color: '#aaa', marginTop: 24 }}>
            Vous pouvez fermer cette page.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Header commun ─────────────────────────────────────────────
function Header() {
  return (
    <div style={{
      background: 'linear-gradient(135deg,#1d4ed8,#2563eb)',
      padding: '18px 24px',
      borderRadius: '10px 10px 0 0',
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 34, height: 34, borderRadius: 8,
        background: 'rgba(255,255,255,.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: '-.5px',
      }}>CHU</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
          Planning Pôle Gériatrie
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 1 }}>
          Saisie de congés
        </div>
      </div>
    </div>
  );
}

// ── Styles partagés ────────────────────────────────────────────
const pageStyle = {
  minHeight: '100vh',
  background: '#f4f2ee',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: '40px 16px 80px',
  fontFamily: 'inherit',
};

const cardStyle = {
  width: '100%',
  maxWidth: 540,
  background: '#fff',
  borderRadius: 12,
  boxShadow: '0 4px 24px rgba(0,0,0,.09)',
  overflow: 'hidden',
};

const inputStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 12px',
  border: '1px solid #ddd',
  borderRadius: 7,
  fontSize: 13,
  color: '#1a1a1a',
  background: '#fff',
  outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle = {
  fontSize: 11,
  fontWeight: 700,
  color: '#555',
  marginBottom: 5,
  display: 'block',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

// ── Ligne d'absence ───────────────────────────────────────────
function AbsenceRow({ abs, index, onUpdate, onRemove, isLast }) {
  return (
    <div style={{
      border: '1px solid #e8e5e0',
      borderRadius: 9,
      padding: '16px',
      marginBottom: 10,
      background: '#fafaf8',
      position: 'relative',
    }}>
      {index > 0 && (
        <button
          onClick={() => onRemove(index)}
          style={{
            position: 'absolute', top: 10, right: 10,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#aaa', fontSize: 16, lineHeight: 1, padding: 4,
          }}
          title="Supprimer cette ligne"
        >×</button>
      )}

      {/* Type d'absence */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Motif</label>
        <select
          value={abs.type_abs}
          onChange={e => onUpdate(index, 'type_abs', e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {ABS_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {/* Dates */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={labelStyle}>Du</label>
          <input
            type="date"
            value={abs.date_debut}
            onChange={e => onUpdate(index, 'date_debut', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>Au (inclus)</label>
          <input
            type="date"
            value={abs.date_fin}
            min={abs.date_debut || undefined}
            onChange={e => onUpdate(index, 'date_fin', e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────
export default function CongePublicPage({ token }) {
  const [phase, setPhase]       = useState('loading'); // loading | form | success | error
  const [med, setMed]           = useState(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [absences, setAbsences] = useState([
    { date_debut: '', date_fin: '', type_abs: 'Congé annuel (CA)' }
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr]   = useState('');
  const [count, setCount]           = useState(0);

  useEffect(() => {
    validateCongeToken(token)
      .then(data => {
        if (data.valid) {
          setMed(data);
          setPhase('form');
        } else {
          setErrorMsg(data.error || 'Lien invalide');
          setPhase('error');
        }
      })
      .catch(e => {
        setErrorMsg(e.message || 'Erreur de connexion');
        setPhase('error');
      });
  }, [token]);

  function updateAbsence(i, field, value) {
    setAbsences(a => a.map((ab, idx) => idx === i ? { ...ab, [field]: value } : ab));
  }

  function removeAbsence(i) {
    setAbsences(a => a.filter((_, idx) => idx !== i));
  }

  function addAbsence() {
    setAbsences(a => [...a, { date_debut: '', date_fin: '', type_abs: 'Congé annuel (CA)' }]);
  }

  async function handleSubmit() {
    setSubmitErr('');
    // Validation
    for (let i = 0; i < absences.length; i++) {
      const ab = absences[i];
      if (!ab.date_debut || !ab.date_fin) {
        setSubmitErr(`Ligne ${i + 1} : veuillez renseigner les deux dates.`);
        return;
      }
      if (ab.date_fin < ab.date_debut) {
        setSubmitErr(`Ligne ${i + 1} : la date de fin est avant la date de début.`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const data = await submitCongeAbsences(token, absences);
      setCount(data.count || absences.length);
      setPhase('success');
    } catch(e) {
      setSubmitErr(e.message || 'Erreur lors de l\'envoi');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'loading') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <Header />
          <div style={{ padding: '40px 32px', textAlign: 'center', color: '#999', fontSize: 13 }}>
            Vérification du lien…
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'error') return <ErrorPage message={errorMsg} />;
  if (phase === 'success') return <SuccessPage nom={med?.nom || ''} count={count} />;

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <Header />

        {/* Corps */}
        <div style={{ padding: '24px 24px 8px' }}>
          {/* Identification */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 16px', borderRadius: 9,
            background: 'var(--accent-light, #eff6ff)',
            border: '1px solid #c7d9ff',
            marginBottom: 22,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: '#2563eb', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 800, fontSize: 15, flexShrink: 0,
            }}>
              {(med?.nom || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>{med?.nom}</div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 1 }}>
                Formulaire de demande de congés · valable 72h
              </div>
            </div>
          </div>

          {/* Titre section */}
          <div style={{ fontSize: 12, fontWeight: 700, color: '#888', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Périodes d'absence
          </div>

          {/* Lignes d'absence */}
          {absences.map((ab, i) => (
            <AbsenceRow
              key={i}
              abs={ab}
              index={i}
              onUpdate={updateAbsence}
              onRemove={removeAbsence}
              isLast={i === absences.length - 1}
            />
          ))}

          {/* Ajouter une ligne */}
          {absences.length < 10 && (
            <button
              onClick={addAbsence}
              style={{
                width: '100%', padding: '9px', marginBottom: 10,
                border: '1.5px dashed #ccc', borderRadius: 9,
                background: 'none', cursor: 'pointer',
                fontSize: 12, color: '#888', fontWeight: 600,
                transition: 'all .15s',
              }}
            >
              + Ajouter une autre période
            </button>
          )}

          {/* Erreur soumission */}
          {submitErr && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, marginBottom: 12,
              background: '#fef2f2', border: '1px solid #fca5a5',
              fontSize: 13, color: '#dc2626',
            }}>
              {submitErr}
            </div>
          )}
        </div>

        {/* Pied — bouton valider */}
        <div style={{ padding: '0 24px 24px' }}>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              width: '100%', padding: '14px',
              background: submitting ? '#93c5fd' : '#2563eb',
              color: '#fff', border: 'none', borderRadius: 9,
              fontSize: 15, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer',
              transition: 'background .15s',
            }}
          >
            {submitting ? 'Envoi en cours…' : `Valider ${absences.length > 1 ? absences.length + ' demandes' : 'ma demande'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
