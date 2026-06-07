# AUDITORÍA DEL SISTEMA ANTIFRAUDE ACTUAL — Tindivo 2.0

> **Paso 1** del proceso de `PROMPT_GEMINI_REFACTOR_ANTIFRAUDE (1).md`.
> Este reporte inventaria lo que YA existe y lo compara con el modelo propuesto.
> **No se ha tocado ningún código de antifraude.** Esperando el OK de Jesús/Mauricio
> antes del Paso 2 (cambios aditivos), como exige el propio doc.
>
> Generado: 2026-06-06 · contra el proyecto Supabase Web v2 (`psjigdoinfpgrnedxeyf`).

---

## 0. Bloqueante #1: el spec de referencia NO está disponible

El prompt de refactor dice textualmente: *"Lee primero `SISTEMA_ANTIFRAUDE_TINDIVO.md` completo. Es la fuente de verdad… Usa el SQL exacto del spec en la sección 4. No improvises."*

**Ese archivo no está en el repo ni en `Downloads/`** (solo está el prompt). Sin él no se puede:
- Conocer el SQL exacto de las nuevas tablas (`customer_incidents`, `fraud_coverage_claims`) ni sus columnas.
- Resolver los conflictos "a favor del spec" (no hay spec contra el cual comparar).
- Confirmar los textos al cliente (sección 8.1 referida).

**Además, hay un segundo conflicto de autoridad:** `DECISIONS.md §8` (fuente única de verdad del repo, confirmada por el usuario) ya canoniza un modelo antifraude **distinto** al del prompt (2 strikes → solo prepago; sin bloqueo de 3 strikes/30 días; validación humana por llamada). El prompt y `DECISIONS.md` divergen.

> **Decisión requerida de Jesús/Mauricio antes del Paso 2** (ver §5).

---

## 1.1 · Inventario de lo que YA existe (antifraude/validación)

| Componente | Dónde | Qué hace | Estado |
|---|---|---|---|
| **Estado `validando`** | enum `order_status` · `create_customer_order` · `validate_order` (RPC) | Pedido entra a `validando` si: prepago (siempre), o contraentrega con número nuevo / con strike / monto ≥ `validation.amountThreshold` (80). El negocio/admin lo valida (pasa→`pending_acceptance`) o rechaza (→`cancelled`). | ✅ Completo |
| **`customer_strikes`** (tabla) | `0013_strikes_setup.sql` | 1 fila por strike, anclada a **teléfono + `delivery_reference`** (independientes) + `order_id` + `reason` + `reported_by`. | ✅ Completo |
| **`customer_contraentrega_blocked(phone, reference)`** | función `SECURITY DEFINER` | Devuelve true si el teléfono **o** la dirección acumulan ≥ `strikes.blockThreshold` (2). | ✅ Completo |
| **`customer_profiles`** | tabla | Contador rápido `strikes` + flag `contraentrega_blocked`. | ✅ Completo |
| **Bloqueo en alta** | `create_customer_order` | Si `payment_intent <> 'prepaid'` y `customer_contraentrega_blocked()` → rechaza (debe pagar adelantado). | ✅ Completo |
| **Umbral prepago S/100** | `create_customer_order` + `app_settings.prepay_threshold` (100) | Pedidos ≥ 100 deben ser prepago. | ✅ Completo |
| **No-show del motorizado** | `advance_order` acción `no_show` (`0014`) | Crea `customer_strikes` (ancla teléfono+dirección) + recalcula bloqueo. | ✅ Completo |
| **Trigger strike→reporte** | `create_report_for_strike` (`0015`) | Al insertar un strike, crea automáticamente un `reports` tipo `no_show` (open) para el admin. | ✅ Completo |
| **`reports`** (bandeja admin) | tabla + enum `report_type` | 6 tipos: `no_show`, `rejected_proof_disputed`, `cash_difference`, `restaurant_fake`, `strike_reactivation`, `advance_dispute`. | ✅ Completo |
| **Comprobante de prepago** | `orders.comprobante_prepago_url` · `payment_proof_status` · `payment_verified_at` · `payment_verified_by` · `validating_at` | Cliente sube comprobante; negocio verifica vía `validate_order` (setea `verified`/`rejected` + auditoría). Timer 10 min. | ✅ Completo *(columnas de verificación añadidas en `0031`/`0034` de la Fase Pedidos)* |
| **Fondo de contingencia** | `contingency_advances` + `app_settings.contingency_fund` (`{initial:250, current:250, disputeWindowHours:48}`) | Registro de adelantos/reembolsos al cliente cuando el restaurante falla; disputa del negocio en 48h → reporte `advance_dispute`. | ✅ Completo |
| **Config por `app_settings`** | tabla `app_settings` | `prepay_threshold=100`, `strikes={blockThreshold:2}`, `validation={amountThreshold:80}`, `timers={validationMinutes:5, prepayVerificationMinutes:10, noShowWaitMinutes:5, …}`. | ✅ Completo |
| **Idempotencia** | `idempotency_keys` + `withIdempotency()` | Estilo Stripe en POST de creación. | ✅ Completo |
| **Texto "billetera digital"** | UI negocios (mapeo `pending_yape→billetera`) | La UI ya generaliza Yape/Plin a "billetera digital". | ✅ Hecho (Fase Pedidos) |

