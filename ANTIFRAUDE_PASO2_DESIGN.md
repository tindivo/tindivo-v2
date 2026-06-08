# ANTIFRAUDE — Diseño del Paso 2 (la "sección 4" que faltaba)

> **Estado:** propuesta para tu OK. **No se ha aplicado nada a la BD.**
> El PROMPT manda usar "el SQL exacto del spec (sección 4)" pero ese spec
> (`SISTEMA_ANTIFRAUDE_TINDIVO.md`) no existe. Decidiste *(decisión #1)* proceder
> con DECISIONS.md + PROMPT como fuente, así que **aquí redacto yo la sección 4**
> (esquemas exactos) para que la apruebes antes de tocar producción.
>
> Decisiones tuyas aplicadas: **#2 reconstruir según el PROMPT** (tablas nuevas
> `customer_incidents` + `fraud_coverage_claims`) · **#3 solo 3 strikes → bloqueo
> temporal 30 días** (sin el escalón de 2→prepago).

---

## 0. Conflicto crítico que debes conocer (afecta lo ya entregado)

El PROMPT modela la validación con **columnas booleanas** (`requires_validation`,
`validated_at`, `validation_result`) y dice *"botón Validar antes de cocinar en
pedidos pending_acceptance"*. El dashboard que **acabas de aprobar y commitear**
(`d4749c4`) usa el **estado `validando`** (columna "Nuevos", `validate_order`,
flujo de prepago que testeé en vivo). Son dos formas de lo mismo.

| Opción | Qué implica | Riesgo |
|---|---|---|
| **R1 — Híbrido (recomendado)** | Creo `customer_incidents` + `fraud_coverage_claims` + bloqueo 3-strikes (todo lo nuevo del PROMPT) **y conservo** el estado `validando` + verificación de comprobante que ya funciona. Agrego las columnas del PROMPT de forma aditiva (registran la validación, no la reemplazan). | Bajo. No rompe nada testeado. |
| **R2 — Rebuild puro** | Reemplazo `validando` por `requires_validation` y rehago el flujo de Pedidos del dashboard. | Alto. Rompe y obliga a re-testear lo entregado esta semana. |

**Recomiendo R1.** Honra "reconstruir según el PROMPT" (crea las tablas nuevas y
el modelo de incidentes/claims/bloqueo) sin tirar el flujo de validación que ya
está probado. El resto de este diseño asume R1.

---

## 1. Tablas nuevas (DDL propuesto)

### 1.1 `customer_incidents` — log de incidentes (el admin confirma `is_strike`)
```sql
create type public.incident_type as enum
  ('no_show','fake_address','customer_abuse','payment_fraud','rejected_proof','other');

create table public.customer_incidents (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid references public.orders(id) on delete set null,
  customer_user_id uuid references public.users(id) on delete set null,
  customer_phone   text not null,
  delivery_reference text,
  incident_type    public.incident_type not null,
  description      text,
  reported_by      uuid references public.users(id) on delete set null,
  reported_by_role text check (reported_by_role in ('driver','business','admin','system','customer')),
  is_strike        boolean not null default false,        -- lo pone el admin al confirmar
  reviewed_at      timestamptz,
  reviewed_by      uuid references public.users(id) on delete set null,
  review_result    text check (review_result in ('confirmed','dismissed')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
```
*(Diseñado por mí — el PROMPT no da columnas. `incident_type` lo defino aquí;
es candidato a ajuste si tienes un set distinto en mente.)*

### 1.2 `fraud_coverage_claims` — reclamos de cobertura (fondo de contingencia)
```sql
create type public.fraud_claim_status as enum ('pending','approved','rejected');

create table public.fraud_coverage_claims (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  business_id   uuid not null references public.businesses(id) on delete cascade,
  amount        numeric(10,2) not null check (amount >= 0),   -- DECISIONS.md: dinero numeric(10,2)
  reason        text not null,
  evidence_url  text,
  status        public.fraud_claim_status not null default 'pending',
  resolved_at   timestamptz,
  resolved_by   uuid references public.users(id) on delete set null,
  resolution_note text,
  created_by    uuid references public.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

### 1.3 RLS (DECISIONS.md: RLS en TODAS las tablas)
`enable row level security` en ambas. Acceso solo server-side vía `service_role`
(bypassa RLS); sin policies para `anon`/`authenticated` = cerrado por defecto.
Las policies de lectura admin se añaden junto con los endpoints admin (Paso 2.2).

---

## 2. Modificaciones a tablas existentes

### 2.1 `orders` — columnas del PROMPT (aditivas; `validando` se mantiene)
```sql
alter table public.orders
  add column requires_validation boolean not null default false,
  add column validated_at  timestamptz,
  add column validated_by  uuid references public.users(id) on delete set null,
  add column validation_result text check (validation_result in ('passed','failed'));
