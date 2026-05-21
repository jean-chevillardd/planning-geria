// components/WeekNav.jsx
import { fmtDay, addDays } from '../utils';

export default function WeekNav({ monday, onChange, onCopy, onGoToday, isSecretary }) {
  const days = Array.from({ length: 5 }, (_, i) => addDays(monday, i));

  return (
    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:12, flexWrap:'wrap' }}>
      <button className="wn-btn" onClick={() => onChange(addDays(monday, -7))}>‹</button>
      <button className="wn-btn" onClick={() => onChange(addDays(monday,  7))}>›</button>
      <span className="wn-lbl">
        Semaine du {fmtDay(days[0])} au {fmtDay(days[4])}
      </span>
      <button className="wn-chip" onClick={onGoToday}>Semaine actuelle</button>
      {isSecretary && (
        <button className="wn-copy" onClick={onCopy} title="Recopier les affectations de la semaine précédente">
          ⎘ Copier sem. précédente
        </button>
      )}
    </div>
  );
}
