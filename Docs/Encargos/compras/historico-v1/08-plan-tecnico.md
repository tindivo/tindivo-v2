# 08 · Plan técnico

> Sobre lo que **ya existe** de Entregas (`0232`–`0241`, `DECISIONS §31`,
> `Docs/Entregas/estado-actual.md`). Nada de esto se escribe hasta que Jesús
> apruebe D1–D9. El orden de construcción sigue las reglas de `CLAUDE.md`:
> TDD en `packages/core`, migraciones solo por CLI, RLS en todo.

## 1. Decisión de fondo: un solo motor

**Encargos va en `courier_orders`, con `kind = 'purchase'`**, no en una tabla
nueva. Se reutiliza:

| Ya existe | Para qué sirve aquí |
|---|---|
| `courier_orders` + `courier_status` | El encargo y sus estados. `at_pickup` = «Comprando», `picked_up` = «Compra lista» |
| `driver_courier_step` (`0235`) | Aceptar, soltar, avanzar. Idempotente y con bloqueo, ya probado con 32 tests |
| Tope por motorizado (`maxActivePerDriver`) | Se añade uno **propio** para encargos: 1 |
| Vencimiento a los 15 min (Inngest + `pg_cron`) | Igual |
| Push por outbox (`0238`: `courier_order_events` → `domain_events`) | Más tipos de evento (§4) |
| Realtime de `courier_orders` (`0239`) | El seguimiento en vivo del cliente |
| Rendición del transporte (`0237`) | El servicio de S/ 3.50 entra igual. El dinero del producto va aparte (§2.3) |
| Tablero del motorizado, `offline-queue.ts`, `@tindivo/map` | El modo compra se monta encima |

**Por qué no una tabla aparte:** el motorizado tiene **un solo tablero** y
**un solo tope**, y Jesús **un solo cuadre**. Con dos tablas, cada una de esas
cosas se hace dos veces y se desincroniza. Lo que es propio de la compra (la
lista, el fondo) sí va en tablas nuevas.

## 2. Base de datos

**Migración `0246`** (comprobar con `supabase migration list` el primer número
libre: dos agentes pueden coger el mismo, ver la memoria de colisiones).
Aditiva, idempotente, con `REVOKE ... FROM public, anon, authenticated` en la
**misma** migración que cada RPC (lección de la `0233`) y verificación de
`proacl` después.

### 2.1 `courier_orders`: columnas nuevas

| Columna | Tipo | Nota |
|---|---|---|
| `kind` | `courier_kind` (`delivery` \| `purchase`) | Default `delivery`: las filas actuales no cambian |
| `store_mode` | `text` (`directory` \| `anywhere` \| `manual`) | Solo `purchase` |
| `store_category` | `directory_business_category` | Para «Donde haya» |
| `extra_store_allowed` | `boolean` | «Busca en otra tienda (+S/ 1)» |
| `budget_cap` | `numeric(10,2)` | Tope de productos |
| `purchase_total` | `numeric(10,2)` | Lo pagado en la tienda |
| `purchase_paid_with` | `text` (`float_cash` \| `driver_yape`) | Con qué pagó el motorizado |
| `receipt_photo_path` | `text` | Storage privado (patrón de las fotos de Store, `0244`) |
| `customer_pays_with` | `text` (`cash` \| `yape`) + `cash_tendered numeric(10,2)` | Lo que eligió el cliente |
| `amount_collected` | `numeric(10,2)` | Lo cobrado en la puerta (producto + servicio) |
| `change_given` | `numeric(10,2)` | Vuelto |
| `loss_amount` | `numeric(10,2)` | Lo marca Jesús (`06` §3) |
| `created_via` | `text` (`web` \| `admin`) | Y `created_by uuid` |
| `tracking_token` | `text` | Para que quien no tiene cuenta decida desde el enlace (§3) |

**Restricciones que cambian, solo para `purchase`:**

- `origin_lat/lng` hoy son `NOT NULL`. En «Donde haya» la tienda **no se sabe**
  hasta que el motorizado la elige, y en «Otra tienda» quizá no hay pin. Pasan a
  nulos **solo si** `kind = 'purchase'`, con un `CHECK` que mantenga la regla
  para `delivery`.
- `item_description` (1 a 120) se rellena con un resumen («3 artículos · Botica
  La Merced»). La lista de verdad va en §2.2.
- `payer` siempre `destination`; `prepaid_confirmed` siempre `false`.
- `customer_user_id` es `NOT NULL`: el encargo creado por Jesús desde el admin
  lo lleva a él (como hoy en Entregas), pero el **dueño real** es
  `requester_phone`. Todo lo que mire historial o bloqueos mira el
  **celular**, no el usuario.
- Nuevas razones en `courier_cancel_reason`: `nothing_available`,
  `store_closed`, `over_budget`, `customer_absent`, `customer_refused`.

### 2.2 `courier_order_items`: la lista