```
**Desviación justificada (PROMPT línea 245 lo permite):** el PROMPT pide
`payment_proof_url`, `payment_proof_verified_at/by`. **No los creo**: ya existen
como `comprobante_prepago_url`, `payment_verified_at`, `payment_verified_by`
(migración 0031). Reusar evita columnas duplicadas y datos divergentes.

### 2.2 `customer_profiles` — bloqueo temporal
```sql
alter table public.customer_profiles add column blocked_until timestamptz;
```

### 2.3 `app_settings` — parámetros (convención **nested** existente, no flat)
```sql
update public.app_settings set value = value || '{"temporaryBlockThreshold":3,"temporaryBlockDays":30}'::jsonb where key='strikes';
update public.app_settings set value = value || '{"maxValidationRequestsPerDayPerBusiness":3}'::jsonb where key='validation';
-- prepay_threshold=100 ya existe (regla S/100).
```
**Desviación justificada:** el PROMPT pide claves planas
(`strikes_for_temporary_block='3'`…). El repo ya usa objetos JSON anidados
(`strikes={blockThreshold:2}`). Mantengo la convención del repo.
Por tu decisión #3, **NO** seteo `strikes_for_prepayment_only` (se elimina el
escalón 2→prepago). La regla de prepago por **monto ≥ S/100** se mantiene.

---

## 3. Trigger `customer_incidents.is_strike → customer_strikes`
Cuando el admin confirma un incidente (`is_strike` pasa a `true`):
1. Inserta una fila en `customer_strikes` (reusa la tabla existente, anclada a
   teléfono + `delivery_reference`).
2. Recalcula `customer_profiles.strikes`.
3. Si `strikes >= temporaryBlockThreshold (3)` → setea
   `blocked_until = now() + temporaryBlockDays (30) días`.
Función `SECURITY DEFINER` con `set search_path = ''` (invariante DECISIONS.md).

---

## 4. Reglas de negocio resultantes (modelo final)
- **Monto ≥ S/100** → prepago obligatorio. *(se mantiene)*
- **Cliente nuevo / monto ≥ S/80** → entra a `validando` (la cajera llama). *(se mantiene)*
- **3 strikes confirmados** → bloqueo temporal 30 días (`blocked_until`). *(nuevo)*
- **Máx. 3 solicitudes de validación por restaurante/día.** *(nuevo)*
- ~~2 strikes → solo prepago~~ → **eliminado por tu decisión #3.**

---

## 5. Orden de implementación (Pasos del PROMPT)
1. **2.1 Migración** `0036_antifraude_incidents_claims.sql` (todo lo de §1–§3). ← *este OK*
2. **2.2 Endpoints**: motorizado (`/driver/incidents`), restaurante
   (`request-validation`, `reject-with-reason` ya existe, `fraud-claims`),
   admin (`incidents/pending-review`, `incidents/{id}/review`, `strikes`,
   `fraud-claims/pending`, `fraud-claims/{id}/resolve`), checkout cliente
   (bloqueo si `blocked_until > now()`). Idempotentes (`idempotency_keys`).
3. **2.3 Frontend**: motorizado "Reportar problema"; admin incidentes/strikes/claims;
   negocios "Reclamar cobertura"; cliente bloqueo elegante + "billetera digital".
4. **Paso 4 Tests** (reglas + flujo + trigger).
5. **Paso 5** `IMPLEMENTACION_ANTIFRAUDE_LOG.md`.
*(Cada paso = su(s) commit(s), con tu OK entre hitos según CLAUDE.md.)*

---

## 6. Dudas abiertas (PROMPT: "no inventes, anota dudas")
1. `incident_type` y los tipos de rechazo: ¿el set que propongo te sirve o tienes uno fijo?
2. Textos al cliente (PROMPT §8.1 del spec ausente): los redacto yo en "billetera digital" salvo que los tengas.
3. `fraud_coverage_claims` vs `contingency_advances` (ya existe y cubre pérdidas): ¿conviven o el claim alimenta al fondo? Propongo: el claim aprobado **genera** un `contingency_advances`.

---

## ⏸ Necesito tu OK en 1 cosa para aplicar la migración
**¿R1 (híbrido, recomendado) o R2 (rebuild puro)?** Con R1 escribo y aplico
`0036` ya. Con R2, primero planifico el rework del dashboard de Pedidos.
