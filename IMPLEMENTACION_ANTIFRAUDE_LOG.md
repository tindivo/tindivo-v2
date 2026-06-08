# IMPLEMENTACIÓN ANTIFRAUDE — Log de cierre (Paso 5)

> Documento de cierre que pide `PROMPT_GEMINI_REFACTOR_ANTIFRAUDE`.
> Resume lo implementado, lo aplicado a producción, lo verificado y lo que queda.
> Decisiones del usuario: **#1** proceder con DECISIONS.md + PROMPT (el spec
> `SISTEMA_ANTIFRAUDE_TINDIVO.md` no existe) · **#2** tablas nuevas
> (`customer_incidents` + `fraud_coverage_claims`) · **#3** solo 3 strikes →
> bloqueo temporal 30 días (sin el escalón 2→prepago).

---

## 1. Resumen de cambios

Sistema antifraude v1 implementado **de forma aditiva** sobre el sistema existente
(no se rompió el estado `validando` ni la verificación de comprobante ya probados —
enfoque R1 híbrido, ver `ANTIFRAUDE_PASO2_DESIGN.md`).

Modelo final de reglas (todo en producción):
- **Monto ≥ S/100** → prepago obligatorio. *(existente)*
- **Cliente nuevo / con strike / monto ≥ S/80** → `validando` (la cajera llama). *(existente)*
- **Motorizado reporta incidente** → `customer_incidents` (pendiente de revisión admin).
- **Admin confirma incidente** → `customer_strikes` (trigger) + recálculo.
- **3 strikes confirmados** → bloqueo temporal 30 días (`blocked_until`); el checkout lo rechaza. *(nuevo)*
- **Máx. 3 solicitudes de validación / negocio / día.** *(nuevo)*
- **Reclamo de cobertura** del negocio → aprobado por admin genera un `contingency_advances`. *(nuevo)*

---

## 2. Migraciones aplicadas (Supabase "Web v2" `psjigdoinfpgrnedxeyf`)

| Migración | Qué hace |
|---|---|
| `0031_business_dashboard_fields` | busy mode + columnas de verificación de comprobante + rechazo estructurado |
| `0032_manual_order_optional_customer` | pedido manual con cliente opcional |
| `0033_fix_manual_order_generated_column` | fix columna generada `is_manual` |
| `0034_validate_order_reason_code` | motivo estructurado en `validate_order` |
| `0035_fix_prepay_timeout_respect_proof_status` | **bugfix**: el cron de prepago respeta `payment_proof_status='verified'` |
| `0036_antifraude_incidents_claims` | tablas `customer_incidents` + `fraud_coverage_claims`, columnas `orders`/`customer_profiles`, `app_settings`, trigger `is_strike→customer_strikes`+bloqueo |
| `0037_antifraude_rpcs_and_rls` | RPCs (create/review incident, request-validation, create/resolve claim, customer_is_blocked) + RLS + revoke trigger fn |
| `0038_antifraude_rpc_optional_params` | params de texto opcionales con DEFAULT NULL |
| `0039_fix_resolve_fraud_claim_enum_cast` | **bugfix**: cast del enum `fraud_claim_status` en resolve |
| `0040_checkout_three_strike_block` | `create_customer_order` rechaza clientes bloqueados (3 strikes); quita el escalón 2→prepago |

`database.types.ts` regenerado tras cada migración. `get_advisors` revisado.

---

## 3. Endpoints creados (`apps/api/app/api/v1/`)

**Motorizado:** `POST/GET /driver/incidents`.
**Negocio:** `POST /business/orders/[id]/request-validation` · `POST /business/fraud-claims`.
**Admin:** `GET /admin/incidents` · `PUT /admin/incidents/[id]/review` · `GET /admin/strikes` ·
`GET /admin/fraud-claims` · `PUT /admin/fraud-claims/[id]/resolve`.
**Cliente:** el bloqueo se aplica server-side en `create_customer_order` (RPC) que usa `/customer/orders`.

Idempotencia (`Idempotency-Key`) en los POST de creación. `lib/http/rpc-error.ts` mapea SQLSTATE→HTTP.
`put` agregado a `@tindivo/api-client`.

---

## 4. Frontend (Paso 2.3) — las 4 apps