---

## 1.2 · Comparación con el modelo del prompt

| Funcionalidad del prompt | ¿Existe? | Cómo está implementado hoy | Qué habría que cambiar |
|---|---|---|---|
| Regla del umbral **S/100** | ✅ Sí | `app_settings.prepay_threshold=100` + guard en `create_customer_order` | Nada (renombrar a `prepayment_threshold_amount` solo si el spec lo exige) |
| Tabla **`customer_strikes`** | ✅ Sí | Ancla teléfono+dirección, 1 fila por strike | Verificar columnas vs spec (no disponible) |
| Tabla **`customer_incidents`** | ⚠️ Parcial / equivalente | El **log de incidentes** hoy se reparte entre `customer_strikes` (cada strike es un incidente) y `reports` (bandeja admin). No hay una tabla única `customer_incidents`. | Decidir: ¿crear `customer_incidents` nueva (migrar) o tratar `reports`+`customer_strikes` como el incident-log? |
| Tabla **`fraud_coverage_claims`** | ⚠️ Parcial / equivalente | El **fondo de contingencia** (`contingency_advances`) cubre pérdidas, con disputa y resolución del admin. No hay un flujo formal de "claim" separado. | Decidir: ¿`fraud_coverage_claims` nueva o extender `contingency_advances`? |
| Validación manual del restaurante | ✅ Sí | Estado `validando` + `validate_order` (RPC, ya con `p_reason_code`) | El prompt usa columnas booleanas (`requires_validation`, `validated_at/by`, `validation_result`); hoy es **máquina de estados**. Decidir cuál gana. |
| Reporte de incidentes del motorizado | ⚠️ Parcial | Solo `no_show` (un tap en `advance_order`). No hay endpoint genérico `POST /api/incidents` con tipos de incidente. | **Añadir** flujo genérico de incidentes del motorizado (tipos predefinidos). |
| Panel admin de revisión de incidentes | ✅ Sí (base) | Bandeja `reports` + UI admin (`/reportes`) ya construida | Adaptar a "confirmar/desestimar strike" si se separa incident-log. |
| Subida y verificación de comprobante | ✅ Sí | `comprobante_prepago_url` + `payment_proof_status` + `validate_order` | Renombrar columnas a `payment_proof_url`/`payment_proof_verified_at/by` solo si el spec lo exige. |
| Mensajes al cliente (prepago obligatorio) | ⚠️ Parcial | El checkout del cliente fuerza prepago ≥100; textos exactos del spec (§8.1) no verificables. | Revisar textos cuando exista el spec. |
| Bloqueo de cliente con **3 strikes** | ❌ No | Hoy: **2 strikes → solo prepago** (no hay bloqueo total ni temporal de 30 días). | **Añadir** regla "3 strikes → bloqueo temporal 30 días" + `temporary_block_duration_days`. **Conflicto con `DECISIONS.md §8`.** |
| Cobertura de pérdidas (claim) | ⚠️ Parcial | Fondo de contingencia + revisión admin (tope ~S/30-40 en `DECISIONS.md`) | Formalizar como claim si el spec lo exige. |
| **Máx. 3 validaciones/día/restaurante** | ❌ No | No existe rate-limit de validaciones por restaurante. | **Añadir** `max_validation_requests_per_day_per_restaurant=3` + chequeo. |
| Config vía `app_settings` | ✅ Sí | Ya se usa para todos los umbrales | Añadir las claves nuevas del prompt si se aprueban. |

---

## 1.3 · Funcionalidades existentes que el prompt NO contempla

Estas existen, funcionan, y **no contradicen** el prompt. Recomendación: **conservar** (no son candidatas a eliminar).

