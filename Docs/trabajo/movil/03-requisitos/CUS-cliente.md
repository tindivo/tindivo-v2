# CUS · App de clientes (`apps/customer`)

> **Es la especificación de las apps nativas de cliente (iOS y Android).** Se escribió leyendo el
> código de `apps/customer` (≈ 24,9 k líneas), `packages/contracts`, las rutas de `apps/api` y las
> funciones SQL vivas en `tindivo-prod` (migración 0230), **no** desde la documentación.
> Formato, leyenda de estados y disposiciones: [`00-formato-y-convenciones.md`](00-formato-y-convenciones.md).
>
> ⚙ = valor **configurable** en `app_settings` (la app lo recibe de `GET /config`, nunca lo lleva
> escrito). Los números entre paréntesis son la **fotografía del 2026-09-20**.
> ★ = **crítico de paridad**: iOS y Android deben decidir o cobrar exactamente igual (llevan
> criterios de aceptación al final y vectores de conformidad).

## Mapa de pantallas actual → propuesta nativa

| Pantalla web (`app/`) | Qué hace | Equivalente nativo |
|---|---|---|
| `/` | Inicio: saludo, buscador, carrusel, negocios, pedido en curso, reseña pendiente | Pestaña **Inicio** |
| `/negocio/[id]` | Carta del negocio, ficha de producto, bolsa | **Negocio** + hoja de producto + hoja de bolsa |
| `/checkout` | Entrega, pago, confirmación | **Checkout** (2 pasos: entrega → pago) |
| `/pedido/[shortId]` | Seguimiento, cancelar, pagar, apelar | **Seguimiento** (+ Live Activity / notificación viva) |
| `/pedidos` | Historial (40) | Pestaña **Pedidos** |
| `/cuenta` | Perfil, direcciones, reclamos, sesión | Pestaña **Cuenta** |
| `/entrar` | Entrada (Google / correo) | Flujo de **acceso** (hoja) |
| `/terminos`, `/privacidad` | Legal | Pantallas web embebidas / enlaces |
| `/auth/callback` | Vuelta de OAuth | *No existe en nativo* |
| `sw.js`, `manifest`, `robots`, `sitemap`, `opengraph` | PWA/SEO | *No existen en nativo* |

## Resumen

Ver el conteo generado en [`matriz-disposicion-movil.md`](matriz-disposicion-movil.md).

---

## CUS-AUT · Acceso, verificación y perfil

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-AUT-001 | Cuando el cliente no tiene sesión, la app debe permitirle explorar el catálogo y armar la bolsa. | El inicio de sesión se exige solo al pasar a checkout (puerta dura). | `lib/order-gates.ts:45-49`; `features/cart/components/cart-ctas.tsx:58-69` | ✅ | IGUAL · M1 |
| CUS-AUT-002 | Cuando el cliente elige Google, la app debe iniciar sesión con Google mostrando siempre el selector de cuenta. | En nativo: flujo de **ID token** (`signInWithIdToken`). Errores mapeados a español. | `components/auth-onboarding/persistence.ts:87-97` | ✅ | ADAPTAR · M1 |
| CUS-AUT-003 | Cuando el cliente use iPhone, la app debe ofrecer **Sign in with Apple** además de Google. | Obligatorio (App Store 4.8). Puede ocultar el correo: `users.email` no siempre es real. | — | ➕ | NUEVO · M1 |
| CUS-AUT-004 | Cuando el cliente elige correo, la app debe crear la cuenta con nombre, correo y contraseña. | Contraseña ≥ 6; sin verificación de correo; «Este correo ya tiene una cuenta»; crea `terms_acceptance` y `customer_profiles`. Decidir si se ofrece en nativo (`SEC-07`). | `persistence.ts:51-70` | ✅ | IGUAL · M1 |
| CUS-AUT-005 | La app debe permitir iniciar sesión con correo y contraseña. | «Correo o contraseña incorrectos»; «Demasiados intentos». | `persistence.ts:72-79` | ✅ | IGUAL · M1 |
| CUS-AUT-006 | Cuando el cliente entra por primera vez, la app debe confirmar su nombre visible y registrar la aceptación de términos. | Versión ⚙ `terms_version` (2026-05); `terms_acceptance(user_id, version)` único (duplicado se ignora). | `persistence.ts:6,34-45,178-182` | ✅ | IGUAL · M1 |
| CUS-AUT-007 | La app debe verificar el celular del cliente por código SMS antes de su primer pedido. | Número `^9\d{8}$` (acepta +51, 51 y separadores); envío `POST /customer/phone/send-code`; **máx. 3 envíos por usuario en 24 h** (429 «Demasiados intentos. Intenta mañana.»); código de **6 dígitos**, envío automático al completarlo; reenvío tras **60 s**; 503 «no disponible». Solo SMS (WhatsApp no aprobado). | `components/auth-onboarding/steps/phone-step.tsx`; `api/.../phone/send-code/route.ts`; `.../verify/route.ts` | ✅ | ADAPTAR · M1 |
| CUS-AUT-008 | El servidor debe guardar el celular verificado en formato E.164 y **asociarlo a una sola cuenta**. | `customer_profiles.phone` único; conflicto → 409 «Este número ya está asociado a otra cuenta». **No hay flujo de fusión ni recuperación** (`DAT-03`). | `verify/route.ts:94-115` | ⚠️ | IGUAL · M1 |
| CUS-AUT-009 | Cuando el cliente cambia el celular en el checkout, la app debe exigir nueva verificación antes de crear el pedido. | Compara el celular escrito con el verificado. | `features/checkout/hooks/use-checkout-actions.ts:190-196` | ✅ | IGUAL · M1 |
| CUS-AUT-010 | Si hay sesión pero no perfil (p. ej. Google en otro dispositivo), la app debe pedir completar el nombre. | Variante `profile-incomplete`. | `use-checkout-auth.ts:89-102` | ✅ | IGUAL · M1 |
| CUS-AUT-011 | Si no se puede confirmar la sesión por falta de red, la app debe **conservar** la sesión local. | `getUser()` devuelve `null` tanto si no vale como si no hubo forma de preguntar; solo se desmiente con veredicto del servidor. Es crítico en móvil. | `use-checkout-auth.ts:44-60`; `packages/supabase/src/session-verdict.ts` | ✅ | IGUAL · M1 |
| CUS-AUT-012 | Si el servidor desmiente la sesión, la app debe cerrar **solo la sesión local**, nunca la de otros dispositivos. | El `signOut()` global echó a todos los usuarios una vez (`Docs/handoff/2026-08-17-…`); la guarda `check:auth` lo impide. | `use-checkout-auth.ts:69-77`; `lib/sign-out.ts` | ✅ | IGUAL · M1 |
| CUS-AUT-013 | La app debe ofrecer «cerrar sesión en este dispositivo» y, aparte, «cerrar en todos». | Dos acciones distintas. | `features/account/components/account-menu.tsx`; `lib/sign-out.ts` | ✅ | ADAPTAR · M1 |
| CUS-AUT-014 | La app debe permitir editar el nombre del perfil. | Actualiza `customer_profiles.full_name` y los metadatos de Auth. | `features/account/hooks/use-account-page.ts:296-302` | ✅ | IGUAL · M1 |
| CUS-AUT-015 | La app debe mostrar el progreso del perfil (nombre, celular verificado, dirección) y llevar al paso que falta. | — | `features/account/components/profile-hero.tsx`; `use-account-page.ts` | ✅ | IGUAL · M1 |
| CUS-AUT-016 | La app debe reanudar el alta tras volver del inicio de sesión de Google en menos de 30 min. | Solo existe porque en web la página se recarga tras OAuth. | `lib/onboarding-store.ts:19-52` | 🗑️ | SOLO-WEB · W |
| CUS-AUT-017 | La app debe permitir **borrar la cuenta** y los datos personales desde la propia app. | Ver `SEC-09`: anonimización con retención mínima; reautenticación; enlace web público. **Bloquea la publicación.** | — | ➕ | NUEVO · M1 |
| CUS-AUT-018 | La app debe permitir gestionar el consentimiento y las categorías de notificaciones. | Ver `NAT-CON-*`. | — | ➕ | NUEVO · M1 |

