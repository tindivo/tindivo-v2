# 04 · Decisiones, supuestos y riesgos de ejecución

> Estado: **en ejecución** · Aprobado por Jesús el 2026-10-10 (conversación con Claude Code: «oka»); alcance ampliado con
> D-49 a D-53, aprobado por Jesús el 2026-10-13 (conversación con Claude Code) · Alcance: las
> decisiones de la migración a apps nativas; manda la sección 1. Análisis y requisitos: `Docs/trabajo/movil/`
> **Actualizado el 2026-09-20** con tus respuestas. La sección 1 es lo decidido; lo que no me correspondía decidir
> sigue en las secciones 2 y 3, con opciones, una **recomendación** y de qué depende.

## 1. Decidido (registrado)

| # | Decisión | Quién / cuándo | Consecuencias reflejadas en el análisis |
|---|---|---|---|
| D-00 | **Dos apps 100 % nativas: Swift (iOS) y Kotlin (Android).** Capacitor descartado. | Tú, 2026-09-20 | OpenAPI obligatorio, sin reutilizar TypeScript, el catálogo de requisitos es la especificación común (`ARQ-02/03`, `03-requisitos/`) |
| D-01 | **Primero la app de clientes** (Customer). Admin se queda en web. | Tú, 2026-09-20 (admin: mi propuesta) | Fases M1/M2/M3/W. **Matizada por `D-30`**: Negocios pasa por delante |
| D-02 | Todo el análisis vive en `Docs/trabajo/movil/`. | Tú | — |
| D-03 | **`tindivo-prod` es operación real** (1 mes y 5 días a 2026-09-20). | Tú, 2026-09-20 | Compatibilidad hacia atrás obligatoria; cambios fuera de 18:00-23:00; Ola A. **Corrige** mis notas del 2026-09-10 («no hay producción viva») |
| D-04 | **La revisión legal la haces tú** (sin abogado por ahora). | Tú, 2026-09-20 | Textos estándar ahora y revisión profesional más adelante; no bloquea el arranque. Ver `D-23/D-24` |
| D-10 | **Tienes Mac.** | Tú, 2026-09-20 | iOS se escribe y depura ahí; **falta modelo y macOS** para Xcode 26 (`05-arranque/01` paso 0) |
| D-12 | **Customer: Android e iOS se lanzan a la vez.** | Tú, 2026-09-20 | Android se construye primero e iOS lo sigue de cerca con la misma especificación y vectores (lanzar a la vez ≠ construir a la vez): `05-arranque/03` |
| D-13 | **Planes gratuitos** (Supabase y Vercel); regiones EE. UU. | Tú, 2026-09-20 | Regiones confirmadas: base `us-west-2`, funciones `iad1` (`PER-02`). Sin copias y Hobby no comercial (`PRO-06`). Ver `D-37` |
| D-30 | **App de Negocios (cajera): sube de prioridad; solo Android; es lo más urgente.** | Tú, 2026-09-20 | Primer carril de app (N). iOS de Negocios queda fuera por ahora. Ver `D-35` |


### Decididas el 2026-10-10

| # | Decisión | Quién / cuándo |
|---|---|---|
| D-39 | **El dinero viaja como texto** (`"12.50"`) en los campos nuevos de la API | Jesús, 2026-10-10 |
| D-44 | Al borrar una cuenta: **pedidos anonimizados para siempre, comprobantes 90 días, directorio y antifraude por teléfono conservados** | Jesús, 2026-10-10 (recomendación aceptada) |
| D-45 | El revisor de las tiendas entra con un **negocio de demostración**; vídeo solo de respaldo | Jesús, 2026-10-10 |
| D-46 | Edad mínima de uso: **18 años** | Jesús, 2026-10-10 |
| D-47 | Versiones mínimas: **Android 8 (API 26) e iOS 17** | Jesús, 2026-10-10 |
| D-48 | Los modelos de **Swift** se compilan en la CI **a diario**, no en cada PR (el runner de macOS cuesta diez veces más); Kotlin, en cada PR | Jesús, 2026-10-10 |

