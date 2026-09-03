-- =============================================================================
-- 0205 · El nombre del trigger miente, así que ahora lo dice
-- =============================================================================
--
-- `trg_orders_balance_due` en `public.orders` YA NO TOCA `balance_due`. Nació
-- en la `0003` disparando `update_business_balance()`, que sí lo escribía; hoy
-- dispara `generate_delivery_charges()`, que solo inserta y borra filas de
-- `business_charges`. Medido el 2026-09-02:
--
--   select p.proname from pg_trigger t join pg_proc p on p.oid = t.tgfoid
--   where t.tgname = 'trg_orders_balance_due';
--   -- generate_delivery_charges
--
--   -- y esa función solo NOMBRA la columna, en dos comentarios que dicen
--   -- justamente que ya no la escribe:
--   --   «`balance_due` lo mantiene ahora trg_business_charges_recalc_balance.»
--
-- Quien lo mantiene de verdad es el OTRO trigger, sobre `business_charges`.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUÉ UN COMENTARIO Y NO UN `ALTER TRIGGER ... RENAME`
--
--   Renombrar quita la mentira pero la reparte: `trg_orders_balance_due` no
--   aparece en NINGÚN sitio del código de las apps —comprobado— pero sí en
--   cinco sitios de migraciones y documentación (`0003`, `0073`,
--   `Docs/04-base-de-datos.md`, `Docs/RIESGOS-LEDGER.md`,
--   `Docs/context/debt-liquidation-audit.md`). Un rename los deja a todos
--   nombrando un trigger que no existe, y el historial de migraciones no se
--   reescribe.
--
--   El comentario pone la verdad DONDE ESTÁ EL NOMBRE, que es exactamente
--   donde mira quien se lo va a creer: `\d public.orders` en psql lo enseña, y
--   cualquier consulta a `pg_description` también. Ganancia igual, coste cero,
--   y no deja cinco referencias huérfanas detrás.
--
--   Mismo criterio que la `0201`: cuando el problema es que algo no se puede
--   LEER bien, la herramienta es un comentario, no DDL.
--
-- Se comentan los DOS para que el par se lea junto: el que no toca la columna
-- y el que sí.
--
-- =============================================================================


COMMENT ON TRIGGER trg_orders_balance_due ON public.orders IS
  'OJO, EL NOMBRE ES HISTORICO Y MIENTE: este trigger NO escribe '
  '`businesses.balance_due`. Nacio en la 0003 disparando '
  '`update_business_balance()` —borrada por la 0123— y hoy dispara '
  '`generate_delivery_charges()`, que solo inserta y borra filas de '
  '`business_charges`. Quien mantiene `balance_due` es '
  '`trg_business_charges_recalc_balance`, sobre esa tabla. No se renombra para '
  'no dejar huerfanas las cinco referencias de migraciones y docs (0205).';

COMMENT ON TRIGGER trg_business_charges_recalc_balance ON public.business_charges IS
  'El UNICO camino vivo que escribe `businesses.balance_due` (0124). Lo recalcula '
  'entero desde el ledger: `balance_due = SUM(business_charges WHERE '
  'status = ''pending'')`, asi que la columna es un cache derivado y no una '
  'cuenta que alguien lleve a mano. Ver `Docs/RIESGOS-LEDGER.md`, R-L1.';
