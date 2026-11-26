---
id: catalogo
nombre: Catálogo y negocio
actores: [CUS]
lineas: [pedidos-restaurante]
depende_de: [bolsa, direcciones]
dinero: true
codigo:
  web: [apps/customer/features/catalog/**, apps/customer/lib/business-ordering.ts, apps/customer/lib/business-path.ts, apps/customer/lib/whatsapp.ts]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/**]
  ios: []
  backend: [apps/api/app/api/v1/public/businesses/**, apps/api/app/api/v1/public/search/**, apps/api/app/api/v1/public/schedule/**, packages/contracts/src/menu-availability.ts, packages/contracts/src/schedule.ts, packages/contracts/src/featured-section.ts, apps/api/app/api/v1/business/profile/route.ts]
operaciones: [searchCatalog, getOrderIntakeStatus]
reglas: [FEATURED_MAX_ITEMS, CART_MAX_QUANTITY, CART_MAX_NOTE_LENGTH, isWithinWindow, describeWindow, getOpenStatus, checkModifierSelection, ACTIVE_ORDER_STATUSES, app_settings:platform_schedule]
---

# Catálogo y negocio

> Verificado: 2026-11-18 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el 2026-11-19 (conversación con Claude Code: «apruebo las recomendaciones de los cuatro»)

## Antes de tocar

- Es lo que el cliente ve antes de pedir: el Inicio (lista de restaurantes), la carta de un negocio y la ficha de un plato
  con sus opciones. Lo que se agrega a la bolsa es de la capacidad `bolsa`; el chip «Entregar en» abre `direcciones`.
- `dinero: true`: la ficha calcula el precio de la línea ((base + opciones) × cantidad) y el tamaño de un plato se
  muestra con su precio completo (CUS-CAT-009, CUS-CAT-034). Es solo para mostrar: el servidor recalcula y cobra. Aun así,
  todo cambio aquí pasa por Codex.
- Store (`STO`) comparte la portada pero es otra capacidad y sale después del lanzamiento: aquí solo vive el texto de su
  tarjeta (CUS-CAT-032). El carrusel de promociones es un recorte del lanzamiento (decisión 18 de
  `Docs/trabajo/app-cliente/README.md`).
- Dos reglas de horario viven en `packages/contracts` y existen **también** en Kotlin, copiadas: `getOpenStatus` (negocio
  abierto) y `isWithinWindow` (franja de un plato; Android: `DishWindow`). Si una cambia, cambian las dos y sus pruebas.
  Por eso CUS-CAT-023 pide que el servidor las entregue ya calculadas; mientras tanto la API manda la regla y no el resultado, por la caché de 15 s (`Docs/negocio/servicios/pedidos-restaurante.md`).
- El negocio cerrado, pausado o sin confirmar la jornada se rechaza **en el servidor** (`createOrder`, capacidad checkout);
  la app solo lo anticipa (CUS-CAT-012). El modo catálogo (`catalog_only`) es la excepción: pedir por WhatsApp es el pedido.
- Las decisiones del 17-nov (CUS-CAT-026 a 034) ya están aplicadas en esta ficha; Android sigue las de franja, cerrado, modo catálogo, «Destacados» e Inicio, y las demás están por hacer (Defectos y PR).
- iOS aún no empieza: `codigo.ios` vacío. La web del cliente se apaga y no se corrige.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-CAT-001 | La app debe listar los negocios publicados con nombre, eslogan, logo, color, plazo de entrega y si están abiertos; un negocio sin horario (`is_open_now` nulo) se trata como abierto. | `Docs/trabajo/app-cliente/requisitos/CAT.md` · `listBusinesses` | |
| CUS-CAT-002 | La app debe titular el Inicio con «¿Qué pedimos hoy?», sin el nombre de la persona (decisión de Jesús, 2026-11-19); el pedido en curso es CUS-CAT-031. | `CAT.md` · Canvas v35, tablero `Main` | |
| CUS-CAT-003 | **Recortada del lanzamiento** (decisión de Jesús, 2026-11-19): la app no debe incluir buscar negocios y platos en el Inicio; al volver, serán mínimo 2 caracteres, sin distinguir mayúsculas ni tildes, y el plato lleva a su negocio. | `CAT.md` · `searchCatalog` · `DECISIONS.md §20` | |
| CUS-CAT-004 | La app debe mostrar la página de un negocio: portada, logo, eslogan, plazo, horario semanal y secciones; el negocio se abre por id o por `slug`. | `CAT.md` · `getBusiness` | |
| CUS-CAT-005 | La app debe mostrar la carta por secciones: las vacías no se muestran, y «Destacados» (CUS-CAT-028) va primero respetando `display_order`. | `CAT.md` (modificado por CUS-CAT-028) | |
| CUS-CAT-006 | La app debe permitir buscar dentro de la carta del negocio, sin distinguir tildes, resaltando coincidencias; el vacío ofrece otro término. | `CAT.md` | |
| CUS-CAT-007 | La app debe mostrar la ficha del plato con nombre, descripción, precio, foto y etiquetas; sin foto, el respaldo de marca. | `CAT.md` · Canvas v35, tableros `Plato*` | |
| CUS-CAT-008 | La app debe permitir elegir opciones según las reglas de cada grupo: una o varias, obligatorio u opcional, tope de elecciones; las opciones no disponibles no se muestran. | `CAT.md` · `checkModifierSelection` | ★ |
| CUS-CAT-009 | La app debe calcular el precio de la línea como (precio base + opciones) × cantidad, con cantidad hasta `CART_MAX_QUANTITY` y nota hasta `CART_MAX_NOTE_LENGTH` caracteres; el servidor recalcula y revalida. | `CAT.md` · `CART_MAX_QUANTITY` · `CART_MAX_NOTE_LENGTH` | ★ |
| CUS-CAT-010 | La app debe mostrar «No disponible» y no permitir pedir un plato que la cajera marcó como agotado. | `CAT.md` | |
| CUS-CAT-011 | Mientras un plato esté fuera de su franja horaria (días, hora de Lima, cruce de medianoche, falla abierta ante datos rotos), la app debe apagarlo y decir cuándo vuelve; se reevalúa sin recargar. Sustituye a la decisión D-59 (`Docs/planes/movil/decisiones.md`), que lo ocultaba (decisión de Jesús, 2026-11-19). | `CAT.md` · `isWithinWindow` · `describeWindow` | ★ |
| CUS-CAT-012 | Mientras el negocio esté cerrado, la app debe mostrar «Cerrado», deshabilitar el pedido y decir cuándo abre; se reevalúa cada minuto. El servidor igual lo rechaza. | `CAT.md` · `getOpenStatus` · `DECISIONS.md §19` | ★ |
| CUS-CAT-013 | El servidor debe rechazar un pedido si el negocio no confirmó que atiende hoy (`opening_confirmed` falso); si no se pudo consultar, deja pasar. | `CAT.md` · `createOrder` | |
| CUS-CAT-014 | El servidor debe rechazar un pedido si el negocio está pausado (`accepting_orders_until` futuro); la pausa no afecta a «Pedir por WhatsApp». | `CAT.md` · `createOrder` | |
| CUS-CAT-015 | Cuando el negocio esté en modo catálogo (`catalog_only`), la app debe ofrecer «Pedir por WhatsApp» y «Llamar» en lugar de la bolsa; cierre y pausa no los bloquean. Conviven con CUS-CAT-026: sin contacto en la hoja de información, pero en modo catálogo pedir por WhatsApp es el pedido (decisión de Jesús, 2026-11-19). | `CAT.md` · `DECISIONS.md §18` | |
| CUS-CAT-016 | La app debe resolver las capacidades del negocio (delivery, recojo) con datos frescos: nunca se guardan con la bolsa y, sin dato, el 409 del servidor es el suelo. | `CAT.md` · `getBusiness` | |
| CUS-CAT-017 | Donde el negocio acepte delivery y recojo, la app debe mostrar el selector Delivery/Recojo; si solo acepta uno, queda fijo. | `CAT.md` · Canvas v35, tablero `Negocio` | |
| CUS-CAT-018 | Si el cliente ya tiene un pedido activo (`ACTIVE_ORDER_STATUSES`) en un negocio, la app debe impedir crear otro en ese negocio y enlazar al existente. | `CAT.md` · `createOrder` (responde 422 `validation_error`, no 409: `apps/api/app/api/v1/customer/orders/route.ts`; junta, 2026-11-21) | ★ |
| CUS-CAT-020 | La app debe mostrar un carrusel de promociones en el Inicio. Recortada del lanzamiento (promociones): sus banners hoy están escritos en la web. | `CAT.md` · decisión 18 de `Docs/trabajo/app-cliente/README.md` | |
| CUS-CAT-021 | La app debe mostrar el horario semanal (hoy resaltado, el día sin turno dice «Cerrado») y los datos del negocio, sin contacto (CUS-CAT-026). | `CAT.md` (modificado por CUS-CAT-026) · `getBusiness` | |
| CUS-CAT-022 | **Diferido a después del lanzamiento** (decisión de Jesús, 2026-11-19): la app debe abrir un negocio desde un enlace compartido (`/negocio/{slug}`); los enlaces antiguos con id siguen funcionando. | `CAT.md` | |
| CUS-CAT-023 | El servidor debe entregar ya calculados el estado de apertura y la disponibilidad de cada plato (`is_open_now`, `next_change_at`, `available_now` y su vigencia), para no reimplementar las dos reglas en tres lenguajes. | `CAT.md` · `Docs/planes/movil/contrato-rest.md` | |
| CUS-CAT-026 | La app no debe mostrar contacto (ni llamar ni WhatsApp) en la información del negocio; las incidencias van por «Ayuda con este pedido» (CUS-SUP-006). | Decisión de Jesús, 2026-11-17 (decisión 4) | |
| CUS-CAT-027 | La app no debe poner el botón «i» sobre la foto del negocio; debe poner bajo el nombre la fila «Información del negocio ›», que abre la hoja de información. | Decisión de Jesús, 2026-11-17 (decisión 4) | |
| CUS-CAT-028 | La app debe ofrecer «Destacados» como sección reutilizable cuyos productos y nombre elige el restaurante, con un campo nuevo de punta a punta (contrato, API, panel de Negocios y app; decisión de Jesús, 2026-11-19): de 1 a 6 productos con foto y disponibles, carrusel manual sin avance automático, precios vigentes y estado de bolsa sincronizado. El tope de 6 lo aplica el panel de Negocios (contador «N de 6» que no deja marcar el séptimo) y el servidor recorta al servir; no hay trigger en la base. | Decisión de Jesús, 2026-11-17 (decisión 4) | |
| CUS-CAT-029 | En la tarjeta del plato, la app debe poner el contador «− 1 +» fuera de la foto y no mostrar «En bolsa · 1»; un plato configurable muestra «En tu bolsa: [N]» y «Editar selección». | Decisión de Jesús, 2026-11-17 (decisión 4) | |
| CUS-CAT-030 | La app debe mostrar en el Inicio una barra superior con el logo, el chip de dos líneas «Entregar en» / [dirección] y la bolsa con su contador (siempre visible, también vacía), y no poner nada flotando sobre las pestañas. | Decisión de Jesús, 2026-11-17 (decisión 5) | ★ |
| CUS-CAT-031 | Cuando haya un pedido en curso, la app debe mostrarlo como tarjeta al inicio del contenido del Inicio y como punto en la pestaña Pedidos; con varios, una sola tarjeta que los cuenta. | Decisión de Jesús, 2026-11-17 (decisión 5) | |
| CUS-CAT-032 | La app no debe mostrar la tarjeta de Store en el Inicio mientras Store esté fuera del lanzamiento (decisión de Jesús, 2026-11-19); cuando vuelva, dirá «Variedad de productos». | Decisión de Jesús, 2026-11-17 (decisión 5) | |
| CUS-CAT-033 | En la ficha del plato, solo los grupos obligatorios deben bloquear el botón, que debe decir qué grupo falta; todos los campos llevan el mismo borde. | Decisión de Jesús, 2026-11-17 (decisión 6) | |
| CUS-CAT-034 | La app debe mostrar el tamaño de un plato con su precio completo (`price_display` total) y sumar los extras como recargo (`delta`); la línea sigue siendo (precio del tamaño + extras) × cantidad. | Decisión de Jesús, 2026-11-17 (decisión 6) · migración `0156` | ★ |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-CAT-01 | Dado un plato con días sábado y domingo y franja 11:00–15:00 en hora de Lima, cuando es martes 20:00, entonces el plato aparece apagado con «Solo sáb y dom, de 11:00 a 15:00» y no se puede agregar a la bolsa; cuando es sábado 12:00, se puede pedir y no aparece etiqueta. | CUS-CAT-011 |
| CA-CAT-02 | Dado un negocio con tres platos marcados como destacados y el nombre «Los más pedidos», entonces «Los más pedidos» aparece como primera sección con esos tres platos; sin ningún plato destacado disponible, la sección no aparece. | CUS-CAT-028, CUS-CAT-005 |
| CA-CAT-03 | Dado un negocio cerrado, cuando se abre su carta, entonces los platos se ven, agregar queda deshabilitado y se dice cuándo abre. | CUS-CAT-012 |
| CA-CAT-04 | Dado un negocio en modo catálogo, entonces la carta ofrece «Pedir por WhatsApp» y «Llamar» en lugar de la bolsa, también si está cerrado. | CUS-CAT-015 |
| CA-CAT-05 | Dado el Inicio, entonces el título dice «¿Qué pedimos hoy?» y no aparece la tarjeta de Store. | CUS-CAT-002, CUS-CAT-032 |
| CA-CAT-06 | Dado un plato con un grupo de opciones obligatorio y otro opcional, cuando se elige una opción, entonces en un grupo de una sola elección la nueva reemplaza a la anterior, el botón sigue pidiendo completar lo obligatorio y solo los grupos obligatorios bloquean. | CUS-CAT-008, CUS-CAT-033 |
| CA-CAT-07 | Dado un plato con precio base, un grupo de tamaño con precio completo y extras con recargo, entonces el tamaño se muestra con su precio y los extras con «+ S/ x», y el precio de la línea es (precio del tamaño + extras) × cantidad, sin redondear. | CUS-CAT-009, CUS-CAT-034 |

Los criterios de cada pantalla (`CA-CAT-P1` a `CA-CAT-P9`) viven en su ficha.

## Abierto

- **Compartir plato y «Para compartir»** (decisión 9 del PR #198): sin recomendación ni decisión de Jesús; no entran. Registrado en `Docs/trabajo/decisiones-abiertas.md` (DA-17).

## Reglas

- Topes de la ficha: `CART_MAX_QUANTITY` y `CART_MAX_NOTE_LENGTH`.
- Selección de opciones válida: `checkModifierSelection`.
- Franja de un plato: `isWithinWindow` y su texto, `describeWindow`.
- Negocio abierto: `getOpenStatus`; horario de la plataforma: `app_settings:platform_schedule`.
- Estados de pedido activo: `ACTIVE_ORDER_STATUSES`.
- Tope de «Destacados»: `FEATURED_MAX_ITEMS`.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-CAT-002 | El saludo de la web es fijo («Buenas noches»); la maqueta del Inicio dice «¿Qué pedimos hoy?». | `apps/customer/features/catalog/components/home-shell.tsx` |
| 3 | CUS-CAT-012 | El Inicio de Android dice «Cerrado ahora»; la carta ya deshabilita el pedido y dice cuándo abre. Falta que el Inicio diga «Cerrado · abre [día] [hora]». | `feature/catalog/home/CatalogHomeScreen.kt` |
| 4 | CUS-CAT-015 | Android: la carta ofrece «Pedir por WhatsApp» y «Llamar» con el único número público del negocio (`whatsapp_number`); la API no manda otro teléfono. El mensaje con la bolsa no existe (en modo catálogo no hay bolsa). | `feature/catalog/business/OrderingMode.kt` |
| 5 | CUS-CAT-007 | Android no usa las etiquetas (`badges`) ni el color de respaldo (`image_hue`) que la API ya manda. | `feature/catalog/business/MenuMapping.kt` |
| 6 | CUS-CAT-023 | La carta pública no trae `is_open_now` ni `available_now`; solo la lista de negocios trae `is_open_now`. | `packages/contracts/openapi/v1.json` (`getBusiness`) |
| 7 | CUS-CAT-033 | El botón de la ficha dice «Completa [N] opciones»; el diseño pide nombrar el grupo que falta. | `feature/catalog/business/DishSheetState.kt` · `DishPage.kt` |
| 8 | CUS-CAT-034 | Android muestra el tamaño con su precio completo, pero no el texto «El precio es el del tamaño». | `feature/catalog/business/DishSheetState.kt` |
| 9 | CUS-CAT-028, CUS-CAT-029 | El carrusel de «Destacados» no muestra el estado de la bolsa del plato (contador «− 1 +» y «En tu bolsa: N»); el diseño lo pide sincronizado. | `feature/catalog/business/FeaturedCarousel.kt` |
| 10 | CUS-CAT-012, CUS-CAT-014 | La app no sabe si el negocio está pausado: `getBusiness` no manda la pausa (`accepting_orders_until`), así que la carta no la anticipa y el servidor rechaza el pedido al final (403 «pausado temporalmente»). | `feature/catalog/business/OrderingMode.kt` · `apps/api/app/api/v1/public/businesses/[id]/route.ts` |
