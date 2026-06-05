// api.js — toutes les requêtes vers le serveur
const BASE = '/api';

let _token = '';
export function setToken(token) { _token = token; }
export function getToken()      { return _token; }

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (_token) opts.headers['Authorization'] = `Bearer ${_token}`;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(BASE + path, opts);
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error(err.error || r.statusText);
  }
  return r.json();
}

// ── Authentification ────────────────────────────────────
export const loginTeam         = (code)              => req('POST', '/auth/team', { code });
export const loginGestionnaire = (email, password)   => req('POST', '/auth/gestionnaire', { email, password });

// ── Médecins ────────────────────────────────────────────
export const getMedecins          = ()         => req('GET',   '/medecins');
export const addMedecin           = (data)     => req('POST',  '/medecins', data);
export const updateMedecin        = (id, data) => req('PUT',   `/medecins/${id}`, data);
export const archiveMedecin       = (id)       => req('PATCH', `/medecins/${id}/archiver`);
export const desarchiveMedecin    = (id)       => req('PATCH', `/medecins/${id}/desarchiver`);
export const getArchivedMedecins  = ()         => req('GET',   '/medecins/archives');

// ── Absences ────────────────────────────────────────────
export const getAbsences   = ()     => req('GET',    '/absences');
export const addAbsence    = (data) => req('POST',   '/absences', data);
export const deleteAbsence = (id)   => req('DELETE', `/absences/${id}`);

// ── Planning semaine ────────────────────────────────────
export const getPlanning = (weekKey) => req('GET', `/planning/${weekKey}`);

// ── Affectations hebdo ──────────────────────────────────
export const addAffectation    = (data) => req('POST',   '/affectations', data);
export const deleteAffectation = (data) => req('DELETE', '/affectations', data);
export const moveAffectation   = (data) => req('POST',   '/affectations/move', data);

// ── Exclusions journalières ─────────────────────────────
export const addExclusion    = (data) => req('POST',   '/exclusions', data);
export const deleteExclusion = (data) => req('DELETE', '/exclusions', data);

// ── Extras journaliers ──────────────────────────────────
export const addExtra    = (data) => req('POST',   '/extras', data);
export const deleteExtra = (data) => req('DELETE', '/extras', data);

// ── Copier semaine ──────────────────────────────────────
export const copyWeek = (from_week, to_week) =>
  req('POST', '/planning/copy', { from_week, to_week });

// ── Statistiques médecin ────────────────────────────────
export const getStatsMedecin = (medId, from, to) => {
  const qs = from ? `?from=${from}&to=${to}` : '';
  return req('GET', `/stats/medecin/${medId}${qs}`);
};
export const getAllStats = (from, to) => {
  const qs = from ? `?from=${from}&to=${to}` : '';
  return req('GET', `/stats/all${qs}`);
};

// ── Renforts ────────────────────────────────────────────
export const addRenfort    = (data) => req('POST',   '/renforts', data);
export const deleteRenfort = (data) => req('DELETE', '/renforts', data);

// ── Astreintes ──────────────────────────────────────────
export const getAstreintes   = (month) => req('GET',    `/astreintes?month=${month}`);
export const addAstreinte    = (data)  => req('POST',   '/astreintes', data);
export const deleteAstreinte = (id)    => req('DELETE', `/astreintes/${id}`);

// ── Settings ────────────────────────────────────────────
export const getTeamCode    = ()      => req('GET', '/settings/team-code');
export const updateTeamCode = (code)  => req('PUT', '/settings/team-code', { code });

// ── Backup base de données ──────────────────────────────
export function downloadBackup() {
  const headers = {};
  if (_token) headers['Authorization'] = `Bearer ${_token}`;
  return fetch('/api/backup/download', { headers })
    .then(r => {
      if (!r.ok) throw new Error('Erreur téléchargement');
      return r.blob();
    })
    .then(blob => {
      const date = new Date().toISOString().split('T')[0];
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `planning-backup-${date}.sqlite`;
      a.click();
      URL.revokeObjectURL(url);
    });
}

// ── Congés self-service ─────────────────────────────────
export const validateCongeToken  = (token)               => req('GET',  `/conge/token/${token}`);
export const submitCongeAbsences = (token, absences)     => req('POST', '/conge/submit', { token, absences });
export const previewCampaign     = (types)               => req('GET',  `/conge/preview?types=${types.join(',')}`);
export const sendCampaign        = (types, base_url)     => req('POST', '/conge/campaign', { types, base_url });
