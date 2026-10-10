# 06 · El contrato REST para las apps nativas (puesta al día del 2026-10-07)

> **Medido el 2026-10-07** sobre `develop` en `0306918`, con la base `tindivo-prod` en la migración **0247**
> (repo, local y remoto alineados). Pone al día el análisis del 2026-09-20, que se escribió en la 0230 y **antes de
> Tindivo Entregas y Tindivo Store**. Donde este documento y los anteriores discrepen, **manda este**; donde este y la
> base discrepen, manda la base.
>
> Solo lectura: no se tocó código. Las únicas escrituras del día fueron aplicar la 0246 y la 0247 en la base local.

> **⚠ Superado en parte por el debate con Codex (2026-10-08):** manda [`debate-rest/conclusion.md`](debate-rest/conclusion.md). Cambios principales: tres defectos de corrección van primero (paso 0); la verificación local del JWT y el cambio de región se **miden antes de decidirse** (no está probado que sean gratis ni cuánto ahorran); el plan F0-F5 de abajo queda sustituido por el orden 0-7 de la conclusión.

## 1. Qué cambió desde el 2026-09-20

| Cambio | Efecto sobre la migración móvil |
|---|---|
| **Tindivo Entregas** (0231-0240 y siguientes): `courier_orders`, `create_courier_order`, `advance_courier_order`, directorio, lugares del pueblo, rendición del motorizado | Nuevo flujo de cliente que también va a la app. **Se construyó con la API como puerta** (crear y cancelar por REST, con idempotencia), pero sus **lecturas** siguen siendo directas a `courier_orders` (5 sitios) y con Realtime |
| **Tindivo Store** (0241-0245): artículos, fotos, eventos, venta por WhatsApp | **Es la parte más limpia del sistema para móvil**: el cliente solo la lee por `GET /public/store*`, con caché HTTP, y no toca la base. Es la prueba de que el patrón «todo por REST» funciona aquí |
| **Mapa del pueblo** (0246-0247): categorías farmacia y comercio en `map_landmarks` | El cliente lee `map_landmarks` directo: es una lectura más que pasar a la API |
| **Una sola puerta para pedir** (`d585c91`) y home con entradas por servicio | Cambia la navegación del cliente; el catálogo `CUS-*` de `03-requisitos/` no lo recoge todavía |

**Lo que el análisis anterior decía y sigue igual (comprobado hoy):** `ARQ-01`, `ARQ-02`, `ARQ-07`, `ARQ-08`,
`PER-01`, `PER-02`, `PER-03`, `SEC-03`, `SEC-09`, `NOT-02` y `DAT-02` **siguen abiertos**. Ninguno de los 11
bloqueadores para publicar se ha resuelto todavía.

## 2. Mi opinión: REST como única puerta de datos

El análisis anterior recomendaba la opción **C** (mixto: lecturas directas a Supabase con RLS y escrituras por REST;
`04-decisiones-abiertas.md` §3.1). **Cambio la recomendación a REST como única superficie de datos de las apps**, con
Supabase reducido a dos papeles:

| Pieza | Cómo la usa la app nativa |
|---|---|
| **Datos y acciones** (leer, crear, cancelar, pagar, perfil, direcciones…) | **Solo** `https://apiv2.tindivo.com/api/v1`, descrita en OpenAPI y con clientes generados para Swift y Kotlin |
| **Sesión** (Google, Apple, refresco del token) | SDK de Supabase Auth (`supabase-swift` / `supabase-kt`): da el JWT que viaja como `Authorization: Bearer` |
| **Tiempo real** | Push nativo (APNs/FCM) como canal principal; Realtime solo como «timbre» de «algo cambió, vuelve a pedir», **nunca** como fuente de datos |
| **Archivos** (comprobante de pago) | La API entrega una URL firmada de subida; la app sube ahí y avisa a la API |

**Por qué cambio de opinión:**

1. **Lo dijiste tú y el sistema ya va en esa dirección.** Entregas y Store, lo último que se construyó, ya funcionan
   así, y son justo la parte del cliente que está lista para móvil.
2. **Lo que el cliente lee directo son tablas, no contratos.** `orders` tiene 98 columnas y 9 triggers; con la app
   leyéndola directo, **cualquier migración futura puede romper una app ya instalada** que no puedes actualizar a la
   fuerza. Con REST, el esquema vuelve a ser un detalle interno y lo puedes cambiar como hasta hoy.