- **Validación por llamada humana de la cajera** (estado `validando` para cliente nuevo / monto ≥80) — pieza central de `DECISIONS.md §8`. El prompt habla de "validación manual del restaurante" pero con columnas booleanas; el modelo de estado actual es más robusto.
- **Strikes anclados a teléfono Y dirección de forma independiente** (`DECISIONS.md §8`). El prompt no especifica el anclaje dual.
- **`reports` con 6 tipos** (incl. `restaurant_fake`, `strike_reactivation`, `advance_dispute`, `cash_difference`) — más amplio que los incidentes del prompt.
- **Fondo de contingencia con ventana de disputa de 48h** y actor que carga (restaurante/Tindivo).
- **Bloque también aplica al canal manual** (`DECISIONS.md §8`: el bloqueo por strikes aplica a pedidos manuales del negocio).

---

## 1.4 · Riesgos y dependencias del refactor

1. **`create_customer_order`** es el corazón: contiene el guard de bloqueo + umbral + lógica `validando`. Tocarlo es alto riesgo (lo consume el alta de pedidos del cliente). Cualquier cambio necesita re-test E2E.
2. **`validate_order`** acaba de cambiar de firma en la Fase Pedidos (añadió `p_reason_code`). Un refactor a columnas booleanas rompería el flujo `validando` del dashboard recién construido y testeado.
3. **Trigger `create_report_for_strike`** acopla `customer_strikes` → `reports`. Si se introduce `customer_incidents`, hay que decidir quién dispara qué para no duplicar entradas en la bandeja del admin.
4. **UI ya construida**: el panel admin (`/reportes`, `/auditoria`) y el dashboard del negocio (verificación de comprobante, validar) dependen del modelo actual. Migrar nombres de tabla/columna obliga a tocar esas UIs.
5. **Datos existentes**: hay `customer_strikes`/`reports`/`contingency_advances` con filas de QA; una migración de modelo necesita preservar/migrar.
6. **`DECISIONS.md` es la fuente de verdad del repo** y diverge del prompt (regla de 3 strikes). Resolver esto es prerequisito.

---

## 1.5 · Plan de refactor sugerido (orden propuesto)

**Recomendación general: NO reemplazar el sistema actual (funciona y está testeado). Hacer cambios ADITIVOS para cerrar las 3 brechas reales, y reutilizar lo existente en vez de duplicar tablas.**

1. **Cambios solo aditivos (no rompen nada):**
   - `app_settings`: añadir `strikes.prepaymentOnlyThreshold=2`, `strikes.blockThreshold=3`, `strikes.temporaryBlockDays=30`, `validation.maxRequestsPerDayPerBusiness=3`. *(Mantener compatibilidad con las claves actuales.)*
   - Columna/lógica para **bloqueo temporal de 30 días** (3 strikes) — p.ej. `customer_profiles.blocked_until timestamptz`.
2. **Lógica nueva (coexiste con la vieja):**
   - Endpoint genérico **incidentes del motorizado** (`POST /driver/incidents` con tipos predefinidos) → alimenta `customer_strikes` + `reports`.
   - Rate-limit de validaciones por negocio/día.
   - Extender `customer_contraentrega_blocked` para distinguir "solo prepago" (2) vs "bloqueo total temporal" (3).
3. **Solo si el spec lo exige** (cuando aparezca `SISTEMA_ANTIFRAUDE_TINDIVO.md`):
   - Renombrados de columnas (`comprobante_prepago_url`→`payment_proof_url`, etc.) con vistas/alias de compatibilidad.
   - Tablas `customer_incidents`/`fraud_coverage_claims` SOLO si se decide no reutilizar `reports`/`contingency_advances`.
4. **Migración de datos** (si se renombra/restructura): scripts idempotentes preservando filas actuales.
5. **Deprecación** del código viejo con feature flags, 2 semanas de transición (como pide el prompt §3).

---

## Dudas para Jesús/Mauricio (resolver antes del Paso 2)

1. **¿Dónde está `SISTEMA_ANTIFRAUDE_TINDIVO.md`?** Sin él no se puede hacer el SQL "exacto" ni resolver conflictos "a favor del spec".
2. **Conflicto de reglas:** ¿gana el prompt (3 strikes → bloqueo 30 días) o `DECISIONS.md §8` (2 strikes → solo prepago, sin bloqueo total)?
3. **¿Reutilizar o duplicar?** ¿`customer_incidents`/`fraud_coverage_claims` nuevas, o tratar `reports`+`customer_strikes`+`contingency_advances` (que ya existen y funcionan) como el modelo canónico?
4. **¿Máquina de estados (`validando`) o columnas booleanas (`requires_validation`)?** El dashboard recién construido depende del estado `validando`.

**⏸ Detenido aquí (Paso 1 completo).** No se avanza al Paso 2 (migraciones/endpoints/UI) hasta recibir el OK.