| Columna | Nota |
|---|---|
| `courier_order_id`, `position` | Los imprescindibles se ordenan primero al leer, no al guardar |
| `quantity`, `description`, `details`, `photo_path` | Lo que pidió el cliente |
| `if_missing` | `ask` \| `similar` \| `skip` \| `cancel_all` |
| `directory_product_id` | Si salió del catálogo (§2.4) |
| `reference_price` | Snapshot del precio aproximado al pedir |
| `status` | `pending` \| `bought` \| `substituted` \| `skipped` \| `asking` |
| `paid_price` | Lo que costó |
| `substitute_description`, `substitute_photo_path` | Lo que se compró en su lugar |
| `asked_at`, `decided_at`, `decided_by` (`customer` \| `timeout` \| `driver`) | Para medir (§6 de `03`) |

### 2.3 `driver_cash_floats`: el fondo

Una fila por motorizado y **jornada** (`service_date`, la misma noción que ya
usa el cierre de comida): `opening_amount`, `given_by`, `given_at`,
`declared_cash`, `declared_yape`, `closed_at`, `confirmed_by`,
`confirmed_at`, `note`.

**Lo esperado no se guarda: se calcula** con una vista
`driver_float_ledger` sobre `courier_orders` del día (fórmula de `04` §5.2).
Es la misma lección que la `0124` dejó con `balance_due`: un saldo derivado no
se descuadra.

### 2.4 `directory_business_products`: el catálogo

`directory_business_id`, `name`, `photo_path`, `reference_price`,
`price_seen_at`, `source` (`manual` \| `purchase`), `times_bought`, `active`.
Cada `bought` de §2.2 hace **upsert** por tienda + nombre normalizado
(`07` §3.2). Más: `directory_businesses.tags text[]` para «Qué encuentras aquí»
y `is_purchase_partner boolean`.

### 2.5 El teléfono de la tienda hoy es público

La policy `db_public_read` de `directory_businesses` (`0232`) deja leer **todas
las columnas** de las filas visibles. **Verificado hoy en `tindivo-prod`:**
`anon` y `authenticated` tienen `SELECT` sobre `phone` y `whatsapp`. Para
Entregas fue a propósito: el spec del 21-sep pone un botón «Llamar» en la
ficha. Para los **aliados de encargos** choca con D7. Hoy no se nota porque la
tabla está vacía, pero el sábado se cargarían sus teléfonos a la vista de
cualquiera.

**Se arregla antes de cargar nada:** la web lee una **vista pública** que
devuelve `phone`/`whatsapp` como `null` cuando `is_purchase_partner`, y se
revoca el `SELECT` directo de esas dos columnas a `anon` y `authenticated`.
`apps/customer/features/courier/lib/directory.ts` pasa a leer la vista.
Probarlo con una consulta como `anon`, no con el código de estado (memoria
«un DELETE sin policy devuelve 204»).

**De paso:** `anon` también tiene `INSERT` y `UPDATE` de columna en esa tabla.
Las policies lo frenan (solo `db_admin_all` escribe), pero conviene revocarlo:
una policy que alguien afloje mañana no debería ser la única barrera.

### 2.6 Otro hueco de Entregas que conviene cerrar a la vez

`/entregas` lista los 60 `map_landmarks` y cualquiera puede abrir una entrega
con **Pizza Priamo** como punto de recojo (`placeAsOrigin`), saltándose la
comisión del aliado. Misma regla que en `02` §4: **un aliado de comida no es
origen** ni de entregas ni de encargos. Se valida en `create_courier_order`,
no solo en la UI.

## 3. RPC y rutas

**Nuevas funciones** (`SECURITY DEFINER`, `SET search_path = ''`, solo
`service_role`):

| Función | Qué hace |
|---|---|
| `create_courier_purchase` | Valida horario de encargos, tope por nivel del celular (`courier_purchase_cap_for(phone)`), bloqueos, aliado de comida → error con su `business_id`, 1 activo por celular **y por tipo**. Crea el encargo + sus artículos + el evento, en **una transacción** (invariante 4) |
| `driver_purchase_item` | `bought(price)` \| `missing` (aplica `if_missing`) \| `ask(photo, price)` \| `substitute(desc, price)` |
| `driver_finish_purchase` | Total, con qué pagó, foto. Pasa a `picked_up`. Exige foto |
| `driver_collect_purchase` | Cobro en la puerta (método, recibido, vuelto). Pasa a `delivered`. Rechaza montos que no cuadren con el total + servicio sin una nota |
| `customer_decide_item` | Sí / No, con sesión **o** con `tracking_token` |
| `expire_item_questions` | Vence las preguntas a los 3 min (Inngest exacto + `pg_cron` de respaldo, como en `0232`) |
| `driver_float_open` / `driver_float_close` / `admin_confirm_float` | El fondo (§2.3) |

**`driver_courier_step` se extiende** para que `accept` respete el tope propio
de encargos y la regla de la comida (`02` §3: no se ofrece con 2 o más pedidos
de comida activos).

