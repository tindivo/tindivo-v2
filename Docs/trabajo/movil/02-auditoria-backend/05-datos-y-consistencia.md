# 05 · Datos y consistencia

> **Pregunta:** ¿el modelo y las reglas de integridad aguantan clientes móviles con red mala,
> reintentos y versiones antiguas conviviendo?
> Etiquetas y escalas: [`00-veredicto-y-metodo.md`](00-veredicto-y-metodo.md).

## DAT-01 · La idempotencia cubre 4 de 49 rutas que mutan, y los reintentos de las demás dan errores engañosos

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | Parcial (hay que cubrir al menos lo que toca el cliente) |
| **Esfuerzo** | M |

**En una frase.** El diseño de idempotencia es bueno pero solo se aplicó a cuatro rutas; en el
resto, un reintento por mala red o produce un duplicado o un error que miente.

**Evidencia.** `[CÓDIGO]`
- **49 rutas** mutan datos (`POST/PUT/PATCH/DELETE`); **solo 4** usan `Idempotency-Key`:
  `POST /customer/orders`, `/business/fraud-claims`, `/driver/incidents`,
  `/driver/orders/:id/transfer-request`. `DECISIONS.md:505` promete «todos los POST de creación».
- **`POST /business/orders`** (la cajera, **619 de los 716 pedidos**) **no tiene idempotencia**: un
  doble toque o un reintento crea un pedido duplicado.
- **Reintento de lo que el cliente hace, hoy:**
  - `POST /customer/orders/:id/cancel` tras un primer intento que sí se aplicó: la RPC responde
    «**Tu pedido ya fue aceptado por el restaurante y no puede cancelarse**» (porque el estado ya no es
    `validando/pending_acceptance`), **aunque el pedido esté cancelado por el propio cliente**. El
    error miente sobre lo ocurrido. (`cancel_customer_order`, definición leída)
  - `POST /customer/orders/:id/prepay-proof` reintentado: «**El pedido no espera comprobante**»
    (409), porque el primero ya lo pasó a `validando` (`prepay-proof/route.ts:39-40`).
- **`withIdempotency` deja la clave en `reserved` si el manejador lanza:** el código reserva con
  `upsert`, ejecuta `await handler()` y solo marca `completed` si no hubo excepción
  (`apps/api/lib/http/idempotency.ts:54-66`). Un error inesperado (500) deja la fila en `reserved`
  hasta que caduca (`expires_at` = 24 h, `[DB-PROD]`), y **el reintento con la misma clave recibe 409
  «Solicitud idéntica en proceso»**. El cliente web «conserva la clave si no fue 4xx»
  (`packages/api-client/src/index.ts:33-38`), o sea que **reintentaría una clave envenenada**. Hoy no
  hay ninguna fila atascada (`[DB-PROD]`: 1 clave, `completed`), pero es un fallo latente.
- **El cliente regenera la clave ante cualquier 4xx**, incluido el 409 «Solicitud idéntica en
  proceso» (`features/checkout/hooks/use-checkout-actions.ts:336-378`): si el primer envío sigue en
  curso o quedó atascado, el reintento del usuario viaja con **otra clave** y solo lo frena la
  regla «un pedido activo por negocio» (migración 0105), no la idempotencia. Funciona por
  casualidad de dominio, no por diseño.

**Por qué importa con nativo.** Los móviles reintentan solos (pérdida de señal, app en segundo
plano, el SO mata la petición). Las peticiones tienen que ser **reintentables sin efecto extra ni
mensaje falso**.

**Dirección.** (1) Idempotencia en **todas** las rutas de mutación de la superficie móvil. (2) Ante
excepción, **borrar o marcar `failed`** la reserva para que el reintento reejecute. (3) Hacer
**semánticamente idempotentes** las acciones naturales: cancelar un pedido ya cancelado por el mismo
usuario devuelve **200 con el estado actual**, no un error; subir el mismo comprobante devuelve el
mismo resultado. (4) Un test de contrato «reintento = mismo resultado».

---

## DAT-02 · Los errores de negocio no tienen código estable

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | **Sí** |
| **Esfuerzo** | M |

**En una frase.** Las reglas de negocio se rechazan con **frases en español** y un único código de
Postgres (`P0001`) que la API convierte, casi siempre, en `validation_error` (422).