**Backend hoy:** Supabase Auth (Google OAuth, `signUp`, `signInWithPassword`, `updateUser`),
`customer_profiles` (lectura/escritura directa), `terms_acceptance` (escritura directa),
`POST /customer/phone/send-code`, `POST /customer/phone/verify`.
**Superficie móvil propuesta:** `GET/PATCH /me`, `POST /me/phone/send-code`, `POST /me/phone/verify`,
`DELETE /me`, `GET /me/readiness` (puertas del checkout calculadas por el servidor).

---

## CUS-CAT · Catálogo, búsqueda y negocio

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-CAT-001 | La app debe listar los negocios publicados con nombre, eslogan, logo, color, ETA y si están abiertos. | `is_open_now`: `true/false`, `null` = sin horario (sin badge). `GET /public/businesses`. Solo negocios activos, no bloqueados y con catálogo publicado. | `app/page.tsx`; `features/catalog/types.ts:117-137` | ✅ | IGUAL · M1 |
| CUS-CAT-002 | La app debe saludar al cliente por su nombre y mostrar el pedido en curso si lo hay. | Hoy el saludo es fijo «Buenas noches» (el negocio opera de noche, ⚙ `platform_schedule` 18:00-23:00). | `features/catalog/components/home-shell.tsx:60-87` | ✅ | ADAPTAR · M1 |
| CUS-CAT-003 | La app debe permitir buscar negocios y platos. | **Mín. 2 caracteres**, *debounce* 300 ms, se cancela la petición en vuelo; insensible a mayúsculas y tildes en ambos sentidos; máx. 60 caracteres en servidor; resultados de negocios y de platos (el plato lleva al negocio). `GET /public/search?q=`. | `lib/use-search.ts:48-49`; `DECISIONS.md §20` | ✅ | IGUAL · M1 |
| CUS-CAT-004 | La app debe mostrar la página de un negocio: banner, logo, eslogan, ETA, horario semanal y categorías. | `GET /public/businesses/:idOrSlug` acepta **uuid o slug**; el enlace con uuid redirige al slug (301). | `api/.../public/businesses/[id]/route.ts:14-27`; `app/negocio/[id]/page.tsx` | ✅ | IGUAL · M1 |
| CUS-CAT-005 | La app debe mostrar el menú por categorías. | Las categorías **sin platos no se muestran**; los destacados (`is_compact`, nombre histórico) van primero, respetando `display_order`. | `route.ts:167-178` | ✅ | IGUAL · M1 |
| CUS-CAT-006 | La app debe permitir buscar dentro de la carta del negocio. | Filtrado local, insensible a tildes; resalta coincidencias; el estado vacío ofrece buscar en todo el catálogo (`?q=`). | `features/catalog/lib/menu-search.ts` | ✅ | IGUAL · M1 |
| CUS-CAT-007 | La app debe mostrar la ficha de un producto con nombre, descripción, precio, imagen y etiquetas. | Sin foto, usa un color de tarjeta (`image_hue`). | `features/catalog/components/product-modal.tsx`; `types.ts:30-38` | ✅ | ADAPTAR · M1 |
| CUS-CAT-008 ★ | La app debe permitir elegir modificadores según las reglas de cada grupo. | `selection_type` **single** (una) o **multi**; grupo **obligatorio**: single exige una, multi exige `max(1, min_selections)`; multi respeta `max_selections`; `price_display` **delta** («+ S/ x», «Incluido») o **total** (tamaños); las opciones no disponibles no se muestran. | `features/catalog/hooks/use-product-options.ts:41-64`; `route.ts:138-165` | ✅ | IGUAL · M1 |
| CUS-CAT-009 ★ | La app debe calcular el precio de la línea como (precio base + Σ opciones) × cantidad. | Cantidad **1-50**; nota del plato **≤ 140** caracteres; redondeo a 2 decimales. El servidor **recalcula y revalida**. | `use-product-options.ts:48-50`; `contracts/requests.ts:15-21` | ✅ | IGUAL · M1 |
| CUS-CAT-010 | La app debe mostrar «Agotado» y no permitir pedir un plato con `is_available = false`. | Lo pone la cajera a mano («se acabó»). | `features/catalog/components/menu-item-card.tsx` | ✅ | IGUAL · M1 |
| CUS-CAT-011 ★ | Mientras un plato esté fuera de su franja horaria, la app debe apagarlo y decir cuándo vuelve. | Días **0=lun…6=dom**, `available_from/to` en `America/Lima`, cruce de medianoche, *fail-open* ante datos rotos; distinto de «agotado»; se reevalúa sin recargar. Etiqueta tipo «Solo sáb y dom, de 11:00 a 15:00». El servidor también lo hace cumplir (`create_customer_order`: «no se sirve en este turno»). | `contracts/src/menu-availability.ts`; `features/catalog/lib/availability.ts` | ✅ | IGUAL · M1 |
| CUS-CAT-012 ★ | Mientras el negocio esté cerrado, la app debe mostrar «Cerrado», deshabilitar el pedido y decir cuándo abre. | `getOpenStatus(turnos, ahora)`: `day_of_week` **0=lun**, turno `[inicio, fin)`, cruce de medianoche **por turno**, sin horario = siempre abierto, hora/día en `America/Lima`; el servidor responde 409 «cerrado ahora. Abre hoy a las …». Reevaluar cada 30-60 s. | `contracts/src/schedule.ts`; `customer/orders/route.ts:235-252`; `DECISIONS.md §19` | ✅ | IGUAL · M1 |
| CUS-CAT-013 | El servidor debe rechazar pedidos si el negocio no ha confirmado que atiende hoy. | `opening_confirmed = false` → 409; `null` (no se pudo consultar) → deja pasar (*fail-open*). | `customer/orders/route.ts:254-268`; `lib/opening/service-day.ts` | ✅ | IGUAL · M1 |
| CUS-CAT-014 | El servidor debe rechazar pedidos si el negocio está pausado. | `accepting_orders_until` futuro o `'infinity'` → 403 «pausado temporalmente». La pausa **no** afecta al botón de WhatsApp. | `customer/orders/route.ts:16-21,210-216` | ✅ | IGUAL · M1 |
| CUS-CAT-015 | Cuando el negocio esté en modo catálogo, la app debe ofrecer «Pedir por WhatsApp» y «Llamar» en lugar de pagar. | Capacidad derivada `catalog_only`; el mensaje incluye ítems, opciones, notas, total y datos del cliente si los hay; abre WhatsApp con el texto ya codificado; `/checkout` redirige al negocio; cierre y pausa **no** bloquean estos botones. | `lib/whatsapp.ts`; `features/cart/components/cart-business-gate.tsx`; `DECISIONS.md §18` | ✅ | IGUAL · M1 |
| CUS-CAT-016 | La app debe resolver las capacidades del negocio (delivery, recojo) con datos frescos. | `accepts_web_delivery`, `accepts_web_pickup`; **caché de 60 s** y nunca se guardan con la bolsa; sin dato, el 409 del servidor es el suelo. | `lib/business-ordering.ts:62-91` | ✅ | IGUAL · M1 |
| CUS-CAT-017 | Donde el negocio acepte delivery y recojo, la app debe mostrar el selector Delivery/Recojo. | Si solo acepta uno, queda fijado. Mientras no llega la respuesta se respeta el método de la bolsa. | `features/catalog/components/delivery-mode-switch.tsx`; `use-checkout-state.ts:174-195` | ✅ | IGUAL · M1 |
| CUS-CAT-018 ★ | Si el cliente ya tiene un pedido activo en un negocio, la app debe impedir crear otro en ese negocio y enlazar al existente. | Regla del servidor «un pedido activo por negocio» (409 `active_order_block:<id>:<shortId>:<estado>`); estados activos = `ACTIVE_ORDER_STATUSES` (incluye `ready_for_pickup`). | `features/catalog/components/active-order-block-banner.tsx`; `customer/orders/route.ts:326-352` | ✅ | IGUAL · M1 |
| CUS-CAT-019 | La app debe mostrar el pedido en curso en el inicio y un contador en la navegación. | Una consulta y una suscripción compartidas; el badge se actualiza por tiempo real. En nativo: notificación / *Live Activity*. | `lib/active-orders.ts`; `features/catalog/components/active-order-banner.tsx` | ✅ | ADAPTAR · M1 |
| CUS-CAT-020 | La app debe mostrar un carrusel de promociones en el inicio. | **Los banners están escritos en el código** (`DEFAULT_BANNERS`, imágenes en `/banners/`), no vienen del backend. Con marketing hay que administrarlos. | `features/catalog/components/home-carousel.tsx:7-30` | 🟡 | ADAPTAR · M1 |
| CUS-CAT-021 | La app debe mostrar el horario semanal y los datos del negocio. | `business_schedule` (`shift1/shift2`); dirección, ETA, WhatsApp público. | `features/catalog/components/schedule-week.tsx`, `business-identity.tsx` | ✅ | IGUAL · M1 |
| CUS-CAT-022 | La app debe abrir un negocio desde un enlace compartido (`/negocio/:slug`). | Los enlaces antiguos con uuid siguen funcionando. | `lib/business-path.ts`; `route.ts:14-27` | ✅ | ADAPTAR · M1 |
| CUS-CAT-023 | El servidor debe entregar el estado de apertura y la disponibilidad de plato **ya calculados**. | `is_open_now`, `next_change_at`, `available_now` + `valid_until`; evita reimplementar `getOpenStatus` y la franja en tres lenguajes (`ARQ-03`). | — | ➕ | NUEVO · M1 |
| CUS-CAT-024 | El muro del piloto y la lista blanca de teléfonos. | `isPhoneAllowed` devuelve siempre `true`; el muro «se autodesmonta». | `apps/api/lib/pilot/gate.ts`; `features/pilot/*` | 🗑️ | MUERTO · — |
| CUS-CAT-025 | Consulta de horario de plataforma (`usePlatformSchedule`). | El hook **no tiene ningún consumidor**. | `hooks/use-platform-schedule.ts` | 🗑️ | MUERTO · — |