### Decididas el 2026-10-13

| # | Decisión | Quién / cuándo |
|---|---|---|
| D-49 | **Pedir en tres pasos** (armar, revisar, confirmar) y **el recurrente en dos toques** (Revisar → Confirmar, con dirección y pago por defecto) son **criterio de aceptación** de la app, comprobado en el flujo crítico contra la API simulada. Mientras `D-22` siga abierta, el recorrido se mide desde que hay sesión; no se asume «OTP solo la primera vez» | Jesús, 2026-10-13 |
| D-50 | **Método de pago por defecto = el del último pedido** (`GET /customer/orders`), sin estado nuevo en el servidor. **Condición:** el valor por defecto se filtra por los métodos que permita la cotización (`POST /customer/checkout/quote`) o `GET /customer/payment-options`; si el cliente ya no puede pagar contraentrega, no se le preselecciona | Jesús, 2026-10-13 (aprobada con condición) |
| D-51 | **Repetir un pedido** con `GET /customer/orders/{id}/reorder`, ruta **de solo lectura**: devuelve el carrito con precios y disponibilidad actuales y las diferencias respecto del pedido original (plato retirado, precio distinto, opción retirada). No crea pedido: eso sigue siendo `POST /customer/orders` con `Idempotency-Key`. Dinero como texto (`D-39`); un pedido ajeno da 404. Repetir una Entrega queda fuera | Jesús, 2026-10-13 |
| D-52 | **Inicio administrable, acotado:** solo **bloques tipados** que sirve la API (esquema en `@tindivo/contracts`; sin agregador `GET /home`, sin segmentos y sin campañas), para que un cambio comercial no exija actualizar la app. **El admin para editarlos va con la iniciativa de campañas, no en este plan** | Jesús, 2026-10-13 (aprobada acotada) |
| D-53 | **Métricas de la app desde la base propia, sin SDK de analítica de producto:** pedidos por `client_platform`, recompra a 30 días app frente a PWA, aceptación del permiso de push por plataforma (guardar el estado del permiso por dispositivo es parte del registro de dispositivos del paso 5). Los fallos, con el rastreador de errores de `OPS-4`, que no es analítica de producto. Revisión semanal el primer mes | Jesús, 2026-10-13 |

### Decididas el 2026-10-21

| # | Decisión | Quién / cuándo |
|---|---|---|
| D-14 | **Un solo repositorio (este monorepo)** y Android como **un proyecto Gradle con módulos** en `apps/android/`: `core` (red, sesión, modelos generados del OpenAPI, diseño, push) y uno por app (`customer` ahora; `negocios` y `motorizados` después). iOS irá en `apps/ios/`. El APK lo compila la CI y se prueba en un Android real (sin emulador local); la app en desarrollo habla con **staging** (MV6), nunca con producción | Jesús, 2026-10-21 (recomendación aceptada) |

**Reglas aplicables que no son decisiones del plan** (ya están en los estándares de código v2, ADR 0038, y se citan sin
número D propio): `DES-6` (el contrato es compatible hacia atrás; `oasdiff` contra la rama base en la CI) y `CLI-14`
(toda publicación pasa por pruebas internas y sale con liberación gradual o escalonada). Los números `D-54` y `D-55`
quedan **libres**: la siguiente decisión del plan tomaba `D-54`; desde el 2026-10-26 la siguiente es `D-64`.

### Decididas el 2026-10-24

Recomendaciones de la consulta de arquitectura a Codex (expediente `tindivo-auditorias/2026-10-24-consulta-movil-base`,
fuera del repo), aceptadas por Jesús en la conversación con Claude Code: «sí, apruebo el orden y las librerías, minOs
opción a».

