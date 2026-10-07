# 04 · Plan técnico

> Sobre lo que **ya existe** de Entregas (`0232`–`0241`, `DECISIONS §31`,
> `Docs/Entregas/estado-actual.md`). Nada se escribe hasta que Jesús apruebe
> la v2. Rige `CLAUDE.md`: TDD en `packages/core`, migraciones solo por CLI,
> RLS en todo, `app_settings` para cualquier número.
>
> **Comparado con la v1, esta versión quita:** la tabla del fondo y su vista
> de cuadre, la lista por artículo con 4 reglas, el catálogo de productos, los
> niveles de cliente, 6 pantallas de admin y los aliados de encargos.
> **Agrega:** el paso «te atiendo en X min».

## 1. Un solo motor

Encargos va en **`courier_orders` con `kind = 'purchase'`**: mismo tablero del
motorizado, mismo tope, mismos push, misma rendición. Se reutiliza:

| Ya existe | Para qué sirve aquí |
|---|---|
| `courier_orders` + `courier_status` | El encargo. `at_pickup` = «Comprando», `picked_up` = «Compra lista» |
| `ready_in_min` / `ready_at` (`0232`) | **«Listo en X min» del restaurante** (`01` §5.3). Ya existe para «el paquete está listo en…» |
| El reloj que ven los dos lados (`0236`) | La cuenta regresiva de «te atiendo en X min» se calcula igual: un plazo en la base y nada escrito a mano |
| `driver_courier_step` (`0235`) | Aceptar, avanzar, soltar. Idempotente, con bloqueo, 32 tests |
| Rendición (`0237`) | Igual. Cambia el **monto** a rendir: S/ 2.50, no todo lo cobrado (§2.1) |
| Push por outbox (`0238`) | Más tipos de evento (§4) |
| Realtime (`0239`) | El seguimiento en vivo y las preguntas |
| `directory_businesses` (`0232`) | **La lista de la noche** (`01` §6): ya tiene `phone`, `opens_at`, `closes_at` |
| `offline-queue.ts`, `@tindivo/map` | Encima se monta el modo compra |

## 2. Base de datos

**Primer número libre: `0246`** (comprobar con `supabase migration list`: las
`0242`–`0245` de Store están en local y aún **no** en remoto, y puede haber
otro agente trabajando).

**Dos migraciones, no una.** `ALTER TYPE … ADD VALUE` no se puede usar en la
misma transacción en que se crea el valor. La `0246` solo agrega los valores
nuevos a los enums; la `0247` crea todo lo que los usa.

### 2.1 `courier_orders`: columnas nuevas

| Columna | Nota |
|---|---|
| `kind` (`delivery` \| `purchase`) | Default `delivery`: las filas de hoy no cambian |
| `shopping_list text` | Lo que pidió el cliente, texto libre (1 a 500). `item_description` lleva el resumen («Pollería X · medio pollo») |
| `list_photo_path` | Foto opcional del cliente. Storage privado, patrón de Store (`0244`) |
| `store_mode` (`directory` \| `anywhere` \| `manual`) | De dónde |
| `offered_eta_min`, `offered_at` | «Te atiendo en X min» del motorizado |
| `customer_confirmed_at` | El «Sí, espero» del cliente |
| `start_by` | `customer_confirmed_at + offered_eta_min`. La cuenta regresiva |
| `eta_extended_at` | La única prórroga |
| `purchase_total`, `purchase_paid_with` (`yape` \| `cash`), `purchase_proof_path` | «Compré». La foto es **obligatoria** |
| `customer_pays_with` (`yape` \| `cash`), `cash_tendered` | Lo que eligió el cliente |
| `extra_store` boolean | La segunda tienda aceptada |
| `driver_bonus numeric(10,2)` | 1.00 o 2.00. Snapshot de `app_settings` al entregar |
| `remit_amount` | **Derivado**, no se guarda a mano: `fee_amount − driver_bonus` para `purchase`, `fee_amount` para `delivery`. Es la lección de la `0124` |
| `loss_amount` | Lo marca Jesús |
| `created_via` (`web` \| `admin`), `created_by` | Para medir cuánto sigue entrando por WhatsApp |
| `tracking_token` | Para que el cliente de WhatsApp, sin cuenta, conteste desde el enlace |