**Backend hoy:** `GET /public/businesses`, `GET /public/businesses/:idOrSlug` (caché de borde
`s-maxage=15`), `GET /public/search`, `GET /public/schedule`. Directo: `app_settings`, `delivery_zones`,
`map_landmarks`.

---

## CUS-CRT · Bolsa (carrito)

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-CRT-001 ★ | La bolsa debe pertenecer a **un solo negocio**; al agregar un plato de otro, la app debe pedir confirmación y reemplazarla. | Cambiar de negocio vacía las líneas, la validación y el método de entrega (vuelve a *delivery*). | `lib/cart.ts:154-180`; `features/catalog/components/cart-replace-sheet.tsx` | ✅ | IGUAL · M1 |
| CUS-CRT-002 | Cuando se agrega una línea idéntica, la app debe **fusionarla** sumando cantidad. | Idéntica = mismo plato + mismo conjunto de opciones (orden irrelevante) + misma nota (recortada). | `lib/cart.ts:108-116,168-178` | ✅ | IGUAL · M1 |
| CUS-CRT-003 | La app debe permitir cambiar la cantidad (mín. 1) o quitar una línea; si queda vacía, se reinicia. | Al vaciarse se limpia negocio, validación y método. | `cart.ts:193-207` | ✅ | IGUAL · M1 |
| CUS-CRT-004 | La app debe **guardar la bolsa en el dispositivo** entre sesiones. | Persiste negocio, líneas y método; **no** persiste la validación; al rehidratar se sanea el método contra el enum. | `cart.ts:236-270` | ✅ | ADAPTAR · M1 |
| CUS-CRT-005 ★ | Cuando se abre la carta o el checkout, la app debe **validar la bolsa contra el catálogo vigente**. | Detecta plato **eliminado**, **agotado**, **fuera de franja**, **precio base** o de **opción** cambiado; muestra aviso; permite quitar las líneas inválidas; con líneas inválidas el checkout se bloquea («Revisa tu bolsa»). | `lib/cart-validation.ts`; `use-checkout-validation.ts:75-82` | ✅ | IGUAL · M1 |
| CUS-CRT-006 | La app debe calcular el subtotal con redondeo a dos decimales. | — | `cart.ts:210-211` | ✅ | IGUAL · M1 |
| CUS-CRT-007 | La app debe recordar el método de entrega **por bolsa**, no por perfil. | Por defecto *delivery* (pide más, así que equivocarse hacia ahí es lo barato). | `cart.ts:11-19,65` | ✅ | IGUAL · M1 |
| CUS-CRT-008 ★ | Antes del checkout, la app debe comprobar en orden: sesión → celular verificado → dirección válida → sin caso de pago pendiente. | La dirección **solo se exige en delivery**: línea ≥ 5, referencia ≥ 5 y pin **dentro del polígono**. El celular se exige también en recojo (strikes por teléfono). Propuesta: que lo calcule el servidor (`GET /me/readiness`). | `lib/order-gates.ts`; `hooks/use-order-readiness.ts` | ✅ | IGUAL · M1 |
| CUS-CRT-009 | Cuando «Ir a pagar» esté deshabilitado, la app debe decir siempre por qué. | «Cargando…» o «El restaurante está cerrado ahora». Nació del incidente del 2026-09-09. | `features/cart/components/cart-ctas.tsx:75-121` | ✅ | IGUAL · M1 |
| CUS-CRT-010 | La app debe mostrar un aviso cuando la bolsa es de recojo. | — | `features/cart/components/cart-pickup-notice.tsx` | ✅ | IGUAL · M1 |
| CUS-CRT-011 | La app debe respetar los topes de la bolsa. | ≤ 50 líneas, cantidad 1-50, ≤ 20 opciones por línea. | `contracts/requests.ts:14-22,113` | ✅ | IGUAL · M1 |
| CUS-CRT-012 | La acción «Volver a pedir» debe reponer la bolsa con los platos de un pedido anterior. | **Hoy solo abre el negocio**; `cart.replace` no se usa en producción. Debe revalidar disponibilidad y precios actuales. | `app/pedidos/page.tsx:203`; `lib/cart.ts:182-191` | ⚠️ | NUEVO · M2 |

---