| # | Decisión | Quién / cuándo |
|---|---|---|
| D-54 | **Librerías de la app Android aprobadas (KT-16)**, cada una entra con el PR que la usa: **Coil** (imágenes), **supabase-kt solo Auth** con el motor **OkHttp** de Ktor y detrás de `SessionStore` (CLI-7), **Credential Manager**, **DataStore**, **Tink** y **Google Maps SDK**. **Condición** para supabase-kt: el PR que lo añade mide cuánto suma al release (D-57); si rompe el presupuesto, se estudia GoTrue por REST con cambio de canon | Jesús, 2026-10-24 (recomendación aceptada) |
| D-55 | **Imágenes para las apps nativas: miniatura generada al subir** (WebP de ~384 px, la carta la pinta a 92 dp) y un campo **opcional** `thumbnail_url` en la API, aditivo (API-3). Las imágenes ya subidas se completan con un proceso por lotes idempotente que **no borra originales**; los nombres van versionados. La app cae a `image_url` si falta la miniatura. Sin transformaciones de pago, sin proxy de imágenes y sin redimensionar en el teléfono | Jesús, 2026-10-24 (recomendación aceptada) |
| D-56 | **El VPS de Jesús** (centro de datos; 12 GB de RAM y 8 núcleos, según Jesús) **solo aloja staging y previews** con Coolify (`infra/coolify/`), aislados. **No** aloja producción, la base, el envío de push, un proxy de imágenes, mosaicos de mapa ni un runner de CI (el repositorio es público: un PR externo ejecutaría código ahí) | Jesús, 2026-10-24 (recomendación aceptada) |
| D-57 | **Peso de la app como regla:** la CI construye el AAB `prodRelease` (R8 y reducción de recursos, sin firmar), mide su tamaño de descarga con bundletool y lo publica en cada PR; el **techo se fija después de medir** y desde entonces falla la CI. **Techo inicial: 1 500 000 bytes** para el perfil de gama baja (`apps/android/config/size/budget.json`), sobre 1 230 557 medidos en la CI del PR #85 (2026-10-24). Funciona como trinquete: el PR que añade peso (una librería, recursos) sube el techo en ese mismo PR y declara la cifra antes y después; nadie lo sube a ciegas. **El techo nuevo es lo medido en ese PR más un 10 %** (Jesús, 2026-10-24, al aprobar la sesión). Baseline Profiles cuando haya flujos reales | Jesús, 2026-10-24 (recomendación aceptada) |
| D-58 | **`minOs` de `/config`: solo aviso.** Si el Android del teléfono está por debajo del mínimo que publica el servidor, la app lo avisa y deja seguir; la única que bloquea es la versión mínima de la app (426, `minVersion`) | Jesús, 2026-10-24 |

### La carta de la app, decididas el 2026-10-24

Decisiones de Jesús en la conversación con Claude Code; para la D-60 se apoyó en el lienzo «Plato sin foto» (cuatro
opciones dibujadas sobre la misma carta).