**Rutas** (`apps/api`, mismo patrón que `customer/courier-orders`):
`POST customer/courier-purchases`,
`POST customer/courier-purchases/:id/items/:itemId/decision`,
`POST public/courier/:shortId/decision` (con token),
`POST driver/courier-orders/:id/items/:itemId`,
`POST driver/courier-orders/:id/finish-purchase`,
`POST driver/courier-orders/:id/collect`,
`POST driver/float/open|close`,
`POST admin/courier-purchases` (crear desde WhatsApp),
`POST admin/courier-purchases/:id/loss|refund|cancel`,
`POST admin/floats/:id/confirm`,
`POST admin/customers/:phone/block|unblock`,
`POST/PATCH admin/directory-businesses` y `.../products`.
Las lecturas, **directas por RLS** desde el navegador, como ya hace Entregas
(`DECISIONS §31`): no hay `GET` de listado en la API. Tener en cuenta la memoria
«el salto a la API cuesta medio segundo».

## 4. Push

Por el mismo outbox (`0238`). Tag = `${event_type}-${shortId}` (invariante 5).

| Evento | A quién | Texto |
|---|---|---|
| `PurchaseRequested` | Motorizados activos | «🛍️ Encargo nuevo · Botica La Merced» |
| `PurchaseAccepted` | Cliente | «Tu encargo ya tiene motorizado» |
| `PurchaseItemQuestion` | Cliente | «No hay Panadol Antigripal. ¿Llevamos el de caja de 6?» |
| `PurchaseShopped` | Cliente | «Compra lista: S/ 25.30. Va en camino» |
| `PurchaseDelivered` / `Cancelled` | Cliente | El motivo, honesto |
| `PurchaseQuestionAnswered` | Motorizado | «Dijo que sí» / «Dijo que no» |

Ojo con lo aprendido: un push que se entrega no siempre suena (memoria «el push
se entregó y aun así no sonó»). Por eso la pregunta al cliente **vence sola** y
nunca bloquea al motorizado.

## 5. Apps

| App | Qué | Dónde |
|---|---|---|
| `apps/customer` | Formulario del encargo (`02` §5), tarjeta de decisión, seguimiento con lista y boleta, entrada en el home y en las fichas de tienda | `features/courier/` crece una carpeta `purchase/`; la regla del repo dice que una feature no importa de otra, así que lo común con Entregas sube a `lib/` |
| `apps/motorizados` | Tarjeta ENCARGO, modo compra, cobro, «Mi cuadre» (`05`) | Junto a `components/home/courier-*` y `app/entrega/[id]` |
| `apps/admin` | `/encargos`, `/encargos/nuevo`, `/encargos/[id]`, `/cuadre`, `/clientes`, `/directorio` (`06`) | Rutas nuevas, mismo layout |
| `packages/contracts` | Enums, Zod de la lista, de las decisiones y del cobro | `courier.ts` |
| `packages/core` | **Puras y con TDD:** aplicar `if_missing`, vigilar el tope y decir qué dejar, calcular el vuelto, la fórmula del cuadre, el nivel del cliente | `courier/purchase.ts` |

**Cambios pequeños pero obligatorios:**

- `apps/motorizados/lib/courier-whatsapp-templates.ts`: «el encargo» → «el
  pedido» en Entregas (`02` §1).
- `app_settings.courier.purchase`: `enabled`, `hours`, `fee`, `extraStoreFee`,
  `caps` (`known`, `new`, `knownMinDelivered`), `maxActivePerDriver`,
  `foodBusyThreshold`, `questionTimeoutSec`, `doorWaitMin`. **Nada en el
  código** (regla del repo).

## 6. Pruebas antes del domingo

- **Integración** (`apps/api`, contra la base local, tras `pnpm db:seed:e2e`):
  un test por caso de `03` que la base pueda decidir. Como mínimo: tope por
  nivel, bloqueado, aliado de comida rechazado, imprescindible que falta
  cancela sin cobro, pregunta que vence, cobro que no cuadra, cuadre con Yape
  propio, `anon` no lee teléfonos. Mirar el pie de `pnpm test`: **`Cached: 0`**
  o no vale (Turbo no ve la base).
- **Unitarias** en `packages/core` para toda la aritmética del dinero.
- **e2e** (Playwright): cliente pide → motorizado compra con un «no hay» y una
  pregunta → cliente responde → cobro → cuadre. Viewport de 390 px. En
  Chromium headless, los permisos de notificación nacen denegados: falla el
  andamio, no el código.
- `pnpm --filter @tindivo/negocios test` si se toca `packages/ui` (iconos).

## 7. Al publicar

`supabase db push` **de madrugada**, antes que las apps y fuera del horario de
pedidos (`tindivo-prod` es operación real). Luego `pnpm db:types` y
`get_advisors`. Encargos queda con `enabled: false` hasta el domingo, y se
enciende para el ensayo.