## CUS-ADR · Direcciones y ubicación

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-ADR-001 | La app debe permitir guardar varias direcciones con etiqueta, línea, referencia, pin y precisión. | Etiqueta **Casa/Trabajo/Otro**; línea **5-200**; referencia **5-140** (⚠ `DECISIONS.md §13` dice 15: el código dice 5); se guarda `location_accuracy_m` y `location_confirmed_at`. | `lib/address-validation.ts`; `contracts/primitives.ts:68-71` | ✅ | IGUAL · M1 |
| CUS-ADR-002 | La app debe rechazar textos basura en línea y referencia. | Solo dígitos, **≥ 4 caracteres repetidos** o **patrón repetido** (`asdfasdf`, `lala lala`) → error específico. Mismo criterio en servidor. | `address-validation.ts:25-64`; `contracts/primitives.ts:79-88` | ✅ | IGUAL · M1 |
| CUS-ADR-003 ★ | La app no debe permitir guardar una dirección sin pin, o con pin **fuera del polígono de reparto**. | Orden de faltas: ubicación → zona → dirección → referencia. Polígono ⚙ `coverage_polygon` (ray-casting, lng=x, lat=y). Un caserío fuera del polígono no puede guardar dirección (solo recojo). | `address-validation.ts:82-92`; `lib/coverage.ts:148-160` | ✅ | IGUAL · M1 |
| CUS-ADR-004 | El centro del pueblo nunca debe usarse como ubicación por defecto. | Sin lectura del sensor ni gesto del usuario, la ubicación queda **vacía**. Cerró un defecto que guardaba la plaza como «casa». | `components/map-picker.tsx:99-107` | ✅ | IGUAL · M1 |
| CUS-ADR-005 | Cuando el cliente toca «Usar mi ubicación», la app debe leer el GPS **una vez y con alta precisión**. | Sin caché (`maximumAge: 0`); espera ⚙ 15 s; errores `denied/timeout/unavailable/position_unavailable` con mensaje en español; con permiso denegado **no se reintenta** (no hay diálogo). El GPS es un atajo, nunca un requisito: siempre se puede mover el pin. | `lib/geolocation.ts` | ✅ | ADAPTAR · M1 |
| CUS-ADR-006 | La app debe avisar cuando la precisión de la lectura no sirve para encontrar una puerta. | Umbral **30 m** (el motorizado usa 20: el cliente está bajo techo). | `map-picker.tsx:31-39` | ✅ | ADAPTAR · M1 |
| CUS-ADR-007 | La app debe permitir precisión **aproximada** y pedir la precisa cuando haga falta. | iOS 14+ y Android 12+ permiten conceder solo ubicación aproximada; hay que detectarlo y solicitar precisión temporal. | — | ➕ | NUEVO · M1 |
| CUS-ADR-008 | La app debe mostrar un mapa con vista previa inerte y pantalla completa para ajustar el pin. | Modos calle y satélite; el mapa no puede alejarse más del polígono + 25 %; puntos de interés (`map_landmarks`, 43). Hoy: Leaflet con teselas CARTO/Esri. En nativo: MapKit / Google Maps. | `map-picker.tsx`; `location-sheet.tsx`; `lib/landmarks.ts` | ✅ | ADAPTAR · M1 |
| CUS-ADR-009 | La app debe mantener **una sola dirección predeterminada**. | Al borrar la predeterminada se promueve la primera restante; una dirección única lo es. | `lib/address-record.ts`; `use-account-page.ts:260-292`; `DECISIONS.md §15` | ✅ | IGUAL · M1 |
| CUS-ADR-010 | La app debe permitir añadir, editar, eliminar y predeterminar direcciones. | Editar no debe perder la medida del sensor. | `features/account/components/addresses-list.tsx`; `components/address-sheet.tsx` | ✅ | IGUAL · M1 |
| CUS-ADR-011 ★ | La app debe enviar con el pedido la **calidad del punto de entrega**. | `deliveryPointAccuracyM` (int > 0) y `deliveryPointConfirmedAt` (ISO con zona). Sin `confirmedAt` = nadie eligió el punto (guiarse por la referencia); con `confirmedAt` sin precisión = puesto a mano. Una precisión absurda **nunca** bloquea el pedido. | `contracts/requests.ts:69-89`; `lib/address-record.ts` | ✅ | IGUAL · M1 |
| CUS-ADR-012 ★ | La app debe mostrar la tarifa de envío según el punto **antes** de confirmar. | Bandas `near`/`far` ⚙ (`delivery_bands`, 2,00/2,50); `far` si el punto cae en una zona lejana activa (`delivery_zones`). **Solo para mostrar**: decide `delivery_band_for_point` en la RPC. Ante fallo, cobra `near`. | `lib/delivery-fee.ts` | ✅ | ADAPTAR · M1 |
| CUS-ADR-013 | El servidor debe devolver la tarifa de envío para un punto. | Evita duplicar el ray-casting en cliente y SQL. | — | ➕ | NUEVO · M1 |
| CUS-ADR-014 | En un recojo la app no debe pedir ni enviar dirección. | Sin dirección, referencia, notas, billete ni coordenadas de entrega. | `use-checkout-actions.ts:255-320`; `order-gates.ts:55-56` | ✅ | IGUAL · M1 |
| CUS-ADR-015 | Cuando el cliente pide con una dirección nueva, la app debe guardarla como «Casa» (si no tiene otra) sin bloquear el pedido. | *Best-effort*; no le quita la predeterminada. | `use-checkout-actions.ts:237-253`; `persistence.ts:198-236` | ✅ | IGUAL · M1 |

---

