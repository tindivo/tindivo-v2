# Mapa de la app Android del cliente, pantalla por pantalla

> 2026-11-10 · Leído sobre `5fe61735` (develop `2fb9c028` + PR #131).
>
> **Zona Trabajo: es análisis, no norma.** Lectura hecha por Gemini y contrastada por muestreo; lo no verificado va
> marcado.

**Convenciones.** `C/` = `apps/android/customer/src/main/kotlin/com/tindivo/customer/`;
`N/` = `apps/android/core/network/src/main/kotlin/com/tindivo/core/network/`. Marcas: ✔ = abrí el archivo y la línea
dice lo que se afirma; ○ = lo dijo Gemini y no lo reabrí (sin verificar). En las tablas de estados: ✔ lo maneja,
✘ no lo maneja, – no aplica.

## 1. Resumen

- La app tiene **17 pantallas u hojas**: 13 completas y 4 a medias (checkout, entrar, mi cuenta y detalle del pedido).
  Ninguna falta del todo; lo que falta son **funciones** de la web, no pantallas.
- Un pedido de **efectivo o Yape pagado fuera** se puede hacer de punta a punta: portada, carta, bolsa, checkout,
  seguimiento y reseña.
- **Bloqueo probable para una cuenta nueva:** Mi cuenta y el checkout piden `GET /customer/profile`; si el perfil
  no existe, la API responde 404 `customer_profile_not_found` y la app lo muestra como error genérico sin salida.
  La app nunca crea el perfil (no llama a `PUT /customer/profile`). Falta probarlo con una cuenta real.
- El build deja `GOOGLE_WEB_CLIENT_ID` vacío (dev y prod): sin ese valor la pantalla Entrar dice «aún no está
  disponible» y nadie puede iniciar sesión.
- Faltan, aunque la API ya las tiene: completar perfil, aceptar términos, **borrar cuenta** (exigido por Google Play),
  subir comprobante de prepago, cancelar, repetir pedido, apelaciones y push.
- Pruebas: 730 casos unitarios, **0 de UI** de Compose y **cobertura por líneas sin medir**.

## 2. Tabla de pantallas y flujos

Pruebas = casos `@Test` de la carpeta (la carpeta puede cubrir varias pantallas). API = ruta bajo `/api/v1`.

| Pantalla | Estado | Rutas de la API | Carga | Vacío | Error | Sin conexión | Pruebas | Archivo principal |
|---|---|---|---|---|---|---|---|---|
| Portada (negocios) | Hecho | `GET /public/businesses` | ✔ | ✔ | ✔ (recarga sin reintento) | ✔ | 97 (catalog) | `C/feature/catalog/home/CatalogHomeScreen.kt` |
| Carta del negocio | Hecho | `GET /public/businesses/{id}` | ✔ | ✔ solo en búsqueda | ✔ | ✔ | 97 (catalog) | `C/feature/catalog/business/BusinessScreen.kt` |
| Ficha del plato (hoja) | Hecho | ninguna (local) | – | – | ✔ validación de grupos | – | 97 (catalog) | `C/feature/catalog/business/DishSheet.kt` |
| Índice de secciones (hoja) | Hecho | ninguna (local) | – | – | – | – | 97 (catalog) | `C/feature/catalog/business/SectionIndexSheet.kt` |
| Bolsa | Hecho | ninguna (DataStore) | invisible | ✔ | ✘ (error de disco se calla) | – | 72 (cart) | `C/feature/cart/CartScreen.kt` |
| Checkout | A medias | `GET /customer/profile`, `/customer/addresses`, `/public/businesses/{id}`, `/customer/orders`; `POST /customer/checkout/quote`, `/customer/orders`; `GET /customer/orders/attempts/{key}` | ✔ | ✔ bolsa vacía | ✔ | ✔ | 135 (checkout) | `C/feature/checkout/CheckoutScreen.kt` |
| Entrar | A medias | `POST /auth/v1/token?grant_type=id_token` (Supabase) | ✔ | – | ✔ genérico | ✘ (igual que error) | 5 (signin) | `C/feature/signin/SignInScreen.kt` |
| Mi cuenta | A medias | `GET /customer/profile`; `POST /auth/v1/logout` | ✔ | – | ✔ genérico | ✔ | 7 (account) | `C/feature/account/AccountScreen.kt` |
| Verificar número | Hecho | `POST /customer/phone/send-code`, `/verify`, `/transfer` | ✔ | – | ✔ | ✔ | 21 (phone) | `C/feature/phone/PhoneVerifyScreen.kt` |
| Mis direcciones | Hecho | `GET /customer/addresses`; `PATCH /customer/addresses/{id}` | ✔ | ✔ | ✔ | ✔ | 38 (addresses) | `C/feature/addresses/AddressListScreen.kt` |
| Formulario de dirección con mapa | Hecho | `GET /public/config`, `/customer/addresses`; `POST`, `PATCH`, `DELETE` | ✔ | – | ✔ | ✔ | 38 (addresses) | `C/feature/addresses/AddressFormScreen.kt` |
| Mis pedidos | Hecho | `GET /customer/orders` (cursor) | ✔ | ✔ | ✔ | ✔ | 63 (orders) | `C/feature/orders/OrdersScreen.kt` |
| Detalle y seguimiento | A medias | `GET /customer/orders/{id}` (sondeo de 8 s) | ✔ | – (404 aparte) | ✔ | ✔ (conserva datos) | 63 (orders) | `C/feature/orders/OrderDetailScreen.kt` |
| Reseñas (hoja) | Hecho | `GET /customer/reviews/pending`; `POST /customer/orders/{id}/review`, `/review/dismiss` | ✔ al enviar | – (no dibuja) | ✔ sin reintento | ✘ no distingue | 30 (reviews) | `C/feature/reviews/ReviewSheets.kt` |
| Actualización obligatoria | Hecho | `GET /config` (por 426 o versión mínima) | – | – | ✔ aviso si no abre la tienda | – | 3 (update) + 20 (config) | `C/feature/update/UpdateScreen.kt` |
| Aviso de Android antiguo | Hecho | `GET /config` | – | – | – | – | 20 (config) | `C/navigation/AppNavHost.kt:255-279` |
| Diagnóstico (solo debug) | Hecho | `GET /health`, `GET /config` | ✔ | – | ✔ | ✔ | 6 (diagnostics) | `C/feature/diagnostics/DiagnosticsScreen.kt` |

Los estados de las columnas salen de la lectura de Gemini; lo que abrí yo está en §7 y §8. Navegación: 7 casos
(`navigation`). Por qué «A medias»:

- **Checkout**: el efectivo y el Yape pagado fuera funcionan; el prepago con comprobante no existe en la app, y los
  botones «Agregar dirección» y «Verificar celular» caen en Mi cuenta en vez de abrir su pantalla (hallazgo 5).
- **Entrar**: sin ID de Google en el build no hay forma de entrar (`C/feature/signin/SignInScreen.kt:78-80` ✔).
- **Mi cuenta**: no edita el nombre, no borra la cuenta y no tiene salida si el perfil no existe.
- **Detalle**: no cancela ni sube comprobante; solo muestra un aviso de texto para ir a la web.

## 3. Lo que falta frente a la web

La web de referencia (`apps/customer`, congelada) tiene las rutas `/`, `/negocio/[id]`, `/checkout`, `/pedido/[shortId]`,
`/pedidos`, `/cuenta`, `/entrar`, `/borrar-cuenta`, `/privacidad`, `/terminos`, `/entregas` y `/store`. Gemini leyó
las ocho primeras; las cuatro últimas **no se leyeron**. «Ruta» = existe el path en
`packages/contracts/src/openapi/registry.ts` (línea entre paréntesis). «Cliente» = método en
`N/*Repository.kt` (hoy solo hay Address, Catalog, Checkout, Customer, Phone, Review y System).

| Función de la web | ¿Está en la app? | ¿Existe la ruta de la API? |
|---|---|---|
| Completar perfil de cuenta nueva (la web lo crea en `components/auth-onboarding/persistence.ts:125`) | No. `CustomerRepository.kt` solo tiene `GET`; el 404 `customer_profile_not_found` cae en `AppError.Unknown` (`N/ErrorMapping.kt:48` ✔) | Sí: `PUT /customer/profile` (801) y `GET` con ese 404 (816-822) |
| Editar el nombre en Mi cuenta | No | Sí: `PUT /customer/profile` (801) |
| Aceptar términos | No | Sí: `POST /customer/terms-acceptance` (1062) |
| Borrar cuenta | No (ni pantalla ni método) | Sí: `DELETE /customer/account` (1079); la web tiene `/borrar-cuenta` |
| Subir comprobante de prepago | No; solo el texto `order_web_payment_notice` | Sí: `GET /customer/orders/{id}/prepay-info` (443), `POST .../prepay-proof/upload-url` (457), `POST .../prepay-proof` (484) |
| GPS («Mi ubicación») | No: el manifiesto solo pide `INTERNET` (`AndroidManifest.xml:5` ✔); el pin se mueve a mano en el mapa | No hay ruta propia; la web guarda `customer_gps_*` en el pedido (sin verificar cómo llega) |
| Push (avisos del pedido) | No: sin Firebase, sin `POST_NOTIFICATIONS` (grep vacío); el seguimiento es por sondeo | Sí: `PUT/DELETE /push/devices/{installId}` (757, 784) |
| Repetir pedido («Volver a pedir») | No | Sí: `GET /customer/orders/{id}/reorder` (969) |
| Cancelar pedido | No | Sí: `POST /customer/orders/{id}/cancel` (429) |
| Apelaciones de comprobante rechazado | No | Sí: `GET/POST /customer/orders/{id}/appeal` (509, 523), `GET /customer/appeals` (543) |
| Avisos de seguridad de la cuenta | No | Sí: `GET /customer/security-notices` (648), `POST .../{id}/seen` (665) |
| Cerrar sesión en todos los dispositivos | No: la app cierra solo la local (`logout?scope=local`) | Es de Supabase Auth, no de la API |
| Deep links / enlaces verificados | No: el manifiesto solo tiene el `intent-filter` del lanzador (`AndroidManifest.xml:30-33` ✔) | No aplica |
| Soporte por WhatsApp | Parcial: solo en la vista de cuenta bloqueada (`C/feature/checkout/CheckoutNoticeViews.kt:19` ✔) | No aplica |
| Entregas (llevar de A a B) | No; fuera de alcance por la D-62 | Sí: `/customer/courier-orders` (562, 1044), `/public/courier/*` (293, 309, 1118) |
| Store | No; fuera de alcance por la D-62 | Sí: `/public/store` (329), `/public/store/{slug}` (357), `/public/store/events` (375) |
| Páginas legales (`/privacidad`, `/terminos`) | No: la app no las enlaza (grep sin resultados) | No aplica: son páginas web |

Lo que la app sí cubre y la web también: catálogo, carta con búsqueda interna, bolsa local, checkout con cotización
en vivo e idempotencia, direcciones con mapa, verificación de celular con traspaso, historial paginado, seguimiento,
reseñas y contacto por WhatsApp con el motorizado (`C/feature/orders/DriverContact.kt`).

## 4. Lo que exige Google Play

Requisitos tomados de `07-publicacion-tiendas.md` §3, §4, §6 y §8. «Evidencia» es lo que encontré en el código.

| Requisito | Estado en la app | Evidencia |
|---|---|---|
| `targetSdk 36` (obligatorio desde 31-ago-2026) | Cumple | `apps/android/customer/build.gradle.kts:18` ✔ |
| `minSdk` por decidir (propuesta API 26) | Cumple la propuesta | `build.gradle.kts:17` ✔ |
| AAB firmado con Play App Signing | Falta: release sin firma; la CI arma el AAB solo para medir peso | `build.gradle.kts:58-59` ✔ |
| R8 y reducción de recursos | Cumple | `build.gradle.kts:60-61` ✔ |
| Cuenta y negocio de revisión (R1, «App access») | Falta: no existe en la app ni en el repo del cliente | no existe (§7 del doc es solo diseño) |
| Borrado de cuenta dentro de la app (R3) | Falta | no existe pantalla ni método; la API sí: `registry.ts:1079` |
| Página web para pedir el borrado (R3) | Existe en la web | `apps/customer/app/borrar-cuenta/page.tsx` ✔ (archivo) |
| Política de privacidad pública y enlazada (R5) | La web tiene `/privacidad`; la app no la enlaza; el doc dice que la versión 2026-05 omite ubicación, fotos, avisos y borrado | `apps/customer/app/privacidad/page.tsx`; en la app: no existe |
| Formulario *Data safety* cuadrado con los SDK (R4) | Pendiente: SDK de hoy son Maps, Credential Manager y Coil; sin analítica ni errores de terceros | `libs.versions.toml:70-74`; el formulario no está en el repo |
| Permisos pedidos al usarlos, con texto | Hoy no se pide ninguno; al llegar GPS, comprobante y push habrá que hacerlo | `AndroidManifest.xml:5` ✔ |
| Sin ubicación en segundo plano | Cumple | `AndroidManifest.xml:5` ✔ (solo `INTERNET`) |
| Notificaciones después del primer pedido | No aplica aún: no hay push | no existe |
| Quitar permisos biométricos que arrastra una librería | Cumple | `AndroidManifest.xml:9-14` ✔ |
| Sin tráfico HTTP en claro | Cumple | `AndroidManifest.xml:26` ✔ |
| Sin respaldo de la sesión en la nube | Cumple | `AndroidManifest.xml:19`, `res/xml/backup_rules.xml`, `data_extraction_rules.xml` ✔ |
| Iniciar sesión funcionando en el build que se sube | Falta: `GOOGLE_WEB_CLIENT_ID` vacío en `dev` y `prod` | `build.gradle.kts:45, 52` ✔ |
| Prueba cerrada: 12+ testers × 14 días | Es un proceso de la cuenta de Jesús, no del repo | sin verificar |
| Marcadores de la ficha (capturas reales, nota al revisor) | Borradores en el doc §9-§10 | `07-publicacion-tiendas.md` |
| Compras con el sistema de la tienda (R10) | No aplica: comida, se paga por fuera | `07-publicacion-tiendas.md` §4 |
| Sign in with Apple (R2) | No aplica a Android | `07-publicacion-tiendas.md` §4 |

## 5. Capa de red

Repositorios (`N/`), 7 clases y 22 métodos:

| Repositorio | Rutas | Con cuenta amarrada (`boundTo`) |
|---|---|---|
| `AddressRepository` | `GET/POST /customer/addresses`, `PATCH/DELETE /customer/addresses/{id}` | Sí, todas |
| `CatalogRepository` | `GET /public/businesses`, `/public/businesses/{id}`, `/public/config` | No (públicas) |
| `CheckoutRepository` | `POST /customer/checkout/quote`, `/customer/orders`; `GET /customer/orders/attempts/{key}`, `/customer/payment-options` | Sí, salvo `paymentOptions()` (que la app no llama: grep vacío) |
| `CustomerRepository` | `GET /customer/profile`, `/customer/orders`, `/customer/orders/{id}` | Hay versión amarrada de perfil y lista; `order(id)` no ✔ |
| `PhoneRepository` | `POST /customer/phone/send-code`, `/verify`, `/transfer` | No |
| `ReviewRepository` | `GET /customer/reviews/pending`; `POST .../review`, `.../review/dismiss` | Sí |
| `SystemRepository` | `GET /health`, `GET /config` | No |

Interceptores: cabeceras de cliente y `X-Request-Id`; `Authorization: Bearer` con un refresco y reintento ante 401;
reintento (2 veces, con espera) de `GET` y de `POST` con `Idempotency-Key` ante red, 5xx o 429; escudo de
`Retry-After`; verificación de que el `sub` del token es la cuenta esperada.

Qué ve el usuario según el error (`N/ErrorMapping.kt` ✔ y los ViewModels):

| Caso | Mapeo | Lo que ve el usuario |
|---|---|---|
| Sin conexión (`IOException`) | `AppError.Network` | «Sin conexión. Revisa tu internet…» en todas las pantallas, salvo Entrar (mensaje genérico) y Reseñas (no distingue) |
| 401 | Un refresco automático; si sigue, `Known(Unauthorized)` | Cuenta, direcciones, detalle y teléfono cierran la sesión y vuelven a «sin sesión»; el checkout muestra «no se pudo cargar» |
| 404 | `Known(NotFound)`; el código `customer_profile_not_found` no está en el enum y pasa a `Unknown` | Dirección: «no se encontró»; pedido: «Algo salió mal» sin explicar; perfil: «Algo salió mal» + Reintentar |
| 422 | `Known(ValidationError)` con `fieldMessage` | Teléfono y dirección muestran el texto del servidor; el resto, genérico |
| 426 o `client_upgrade_required` | `AppError.UpgradeRequired` | Se vacía la pila y se muestra «Actualiza la app». **El checkout no lo reporta** (hallazgo 4) |
| 429 | `Known(RateLimited)` | Teléfono muestra el texto del servidor; en el pedido cuenta como «el servidor pudo crearlo» y se reconcilia; el resto, genérico |
| 5xx | `Known(InternalError)` o `Unknown` | «Algo salió mal. Inténtalo de nuevo.» (tras 2 reintentos automáticos si es seguro) |
| Cuerpo ilegible o 2xx incompatible | `Unknown` con `detail` | Genérico; en pedidos «falla cerrado» (retira lo mostrado) |

## 6. Pruebas

Casos `@Test` medidos hoy sobre `5fe61735`. No hay Kover ni JaCoCo: **la cobertura por líneas no está medida**.
Solo existe una prueba instrumentada (`customer/src/androidTest/.../SessionKeystoreTest.kt` ✔) y no hay
`createComposeRule` ni `ui-test` en `apps/android` (grep vacío ✔).

| Área | Casos | | Área | Casos |
|---|---|---|---|---|
| `core/network` | 157 | | `reviews` | 30 |
| `checkout` | 135 | | `phone` | 21 |
| `catalog` | 97 | | `config` | 20 |
| `cart` | 72 | | `navigation` | 7 |
| `session` | 69 | | `account` | 7 |
| `orders` | 63 | | `diagnostics` | 6 |
| `addresses` | 38 | | `signin` | 5 |
| `update` | 3 | | **Total** | **730** (573 en `customer` + 157 en red) |

Huecos, por riesgo:

1. **Sin pruebas de UI**: ninguna pantalla se ha probado dibujada, ni con TalkBack, ni con fuente grande.
2. **`signin` 5 y `account` 7**: es la puerta de entrada y el cierre de sesión; el caso del perfil inexistente (404)
   no tiene prueba que lo ate.
3. **`update` 3**: bloquea toda la app ante un 426; el flujo completo (pila vaciada, sin vuelta atrás) está solo en
   `navigation` (7).
4. **Checkout y 426**: ninguna prueba ata que un 426 en cotización o creación lleve a la pantalla de actualización.
5. **Cobertura no medida**: no se puede decir qué porcentaje del código toca una prueba. Medirla (Kover) es el primer
   paso antes de fijar metas.
6. **Prueba instrumentada única**: solo se prueba el almacén de claves; nada de mapa, Credential Manager ni rotación.

## 7. Hallazgos de UX/UI

Fusionados entre los cinco reportes. La severidad es la mía tras leer el código, no la de Gemini; donde difiere,
va indicado. ✔ verificado en el archivo; ○ sin verificar.

### ALTA

| # | Tema | Hallazgo | Dónde |
|---|---|---|---|
| 1 | Errores | Cuenta nueva sin perfil: Mi cuenta y el checkout piden `GET /customer/profile`, reciben 404 `customer_profile_not_found` (cae en `Unknown`) y quedan en «Algo salió mal» + Reintentar; el botón «Verificar mi número» no se llega a dibujar. La app no tiene cómo crear el perfil. **Por confirmar con una cuenta real** | ✔ `C/feature/account/AccountViewModel.kt:73,86-91`; ✔ `C/feature/checkout/CheckoutLoader.kt:51-58`; ✔ `N/ErrorMapping.kt:48` |
| 2 | Entrar | El build deja `GOOGLE_WEB_CLIENT_ID = ""` y la pantalla queda en «aún no está disponible» sin otra acción | ✔ `apps/android/customer/build.gradle.kts:45,52`; ✔ `C/feature/signin/SignInScreen.kt:78-80` |

### MEDIA

| # | Tema | Hallazgo | Dónde |
|---|---|---|---|
| 3 | Errores | Entrar mezcla «sin internet» con «falló el servicio» en un solo mensaje (Gemini: ALTA) | ✔ `C/feature/signin/SignInViewModel.kt:51,62`; ✔ `SignInScreen.kt:71-77` |
| 4 | Errores | El checkout no reporta el 426 a `ConfigService` (los demás ViewModels sí): el usuario ve un error genérico hasta que la app vuelva a primer plano | ✔ grep: `reportUpgradeRequired` ausente en `C/feature/checkout/` |
| 5 | Navegación | «Agregar dirección», «Arreglar» y «Verificar celular» del checkout abren Mi cuenta, no su pantalla; el modo selector (`AddressesRoute(pick=true)`) nunca se abre y nadie lee `PICKED_ADDRESS_KEY`; el comentario «cuando lleguen las pantallas, se recablea» quedó viejo | ✔ `C/feature/checkout/CheckoutActions.kt:4-6`, `CheckoutDeliverySection.kt:141,235`; ✔ `C/navigation/AppNavHost.kt:191,233`; ✔ grep de `PICKED_ADDRESS_KEY` |
| 6 | Errores | Prepago rechazado o por pagar: solo un texto «abre tu pedido en la web de Tindivo» sin enlace ni botón. Ojo: el texto real es el de `strings.xml:231`, no el que citó Gemini | ✔ `C/feature/orders/OrderDetailScreen.kt:124-130`; ✔ `res/values/strings.xml:231` |
| 7 | Errores | Pedido no encontrado (404) muestra «Algo salió mal»; sí hay botón «atrás» arriba, pero el texto no explica nada (Gemini: ALTA y «sin botón», lo segundo es falso) | ✔ `C/feature/orders/OrderDetailScreen.kt:68-69,82-84` |
| 8 | Errores | Bolsa: si el disco falla al guardar, no pasa nada visible y el usuario no sabe por qué «+» no hizo nada (Gemini: ALTA) | ✔ `C/feature/cart/CartViewModel.kt:98-100` |
| 9 | Errores | Mensajes genéricos sin acción: teléfono con 5xx (`PhoneError.Generic`), cuenta con cualquier error que no sea red, catálogo y carta con 404/5xx | ✔ `C/feature/phone/PhoneVerifyViewModel.kt:283-305`; ✔ `C/feature/account/AccountScreen.kt:125-132`; ✔ `CatalogHomeScreen.kt:318-322`; ○ `BusinessScreen.kt:184-189` |
| 10 | Accesibilidad | Tarjetas clicables sin `Role.Button` (negocio) y filas que hacen de botón sin rol (bolsa del checkout) (Gemini: ALTA) | ✔ `C/feature/catalog/home/CatalogHomeScreen.kt:190`; ✔ `C/feature/checkout/CheckoutBagSection.kt:47-54` |
| 11 | Accesibilidad | Estrellas de la reseña: botón con `contentDescription` que contiene el glifo «★/☆» (posible lectura doble en TalkBack, no probada); error de envío sin reintento ○ | ✔ `C/feature/reviews/ReviewSheets.kt:187-206` |
| 12 | Accesibilidad | La tarjeta de dirección es clicable y lleva dentro «Editar» y «Hacer principal»: dos acciones anidadas (efecto en TalkBack no probado) | ✔ `C/feature/addresses/AddressListScreen.kt:226,254,258` |
| 13 | Consistencia visual | Inicial del negocio en `Color.White` sobre el acento que manda el negocio: con acento claro, ilegible. Misma copia en la portada ○ | ✔ `C/feature/catalog/business/BusinessHeader.kt:63-75`; ○ `CatalogHomeScreen.kt:252-265` |
| 14 | Consistencia visual | El mapa no cambia de estilo en modo oscuro y no hay vista alterna si faltan los Servicios de Google Play | ✔ `C/feature/addresses/AddressMap.kt:74-85` |
| 15 | Consistencia visual | Ventana de arranque en tema claro fijo y sin `values-night`: en modo oscuro hay un fogonazo claro antes de que Compose pinte (el contenido sí sigue al sistema) | ✔ `res/values/themes.xml:4`; ✔ `MainActivity.kt` (`enableEdgeToEdge`, `TindivoTheme`) |
| 16 | Textos | Mensaje de WhatsApp al motorizado escrito en el código («Estás en mi domicilio»), fuera de `strings.xml` | ✔ `C/feature/orders/DriverContact.kt:21` |
| 17 | Textos | Hay un solo punto que usa «Añadir/Añade/Añadido» (peninsular) frente a «Agregar» en el resto (Gemini: ALTA) | ✔ `res/values/strings.xml:61,121,122,123` (y «Agregar» en 56, 83, 88, 313, 380) |

### BAJA

| # | Tema | Hallazgo | Dónde |
|---|---|---|---|
| 18 | Textos | «podrían no ir bien» (peninsular), «suena tu celu» (coloquial), «Pásalo a recoger» (rebuscado), «Enviando» sin puntos suspensivos | ✔ `strings.xml:254, 344, 203, 419` |
| 19 | Textos | Pasos del prepago con «1. / 2. / 3. » pegados en el código; separadores « · » en código | ✔ `C/feature/checkout/CheckoutPaymentSection.kt:134-142`; ✔ `C/feature/orders/OrdersScreen.kt:152-154` |
| 20 | Textos | El apoyo del campo «Referencia» queda vacío si no cumple el mínimo: no dice qué falta | ✔ `C/feature/addresses/AddressFormScreen.kt:257` |
| 21 | Textos | El prefijo «+51» vive dos veces (constante y recurso) | ✔ `C/feature/phone/PhoneVerifyViewModel.kt:277`; ✔ `strings.xml:410` |
| 22 | Accesibilidad | Títulos sin `heading()` en Entrar y Diagnóstico (Mi cuenta y Verificar sí lo tienen: `AccountScreen.kt:87`, `PhoneVerifyScreen.kt:103` ✔); Actualización y aviso de Android antiguo ○ | ✔ `C/feature/signin/SignInScreen.kt:68`; ✔ `DiagnosticsScreen.kt` (sin `heading`) |
| 23 | Accesibilidad | Campos de teléfono y código sin `imeAction`: hay que tocar el botón en pantalla | ✔ `C/feature/phone/PhoneVerifyScreen.kt:128,155` |
| 24 | Accesibilidad | Botones «−» y «+» con el símbolo como texto literal (la descripción accesible sí está) | ✔ `C/feature/cart/CartScreen.kt:250,259`; ○ `DishSheet.kt:142,151` |
| 25 | Errores | Cierre de sesión sin pedir confirmación | ✔ `C/feature/account/AccountScreen.kt:192-197` |
| 26 | Errores | Si falla recargar la portada o paginar pedidos, queda un texto rojo sin botón | ✔ `CatalogHomeScreen.kt:141-143`; ✔ `OrdersScreen.kt:107-109` |
| 27 | Errores | El aviso de Android antiguo reaparece en cada arranque del proceso (se descarta solo en memoria) | ✔ `C/navigation/AppViewModel.kt:29-30` |
| 28 | Rendimiento | Índice de secciones con `Column` + `chunked(2)` en vez de rejilla perezosa; solo se abre con 5 o más categorías | ✔ `C/feature/catalog/business/SectionIndexSheet.kt:48-70` |
| 29 | Rendimiento | `AsyncImage` de plato sin `placeholder` ni `error` | ✔ `C/feature/catalog/business/DishSheet.kt:100-106` |
| 30 | Consistencia visual | Diagnóstico (solo debug) sin scroll ni botón atrás; el mapa pinta la zona con naranja fijo | ✔ `C/feature/diagnostics/DiagnosticsScreen.kt:40`; ✔ `C/feature/addresses/AddressMap.kt:30-33` |
| 31 | Mantenimiento | `isUnauthorized()` copiada en 4 archivos | ✔ grep: `AccountViewModel`, `AddressUi`, `OrderErrors`, `PhoneVerifyViewModel` |
| 32 | Mantenimiento | `OrderDetailScreen` declara `canRate`/`onRate` con valor por defecto vacío (ver §8: sí están cableados) | ✔ `C/feature/orders/OrderDetailScreen.kt:63-70` |

Sin verificar (○ Gemini, no reabiertos): espaciado mínimo de `SectionChip` y de estrellas (`MenuTopBar.kt:218-227`,
`ReviewSheets.kt:187-208`), `remember` de búsqueda y de `visibleAt` en el hilo principal, dp mágicos, caducidad
silenciosa del reto de traspaso en `PhoneVerifyScreen.kt:204-231`, y los riesgos 3, 4, 6 y 7 del reporte de red
(JWT sin forma esperada, `lazy` de `GeneratedJson`, `Thread.sleep` en el reintento, deserialización opaca).

Muestreo: de los hallazgos MEDIA y BAJA abrí 21 puntos distintos (los marcados ✔ arriba y otros fusionados) y los 21
dicen lo que el reporte afirmaba; 3 tienen el impacto rebajado (colores fijos de `MenuItemRow.kt:120-121`,
`SharingStarted.Eagerly` de `AppViewModel.kt:37,46`), porque el efecto real es mínimo.

## 8. Hallazgos descartados o dudosos

| Lo que dijo Gemini | Qué encontré | Veredicto |
|---|---|---|
| El botón «Diagnóstico» de la portada expone herramientas de desarrollo en producción (`CatalogHomeScreen.kt:131-135`) | `onOpenDiagnostics` solo se pasa si `BuildConfig.DEBUG`; en release es `null` y la ruta ni se registra: `AppNavHost.kt:120-125` y `:212` ✔ | **Falso** en release |
| Modo oscuro ALTA: «tema Light fijo, sin `darkColorScheme`» (`themes.xml:4`) | `TindivoTheme` usa `darkColorScheme()` con `isSystemInDarkTheme()` (`Theme.kt:10-22` ✔) y `MainActivity` la aplica. Lo cierto es solo el fondo de arranque (hallazgo 15) | **Exagerado** → MEDIA |
| «Theme.kt: no hay paleta de marca, por eso falla el modo oscuro» | El comentario «paleta de marca llega en otro PR» es cierto (`Theme.kt:9`), pero es de marca, no un fallo del modo oscuro | **Engañoso** |
| `PhoneActions`, `BusinessCartActions`, `CartActions`, `AddressFormActions` y `CheckoutFormActions` causan recomposiciones innecesarias (5 hallazgos ALTA) | Las instancias existen, pero se crean dentro de un `Destination` que solo se recompone cuando cambia el estado que recolecta, y en ese caso la pantalla también debe recomponerse. Con Compose 1.12 y Kotlin 2.4 rige «strong skipping». Sin medición | **No confirmable**; como mucho BAJA |
| `OrderDetailScreen`: `canRate`/`onRate` «sin implementar» | `OrderDetailWithReview` los cablea: `AppNavHost.kt:243-253` ✔ | **Falso** |
| Detalle 404 «sin botón para volver» | Hay «atrás» en la parte superior de la pantalla (`OrderDetailScreen.kt:68-69` ✔) | **Falso a medias** (el texto sí es pobre) |
| El aviso de prepago dice «Paga o sube tu comprobante en tindivo.com» | El recurso es «Para pagar o apelar, abre tu pedido en la web de Tindivo.» (`strings.xml:231` ✔), sin dirección | **Cita errónea** |
| `INVALID_MENU` y «invalid order data» son textos que ve el usuario | Viajan en `AppError.Unknown.detail`, que ninguna pantalla muestra (solo hay red o genérico) | **No visible**; BAJA |
| `order(id)` y `paymentOptions()` sin `boundTo` «podrían usar el token de otra cuenta» | Es cierto que no están amarradas (`CustomerRepository.kt:63-66`, `CheckoutRepository.kt:46-49` ✔); pero `order(id)` solo lee y un pedido ajeno da 404, y `paymentOptions()` no se llama | **Bajo riesgo** |
| `GeneratedJson` con `lazy` puede quedar sin configurar | No lo abrí | **Sin verificar** |

## 9. Cosas a decidir

- ¿Quién crea el perfil de la cuenta nueva? La web lo hace con `PUT /customer/profile` tras entrar; la app puede hacer
  lo mismo (pantalla de nombre) o la API puede crearlo sola al primer `GET`. Es decisión de producto y del contrato REST.
- Con el prepago diferido a la web, el aviso necesita al menos un botón que abra el pedido en el navegador.