- **Motorizados** (`app/page.tsx`): botón "Reportar problema" + modal de tipos → `POST /driver/incidents`.
- **Admin** (`app/incidentes` · `app/strikes` · `app/claims` + nav): bandeja de incidentes
  (Confirmar strike/Desestimar), strikes por cliente + bloqueo, claims (Aprobar/Rechazar).
- **Negocios** (`app/historial`): "Reclamar cobertura por fraude" → modal → `POST /business/fraud-claims`.
- **Cliente** (`app/checkout`): pantalla "Cuenta en pausa" al detectar bloqueo + textos "billetera digital".

---

## 5. Tests / verificación

> Las reglas antifraude viven en **Postgres** (RPCs/triggers/cron), no en TS. Se verificaron
> **end-to-end por SQL directo en producción** (no por vitest unit — la suite actual es pura-unit
> de `core`+`contracts`; tests formales de las reglas requerirían un harness de integración con BD).

Verificado en vivo:
- ✅ Trigger `customer_incidents.is_strike → customer_strikes`.
- ✅ `create_customer_incident` → `review('confirmed')` → **3er strike → `blocked_until` = +30 días** → `customer_is_blocked()=true`.
- ✅ `create_fraud_claim` → `resolve(approve=true)` → **genera `contingency_advances` (S/30)**.
- ✅ `request_order_validation` marca `requires_validation`.
- ✅ `create_customer_order`: cliente bloqueado → **rechazado**; cliente normal → **creado** (no rompió el camino crítico).
- ✅ Bugfix `0035` reverificado en vivo: prepago verificado **sobrevive** el cron; sin verificar **se cancela**.
- ✅ Build + type-check + lint + CI (GitHub Actions) en **verde**.

Pendiente de prueba: write-test HTTP en vivo de los endpoints (bloqueado por guardrail — mutaría prod);
flujo logueado e2e de motorizados/cliente.

---

## 6. Desviaciones respecto al PROMPT (justificadas)

1. **R1 híbrido**: se conserva el estado `validando` + columnas de comprobante existentes en vez de
   reemplazarlas por las booleanas del PROMPT (no romper lo entregado y testeado).
2. **Reúso de columnas de comprobante** (`comprobante_prepago_url`, `payment_verified_at/by`) en vez
   de duplicar (`payment_proof_url`…). El PROMPT lo permite (regla #7).
3. **`app_settings` anidado** (convención del repo) en vez de claves planas.
4. **Decisión #3**: se elimina el escalón "2 strikes → prepago"; solo 3 strikes → bloqueo 30 días.
5. **Esquemas de `customer_incidents`/`fraud_coverage_claims` diseñados aquí** (el spec con el "SQL
   exacto" no existe), documentados en `ANTIFRAUDE_PASO2_DESIGN.md`.

---

## 7. Issues abiertos / pendientes

- **Paso 3 (NO hecho)**: deprecar el código antifraude viejo con feature flags + período de transición.
  *(Nota: el sistema viejo — `customer_contraentrega_blocked`, `reports`, fondo de contingencia — sigue
  vivo; el nuevo es aditivo. No hay código "muerto" a quitar todavía salvo el chequeo 2-strikes ya
  reemplazado en `create_customer_order`.)*
- **Paso 4 (parcial)**: verificación e2e por SQL hecha; faltan tests automatizados en la suite.
- **DNS [tú]**: `negocios/admin/motorizados.tindivo.com` no resuelven (configurar CNAME a Vercel).
  Hoy operativo por los alias `*.vercel.app`. `api.tindivo.com` ✅ ya operativo.
- **`request_order_validation` rate-limit**: lógica `count >= max` correcta pero no e2e-testeada (cambio de día UTC).
- **Endpoints HTTP de escritura**: verificados por construcción (RPC + patrón), no por write-test en vivo.
- **Path manual** (`create_business_manual_order`): aún tiene el chequeo viejo de 2-strikes (path secundario).

---

## 8. Recomendaciones para Mauricio

1. Configurar el DNS de los subdominios frontend para usar `tindivo.com` (último paso de go-live).
2. Sembrar `app_settings` finales si quieres ajustar umbrales (`strikes.temporaryBlockThreshold/Days`,
   `validation.maxValidationRequestsPerDayPerBusiness`).
3. Si querés cobertura formal: montar un harness de integración con BD para testear las reglas SQL en CI.
4. Decidir si el path de pedido manual del negocio también debe aplicar el bloqueo a 3 strikes.