## CUS-CHK · Checkout y creación del pedido

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-CHK-001 | La app debe mostrar el resumen: ítems (con opciones y nota), subtotal, envío y total. | Total = subtotal + envío. Envío tachado si aplica una promo. | `features/checkout/components/order-detail.tsx`; `use-checkout-state.ts` | ✅ | IGUAL · M1 |
| CUS-CHK-002 ★ | La app debe exigir nombre y celular válidos. | Nombre 1-120; celular `^9\d{8}$` tras normalizar. | `use-checkout-validation.ts:83-144`; `contracts/requests.ts:50-51` | ✅ | IGUAL · M1 |
| CUS-CHK-003 | La app debe ofrecer el método de entrega que admite el negocio. | Ver `CUS-CAT-016/017`. | `use-checkout-state.ts:174-195` | ✅ | IGUAL · M1 |
| CUS-CHK-004 ★ | Cuando el método sea recojo, la app debe preguntar «¿Vas al local ahora?» sin preseleccionar respuesta. | **Ahora**: cliente en el mostrador; la cajera lo verifica al aceptar; no pasa por `validando`; el GPS **no bloquea**. **Más tarde**: solo prepago. Es una **pregunta**, no una inferencia (un QR se comparte). | `contracts/requests.ts:90-127`; `use-checkout-validation.ts:92-98` | ✅ | IGUAL · M1 |
| CUS-CHK-005 | La app debe permitir elegir una dirección guardada o marcar una nueva, con referencia y nota al motorizado. | Referencia ≥ 5; **nota ≤ 200** caracteres, opcional, solo delivery, no bloquea. | `features/checkout/components/delivery-card.tsx`; `types.ts:41` | ✅ | IGUAL · M1 |
| CUS-CHK-006 ★ | La app debe ofrecer solo las formas de pago que la matriz permite. | **Delivery:** efectivo, Yape/Plin al recibir, prepago. **Recojo «ahora»:** caja (efectivo o Yape/Plin), prepago. **Recojo «más tarde»:** solo prepago. «Yape al recibir» **no existe** en recojo (se oculta, no se apaga). En «más tarde» la caja se **apaga** con su motivo. El servidor la repite (CHECK `orders_pickup_payment_chk`). | `contracts/payment-rules.ts`; `features/checkout/types.ts:285-293` | ✅ | IGUAL · M1 |
| CUS-CHK-007 ★ | La app debe forzar prepago y explicar el motivo cuando corresponda. | Total con envío **> ⚙ `prepay_threshold` (80)**; o riesgo (**2 strikes**, `contraentrega_blocked`, `risk_blocked`); o recojo «más tarde»; o cliente sin historial sin GPS en cobertura. Un cliente sin `compra_previa` con GPS dentro de cobertura pasa a **`validando`** (llamada de la cajera). El servidor decide con `customer_contraentrega_decision`: `trusted / no_history / risk_blocked`. | `customer/orders/route.ts:60-176`; `SYS-transversal.md` | ✅ | IGUAL · M1 |
| CUS-CHK-008 ★ | Cuando el pago sea efectivo en delivery, la app debe pedir con cuánto paga y validar el vuelto. | Opciones **Exacto / S/ 20 / S/ 50 / S/ 100 / otro**; monto libre redondeado a múltiplos de **S/ 0,50**; debe **cubrir el total**; máx. billete ⚙ `max_cash_bill` (100); vuelto ≤ ⚙ vuelto de la caja **esa noche** (`effective_max_change`; 50 por defecto; 0 → «Esta noche el negocio no tiene vuelto»). El tope se **vuelve a consultar al confirmar**. En recojo no se pregunta ni se envía. | `features/checkout/lib/cash.ts`; `use-checkout-actions.ts:198-212` | ✅ | IGUAL · M1 |
| CUS-CHK-009 ★ | La app debe capturar un GPS en vivo al pedir y aplicar las reglas antifraude. | La lectura **arranca al abrir el checkout**; método `gps_high_accuracy` (precisión ≤ ⚙ 500 m) o `gps_low_accuracy`; distancia al centro; si el cliente **tiene historial**, el pago **no es prepago** y (precisión mala **o** distancia > ⚙ `warningRadiusKm` 30) → hoja de bloqueo (*reintentar / pagar por adelantado*). Sin GPS: prepago pasa con `manual_skip_prepaid`; efectivo → bloqueo `unavailable`. **Recojo «ahora» nunca bloquea** (`failed` como evidencia). | `use-checkout-actions.ts:91-175`; `use-checkout-state.ts:267-311` | ✅ | ADAPTAR · M1 |
| CUS-CHK-010 ★ | La app debe crear el pedido con una clave de idempotencia por intento. | `POST /customer/orders` con `Idempotency-Key` (UUID). Tras un **4xx** se regenera (el servidor no creó nada); tras **fallo de red/5xx/plazo** se **conserva** (resultado desconocido); plazo 15 s. Ver `DAT-01` (el cliente hoy regenera también ante el 409 «en proceso»). | `use-checkout-actions.ts:77-89,322-386`; `packages/api-client/src/index.ts:58` | ⚠️ | IGUAL · M1 |
| CUS-CHK-011 | Cuando se crea el pedido, la app debe vaciar la bolsa, sonar y abrir el seguimiento **reemplazando** la pantalla. | El seguimiento trae el botón de cancelar; no hay pantalla intermedia. | `use-checkout-actions.ts:25-46,330-334` | ✅ | ADAPTAR · M1 |
| CUS-CHK-012 | Cuando el servidor responda que la cuenta está bloqueada, la app debe mostrar la vista de bloqueo con soporte. | Hoy se detecta con `/bloquead/i` sobre el texto del error (frágil: `DAT-02`). El bloqueo total dura ⚙ 30 días (`blocked_until`). | `use-checkout-actions.ts:357,374`; `features/checkout/components/blocked-view.tsx` | ⚠️ | IGUAL · M1 |
| CUS-CHK-013 | Cuando falte algo, el botón principal debe decir qué hacer y llevar al campo. | Orden: bolsa → nombre → pregunta de recojo → dirección (línea, referencia, pin, zona) → celular → efectivo. | `use-checkout-validation.ts:74-173` | ✅ | IGUAL · M1 |
| CUS-CHK-014 | Mientras se verifica la bolsa contra el catálogo, la app debe impedir confirmar con un mensaje. | «Estamos verificando tu bolsa con el menú actual.» | `use-checkout-validation.ts:175-191` | ✅ | IGUAL · M1 |
| CUS-CHK-015 | Antes de pedir, la app debe explicar los plazos y la política del prepago y del recojo «más tarde». | Aceptación ⚙ 8 min, pago ⚙ 15 min; recojo «más tarde»: se guarda hasta el cierre y **no se devuelve** (Tindivo no retiene fondos). | `features/checkout/components/prepay-explainer.tsx`; `types.ts:22`; `DECISIONS.md §8` | ✅ | IGUAL · M1 |
| CUS-CHK-016 | La app debe mostrar el envío gratis de un plato cuando la bolsa lo incluya. | `cart_item_free_delivery` (0227-0230); solo pinta, decide el servidor; el estado falla a «sin promo». | `use-checkout-state.ts:313-345` | ✅ | IGUAL · M1 |
| CUS-CHK-017 | La app debe mostrar la promo de envío gratis de lanzamiento cuando esté vigente. | `current_customer_promo_free_delivery` → `active/exhausted/already_redeemed/outside_window/inactive`; **vencida el 2026-09-05** aunque `active: true`. Reutilizable como cupón. | `features/checkout/types.ts:74-114`; `app_settings.promo_free_delivery` | 🗑️ | DIFERIR · M2 |
| CUS-CHK-018 ★ | En un recojo, la app no debe enviar billete, dirección, referencia, notas ni coordenadas, y **sí** `pickupTiming`. | `pickupTiming` obligatorio en recojo y prohibido en delivery (422 legible). | `use-checkout-actions.ts:255-320`; `contracts/requests.ts:115-127` | ✅ | IGUAL · M1 |
| CUS-CHK-019 | Cuando el cliente tenga un caso de pago sin resolver, la app debe impedir el checkout y llevar al caso. | Ver `CUS-PAY-008`. | `components/gates/payment-resolution-gate-modal.tsx` | ✅ | IGUAL · M1 |
| CUS-CHK-020 | La app debe mostrar los errores del servidor con un mensaje comprensible. | Hoy se muestra `problem.detail` tal cual (frases en español); con `DAT-02` se decidirá por `code` y se formateará con cadenas propias. | `use-checkout-actions.ts:361-384` | ⚠️ | ADAPTAR · M1 |

**Backend hoy:** `POST /customer/orders` (393 líneas; ver `PER-03`); directo: `customer_profiles`,
`customer_addresses`, `app_settings`, RPC `current_customer_trusted_for_contraentrega`,
`current_customer_promo_free_delivery`, `cart_item_free_delivery`, `effective_max_change`.
**Superficie móvil propuesta:** `GET /me/checkout-context?businessId=` (perfil, direcciones, decisión
de contraentrega, promos, vuelto de la noche, plazos, tarifas) y `POST /orders` (idempotente).

---

## CUS-PAY · Prepago, comprobante y apelaciones

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-PAY-001 ★ | La app debe mostrar de quién es el turno del dinero en el prepago. | **Tres esperas**: `pending_acceptance` (**negocio** confirma disponibilidad, ⚙ 8 min) → `awaiting_payment` (**cliente** paga y sube captura, ⚙ 15 min) → `validando` (**cajera** revisa, ⚙ 10 min). Etapas 1/2/3/hecho. Un mismo `prepay_timeout` cierra dos de ellas. | `features/tracking/lib/prepay-stage.ts`; `deadline.ts` | ✅ | IGUAL · M1 |
| CUS-PAY-002 | Cuando el negocio acepta, la app debe mostrar cómo pagar: cuenta de cobro, QR, total y plazo. | `GET /customer/orders/:id/prepay-info` → nombre, número Yape/Plin, QR (`paymentQr`, hay un QR de reserva 0184), total, `hasProof`, `proofAttempt`. | `api/.../prepay-info/route.ts`; `components/prepay-proof-section.tsx:13-24` | ✅ | ADAPTAR · M1 |
| CUS-PAY-003 | Cuando el cliente elige una captura, la app debe validarla, comprimirla y mostrar vista previa. | Perfil `proof`: lado mayor **1600 px**, calidad **0,92**; si la compresión falla, sube el original (nunca impedir pagar); validación de tipo y tamaño de entrada. | `packages/images/src/profiles.ts:52`; `prepay-proof-section.tsx:134-159` | ✅ | ADAPTAR · M1 |
| CUS-PAY-004 | La app debe subir el comprobante a almacenamiento privado y registrar su ruta. | Ruta `payment-proofs/<user>/<pedido>/attempt-<n>-<ts>.<ext>` (**única por intento**); luego `POST /customer/orders/:id/prepay-proof {path}`; la ruta debe empezar por `<user_id>/`. | `prepay-proof-section.tsx:161-190`; `.../prepay-proof/route.ts:24-30` | ✅ | ADAPTAR · M1 |
| CUS-PAY-005 ★ | La app debe permitir **como máximo 2 intentos** de comprobante. | Primer rechazo (`validate_fail_retry`): vuelve a `awaiting_payment` con «Te queda 1 intento»; segundo rechazo: cancelación `proof_rejected_final`. | `prepay-proof/route.ts:41-43`; `send-push/index.ts:631-644` | ✅ | IGUAL · M1 |
| CUS-PAY-006 | La app debe mostrar al cliente el comprobante que envió. | URL firmada de **10 min** desde Storage (bucket privado, RLS por carpeta). | `prepay-proof-section.tsx:110-132` | ✅ | ADAPTAR · M1 |
| CUS-PAY-007 | Cuando el cliente vuelve de su billetera, la app debe resaltar el botón de subir la captura. | Solo cuenta el viaje completo (oculta→visible); la pista dura 6 s. | `prepay-proof-section.tsx:71-108` | ✅ | ADAPTAR · M1 |
| CUS-PAY-008 ★ | La app debe impedir pedidos nuevos mientras exista un caso de pago sin resolver. | Un pedido cancelado por `proof_rejected_final` bloquea si: dentro de **24 h** sin apelar; apelación `pending`/`in_review`; aprobada con devolución `pending`. Libre si: apelación rechazada; aprobada con devolución `completed`; pasadas 24 h sin apelar. | `lib/payment-block.ts` | ✅ | IGUAL · M1 |
| CUS-PAY-009 | Cuando el pedido se cancela por comprobante rechazado, la app debe ofrecer **solicitar revisión de pago**. | `POST /customer/orders/:id/appeal` (RPC `create_appeal_report`); respuesta por WhatsApp en ≤ **24 h**; pasos del caso (pendiente → en revisión → aprobada/rechazada; devolución pendiente/completada); si se rechaza, **strike**. | `features/tracking/components/appeal-section/*`; `create_appeal_report`, `resolve_appeal` | ✅ | IGUAL · M1 |
| CUS-PAY-010 | La app debe mostrar el resumen de reclamos y el comprobante de devolución. | Contadores desde `reports` (RLS `rep_participant_read`); el comprobante de devolución usa URL firmada **por la API** (exige `service_role`). | `use-account-page.ts:139-166`; `.../customer/appeals/route.ts` | ✅ | IGUAL · M1 |