**Restricciones, solo para `purchase`:**

- `origin_lat/lng` pasan a aceptar nulos **solo si** `kind = 'purchase'` y
  `store_mode <> 'directory'` (en «donde haya» la tienda la elige el
  motorizado). Un `CHECK` mantiene la regla para `delivery`.
- `payer = 'destination'` y `prepaid_confirmed = false`, siempre.
- Nuevo estado **`offered`** entre `requested` y `accepted`: el motorizado ya
  lo tomó con un tiempo y falta el sí del cliente. Con «Ahora» se salta y va
  directo a `accepted`.
- Nuevos `courier_cancel_reason`: `customer_declined_eta`, `no_answer`,
  `nothing_available`, `customer_absent`, `customer_refused`.

### 2.2 `courier_purchase_questions`

Una fila por pregunta: `courier_order_id`, `kind` (`substitute` \|
`extra_store` \| `over_cap` \| `price`), `text`, `photo_path`, `price`,
`asked_at`, `answer` (`yes` \| `no` \| `timeout`), `answered_at`. **Con un
`timeout`, el encargo se cancela sin cobro** si aún no hay `purchase_total`
(regla de Jesús, `01` §5.4).

### 2.3 La lista de la noche: `directory_businesses`

Se agrega `accepts_yape boolean`, `night_note text` e `is_night_list boolean`.
Teléfono, horario y pin ya existen.

**Antes de cargar un solo teléfono, hay que cerrar un hueco que ya está en
producción:** la policy `db_public_read` (`0232`) deja que `anon` lea
**todas** las columnas, `phone` incluido (verificado el 6-oct en
`tindivo-prod`). Hoy no se nota porque la tabla está vacía. La solución: la
web lee una vista sin `phone`/`whatsapp`, y se revoca el `SELECT` de esas
columnas a `anon` y `authenticated`. Se prueba **con una consulta como
`anon`**, no mirando el código de estado. De paso, se revocan el `INSERT` y el
`UPDATE` de columna que `anon` también tiene.

## 3. Funciones y rutas

Nuevas, `SECURITY DEFINER`, `SET search_path = ''`, `REVOKE` en la **misma**
migración (lección de la `0233`):

| Función | Qué hace |
|---|---|
| `create_courier_purchase` | Horario, tope, bloqueo del celular, **aliado de comida → error con su `business_id`**, 1 activo por celular. Encargo + evento en **una transacción** (invariante 4) |
| `driver_offer_purchase(eta)` | `Ahora` → `accepted`; `10/20/30` → `offered`. Respeta 1 encargo activo por motorizado |
| `customer_confirm_offer` | Sí / No, con sesión **o** con `tracking_token` |
| `driver_extend_eta` | Una vez, +10 min |
| `driver_ask` / `customer_answer` | Las preguntas (§2.2) |
| `driver_finish_purchase` | Total, con qué pagó, foto obligatoria → `picked_up` |
| `driver_collect_purchase` | Cobro (método, recibido, vuelto) → `delivered`. Fija `driver_bonus` |
| `expire_purchase_timers` | Vence ofertas sin respuesta (5 min), preguntas (5 min) y ofertas sin tomar (15 min). Inngest exacto + `pg_cron` de respaldo, como en `0232` |

**Rutas** (`apps/api`, mismo patrón que `customer/courier-orders`):
`POST customer/courier-purchases`, `POST public/courier/:shortId/confirm`
y `/answer` (con token), `POST driver/courier-orders/:id/offer|extend|ask|finish-purchase|collect`,
`POST admin/courier-purchases` (crear desde WhatsApp),
`POST admin/courier-purchases/:id/loss|cancel`,
`POST admin/customers/:phone/block|unblock`,
`POST/PATCH admin/directory-businesses`. Las lecturas, **directas por RLS**,
como ya hace Entregas.

