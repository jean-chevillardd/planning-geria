# Livraisons — Planning Gériatrie

| Date | # | Titre |
|---|---|---|
| 2026-06-08 | P11/F5 | Nettoyage — suppression AbsencesTab.jsx, README mis à jour (routes P11) |
| 2026-06-08 | P11/F4 | Demandes ponctuelles gestionnaire — GET/accept/refuse + composant DemandesPonctuelles filtrable |
| 2026-06-08 | P11/F3 | Migration campagne congés — CampaignModal/CampaignStatusModal déplacés vers CongesTab, nettoyage TeamTab |
| 2026-06-08 | P11/F2 | Formulaire médecin self-service — CongeModal, DRP deux mois, soumission POST /api/conge-requests |
| 2026-06-08 | P11/F1 | Nouveau CongesTab — vue médecin (liste congés futurs) + vue gestionnaire (campagne) |
| 2026-06-07 | SPEC | P11 — Spec UX onglet Congés terminée : 5 features F1–F5, mockup HTML généré, bugs P32 identifiés |
| 2026-06-07 | UX-FIX | Campagne congés : médecins d'astreinte exclus de la ligne "Externes" (CampaignModal) |
| 2026-06-07 | UX-FIX | TeamTab : email non bloquant pour médecins d'astreinte (envoi `null` au lieu de `""`, fix Zod) |
| 2026-06-07 | UX-FIX | styles.css : `justify-content:center` sur `.btn-primary` — bouton Enregistrer/Créer centré |
| 2026-06-07 | UX-FIX | Escape global : ferme CampaignStatusModal, CampaignModal, BarPopover (AbsencesTab), SidePanel (StatsTab) |
| 2026-06-07 | UX-FIX | AstreintesTab EPill : chips praticiens alignés sur look Planning/semaine + suppression pdots |
| 2026-06-05 | AUTH | Sprint auth — deux rôles (médecin lecture / gestionnaire écriture), LoginPage, suppression LockButton |
| 2026-06-05 | DT4 | Multi-comptes gestionnaires — table `users`, `setup-admin.js`, JWT `{ role, userId }` |
| 2026-06-05 | DT2 | JWT_SECRET persistant sur Railway (variable d'environnement configurée) |
| 2026-06-05 | P24 | Vue Rotation : absences fusionnées multi-semaines (colspan par type) |
| 2026-06-05 | P25 | Ordre services : indispensables → dispensables (vue Semaine + Rotation) |
| 2026-06-05 | DT1 | Migration better-sqlite3 — `POST /api/planning/copy` 500 résolu |
| 2026-06-05 | DT3 | Backup BD à la demande — `GET /api/backup/download` dans TeamTab |
| 2026-06-05 | DT6 | Documentation sql.js → better-sqlite3 mise à jour |
| 2026-06-05 | P8 | Vue rotation astreintes : tri par ordre d'insertion (suppression tri alpha) |
| 2026-06-05 | P15 | Refonte bandeau créneaux non couverts : badge + pills |
| 2026-06-05 | P22 | Panel PH Dispo : "Présents 5j" → "Présents cette semaine" |
| 2026-06-05 | P23 | Bug Esc sur AssignModal : scroll vers le bas corrigé |
| 2026-06-05 | P26 | StatsTab : filtre période personnalisée (MonthPickerPopover) |
| 2026-06-03 | P9 | MonthView : mode Rotation + D&D + click-to-assign (durée semaine / mois / N semaines) |
| 2026-06-03 | P2 | Alerte couverture minimale : indicateur ⚠/✓ inline + bannière |
| 2026-06-03 | P4-bis | Règles métier activités & effectifs (documentées, guard HDJ mercredi) |
| 2026-06-03 | P6 | Numéro ISO de semaine dans WeekNav |
| 2026-06-03 | P18 | AssignModal : recherche étendue au type de praticien |
| 2026-06-03 | P19 | Bug : bouton "À la semaine" grisé si PH déjà remplaçant |
| 2026-06-03 | P20 | Suppression chips "absent" des cellules planning |
| 2026-06-03 | P21 | Panel "En congés cette semaine" + filtrage médecins extérieurs |
| 2026-06-02 | P1 | Contrainte serveur "1 médecin = 1 poste max" (côté UI) |
| 2026-06-02 | P5 | Vue disponibilités praticiens PH (vue semaine) |
| 2026-06-02 | P12 | Panneau PH dispo : visibilité conditionnelle (mode secrétaire) |
| 2026-06-02 | P13 | Panneau PH dispo sur vue mensuelle |
| 2026-06-02 | P14 | Drag & drop panneau dispo → planning (vue semaine) |
| 2026-06-02 | P16 | Filtres vue semaine : suppression "Tout afficher", sous-filtres |
| 2026-06-02 | P-BUG | Affectation ouverte à tous types de praticiens (plus PH-only) |
| 2026-05-30 | P4 | UI désarchivage praticien dans TeamTab |