3. **Las escrituras directas que quedan tienen reglas.** Direcciones, perfil y teléfono, términos y reseñas: hoy
   las protege la RLS, pero las reglas de forma (referencia mínima, coordenadas, cuál es la dirección por defecto)
   viven en TypeScript del navegador. En nativo serían **dos copias más** (Swift y Kotlin).
4. **El coste que frenaba la opción REST es arreglable.** La objeción era la latencia (~0,47 s medidos en septiembre). Medido hoy:
   la mitad se va en verificar la sesión contra Supabase Auth en cada petición, y eso **ya se puede hacer en
   local** (§3, R-06), y la otra mitad es la región de la función (R-07). Ambas cosas hay que medirlas antes de cambiarlas (ver la conclusión del debate).
5. **La superficie del cliente es abarcable.** Son unas **45 rutas** contando cada método (§4), y **19 ya existen**.

**Lo que NO recomiendo:** reescribir el dominio. Las RPC de Postgres (`create_customer_order`,
`advance_order`, `create_courier_order`…) son la autoridad sobre dinero, estados y antifraude, y están bien. La API
REST las **envuelve**; no las sustituye.

**Y una idea que abarata todo el plan:** que **la web del customer sea la primera consumidora del contrato móvil**.
Si la PWA deja de leer Supabase directo y pasa a usar las mismas rutas, cada noche de operación real prueba el
contrato antes de que exista la primera línea de Swift. Las apps nativas llegan a una API ya rodada, y no a una
diseñada sobre el papel.

## 3. Hallazgos medidos hoy

Los IDs `R-NN` son de este documento; donde corresponden a un hallazgo anterior, se indica.

### Lo que está bien y no se toca

- **Errores RFC 9457** (`application/problem+json`, `code`, `requestId`, `errors[]`), en
  `apps/api/lib/http/problem.ts`.
- **Idempotencia estilo Stripe** con reproducción y detección de payload distinto (`lib/http/idempotency.ts`), ya
  en crear pedido y crear entrega, que son las dos rutas que importan.
- **Plazo de 15 s** y distinción entre fallo de red y respuesta del servidor en `packages/api-client`: el mismo
  criterio debe copiarse en los clientes nativos.
- **Las RPC como fuente única** de las reglas (el comentario de `customer/orders/route.ts` sobre la «tercera copia»
  es exactamente la lección).
- **Store**: API pura, con `cache-control: s-maxage=15, stale-while-revalidate=60`.

### Lo que hay que resolver