## 4. Push

Por el mismo outbox (`0238`). Tag = `${event_type}-${shortId}` (invariante 5).

| Evento | A quién | Texto |
|---|---|---|
| `PurchaseRequested` | Motorizados activos | «🛍️ Encargo · Pollería X → Barrio Nuevo» |
| `PurchaseOffered` | Cliente | «Te atendemos en 20 min. ¿Te sirve?» |
| `PurchaseConfirmed` / `Declined` | Motorizado | «Dijo que sí, empieza a las 8:20» |
| `PurchaseQuestion` | Cliente | «No hay Panadol de 12. ¿Llevamos el de 6 a S/ 7?» |
| `PurchaseAnswered` | Motorizado | «Dijo que sí» / «No contestó: cancelado» |
| `PurchaseReadySoon` | Motorizado | «Faltan 3 min: vuelve a la Pollería X» |
| `PurchaseShopped` | Cliente | «Compra lista: S/ 30.80. Va en camino» |
| `PurchaseArrived` | Cliente | «Tu encargo está en la puerta» |
| `PurchaseDelivered` / `Cancelled` | Cliente | El motivo, honesto |

Un push que se entrega no siempre suena. Por eso **todo plazo vence solo** y
nunca deja al motorizado esperando.

## 5. Apps

| App | Qué | Dónde |
|---|---|---|
| `apps/customer` | Ficha de 4 cosas, «¿te sirve?», preguntas, seguimiento con la foto de la compra | `features/courier/purchase/`. Lo común con Entregas sube a `lib/` (una feature no importa de otra) |
| `apps/motorizados` | Tarjeta ENCARGO con los 5 botones de tiempo, modo compra, «listo en X min», «Llegué», cobro, **lista de la noche**, cierre único | Junto a `components/home/courier-*` y `app/entrega/[id]` |
| `apps/admin` | **Tres pantallas:** crear desde WhatsApp (<1 min), tablero del día (con prometido contra real) y alta rápida de la lista de la noche. La rendición ya existe (`/deuda-entregas`) | Rutas nuevas, mismo layout |
| `packages/contracts` | Enums y Zod | `courier.ts` |
| `packages/core` | **Puras, con TDD:** reparto y rendición, vuelto, `start_by` y prórroga, qué vence y cuándo | `courier/purchase.ts` |

**Iconos** (invariante 9): `apps/motorizados` ya tiene `shopping_bag`,
`receipt_long`, `photo_camera`, `storefront` y `timer`. Cualquier otro se
comprueba contra `public/fonts/icons.txt` antes de usarlo.

**De paso:** las plantillas de Entregas
(`apps/motorizados/lib/courier-whatsapp-templates.ts`) dicen «el encargo».
Pasan a «el pedido», para que la palabra signifique una sola cosa.

## 6. Pruebas

- **Integración** (`apps/api`, base local, tras `pnpm db:seed:e2e`): oferta
  con y sin tiempo, oferta que vence, pregunta que vence y cancela sin cobro,
  aliado de comida rechazado, tope, bloqueado, 1 activo por motorizado,
  rendición de S/ 2.50, `anon` no lee teléfonos. **`Cached: 0`** en el pie de
  `pnpm test`, o no vale.
- **Unitarias** en `packages/core` para toda la aritmética.
- **e2e** (Playwright, 390 px): pedir → «en 20 min» → sí → pregunta → sí →
  compré con foto → llegué → cobro con Yape → rendición.

## 7. Al publicar

`supabase db push` **de madrugada**, fuera del horario de pedidos. **Ojo:**
irían también las `0242`–`0245` de Store si siguen pendientes. Se decide
antes. Luego `pnpm db:types` y `get_advisors`. Encargos queda con
`enabled: false` hasta el ensayo.