**Evidencia.**
- `create_customer_order` contiene al menos **17 `RAISE EXCEPTION`** de negocio (16 mensajes
  distintos): «Verifica tu número de WhatsApp antes de hacer un pedido.», «Pago adelantado
  requerido para primer pedido.» (dos veces), «El total con envio (S/ %) pasa de S/ %, asi que el
  pago debe ser adelantado.», «Dirección fuera de la zona de reparto establecida para San
  Jacinto», «El item "%" no se sirve en este turno»… Todas con `errcode = 'P0001'`. `[DB-PROD]`
- `customer/orders/route.ts:353-355` mapea `P0001 → validation_error` sin distinguir; en `cancel`
  el mismo `P0001` se mapea a `order_not_cancellable` (`.../cancel/route.ts:34`), incluida la
  frase «No autorizado para cancelar este pedido», que **debería ser 403**. `[CÓDIGO]`
- El catálogo de códigos (`packages/contracts/src/errors.ts:24-37`) tiene 12; **`business_blocked`
  y `payment_required` no se emiten en ningún sitio**, `rate_limited` solo en OTP. `[CÓDIGO]`
- Para mostrar un dato de contexto se recurre a **cadenas dentro de `error.details`**
  (`active_order_block:<uuid>:<shortId>:<status>`, `customer/orders/route.ts:332`), analizadas con
  una expresión regular. `[CÓDIGO]`
- **Se filtra información de contexto en el texto**, p. ej. el nombre de la ciudad («…para San
  Jacinto») está dentro del mensaje: no sirve para más de un pueblo.

**Por qué importa con nativo.** La app necesita **decidir qué pantalla mostrar** («ir a pago
adelantado», «fuera de zona: ¿recojo?», «negocio cerrado») y **traducir/formatear** el mensaje.
Comparar cadenas en español es frágil (un cambio de redacción rompe la app publicada) y no permite
localización.

**Dirección.** **Códigos de dominio estables** (`prepay_required`, `out_of_coverage`,
`item_unavailable`, `phone_not_verified`, `business_closed`, `active_order_exists`…), con
`params` estructurados (`{ threshold: 80, total: 82.5 }`), definidos en `contracts`, emitidos por
`errcode`/`DETAIL` JSON desde SQL y mapeados **una vez** en la API a `code` + `params` +
`detail` (texto de respaldo). La app decide por `code` y formatea con sus propias cadenas. Cada
código lleva su estado HTTP correcto (409 para conflicto de estado, 403 para autorización, 422
solo para validación de forma).

---

## DAT-03 · Tres modelos de identidad que no se hablan (Auth, teléfono, directorio)

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | Parcial (afecta al *onboarding*) |
| **Esfuerzo** | M |

**En una frase.** Quién eres para **Supabase Auth** (Google o correo), quién eres para **el
negocio** (tu teléfono) y quién eres para **la cajera** (una fila del directorio) son tres cosas
distintas, unidas por convenciones.

**Evidencia.** `[DB-PROD]`
- `auth.users`: **86, ninguno con teléfono** (64 Google, 22 correo). El teléfono es un atributo de
  `customer_profiles`, verificado por **Twilio Verify por SMS** (63 de 76 perfiles verificados).
- `customer_profiles.phone` es **único** (`23505 → «Este número ya está asociado a otra
  cuenta»`, `verify/route.ts:107-112`). **No hay flujo para fusionar, recuperar ni cambiar** número:
  quien entra un día con Google y otro con correo tiene **dos cuentas y solo una puede tener su
  teléfono**.
- El **antifraude se ancla al teléfono y a la dirección** (strikes, `compra_previa`), y los
  pedidos de la cajera (`customer_user_id NULL`) cuentan como historial del teléfono
  (`customer_contraentrega_decision`, definición leída). O sea: **el teléfono es la identidad de
  negocio**, aunque no sea la de Auth.
- Los usuarios sin `phone` en Auth **no pueden usar el OTP nativo de Supabase**; el OTP es un
  desarrollo propio (`send-code` / `verify`).

**Por qué importa con nativo.** El primer contacto del cliente es «regístrate». Un flujo que
permite crear dos cuentas para la misma persona y luego bloquea una por el teléfono es fricción
segura. Además, en nativo aparecen Sign in with Apple (que puede **ocultar el correo**) y el
autocompletado del OTP (SMS Retriever / *one-time-code*).