| ID | Hallazgo (evidencia) | Antes | Gravedad para móvil |
|---|---|---|---|
| **R-01** | **El customer usa 21 rutas REST y hace 65 llamadas directas a Supabase**: 36 lecturas de tablas, **16 escrituras** (`customer_addresses` 9, `customer_profiles` 5, `terms_acceptance` 1, `order_review_dismissals` 1), 6 llamadas a 5 RPC (`effective_max_change`, `cart_item_free_delivery`, `get_pending_review`, `create_order_review`, `get_courier_tracking`), 4 canales Realtime y 3 usos de Storage (subida del comprobante y dos URL firmadas) | `ARQ-01` | **Bloquea** |
| **R-02** | **Dos formas de respuesta**: casi todo devuelve `{ data }`, pero `public/orders/[shortId]`, `public/courier/[shortId]` y `public/courier/status` devuelven el objeto sin envoltura (`raw()`). Un cliente generado necesita una sola forma | nuevo | Alto |
| **R-03** | **Los errores no tienen código de negocio.** `API_ERROR_CODES` tiene 12 códigos genéricos; «restaurante pausado», «cerrado», «teléfono sin verificar» y «primer pedido adelantado» llegan todos como `forbidden`/`conflict`, y **solo el texto en español los distingue**. `rpc-error.ts` clasifica errores de Postgres **con expresiones regulares sobre el mensaje**. En Entregas, la RPC ya lanza prefijos estables (`courier_closed`, `courier_out_of_zone`…) y **la API los tira** al traducirlos a `conflict` | `DAT-02` | **Bloquea** |
| **R-04** | **El checkout calcula el dinero en el cliente.** `use-checkout-state.ts` (724 líneas) calcula envío, promociones, tope de contraentrega, vuelto máximo y bloqueo por riesgo leyendo `app_settings` y dos RPC; la ruta de crear pedido lo **vuelve a calcular en TypeScript** (subtotal con modificadores) y la RPC una tercera vez. En nativo serían cinco copias | `ARQ-03` | **Bloquea** (falta un `quote`) |
| **R-05** | **Crear un pedido son ~16 rondas en serie**: Auth, `user_roles`, perfil, decisión de contraentrega, `app_settings` ×2, `menu_items`, modificadores, reproducción de idempotencia, `businesses`, `business_schedule`, apertura del día, reserva de idempotencia, RPC, cierre de idempotencia y Inngest. Cada ronda cruza el país (R-07) | `PER-03` | Alto |
| **R-06** | **Cada petición autenticada hace 2 rondas antes de empezar** (`auth.getUser` contra Supabase Auth + consulta a `user_roles`). **Novedad:** el proyecto ya firma los JWT con **ES256** (clave pública en `/auth/v1/.well-known/jwks.json`, comprobado hoy), así que la API puede **verificar el token en local** con la clave pública, sin ir a Auth; y los roles pueden viajar en el propio token con un *Custom Access Token Hook* (el invariante 7 de `CLAUDE.md` ya lo pedía) | `PER-01` | Alto |
| **R-07** | **La función sigue en Virginia y la base en Oregón.** Medido hoy: `x-vercel-id: gru1::iad1`; `/health`, que no toca la base, tarda 0,6-0,9 s desde aquí. No hay `vercel.json`, así que nadie fijó la región | `PER-02` | Alto (efecto de moverla por medir) |
| **R-08** | **Sin límite de peticiones.** `@upstash/ratelimit` está instalado y **tiene 0 usos**. El OTP limita 3 envíos por usuario y día, pero no por IP ni por teléfono: crear cuentas sale gratis y cada SMS te cuesta. `public/store/events` limita por `session_id`, que **lo inventa el propio cliente** | `SEC-03` | **Bloquea** abrir al público |
| **R-09** | **Ni versión del cliente, ni `GET /config`, ni `426`.** Nada sabe qué versión de app llama | `ARQ-07` (crítico) | **Bloquea** |
| **R-10** | **`p_source: 'customer_pwa'`** sigue escrito en la ruta de crear pedido y en las reglas SQL | `ARQ-08` | **Bloquea** |
| **R-11** | **Sin OpenAPI y casi sin esquemas de respuesta**: `packages/contracts` tiene 4 esquemas de petición y 2 de respuesta; las respuestas son el JSON de la RPC tal cual, sin tipo. **Lo bueno:** Zod 4 (`^4.4.3`, ya en el catálogo) trae `z.toJSONSchema()`, así que el OpenAPI puede salir de los mismos esquemas que validan, sin escribirlo dos veces | `ARQ-02` | **Bloquea** |
| **R-12** | **Textos que deberían ser datos.** `courierErrorDetail()` responde «Atendemos de 6 a 11 pm» con la hora escrita en el código, mientras `courier_service_status()` la saca de configuración; `public/courier/status` cae a `price: 3` escrito a mano si la RPC falla | nuevo | Medio |
| **R-13** | **Store usa parámetros en español en la URL** (`categoria`, `condicion`, `orden`), contra la convención de identificadores en inglés. En web da igual; en un contrato público cuesta cambiarlo después | nuevo | Bajo (decidir antes de congelar) |
| **R-14** | **El seguimiento del pedido es público por `shortId`** (`get_tracking`), sin sesión. Para la app del dueño del pedido debe existir una ruta autenticada (`/me/orders/{id}`); la pública queda para el enlace compartido | `SEC-04` | Medio |
| **R-15** | Siguen **solo Web Push** (`push/subscriptions` guarda `endpoint` de navegador) y **sin borrado de cuenta** | `NOT-02`, `SEC-09` | **Bloquean** |

**Un dato tranquilizador para el cambio de errores (R-03):** en todo el customer solo **un** sitio ramifica sobre
`err.code` (`idempotency_conflict`, en `use-checkout-actions.ts:353`). Añadir códigos más finos no rompe la web.

## 4. La superficie del cliente móvil (objetivo v1)

Prefijo `/api/v1`. **Ya existe** = se reutiliza tal cual o con ajustes de forma; **Nueva** = hoy la web lo hace
directo contra Supabase o no existe.