---

## CUS-TRK · Seguimiento del pedido

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-TRK-001 | La app debe mostrar el seguimiento de un pedido por su código, con o sin sesión. | Sin sesión: vista pública (`GET /public/orders/:shortId`, `get_tracking`; deja de servirse 24 h tras entregar). Con sesión y dueño: además cancelar, pagar y la nota. La propiedad se comprueba por RLS. | `app/pedido/[shortId]/page.tsx`; `use-tracking.ts:39-77` | ✅ | ADAPTAR · M1 |
| CUS-TRK-002 ★ | La app debe proyectar el estado del pedido en **cuatro pasos** y mostrar el cancelado aparte. | `validando/pending_acceptance/awaiting_payment/confirmed` → **Recibido**; `preparing/waiting_driver/heading_to_restaurant/waiting_at_restaurant` → **Preparando**; `picked_up/ready_for_pickup` → **En camino**; `delivered` → **Entregado**. En **recojo** el tercero dice «Listo para recoger · Pásalo a recoger en el local». | `contracts/order-status.ts:63-85`; `tracking/lib/format.ts:18-56` | ✅ | IGUAL · M1 |
| CUS-TRK-003 | La app debe mostrar un subtítulo y un mensaje de pie según estado y forma de pago. | Textos por estado (prepago: «Esperando confirmación de disponibilidad» / «Restaurante confirmó. Paga ahora» / «Verificando tu comprobante» / «Pago verificado»); recojo: «y pagas ahí» solo si `paymentVerifiedAt` es nulo y no es prepago. | `format.ts:263-359` | ✅ | IGUAL · M1 |
| CUS-TRK-004 ★ | La app debe mostrar el tiempo estimado como **rango**, nunca como hora exacta. | ETA = `estimated_ready_at` + trayecto ⚙ (`travelMinutes` 20-25); **recojo: sin trayecto**; no se muestra con el motorizado en la puerta ni en estados terminales; `ready_for_pickup` → «Ya está listo»; mínimo ≤ 0 → «En cualquier momento»; rango igual → «12 min». Sin base de cálculo, **no se muestra nada** (no se inventa). | `format.ts:195-256` | ✅ | IGUAL · M1 |
| CUS-TRK-005 ★ | Mientras corra un plazo, la app debe mostrar una cuenta atrás con su sujeto. | Tres relojes: aceptación (desde `pendingAcceptanceAt`, ⚙ 8), pago (desde `awaitingPaymentAt`, ⚙ 15), verificación (desde `validatingAt`, ⚙ 10, **solo con comprobante**). Rojo en el **último tercio, tope 3 min**; vencido → «Confirmando…/Procesando…/Revisando…» (hasta 60 s de desfase del cron). No se muestra en `validando` de contraentrega. | `tracking/lib/deadline.ts` | ✅ | IGUAL · M1 |
| CUS-TRK-006 ★ | La app debe permitir cancelar solo mientras el servidor lo permita. | Efectivo/Yape al recibir: en `validando` y `pending_acceptance`; **prepago: solo en `pending_acceptance`**; tiene que coincidir con `cancel_customer_order`; requiere ser el dueño; con confirmación. Tras aceptar → «va a soporte». Éxito: `cancel_reason = customer_cancelled`. | `format.ts:377-381`; `.../cancel/route.ts`; `cancel_customer_order` | ✅ | IGUAL · M1 |
| CUS-TRK-007 | La app debe mostrar el nombre del motorizado, y su teléfono solo cuando llegó. | `driverPhone` viaja **solo** con `arrivedAtCustomerAt`; botón para escribirle por WhatsApp; aviso «¡El motorizado llegó a tu domicilio!». | `features/tracking/components/tracking-driver.tsx`; `get_tracking` | ✅ | ADAPTAR · M1 |
| CUS-TRK-008 | La app debe mostrar el detalle: ítems con opciones, totales, forma de pago y, en efectivo, con cuánto paga y el vuelto. | `paysWith`, `changeToGive`. | `tracking-items.tsx`; `types.ts` | ✅ | IGUAL · M1 |
| CUS-TRK-009 | La app debe mostrar al dueño la nota que escribió para el motorizado. | Sale de una lectura bajo RLS, **no** de la vista pública (habla de la casa de alguien). | `use-tracking.ts:14-25` | ✅ | IGUAL · M1 |
| CUS-TRK-010 | Cuando el estado cambie, la app debe avisar con un mensaje, tono y sonido. | Señales: `waiting`, `awaiting_payment` («Ya puedes pagar»), `confirmed`, `preparing`, `ontheway`, `ready_for_pickup`, `arrived`, `delivered`, `cancelled`. No avisa `validando` con comprobante (lo provoca el propio cliente). El aviso depende **solo del destino**, no del origen. | `tracking/lib/alerts.ts` | ✅ | ADAPTAR · M1 |
| CUS-TRK-011 | La app debe permitir silenciar o activar el sonido de los avisos. | — | `tracking-sound-toggle.tsx`; `lib/sound.ts` | ✅ | ADAPTAR · M1 |
| CUS-TRK-012 | Mientras el pedido siga vivo, la app debe evitar que la pantalla se apague. | `Wake Lock` web. En nativo: mantener pantalla o **Live Activity**. | `hooks/use-wake-lock.ts` | ✅ | ADAPTAR · M1 |
| CUS-TRK-013 | Cuando el pedido está vivo y el cliente es el dueño, la app debe ofrecer activar las notificaciones **una vez por pedido**. | Retardo 1,5 s; tope de **2 descartes**; con permiso ya bloqueado no se ofrece. En nativo: pedirlo en el momento de valor, con explicación previa. | `hooks/use-push-offer.ts`; `lib/push.ts:33-143` | ✅ | ADAPTAR · M1 |
| CUS-TRK-014 | La app debe refrescar el estado al volver a primer plano y como respaldo cada 8 s (solo visible). | Además del tiempo real. En nativo: push + refresco al activarse. | `use-tracking.ts:48-125` | ✅ | ADAPTAR · M1 |
| CUS-TRK-015 | Cuando el pedido esté cancelado, la app debe explicar el motivo con el texto adecuado. | Según `cancel_reason` (customer, prepay_timeout, validation/pending_acceptance_timeout, business, admin, proof_rejected_final, no_show), **si ya pagó** (`proofUrl` o `paymentVerifiedAt`) y según **método** (`no_show` de recojo ≠ de delivery). Siempre deja abierta la puerta a WhatsApp. | `tracking/lib/format.ts:80-177` | ✅ | IGUAL · M1 |
| CUS-TRK-016 | La app debe permitir instalar la PWA desde el seguimiento (pasos para iPhone). | Solo tiene sentido en web. | `features/tracking/components/tracking-install.tsx`; `hooks/use-pwa-install.ts` | ✅ | SOLO-WEB · W |
| CUS-TRK-017 | La app debe mostrar una *Live Activity* / notificación viva con el estado del pedido. | Ver `NAT-LIV-*`. | — | ➕ | NUEVO · M2 |

