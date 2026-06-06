// hooks/useData.js — custom hooks pour les données
import { useState, useEffect, useCallback } from 'react';
import * as api from '../api';
import { toIso, getMonday } from '../utils';

/** Hook principal : médecins + absences (données stables) */
export function useBaseData() {
  const [medecins, setMedecins]   = useState([]);
  const [absences, setAbsences]   = useState([]);
  const [loading,  setLoading]    = useState(true);
  const [error,    setError]      = useState(null);

  const reload = useCallback(async () => {
    try {
      setLoading(true);
      const [meds, abs] = await Promise.all([api.getMedecins(), api.getAbsences()]);
      setMedecins(meds);
      setAbsences(abs);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { medecins, setMedecins, absences, setAbsences, loading, error, reload };
}

/** Hook planning semaine */
export function usePlanning(weekKey) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const reload = useCallback(async () => {
    if (!weekKey) return;
    try {
      setLoading(true);
      const d = await api.getPlanning(weekKey);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [weekKey]);

  useEffect(() => { reload(); }, [reload]);

  return { data, setData, loading, error, reload };
}
