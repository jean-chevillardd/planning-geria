// validation.js — Schémas Zod pour les routes API
const { z } = require('zod');

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE    = /^\d{4}-\d{2}$/;
const SCHED_RE    = /^[01]{10}$/;

const isoDate = z.string().regex(ISO_DATE_RE, 'Format YYYY-MM-DD attendu');
const month   = z.string().regex(MONTH_RE,    'Format YYYY-MM attendu');

const schedArray = z
  .array(z.union([z.literal(0), z.literal(1)]))
  .length(10, 'sched invalide (10 valeurs 0/1 attendues)');
const schedString = z.string().regex(SCHED_RE, 'sched invalide (10 caractères 0/1 attendus)');
const schedField  = z.union([schedArray, schedString]).optional();

const MED_TYPES = ['ph', 'ipa', 'interne', 'externe', 'padhue'];
const ABS_TYPES = [
  'Congé annuel (CA)', 'Congé maladie', 'Congé maternité',
  'RTT', 'Récupération de garde', 'Formation', 'Activité hors site',
];
const AST_TYPES = ['astreinte', 'pont_rouge', 'csg1'];

const medecinsCreateSchema = z.object({
  nom:     z.string().min(1, 'nom requis'),
  type:    z.enum(MED_TYPES),
  sched:   schedField,
  service: z.string().optional(),
  tel:     z.string().optional(),
  email:   z.string().email('email invalide').optional().nullable(),
});

const medecinsUpdateSchema = z.object({
  nom:     z.string().min(1, 'nom requis').optional(),
  type:    z.enum(MED_TYPES).optional(),
  sched:   schedField,
  service: z.string().optional(),
  tel:     z.string().optional(),
  email:   z.string().email('email invalide').optional().nullable(),
});

const absencesCreateSchema = z.object({
  med_id:      z.string().min(1, 'med_id requis'),
  date_debut:  isoDate,
  date_fin:    isoDate,
  type_abs:    z.enum(ABS_TYPES),
  demi_journee: z.enum(['matin', 'apm']).optional().nullable(),
});

const affectationSchema = z.object({
  week_key: isoDate,
  poste_id: z.string().min(1, 'poste_id requis'),
  med_id:   z.string().min(1, 'med_id requis'),
});

const affectationMoveSchema = z.object({
  week_key:        isoDate,
  source_poste_id: z.string().min(1, 'source_poste_id requis'),
  target_poste_id: z.string().min(1, 'target_poste_id requis'),
  med_id:          z.string().min(1, 'med_id requis'),
});

const exclusionExtraSchema = z.object({
  week_key: isoDate,
  poste_id: z.string().min(1, 'poste_id requis'),
  med_id:   z.string().min(1, 'med_id requis'),
  jour:     isoDate,
});

const extrasBulkDeleteSchema = z.object({
  week_key: isoDate,
  poste_id: z.string().min(1, 'poste_id requis'),
  med_id:   z.string().min(1, 'med_id requis'),
});

const renfortSchema = z.object({
  week_key: isoDate,
  poste_id: z.string().min(1, 'poste_id requis'),
  med_id:   z.string().min(1, 'med_id requis'),
  jour:     isoDate,
});

const astreintesCreateSchema = z.object({
  date_iso: isoDate,
  type_ast: z.enum(AST_TYPES),
  med_id:   z.string().min(1, 'med_id requis'),
});

const planningCopySchema = z.object({
  from_week: isoDate,
  to_week:   isoDate,
});

const teamCodeUpdateSchema = z.object({
  code: z.string().min(4, 'Code trop court (4 caractères minimum)').trim(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Mot de passe actuel requis'),
  newPassword:     z.string().min(6, 'Le nouveau mot de passe doit comporter au moins 6 caractères'),
});

const createGestionnaireSchema = z.object({
  nom:      z.string().min(1, 'Nom requis').trim(),
  email:    z.string().email('Adresse e-mail invalide').toLowerCase().trim(),
  password: z.string().min(6, 'Le mot de passe doit comporter au moins 6 caractères'),
});

const updateGestionnaireSchema = z.object({
  nom:   z.string().min(1, 'Nom requis').trim(),
  email: z.string().email('Adresse e-mail invalide').toLowerCase().trim(),
});

const auditLogQuerySchema = z.object({
  action: z.string().optional(),
  table:  z.string().optional(),
  from:   z.string().regex(ISO_DATE_RE, 'Format YYYY-MM-DD attendu').optional(),
  to:     z.string().regex(ISO_DATE_RE, 'Format YYYY-MM-DD attendu').optional(),
  page:   z.coerce.number().int().min(1).optional().default(1),
});

const extendTokenSchema = z.object({
  hours: z.number().int().min(1).max(168).optional().default(48),
});

function validate(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const msg = result.error.issues.map(i => i.message).join('; ');
    return { ok: false, error: msg };
  }
  return { ok: true, data: result.data };
}

module.exports = {
  validate,
  medecinsCreateSchema,
  medecinsUpdateSchema,
  absencesCreateSchema,
  affectationSchema,
  affectationMoveSchema,
  exclusionExtraSchema,
  extrasBulkDeleteSchema,
  renfortSchema,
  astreintesCreateSchema,
  planningCopySchema,
  teamCodeUpdateSchema,
  changePasswordSchema,
  createGestionnaireSchema,
  updateGestionnaireSchema,
  auditLogQuerySchema,
  extendTokenSchema,
  isoDate,
  month,
  MED_TYPES,
  ABS_TYPES,
  AST_TYPES,
};