**Backend hoy:** `GET /public/orders/:shortId` (`get_tracking`, sondeo cada 8 s), Realtime
`postgres_changes` sobre `orders`, `POST /customer/orders/:id/cancel`, lectura directa de `orders`.
**Superficie móvil propuesta:** `GET /me/orders/:id` (modelo de lectura del cliente con `steps[]`,
`eta`, `deadline`, `actions[]` calculados por el servidor), canal *Broadcast* privado por pedido y push.

---

## CUS-ORD · Historial y pedidos activos

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-ORD-001 | La app debe listar el historial del cliente con negocio, resumen de ítems, código, fecha relativa, total y estado. | **Últimos 40**, sin paginación; total = importe + envío; fecha relativa («hace 5 min», «ayer», fecha corta). Sin sesión lleva a entrar. | `app/pedidos/page.tsx:76-231` | ✅ | ADAPTAR · M1 |
| CUS-ORD-002 | La app debe mostrar el estado con una etiqueta corta. | ⚠️ `STATUS_LABEL` **no cubre `awaiting_payment` ni `ready_for_pickup`**: el cliente vería el texto interno. Debe salir de la misma proyección que el seguimiento. | `pedidos/page.tsx:39-50` | ⚠️ | IGUAL · M1 |
| CUS-ORD-003 | La app debe ofrecer, según el pedido, «Ver seguimiento», «Ver caso de pago», calificar y «Volver a pedir». | «Ver seguimiento» si está activo; «Ver caso de pago» si `proof_rejected_final`. | `pedidos/page.tsx:186-209` | ✅ | IGUAL · M1 |
| CUS-ORD-004 | La app debe ofrecer ayuda por WhatsApp en un pedido cancelado. | Mensaje con el código. ⚠️ Usa `#TDV-`; la referencia oficial es `#TND-` (`DECISIONS §6`): unificar. | `pedidos/page.tsx:211-221`; `appeal-create-view.tsx:26-28` | ⚠️ | ADAPTAR · M1 |
| CUS-ORD-005 | La app debe mantener el contador de pedidos activos con una sola consulta compartida. | `ACTIVE_ORDER_STATUSES`; se descarta la respuesta vieja si llega una nueva (testigo `ultimaPeticion`). | `lib/active-orders.ts` | ✅ | ADAPTAR · M1 |
| CUS-ORD-006 | El servidor debe paginar el historial y devolver el estado ya proyectado. | Hoy: 40 fijos por PostgREST. | — | ➕ | NUEVO · M1 |

---

## CUS-REV · Reseñas

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-REV-001 | La app debe preguntar por la reseña de un pedido `delivered` **en el siguiente contacto**, no al entregar. | `get_pending_review` (RPC) devuelve el pendiente o `null`; ventana ⚙ `reviews.windowDays` (21). Se consulta al abrir inicio con sesión, al salir del seguimiento y en el historial; nunca junto al banner de un pedido activo. | `features/reviews/lib/pending.ts`; `hooks/use-pending-review.ts`; `DECISIONS.md §28` | ✅ | IGUAL · M1 |
| CUS-REV-002 | La app debe permitir puntuar de 1 a 5 con etiquetas y un comentario opcional. | Etiquetas ⚙ (`todo_bien`, `buen_trato`, `demoro`, `llego_fria`, `falto_algo`); comentario ≤ ⚙ 400; `create_order_review`. **El negocio ve nota y etiquetas, no el texto** (GRANT por columna). Nada es público. | `features/reviews/components/review-sheet.tsx`; `pending.ts:44-53` | ✅ | IGUAL · M1 |
| CUS-REV-003 | La app debe permitir descartar la pregunta sin cerrar la ventana. | «Ahora no» inserta en `order_review_dismissals`; se cierra la tarjeta **antes** de esperar a la base. | `pending.ts:61-66`; `use-pending-review.ts:98-111` | ✅ | IGUAL · M1 |

---

## CUS-ACC · Mi cuenta

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-ACC-001 | La app debe mostrar el perfil, el estado de verificación del celular y el progreso. | Permite verificar el celular desde aquí. | `app/cuenta/page.tsx` | ✅ | IGUAL · M1 |
| CUS-ACC-002 | La app debe mostrar las direcciones guardadas con acciones de añadir, editar y predeterminar. | Ver `CUS-ADR-*`. | `features/account/components/addresses-list.tsx` | ✅ | IGUAL · M1 |
| CUS-ACC-003 | La app debe mostrar los tres pedidos más recientes y accesos rápidos (pedidos activos, reclamos). | Contadores: reclamos totales, pendientes, completados. | `recent-orders-preview.tsx`; `quick-actions-grid.tsx` | ✅ | IGUAL · M1 |
| CUS-ACC-004 | La app debe mostrar el menú de cuenta con cerrar sesión. | Ver `CUS-AUT-013`. | `account-menu.tsx` | ✅ | IGUAL · M1 |

---

## CUS-SUP · Soporte y legal

| ID | Requisito | Reglas y validaciones clave | Fuente | Est. | Móvil |
|---|---|---|---|---|---|
| CUS-SUP-001 | La app debe ofrecer soporte por WhatsApp con un mensaje preescrito. | Número ⚙ `support_whatsapp` (con *fallback* `TINDIVO_SUPPORT_WHATSAPP`); incluye el código del pedido. | `lib/support.ts`; `packages/core` | ✅ | ADAPTAR · M1 |
| CUS-SUP-002 | La app debe dar acceso a Términos y Privacidad. | Versión ⚙ `terms_version` (2026-05). La política **no menciona** la ubicación GPS, los datos de dispositivo ni las notificaciones (debe actualizarse antes de las tiendas, `MOB-10`). | `app/terminos/page.tsx`; `app/privacidad/page.tsx` | 🟡 | ADAPTAR · M1 |
| CUS-SUP-003 | La app debe permitir ejercer los derechos ARCO desde la propia app. | Hoy: «escríbenos por WhatsApp». | `privacidad/page.tsx:30-32` | 🟡 | NUEVO · M1 |

---

## CUS-WEB · Lo que solo existe por ser web