| Recurso | Rutas | Estado |
|---|---|---|
| Arranque | `GET /config` (versión mínima por plataforma, *kill switch*, parámetros ⚙ de `app_settings`, textos de horario) | **Nueva** |
| Catálogo | `GET /public/businesses`, `GET /public/businesses/{id}`, `GET /public/search`, `GET /public/schedule` | Ya existe |
| Mapa | `GET /public/landmarks`, `GET /public/delivery-zones` | **Nueva** (hoy directo) |
| Checkout | `POST /customer/checkout/quote` → total, envío, promos, métodos de pago permitidos y por qué, vuelto máximo | **Nueva — la más importante** (R-04) |
| Pedidos | `POST /customer/orders` · `GET /me/orders?status=active\|past` · `GET /me/orders/{id}` · `POST /customer/orders/{id}/cancel` | Crear y cancelar existen; **listar y detalle autenticado, nuevas** |
| Pago adelantado | `GET /customer/orders/{id}/prepay-info` · `POST /customer/orders/{id}/prepay-proof/upload-url` · `POST /customer/orders/{id}/prepay-proof` | La URL firmada de subida es **nueva** |
| Reclamos | `GET/POST /customer/orders/{id}/appeal`, `GET /customer/appeals` | Ya existe |
| Reseñas | `GET /me/reviews/pending`, `POST /me/reviews`, `POST /me/reviews/{orderId}/dismiss` | **Nueva** (hoy RPC directas) |
| Entregas | `GET /public/courier/status`, `GET /public/courier/directory`, `POST /customer/courier-orders`, `GET /me/courier-orders`, `GET /me/courier-orders/{id}`, `POST /customer/courier-orders/{id}/cancel` | Crear, cancelar y estado existen; **listar, detalle y directorio, nuevas** |
| Store | `GET /public/store`, `GET /public/store/{slug}`, `POST /public/store/events` | Ya existe |
| Perfil | `GET /me`, `PATCH /me`, `POST /me/terms` | **Nueva** (hoy directo) |
| Teléfono | `POST /customer/phone/send-code`, `POST /customer/phone/verify` | Ya existe |
| Direcciones | `GET/POST /me/addresses`, `PATCH/DELETE /me/addresses/{id}`, `POST /me/addresses/{id}/default` | **Nueva** (hoy 9 llamadas en 3 ficheros escriben directo) |
| Avisos | `PUT /me/devices/{installationId}` (token APNs/FCM, plataforma, versión) · `DELETE /me/devices/{installationId}` · `GET/PUT /me/notification-preferences` | **Nueva** (`NOT-02`, `NOT-06`) |
| Cuenta | `DELETE /me` (anonimización, `D-23`) | **Nueva** (`SEC-09`) |

**Reglas comunes a toda la superficie** (se implementan una vez, en `lib/http/`):

- Cabeceras de entrada `X-Client-Platform` (`ios|android|web`), `X-Client-Version`, `X-Client-Build`; si la versión
  es menor que la mínima de `/config`, **`426 Upgrade Required`** con `code: 'client_outdated'`.
- **Una sola envoltura**: `{ data }` en éxito y Problem Details en error; listas con `{ data: [...], nextCursor }`.
- **Códigos de error estables y específicos** (`business_paused`, `business_closed`, `phone_not_verified`,
  `prepay_required`, `active_order_exists`, `courier_closed`, `out_of_zone`, `client_outdated`…), con el texto en
  español en `detail` solo para mostrar.
- `Idempotency-Key` **obligatoria en todo `POST` que cree algo** (no solo en dos rutas).
- Fechas en ISO 8601 UTC; dinero como **cadena decimal** (`"12.50"`) o en céntimos, nunca como `float`. Hoy viaja
  como número JSON; decidir antes de congelar.
- Límite de peticiones por usuario y por IP (Upstash, ya instalado).

## 5. Plan por fases

Cada fase deja el sistema **funcionando en producción** y la web sin cambios visibles. Ninguna exige tocar
las RPC de dinero.