**Dirección.** Tratar el **teléfono verificado como identidad de primera clase**: OTP como método
de acceso (o al menos como enlace obligatorio), *account linking* explícito (Google ↔ Apple ↔
teléfono) y un flujo de recuperación («este número ya tiene cuenta con Google: entra con eso o
solicita el traspaso»). Decisión de producto pendiente (ver `04-decisiones-abiertas.md`).

---

## DAT-04 · Tres almacenes de direcciones y una instantánea por pedido

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | M |

**Evidencia.** `[DB-PROD]` Columnas:
- `customer_profiles`: `default_address, default_reference, default_coordinates_lat/lng,
  default_location_accuracy_m` (**una dirección por defecto dentro del perfil**).
- `customer_addresses`: `label, line, reference, coordinates_lat/lng, is_default,
  location_confirmed_at, location_accuracy_m` (**varias direcciones del cliente**; también tiene
  `is_default`).
- `address_directory`: **por teléfono**, `customer_name, reference, lat, lng, accuracy_m, source
  (backfill|driver_verified|admin_curated|business_created), times_used` (**lo que el pueblo sabe de
  una persona**, alimentado por el ETL del v1, la cajera y el motorizado; 908 filas).
- `orders`: `delivery_address, delivery_reference, delivery_coordinates_*` como **instantánea**
  (correcto) más `address_directory_id`.
- Tipos de coordenadas **mezclados**: `numeric` en `customer_profiles.default_*`,
  `customer_addresses` y `orders.delivery_coordinates_*`; `float8` en `address_directory.lat/lng` y
  `orders.customer_gps_*`. `CLAUDE.md` fija `numeric(10,7)`.

**Por qué importa con nativo.** Tu queja de que «las direcciones no son exactas en el navegador» se
resuelve **capturando mejor** (GPS nativo, pin ajustable), pero **el destino de esos datos es un
modelo con dos sitios donde guardar «mi dirección por defecto»** y un tercero que la cajera
alimenta aparte. La app debe leer/escribir **uno**.

**Dirección.** `customer_addresses` como única fuente de las direcciones del cliente
(`is_default` como marca; quitar `customer_profiles.default_*`), `address_directory` **solo** como
conocimiento del pueblo indexado por teléfono, y una **instantánea inmutable** en el pedido. Ver
`CUS-ADR-*` (requisitos) y `NAT-LOC-*` (precisión nativa).

---

## DAT-05 · El pedido cambia de estado desde la API sin pasar por la máquina de estados

| | |
|---|---|
| **Severidad** | Bajo-Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

**Evidencia.** `[CÓDIGO]` `customer/orders/[id]/prepay-proof/route.ts:45-55`: hace `UPDATE orders SET
status = 'validando', proof_attempt = …` directamente, tras un `SELECT` sin `FOR UPDATE`.
`CLAUDE.md` invariante 8 lo menciona como «el único `.update()` directo del API». Comprobar y
actualizar en dos pasos permite que dos subidas simultáneas pasen ambas el `proof_attempt >= 2`.

**Dirección.** Convertirlo en una RPC (`submit_payment_proof`) o en una acción de `advance_order`
(una sola pieza de código escribe estados), idempotente (`DAT-01`).

---

## DAT-06 · No hay política de retención de datos personales

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | Parcial (formulario de seguridad de datos y borrado de cuenta) |
| **Esfuerzo** | M |

**Evidencia.** `[DB-PROD]` `[CÓDIGO]` Retención definida solo para logs técnicos (`push_delivery_log`
30 d, `domain_events` 90 d, `idempotency_keys` 24 h, `outbox_events` 30 d). **Sin fecha de caducidad**:
`orders.customer_phone`, `delivery_address`, `customer_notes`; `customer_addresses`;
`address_directory` (908 filas de personas que **nunca abrieron una cuenta**); `order_event_log`
(5 376 filas); `order_status_history`; `customer_otp_attempts` (nunca se purga, 49 filas). No existe
inventario de PII ni texto de política que lo enumere; `/privacidad` es una página web.

**Por qué importa.** Apple pide **etiquetas de privacidad** y Google el **formulario de seguridad de
datos**: hay que declarar qué se recoge, para qué y cuánto se guarda. Y la Ley 29733 exige
finalidad y plazo.

**Dirección.** Inventario de PII por tabla/columna, plazo por categoría, jobs de anonimización
(pedidos con más de N meses conservan importes y pierden nombre/teléfono/dirección), y texto de
política alineado con lo implementado (ver `SEC-09`).

---

