# P11 — Refonte onglet Absences

**Effort :** L (CC: ~2h min, à affiner après spec) | **WSJF :** 1.3 | **Bloquant :** session spec UX

## Pourquoi

L'onglet actuel (calendrier mensuel + vue semestre + DateRangePicker custom) est fonctionnel mais peu intuitif. Signalé comme point de friction dans les notes utilisateur du 2026-06-02. L'onglet est utilisé en autonomie par les secrétaires et les médecins via magic link.

## Périmètre à définir en spec UX

Questions ouvertes à trancher avec l'utilisatrice :
- Quels écrans sont conservés, lesquels sont repensés ?
- Formulaire inline vs modal pour la saisie ?
- Synthèse par agent (praticien) ou par période ?
- Export (CSV, PDF) dans le scope ou non ?
- Nouveau parcours de saisie pour les secrétaires ?

## Dépendances

- Session de spécification UX obligatoire avant toute implémentation
- Idéalement après P10 (demi-journées, si jamais réouvert) — les demi-journées pourraient affecter la saisie d'absences