| # | Decisión | Quién / cuándo |
|---|---|---|
| D-59 | **Un plato fuera de su franja horaria no sale en la carta de la app**, ni su categoría si se queda vacía; no se muestra «disponible desde…». La franja se resuelve en hora de Lima con la misma regla que `isWithinWindow` (`packages/contracts/src/menu-availability.ts`) y se reevalúa cada minuto. La web del cliente la atenúa con la franja y no se iguala, porque Jesús la va a apagar; el panel de negocios ya lo dice así (PR #90) | Jesús, 2026-10-24 |
| D-60 | **Plato sin foto: el isotipo de Tindivo en gris** dentro del recuadro de la foto (92 dp; isotipo a 40 dp, `#2E3236` al 35 % sobre `#F4F4F2`). El recuadro está siempre, para que las filas queden alineadas, y el isotipo se ve también mientras la foto carga o si falla. En prod faltaban fotos en 63 de 138 platos (2026-10-24) | Jesús, 2026-10-24 (opción A) |
| D-61 | **Barra fija de la carta en la app**: volver, el nombre del negocio (aparece al dejar atrás la portada) y una lupa para buscar en la carta; debajo, los chips de categorías, que siguen la sección visible, y desde 5 categorías el botón del índice. La barra fija de la web no muestra el nombre del negocio | Jesús, 2026-10-24 (recomendación aceptada) |

### La sesión del cliente, decidida el 2026-10-24

Decisión de Jesús en la conversación con Claude Code, entre tres opciones: igual que la web, solo Google, o el teléfono
por SMS como inicio de sesión.

| # | Decisión | Quién / cuándo |
|---|---|---|
| D-22 | **En la app nativa, el cliente entra solo con Google**: Credential Manager y supabase-kt Auth (D-54). La app no ofrece correo y contraseña, ni el teléfono como inicio de sesión. El teléfono se sigue verificando por SMS para poder pedir (`/customer/phone/*`). En **iOS** serán Google **y Apple**, conforme al requisito documentado para Tindivo en la fila R2 de `Docs/trabajo/movil/07-publicacion-tiendas.md` (guía 4.8). **Tampoco la web crea cuentas con correo** (migración 0279, PR #110): la migración crea el hook de Auth `auth_hooks.before_user_created`, que rechaza el alta de un cliente que no venga de Google, y **el bloqueo rige solo mientras el hook esté activado en el proyecto** (paso manual, `Docs/operacion/deploy.md` §2.1); con la confirmación de correo apagada, el alta por correo permitía preapropiar la cuenta de otra persona. El personal se sigue creando desde Admin y entra con correo y contraseña. Las cuentas de cliente que ya tienen contraseña siguen entrando con ella: la 0279 no las toca. Jesús decidió (2026-10-26) invalidarlas en la migración a móvil y no sanearlas antes, pero **esa invalidación todavía no tiene mecanismo**: se diseña con la migración a móvil. El teléfono ya verificado en otra cuenta lo resuelve `D-63` | Jesús, 2026-10-24 (opción «solo Google»); web: Jesús, 2026-10-26 (S3, opción A) |

### Alcance de la app y el número entre cuentas, decididos el 2026-10-26

Decisiones de Jesús en la conversación con Claude Code. La política del número la revisó Codex en dos rondas
(expediente `tindivo-auditorias/2026-10-25-consulta-telefono-otra-cuenta`, fuera del repo); Jesús la aprobó sin
aprobación manual: «no quiero trabajo manual de aprobar cambio de número».

| # | Decisión | Quién / cuándo |
|---|---|---|
| D-62 | **Tindivo Store y Tindivo Entregas entran en la app del cliente**, además de los pedidos de restaurante | Jesús, 2026-10-26 («sí, agrega ambos, store y entregas») |
| D-63 | **Un número verificado pertenece a una sola cuenta.** Si otra cuenta lo verifica por SMS, la app pregunta y el cliente puede **trasladarlo él mismo**, sin aprobación de Tindivo; la otra cuenta pierde la verificación y recibe un aviso que queda en su cuenta (el push es solo un intento). **No se mueven pedidos, datos, deudas ni roles**, y el SMS no da acceso a la otra cuenta. Se espera solo si alguna de las dos tiene un pedido o Entrega en curso. **El riesgo se queda con el número**: strikes, bloqueos y restricciones de contraentrega de la cuenta anterior siguen aplicando, y tras un traslado la confianza para contraentrega solo cuenta las entregas de la cuenta nueva con ese número. Cada traslado exige un código nuevo, de un solo uso, sin plazo de espera entre traslados. Un número reciclado sigue el mismo camino; la excepción va por WhatsApp. Resuelve lo que `D-22` dejaba abierto sobre el teléfono ya verificado en otra cuenta | Jesús, 2026-10-26 |

## 2. Decisiones abiertas — organización y plazos externos

| # | Decisión | Opciones | Recomendación | Bloquea |
|---|---|---|---|---|
| D-11 | **Cuentas de tienda**: Apple Developer Program y Google Play Console. | Crear ambas hoy · esperar. | **Hoy.** Apple: la creas ahora (guía paso a paso en `05-arranque/01-cuentas-y-firmas.md`). **Google Play: por crear** y con el **camino crítico** de 12 testers × 14 días por app para Customer. | Fecha del primer lanzamiento |
| D-14 | **Estructura del repositorio** (`MOB-16`). | Proyectos `apps/ios` y `apps/android` en el monorepo · repos separados con la especificación como submódulo. | Monorepo: el spec OpenAPI, los vectores de conformidad y los tokens de diseño viven junto al backend y el CI los valida. **Decidido por Jesús el 2026-10-21: monorepo, con `apps/android/` en módulos (sección 1)** | Ritmo de trabajo |
| D-35 | **Orden de construcción.** | Negocios Android primero y Customer después · en paralelo · Customer primero. | **Negocios Android primero** (lo más urgente, 4 usuarios que conoces, pista interna sin la prueba de 12 × 14). El backend (B1-B3) y la organización (O) corren **en paralelo**; Customer arranca al terminar N1, con la pista cerrada abierta cuanto antes. Ver `05-arranque/03`. **Decidido por Jesús el 2026-10-09: Customer primero, Negocios Android después y la mudanza al VPS al final** (`../../planes/migraciones/cola.md`) | Plan de fases |
| D-36 | **Quién figura como publicador** en las tiendas. | Persona natural (hoy; tu nombre legal) · organización (empresa + D-U-N-S; semanas; exime de la prueba de 12 testers de Google). | **Persona natural ahora**; ambas tiendas permiten transferir la app a otra cuenta más adelante (con condiciones). | Fecha del primer lanzamiento |
| D-37 | **Subir a planes de pago** (`PRO-06`). | Supabase Pro (US$ 25/mes) y Vercel Pro (US$ 20/mes) · quedarse en gratuito con el mínimo de la Ola A. | **Subir ambos antes del lanzamiento público** (copias de seguridad y términos de uso comercial). Hoy, el mínimo gratis: funciones a `pdx1`, poda de `pg_cron` y un volcado nocturno cifrado. | Fiabilidad y cumplimiento |

## 3. Decisiones abiertas — producto y arquitectura

| # | Decisión | Opciones | Recomendación | Depende / bloquea |
|---|---|---|---|---|
| D-20 | **Dónde vive el dominio** (`ARQ-04`). | A: base de datos (lo actual, ordenado: esquema declarativo, una función por acción, tests en CI). B: TypeScript con RPC finas. | **A, y no ahora**: conserva lo probado y es higiene de la Ola 2, no un bloqueador. | `ARQ-04` |
| D-21 | **Superficie que consume la app** (`ARQ-01`). | A: Supabase directo (SDK de Swift/Kotlin). B: fachada REST completa (`03-superficie-api.md §4`). **C: mixto mínimo.** | **C**: lecturas simples y tiempo real directos con RLS; **escrituras con reglas** por REST/RPC **versionadas**; más `GET /config`. Ver §3.1 | Bloquea el primer *build* de Customer |
| D-23 | **Política de borrado de cuenta** (`SEC-09`). | Anonimización con retención mínima del vínculo antifraude (hash del teléfono) · borrado total. | Anonimización; los plazos de retención los decides tú (`D-04`); una revisión profesional puntual sería lo ideal (Ley 29733). | Bloquea la publicación |
| D-24 | **Consentimiento y marketing** (`NAT-CON`). | Texto, categorías, edad mínima, horas de silencio, frecuencia máxima. | Empezar por `order_updates` (no comercial) y añadir `promotions` tras M1; texto estándar y revisión más adelante (`D-04`). | `NAT-MKT-001` |
| D-25 | **Motor de notificaciones** (`NOT-01/05/07`). | FCM + APNs **directos** desde un *worker* propio · servicio gestionado para campañas (OneSignal, etc.). | **Directo para lo transaccional** (control de fiabilidad y prioridad); evaluar un servicio gestionado **solo para campañas** si construir segmentos y programación cuesta más de lo que vale. | `NAT-PSH`, `NAT-MKT` |
| D-26 | **Proveedor de mapas nativo** (`NAT-LOC-002`). | iOS: MapKit. Android: Google Maps SDK · MapLibre con teselas propias. | MapKit + Google Maps SDK; **comprobar la calidad del satélite en San Jacinto** antes de fijar. Las teselas de OSM/CARTO de la web **no** deben usarse en una app publicada. **Android: Google Maps SDK aprobado por Jesús el 2026-10-24 (D-54)**, con carga diferida al abrir el selector; la calidad del satélite en San Jacinto se comprueba antes de publicar | `CUS-ADR-008` |
| D-27 | **Alcance de la web cuando exista la app** (`MOB-15`). | Apagar la PWA · dejarla como respaldo de enlaces, tienda y borrado de cuenta. | **Respaldo** (no apagar). Para Negocios, además, la web sigue siendo la vía de los usuarios de escritorio y de iPhone. | `CUS-WEB-007` |
| D-28 | **Sistema de diseño en nativo** (`MOB-21`). | Iconos: Material Symbols en ambas · SF Symbols en iOS + Material en Android. Modo oscuro sí/no. | Exportar los **tokens** (color, radio, tipografía Geist/JetBrains Mono) como JSON; SF Symbols en iOS; modo oscuro **fuera de M1**. | Diseño de M1 |
| D-29 | **Versiones mínimas de SO** y presupuesto de dispositivo. | iOS 16.1+ (Live Activities) o 17+ · Android 8 (API 26) o superior. | Decidir con **datos reales de dispositivos** de la PWA (`@vercel/analytics` en el Customer) y con el móvil gama baja que se quiera soportar. `targetSdk` = 36 (obligatorio en Play desde el 2026-08-31). | Alcance de `NAT-LIV` |
| D-31 | **Referencia mínima de dirección** (`CUS-ADR-001`). | 5 (código) · 15 (`DECISIONS.md §13`). | Decidir con la cajera/motorizados qué referencia sirve a la puerta; el número debe vivir en **una** fuente (⚙). | Validaciones |
| D-32 | **Formato del código de pedido**: `#TND-` (oficial) vs `#TDV-` (mensajes de WhatsApp). | — | Unificar en `#TND-`. | Textos |
| D-33 | **Canal del pedido nativo** (`ARQ-08`). | Renombrar `customer_pwa` · conservarlo y añadir `client_platform` (`ios`/`android`/`web`). | **Conservar y añadir columnas**; generalizar los CHECK con un predicado. | Antes del primer *build* |
| D-34 | **Quién financia cupones/promos** (`NAT-MKT-003`). | Tindivo · el negocio. | Depende del modelo económico (Tindivo no retiene fondos). | `NAT-MKT-003` |

### 3.1 Tu pregunta: «¿lo ves muy necesario? ¿es buena práctica? ¿es un estándar?»

**Respuesta corta:** el **principio** sí es estándar y no es negociable; la **fachada completa** que propuse, no.
Te recomiendo la **versión mínima**.

**Lo que sí es estándar en la industria (y por qué).** Una app instalada **no se actualiza cuando tú despliegas**: hay
versiones viejas vivas durante meses (a diferencia de tu PWA, que se actualiza sola). Por eso toda app móvil seria tiene
un **contrato estable, versionado y documentado** con su servidor, una **versión mínima** con pantalla de «actualiza la
app», **errores con código estable** y las reglas de dinero y de estado decididas **en el servidor**. Sin esto, la primera
vez que cambies una columna o una función de la base, **las apps ya instaladas se rompen y no puedes arreglarlas con un
despliegue**: hay que esperar la revisión de la tienda (días) mientras los clientes ven errores.

**Lo que no es obligatorio:** que ese contrato sea *una capa REST nueva y separada*. Hay tres formas válidas:

| Opción | Cómo es | Ventaja | Coste | En Tindivo |
|---|---|---|---|---|
| **A · Supabase directo** (SDK de Swift/Kotlin) | La app habla con PostgREST, RPC y Realtime | Menos código y menos latencia (sin salto extra) | **El esquema y las RPC pasan a ser tu API pública**: cada cambio debe ser compatible hacia atrás durante meses | Ya es la mitad del sistema hoy (103 accesos directos en `negocios`, 48 en `customer`) |
| **B · Fachada REST completa** (`/api/mobile/v1`) | Toda lectura y escritura por endpoints propios | Control total: versionado, validación, límites, idempotencia, observabilidad | Otra capa que escribir y mantener; un salto más (suelo de ~0,47 s hoy) | La propuesta original |
| **C · Mixto mínimo** *(recomendada)* | Lecturas simples y tiempo real **directos** con RLS; **escrituras con reglas** (crear/cancelar pedido, pagos, borrado de cuenta, dispositivos) por REST/RPC **versionadas**; más `GET /config` | Contrato estable **donde importa** (dinero, estados) sin reescribirlo todo | Disciplina: congelar lo que la app lee directo (vistas o RPC estables, no tablas) | Lo que el sistema ya hace, con reglas |

**Qué es «la versión mínima» (lo que hay que tener antes del primer *build* público):**
1. Cabeceras `X-Client-Platform/Version/Build` en toda petición.
2. `GET /config`: versión mínima por plataforma, *kill switch*, *flags* y los parámetros ⚙ (la app no lleva números escritos).
3. `426 Upgrade Required` y una pantalla de «actualiza la app».
4. **Códigos de error estables** (`code`) en las rutas y RPC que usa la app, en vez de frases en español.
5. **OpenAPI** de esas rutas, generado a partir de los Zod que ya existen, para generar los clientes de Swift y Kotlin.
6. Generalizar `source = 'customer_pwa'` (`ARQ-08`, `D-33`).
7. Congelar como contrato lo que la app lee directo: vistas o RPC estables, no tablas.

**Lo que se difiere** hasta que una **medición** diga que hace falta: el agregador `GET /home`, los `/me/*` completos, el
canal *Broadcast* por pedido y la reescritura de `advance_order` por acción (`D-20`).

**Por qué a Negocios le basta menos:** son 4 negocios que conoces y puedes exigir actualizar por WhatsApp; con los
puntos 1-4 alcanza. **Customer exige lo estricto**: es público, se instala sin que sepas quién y pasa por la revisión
de la tienda.

## 4. Supuestos que hice (corrígeme si alguno es falso)

1. **La documentación es pista, no verdad.** Donde `DECISIONS.md`/`Docs/` contradicen al código o a la
   base, manda lo medido (13 casos en `PRO-04`).
2. **Resuelto (`D-03`): es operación real.** Los datos ya lo sugerían: 716 pedidos en 43 de los 44 días desde el
   2026-08-08 (≈ 17 por día activo; 25 en las últimas 24 h; 663 entregados; 619 tecleados por la cajera), **386
   teléfonos distintos** (254 piden una sola vez, 12 cinco veces o más), 231 filas en `cash_settlements`, 16 en
   `restaurant_payments`, 1 308 en `business_charges` (consulta de solo lectura contra `tindivo-prod`, 2026-09-20;
   `anexos/C-consultas-de-medicion.md`).
3. **Las medidas de latencia salen del equipo de trabajo** (nueva conexión TLS en cada llamada; conexión al borde de
   Cloudflare de 0,22-0,50 s). Sirven para el orden de magnitud y para comparar, no como línea base final.
4. **Admin se queda en web** (nada en `ADM-*` va a móvil).
5. **Sin acceso a los paneles** de Supabase, Vercel, Inngest, Twilio, Apple y Google: la región de Supabase se dedujo
   del fichero de enlace de la CLI (`us-west-2`) y los planes los confirmaste tú; siguen sin verse la configuración
   de Auth, la salida de datos y los límites de Realtime.
6. **No se ejecutaron los tests de integración** ni se tocó ninguna base con escritura.
7. **Los textos legales** (privacidad, términos, consentimiento) los revisarás tú (`D-04`); lo aquí dicho sobre
   Ley 29733 y políticas de tiendas es orientación técnica, no asesoría legal. Las guías de Apple y Google cambian:
   hay que contrastarlas al enviar.
8. **Tu Mac aguanta Xcode 26** (macOS Sequoia 15.6 o Tahoe 26.2 según la versión de Xcode): sin confirmar. Necesito el
   modelo, el año y la versión de macOS.
9. **Las cajeras que usarán Negocios tienen teléfono o tablet Android.** Los datos lo matizan: entre los usuarios de
   negocio con push hay **2 en Android, 3 en Windows, 2 en Mac y 1 en iPhone** (suscripciones por dispositivo; una
   persona puede tener varios). Comprobar con los 4 negocios qué usan **durante la noche**; quien use escritorio o iPhone
   seguirá con la web.
10. **Motorizados sin decisión.** 3 de sus 4 usuarios con push usan iPhone: a diferencia de Negocios, ahí iOS sí
    importaría.

## 5. Riesgos de ejecución (no para reabrir D-00, sino para gestionarlo)

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **Dos bases de código nativas (y una tercera, Negocios) con una sola persona** | El coste se duplica y las apps divergen | Especificación única (`03-requisitos/`), OpenAPI, **vectores de conformidad**, tokens de diseño compartidos; **un carril de app a la vez**, iOS desfasado de Android (`05-arranque/03`) |
| **iOS exige macOS y Xcode 26** | Sin un Mac compatible no hay iOS | `D-10`: confirmar modelo y versión; trabajo de Android y de backend sin bloqueo mientras tanto |
| **El backend cambia más rápido que las apps publicadas** | Una versión vieja deja de poder pedir | Política de compatibilidad + versión mínima + `426` **antes** del primer envío (`ARQ-07`) |
| **Plazos externos** (cuentas de desarrollador, revisión de tiendas, **12 testers × 14 días por app en Google**) | No dependen del código | Abrir las cuentas ya; reclutar 15-20 testers; abrir la pista cerrada con la primera versión usable (`05-arranque/01`) |
| **Planes gratuitos con operación real** | Sin copias de seguridad; Hobby no comercial; tope de 500 MB por el registro de `pg_cron` | Ola A antes que cualquier otra cosa (`05-arranque/02`) |
| **Reglas de negocio en cuatro sitios** | Iguales en la teoría, distintas en la práctica | Mover al servidor lo que dependa de hora/config/estado (`ARQ-03`); vectores para lo demás |
| **Notificaciones: el efecto depende de cuántos instalen la app** | El techo es la adopción, no la tecnología | Embudo web → tienda (`NAT-LNK-*`), QR del mostrador, y medir (`NAT-ANA-002`) |
| **Fabricantes Android que matan procesos o restringen avisos a pantalla completa** | La alarma de la cajera puede no sonar aun siendo nativa | Diseño de N0 con permisos guiados, servicio en primer plano y latido; probar en el móvil real de la cajera |
| **Cajera como canal dominante (86 %)** | Si el móvil de cliente no la desplaza, poco cambia | `D-30` (Negocios primero) y medir la cuota de autoservicio (`ADM-OPE-006`) |
| **Deriva de los documentos** | Ya se ha construido sobre datos falsos antes (incluida la promesa de copias de seguridad) | Este catálogo se regenera y se revalida (`00-formato…`); los números son fotografías del 2026-09-20 |

## 6. Lo que sigue pendiente de ti (por orden de impacto)

1. **`D-10`**: modelo, año y versión de macOS de tu Mac.
2. **`D-11`**: crear hoy la cuenta de **Google Play** y la de **Apple**, y reunir 15-20 testers (`05-arranque/01`).
3. **`D-37`**: ¿subes Supabase y Vercel a Pro antes del lanzamiento público?
4. **`D-21`**: ¿aprobamos la **versión mínima** del contrato (§3.1)?
5. **`D-35`**: ¿confirmas Negocios Android primero y Customer después?
6. **`D-36`**: ¿publicas como persona natural por ahora?