## DAT-07 · Deriva entre lo documentado y lo vivo en parámetros de negocio

| | |
|---|---|
| **Severidad** | Bajo (afecta a quien implemente el móvil leyendo la documentación) |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

`[DB-PROD]` frente a `DECISIONS.md`:

| Parámetro | Documento | Vivo en `app_settings` |
|---|---|---|
| Umbral de prepago | «S/100» (§7) | **80** (`prepay_threshold`, `validation.amountThreshold`) |
| Comisión de delivery | «S/1.00» (§4) | **1.50** (`commissions.delivery`) |
| Aceptación del negocio | 8 min (§10) ✔ | 8 (pero `get_tracking` tiene `5` como *fallback*) |
| Promo de envío gratis | — | `active: true` con `to: 2026-09-05` (vencida; la 0230 le puso fecha) |
| Postgres | «15» (`Docs/13`) | **17** (`DECISIONS.md:53`) |

**Regla para el móvil:** la app **no debe llevar ninguno de estos números escritos**; los recibe de
`GET /config` (ver `MOB-02`). Los valores de la tabla son **fotografías del 2026-09-20**.

---

## DAT-08 · El registro de `pg_cron` es el 79 % de la base y crece sin poda

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S |

**En una frase.** `cron.job_run_details` ocupa **117 MB de los 148 MB** de la base y suma **~2,1 MB al día**; ningún
trabajo de limpieza lo poda.

**Evidencia.** `[DB-PROD]` 374 600 filas desde 2026-07-24, ~327 bytes por fila, **6 463 filas al día** (los 4 barridos
de 1 minuto suman ≈ 5 760). Las tablas de la aplicación suman 13 MB. Existen 6 trabajos de limpieza (`idempotency`,
`push_delivery_log`, `subscriptions`, `rejections`, `domain_events`, `outbox`), **ninguno** para el propio registro de
`pg_cron`. Supabase documenta que esta tabla no se poda sola.

**Por qué importa.** En el plan gratuito (500 MB, `PRO-06`) el tope llega hacia **febrero-marzo de 2027**, antes si suben
los pedidos, y un proyecto gratuito que lo supera pasa a solo lectura (◦ confirmarlo en el panel): una **caída de
escritura** en plena operación. Aun en Pro, es el 79 % del disco dedicado a un registro que nadie lee.

**Dirección.** Un trabajo diario que borre lo anterior a 7 días (lo recomendado por Supabase); propuesta idempotente
en `05-arranque/02-planes-region-y-mejoras-rapidas.md` §2.2. El espacio se reutiliza y el crecimiento se detiene.

---

## Lo que ya está bien en datos (conservar)

- **Dinero en `numeric(10,2)`**, importes desglosados (`order_amount` vs `delivery_fee`), y la regla
  «un total que no cubre el envío se rechaza» calculada en la RPC, no en el navegador (§22).
- **Instantánea del pedido** (dirección, precios de ítems, modificadores) que no cambia si cambia el
  catálogo (`customer_order_items.item_name_snapshot`, `…_snapshot`).
- **`update_business_manual_order` con `p_expected_updated_at`** (concurrencia optimista): el patrón
  correcto para ediciones que dos personas pueden pisar.
- **`short_id` y `numero_pedido`** generados en servidor; `delivered` terminal y verificado contra
  las 8 funciones que escriben estado (invariante 8).

## Resumen de este documento

| ID | Hallazgo | Sev. | Bloquea | Esf. |
|---|---|---|---|---|
| DAT-01 | Idempotencia en 4 de 49 rutas; reintentos con errores engañosos; clave `reserved` atascable | Alto | Parcial | M |
| DAT-02 | Errores de negocio sin código estable (frases + `P0001`) | Alto | **Sí** | M |
| DAT-03 | Tres modelos de identidad (Auth / teléfono / directorio) sin unificar | Medio | Parcial | M |
| DAT-04 | Tres almacenes de direcciones + tipos numéricos mezclados | Medio | No | M |
| DAT-05 | Estado mutado fuera de la máquina de estados (`prepay-proof`) | Bajo-Medio | No | S |
| DAT-06 | Sin política de retención de datos personales | Medio | Parcial | M |
| DAT-07 | Parámetros documentados que no coinciden con los vivos | Bajo | No | S |
| DAT-08 | Registro de `pg_cron` sin poda: 79 % de la base (117 MB) | Medio | No | S |