| Fase | Qué | «Hecho» cuando… | Riesgo para prod |
|---|---|---|---|
| **F0 · Cimientos** | Cabeceras de cliente + `GET /config` + `426`; códigos de error específicos (R-03) y una sola envoltura (R-02, aceptando ambas formas en la web durante la transición); verificación local del JWT (R-06); región `pdx1` (R-07); límites de peticiones (R-08); `client_platform` junto a `source` (R-10, `D-33`) | Los tests de la API pasan; una petición con versión vieja recibe 426 | Bajo: todo es aditivo |
| **F1 · OpenAPI** | Esquemas de respuesta en `packages/contracts` para las rutas del §4 que ya existen; generación de `openapi.json` desde Zod; servirlo en `GET /api/v1/openapi.json`; un test de CI que falle si una ruta del cliente no está documentada | `openapi-generator` produce clientes de Swift y Kotlin que compilan | Nulo |
| **F2 · Superficie `/me`** | Las rutas **nuevas** del §4: perfil, direcciones, pedidos y entregas (listar y detalle), reseñas, términos, landmarks, zonas, directorio y **`quote`** | Cada una con test de integración y en OpenAPI | Bajo: rutas nuevas |
| **F3 · La web se muda** | El customer deja de leer y escribir Supabase directo: usa F2. `use-checkout-state.ts` pasa a pedir el `quote` en vez de calcular | `grep` de `.from(` y `.rpc(` en `apps/customer` da solo Auth y Realtime; e2e verde | **Medio**: cambia la web en uso; desplegar fuera de 18:00-23:00 y por partes |
| **F4 · Avisos nativos** | Tabla de dispositivos, envío APNs/FCM desde el *outbox*, preferencias y consentimiento | Un pedido de prueba suena en un Android y un iPhone reales | Bajo |
| **F5 · Cuenta y tiendas** | Borrado de cuenta, Sign in with Apple, textos legales | Cumple las guías de App Store y Play | Bajo |

**Orden con Negocios:** el análisis anterior pone Negocios Android por delante (`D-35`). F0 y F1 sirven igual a las
dos apps, así que **no cambian ese orden**: se hacen primero en cualquier caso.

## 6. El código del customer: lo que complica la migración

No es «boilerplate» en el sentido de código de plantilla sobrante: el customer está bien organizado por *features*
y tiene tests. El problema es otro: **mucho comportamiento de negocio vive en la interfaz**, y eso es lo que habría que
reescribir dos veces.

1. **Ficheros que pasan con mucho su propia regla de 300 líneas** (`apps/customer/ARCHITECTURE.md`): 16 ficheros,
   encabezados por `use-checkout-state.ts` (724), `courier-map-host.tsx` (699), `unified-checkout.tsx` (651) y los dos
   `map-picker` (631 y 607). No es grave en sí; lo grave es **qué hay dentro** (punto 2).
2. **Reglas de dinero y elegibilidad en hooks de React** (R-04). Mientras estén ahí, cada app nativa necesita su
   copia, y las copias divergen; el propio código documenta dos veces que ya pasó.
3. **Acceso directo a la base desde componentes** (`address-bar.tsx`, `cart-business-gate.tsx`, `phone-gate-modal.tsx`…).
   Además de lo de móvil, mezcla presentación con datos y complica los tests.
4. **Tres almacenes de direcciones** (`DAT-04`, sigue igual) y una lógica de dirección por defecto repartida entre
   `address-save.ts`, `address-bar.tsx` y `use-account-page.ts`.
5. **Documentación que miente al lado peligroso:** `CLAUDE.md`, `DECISIONS.md §3`, `requireUser()` y
   `supabase/config.toml` siguen hablando de Capacitor o de aplicar migraciones por MCP. Se corrige al tocar cada uno.

**Qué SÍ se aprovecha tal cual en nativo:** los esquemas Zod (vía OpenAPI), la máquina de estados de
`packages/contracts` (para pintar el seguimiento), los textos y la lógica de presentación de `tracking/lib/` como
especificación, y el diseño de pantallas.

## 7. Qué puedes ir haciendo tú, sin esperar al código

1. **Abrir las cuentas** de Google Play y Apple (guía en `05-arranque/01-cuentas-y-firmas.md`) y reunir 15-20
   testers de Android: es el plazo externo más largo y no depende de nada de lo de arriba.
2. **Confirmar el Mac** (modelo y macOS) para Xcode 26.
3. **Vercel**: decidir el plan Pro (`D-37`); la región `pdx1` se fija desde el repo en F0.
4. **Probar en tu Android** el flujo completo de la web cada semana: lo que se rompa ahí, se romperá en nativo.

## 8. Decisiones que necesito

| # | Decisión | Mi recomendación |
|---|---|---|
| **D-21** (reabierta) | Superficie de las apps | **REST como única puerta de datos** (§2), sustituye a la opción C |
| **D-38** | ¿La web del customer se muda al mismo contrato (F3)? | **Sí**: es la forma más barata de probar el contrato con operación real |
| **D-39** | Dinero en JSON | Cadena decimal (`"12.50"`): exacta en Swift (`Decimal`) y Kotlin (`BigDecimal`) |
| **D-40** | Parámetros de Store en la URL | Aceptar los dos (`category` y `categoria`) en la API y documentar solo los ingleses |