| ID | Requisito | Fuente | Est. | Móvil |
|---|---|---|---|---|
| CUS-WEB-001 | Manifiesto de PWA (nombre, iconos, colores, `display: standalone`). | `app/manifest.ts` | ✅ | SOLO-WEB · W |
| CUS-WEB-002 | *Service worker* (`sw.js`) y suscripción **Web Push** con reconciliación cada 60 s. | `public/sw.js`; `lib/push.ts`; `components/push-manager.tsx` | ✅ | SOLO-WEB · W |
| CUS-WEB-003 | Detección e instalación de la PWA (`beforeinstallprompt`, pasos de iOS). | `hooks/use-pwa-install.ts`; `lib/pwa-install.ts` | ✅ | SOLO-WEB · W |
| CUS-WEB-004 | SEO: `robots`, `sitemap` (1 h), `opengraph-image`, JSON-LD `Organization`/`Restaurant`, metadatos. | `app/robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, `app/page.tsx:34-49` | ✅ | SOLO-WEB · W |
| CUS-WEB-005 | Retorno de OAuth (`/auth/callback`) y cliente/servidor Supabase con cookies (`@supabase/ssr`). | `app/auth/callback/route.ts`; `lib/supabase/*` | ✅ | SOLO-WEB · W |
| CUS-WEB-006 | Sonido y `AudioContext` desde gestos del usuario (política de autoplay del navegador). | `lib/sound.ts`; `features/tracking/lib/chime.ts` | ✅ | SOLO-WEB · W |
| CUS-WEB-007 | Mantener la web como **respaldo** de enlaces `/pedido/:shortId` y `/negocio/:slug`, página de tienda y borrado de cuenta. | Ver `MOB-15`. | 🟡 | SOLO-WEB · W |

---

## Criterios de aceptación de los requisitos ★

```
CA-CHK-01 · Recojo «más tarde» solo admite prepago                       (CUS-CHK-004, 006)
  Dado un negocio con accepts_web_pickup = true
  Y una bolsa en modo recojo
  Y el cliente respondió «No, paso más tarde»
  Cuando abre las formas de pago
  Entonces «Yape o Plin (antes de recibir)» está habilitada
  Y «Pagas en el local» aparece apagada con su motivo
  Y «Yape o Plin al recibir» no aparece
  Y crear el pedido con paymentIntent = pending_cash devuelve 422

CA-CHK-02 · Recojo «ahora» sin respuesta no permite continuar            (CUS-CHK-004)
  Dado una bolsa en modo recojo sin respuesta a «¿Vas al local ahora?»
  Cuando el cliente toca el botón principal
  Entonces el botón dice «Responde si vas ahora»
  Y el foco va a la pregunta
  Y no se envía ninguna petición

CA-CHK-03 · Efectivo: el billete debe cubrir el total y respetar el vuelto de la noche   (CUS-CHK-008)
  Dado un total de S/ 27,00, billete máximo ⚙ 100 y vuelto de la caja ⚙ 50
  Cuando el cliente paga con S/ 20     Entonces error «El monto debe cubrir el total (S/ 27.00).»
  Cuando el cliente paga con S/ 100    Entonces error «…el vuelto sería S/ 73.00, y esta noche hay hasta S/ 50.00. Paga con S/ 77.00 o menos…»
  Cuando el cliente paga con S/ 50     Entonces se acepta (vuelto S/ 23,00)
  Y al confirmar se vuelve a consultar el vuelto de la noche antes de enviar

CA-CHK-04 · Prepago obligatorio por umbral                               (CUS-CHK-007)
  Dado ⚙ prepay_threshold = 80 y un pedido a domicilio con total (comida + envío) S/ 82,00
  Cuando el cliente elige efectivo o «Yape al recibir»
  Entonces el servidor responde 403 «El total con envío (S/ 82.00) pasa de S/ 80, así que el pago debe ser adelantado.»
  Y la app ya no ofrecía esas opciones habilitadas (las apagó con su motivo)

CA-CHK-05 · Reintento seguro de la creación                              (CUS-CHK-010)
  Dado un envío que agotó el plazo de 15 s sin respuesta
  Cuando el cliente reintenta
  Entonces se reutiliza la misma Idempotency-Key
  Y si el servidor ya lo creó devuelve el mismo 201 con la cabecera idempotency-replayed = true
  Y si el servidor responde 4xx, la siguiente acción usa una clave nueva

CA-CHK-06 · GPS antifraude                                                (CUS-CHK-009)
  Dado un cliente con historial, pago en efectivo y precisión de GPS > ⚙ 500 m
  Cuando confirma el pedido
  Entonces la app muestra la hoja «reintentar / pagar por adelantado» y no envía el pedido
  Dado un recojo «ahora» con GPS fallido
  Cuando confirma el pedido
  Entonces la app envía el pedido con gpsValidation.method = 'failed'

CA-CAT-01 · Plato fuera de franja                                          (CUS-CAT-011)
  Dado un plato con days = [5,6], from = 11:00, to = 15:00 en America/Lima
  Cuando es martes 20:00
  Entonces el plato aparece apagado con la etiqueta «Solo sáb y dom, de 11:00 a 15:00»
  Y no se puede agregar a la bolsa
  Cuando es sábado 12:00     Entonces se puede pedir y no aparece ninguna etiqueta

CA-TRK-01 · Cancelación                                                    (CUS-TRK-006)
  Dado un pedido en efectivo en pending_acceptance de un cliente dueño
  Entonces la app ofrece «Cancelar»
  Dado un pedido prepagado en validando (con comprobante)
  Entonces la app NO ofrece «Cancelar»
  Y el texto dice que ya está en revisión y se resuelve por soporte

CA-TRK-02 · Tercer paso del seguimiento                                    (CUS-TRK-002)
  Dado un pedido en ready_for_pickup con deliveryMethod = pickup
  Entonces el paso activo es el tercero con el texto «Listo para recoger · Pásalo a recoger en el local»
  Y el ETA muestra «Ya está listo»
  Dado un pedido en picked_up con deliveryMethod = delivery
  Entonces el paso activo dice «En camino · El motorizado va en ruta»

CA-PAY-01 · Máximo dos comprobantes                                        (CUS-PAY-005)
  Dado un prepago con proofAttempt = 1 rechazado por la cajera
  Entonces el pedido vuelve a awaiting_payment y la app dice «Te queda 1 intento»
  Cuando el segundo comprobante también es rechazado
  Entonces el pedido queda cancelled con cancel_reason = proof_rejected_final
  Y la app muestra «Solicitar revisión de pago»
  Y crear un pedido nuevo está bloqueado (CUS-PAY-008)

CA-CRT-01 · Bolsa de un solo negocio                                       (CUS-CRT-001)
  Dado una bolsa con 2 platos del negocio A
  Cuando el cliente agrega un plato del negocio B
  Entonces la app pide confirmación de reemplazo
  Y al aceptar la bolsa queda con solo el plato de B y el método vuelve a «delivery»
```

## Defectos y desajustes encontrados al especificar (para corregir en el nativo, no copiar)

| # | Hallazgo | Dónde |
|---|---|---|
| 1 | El historial (`STATUS_LABEL`) **no traduce** `awaiting_payment` ni `ready_for_pickup`: se ve el estado interno. | `app/pedidos/page.tsx:39-50` |
| 2 | Los mensajes de WhatsApp usan `#TDV-…`; la referencia oficial es `#TND-…`. | `pedidos/page.tsx:213`, `appeal-create-view.tsx:27` |
| 3 | La vista de bloqueo se activa comparando el **texto** del error con `/bloquead/i`. | `use-checkout-actions.ts:357,374` |
| 4 | Los *fallback* de cobertura del cliente (`-9.1547, -78.5042`) no coinciden con los vivos (`-9.1465, -78.2779`). | `lib/coverage.ts:22-30` |
| 5 | `ADDRESS_REFERENCE_MIN` es **5** en código; `DECISIONS.md §13` dice **15**. | `contracts/primitives.ts:68` |
| 6 | «Volver a pedir» no repone la bolsa; `cart.replace` solo se usa en tests. | `pedidos/page.tsx:203`; `lib/cart.ts:182` |
| 7 | El saludo del inicio es fijo «Buenas noches». | `home-shell.tsx:64-77` |
| 8 | Los banners del carrusel están escritos en el código. | `home-carousel.tsx:14-30` |
| 9 | `usePlatformSchedule` no tiene consumidores. | `hooks/use-platform-schedule.ts` |
| 10 | El cliente regenera la clave de idempotencia ante cualquier 4xx (incluido el 409 «en proceso»). | `use-checkout-actions.ts:336-378` |
| 11 | La política de privacidad no menciona ubicación GPS ni datos de dispositivo. | `app/privacidad/page.tsx` |
