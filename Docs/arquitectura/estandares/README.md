# Estándares de código de Tindivo

> Verificado: 2026-10-12 · entorno: `develop@591ec569` · Aprobado por Jesús el 2026-10-12 (conversación con Claude Code) · Decisión: `Docs/decisiones/0038-estandares-de-codigo-v2.md`

Este archivo define las reglas transversales. Las de cada lenguaje viven en su archivo y no se repiten aquí (una fuente por regla, `Docs/README.md` §3.1):

| Archivo | Reglas | Lo lee quien toque… |
|---|---|---|
| `README.md` (este) | DES, API, CLI, MIG, TST, OPS | cualquier cosa |
| `typescript.md` | TS | `packages/backend`, `apps/api`, las apps web y el resto de `packages/` |
| `sql.md` | DB | `supabase/`: migraciones, funciones, políticas, pruebas |
| `swift.md` | SW | `apps/customer-ios/` |
| `kotlin.md` | KT | `apps/customer-android/` |

Un agente lee este archivo y solo los de los lenguajes que toca su cambio.

## Qué manda

- **El contrato REST v1 es `Docs/planes/movil/contrato-rest.md`**, aprobado, con el código que lo cumple (`packages/contracts`, `apps/api`). Allí están los valores: rutas (por actor, `/api/v1/<actor>/…`), códigos de error y sus status, cabeceras (`x-tindivo-*`), la actualización obligatoria (`426 client_upgrade_required`), `GET /api/v1/config` y el uso de Realtime como aviso.
- **Estas reglas no redefinen esos valores**: dicen cómo se diseña, se cambia y se verifica el contrato. Si una regla y el contrato fijan valores distintos, manda el contrato, y la regla se corrige.
- **Lo mismo con las decisiones vigentes** de `DECISIONS.md`, `Docs/decisiones/` y `Docs/planes/movil/decisiones.md` (por ejemplo, D-39, D-44, D-47 y D-48).
- **El plan móvil (`Docs/planes/movil/`) manda en el alcance, las fases MV y las decisiones D-xx de las apps.** Estas reglas no fijan alcance de producto: dicen cómo se construye lo que el plan decide.
- Un valor nuevo (un `code`, una cabecera, una ruta) se añade primero al contrato, con su aprobación, y después al código.

## Cómo funcionan

### Niveles

| Nivel | Qué significa | A qué código aplica |
|---|---|---|
| **OBLIGATORIA** | Bloquea el merge, por la CI o con evidencia citada en el PR | Al comportamiento añadido o modificado, no al archivo entero: tocar una línea no obliga a sanear el archivo. Lo existente que la incumple va a `Docs/arquitectura/excepciones.md` |
| **ALERTA** | La CI avisa y quien revisa decide | Todo |
| **GUÍA** | Criterio para la revisión | Todo |

### Excepciones

- Se permiten, también nuevas, si van confinadas y justificadas en una línea en `Docs/arquitectura/excepciones.md` (regla, ruta o símbolo, porqué, fecha). Sin esa línea, es un incumplimiento.
- La CI cuenta las filas de `excepciones.md`: el número solo puede bajar, salvo aprobación explícita de Jesús en el PR.

### Evidencia

Mientras una OBLIGATORIA no tenga mecanismo (§8), el PR cita la evidencia que la demuestra: el test, la consulta o la salida en crudo. «Lo revisé» no es evidencia.

## 1. Desacoplamiento (la prioridad)

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| DES-1 | **Los clientes (web y nativos) solo hablan con la API REST** para datos y acciones del negocio. Supabase en un cliente: Auth, Realtime como aviso (según el contrato) y cargas directas a Storage autorizadas por el servidor. En las apps nativas, el SDK de Supabase vive detrás de interfaces propias (`SessionStore`, CLI-7) | OBLIGATORIA para pantallas nuevas | Análisis de imports y llamadas por AST en `apps/*` (no por cadenas) |
| DES-2 | **El SDK de un proveedor** (`@supabase/*`, Twilio, FCM, Firebase, Inngest…) **solo se importa en `infra/`** de un módulo o en el servicio de infraestructura de cada app (`SessionStore`, `PushService`) | OBLIGATORIA para código nuevo | Lint de imports restringidos por carpeta (TS); regla de imports en revisión y lint (Swift, Kotlin) |
| DES-3 | **Las rutas de `apps/api` no tienen lógica**: cada archivo de ruta importa un handler de `packages/backend` y lo exporta con `toNextRoute`. El handler (TS-17) valida, llama a un caso de uso y responde; nunca consulta tablas ni llama funciones de la base, ni directamente ni con un ayudante genérico | OBLIGATORIA para rutas nuevas o modificadas | Test de enlace de rutas: cada archivo de ruta solo importa un handler y el adaptador, con el mismo método y ruta que declara el handler; grafo de dependencias de los handlers |
| DES-4 | **Un módulo solo importa el `index.ts` de otro módulo** | OBLIGATORIA donde existan módulos | `dependency-cruiser` en CI |
| DES-5 | **Una regla de negocio vive en un solo sitio**, el que da la garantía que necesita: la **base** para la integridad (restricciones, transiciones permitidas, operaciones atómicas que necesitan bloqueo: dinero, stock, cupos); `domain/` en TypeScript para la política (precios, promociones, elegibilidad, reglas de asignación, notificaciones). Si un cliente necesita anticiparla, la pide a la API (`quote`, `config`) | GUÍA | Revisión |
| DES-6 | **El contrato es versionado y compatible hacia atrás** (API-3) | OBLIGATORIA | `oasdiff` en CI contra la rama base |
| DES-7 | **Cada tabla, función, trigger y vista tiene un módulo dueño**, registrado en `Docs/arquitectura/propiedad.md`. Un módulo no escribe tablas de otro; para leer, prefiere su interfaz | Registro: OBLIGATORIA desde ya. No escribir tablas ajenas: OBLIGATORIA cuando exista el módulo dueño | Consulta de catálogo: todo objeto nuevo aparece en el registro |
| DES-8 | **Ningún contenido comercial va en el binario de una app nativa** (banners, ofertas, textos de promoción, orden de las secciones de inicio): lo sirve la API. La ruta que lo sirva la fija el contrato; hoy no existe, porque el contrato difiere el agregador de inicio hasta que una medición lo justifique (contrato §5) | OBLIGATORIA para nativo | Test: la pantalla de inicio se arma solo desde un fixture de la respuesta de la API |
| DES-9 | **El servicio no depende del framework**: `packages/backend` no tiene `next` entre sus dependencias ni importa nada de Next.js; los handlers usan la API Fetch estándar (`Request`, `Response`). En `apps/api`, solo `src/next-adapter.ts` conoce la forma de Next.js (`NextRequest`, `NextResponse`, `cookies()`, `next/headers`, `next/cache`) | OBLIGATORIA | CI: `next` ausente del `package.json` de `packages/backend` + `dependency-cruiser` |
| DES-10 | **Todo evento del outbox tiene esquema en `packages/contracts`** y se versiona como la API: se añaden campos opcionales; un cambio incompatible es un tipo de evento nuevo | OBLIGATORIA para eventos nuevos | Test de contrato del consumidor |
| DES-11 | **Solo el desplegable de la API importa `packages/backend`** (hoy, `apps/api`). Las apps cliente, web y nativas, nunca lo importan: hablan con la API por HTTP (DES-1) | OBLIGATORIA | `dependency-cruiser` |

## 2. API REST

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| API-1 | Las rutas nuevas siguen la forma del contrato: **por actor** (`/api/v1/<actor>/…`, por ejemplo `/api/v1/customer/…`), en inglés y con las convenciones de estilo que fije el contrato. Una ruta por actor deja la autorización de cada audiencia en un solo sitio | OBLIGATORIA para rutas nuevas | Spectral sobre el OpenAPI (`.spectral.yaml`), ajustado al estilo del contrato |
| API-2 | Entrada **y salida** con esquema Zod en `packages/contracts`; el OpenAPI (`packages/contracts/openapi/v1.json`) se genera de ellos y se versiona en el repo | OBLIGATORIA para rutas nuevas | CI: ruta sin documentar = fallo; el OpenAPI regenerado no difiere del versionado |
| API-3 | Solo cambios compatibles en `v1`: añadir rutas y campos **opcionales**. Quitar, renombrar, cambiar tipos o volver obligatorio un campo es incompatible. Añadir un valor a un enum de respuesta solo es compatible si todas las versiones soportadas de las apps cumplen CLI-2; se revisa la UI de reserva | OBLIGATORIA | `oasdiff` + revisión semántica |
| API-4 | Éxito `{ "data": … }`; listas paginadas con cursor opaco y límite (`{ "data": { "items", "nextCursor" } }`, como las rutas de historial del cliente); `204` sin cuerpo cuando no hay nada que devolver. Las rutas heredadas conservan su forma (`raw()`, `204`) y se documentan como están (contrato §1) | OBLIGATORIA para rutas nuevas | Spectral |
| API-5 | Errores RFC 9457 (`application/problem+json`) con **`code` estable**; el cliente decide por `code`, nunca por `detail`. **Los códigos y sus status son los del contrato** (por ejemplo, `validation_error` con `422`), reflejados en `packages/contracts/src/errors.ts`; un código nuevo se añade primero al contrato | OBLIGATORIA para rutas nuevas | Test por `code` |
| API-6 | `Idempotency-Key` en los `POST` que crean algo con efecto durable relevante (pedidos, pagos, canjes, comprobantes), aislada por usuario y ligada al recurso creado. Repetir la clave devuelve la misma respuesta; los conflictos responden con el código del contrato (`idempotency_conflict`) | OBLIGATORIA para esas rutas | Test de integración con concurrencia (TST-2) |
| API-7 | La autorización del recurso se comprueba en el caso de uso o en la función de la base; un *claim* orienta, no autoriza; las lecturas privadas también verifican permisos | OBLIGATORIA | Test de acceso ajeno por ruta |
| API-8 | Campos **nuevos**: dinero como cadena decimal + moneda, con la forma exacta de la decisión D-39; fechas ISO 8601 en UTC con `Z`; enums en inglés y `snake_case`; identificadores como cadena (UUID) | OBLIGATORIA para campos nuevos | Spectral (formatos) + revisión |
| API-9 | Límites de entrada: tamaño del cuerpo **antes de leerlo entero**, longitud de textos, tamaño y tipo de archivo **antes de cargarlo** (en el bucket y en la URL firmada), con los valores de la configuración de la API. Zod valida la forma, no basta para el tamaño | OBLIGATORIA para rutas nuevas | Test |
| API-10 | **Límites de uso** por teléfono, IP y dispositivo en OTP, creación de pedidos y canjes; al superarlos, `429 rate_limited` con `Retry-After`, como hace hoy `apps/api/lib/http/rate-limit.ts`. Si el OTP va de la app directo a Supabase Auth, el límite se configura en Supabase Auth y se documenta en `Docs/operacion/` | OBLIGATORIA para esas rutas | Test + configuración registrada |
| API-11 | **Retirar algo se anuncia** antes de quitarlo y se contrae solo con el tráfico por versión (MIG-3). Para anunciarlo en la respuesta se propone `Deprecation` (RFC 9745) y `Sunset` (RFC 8594), que se incorporan al contrato antes de usarse | GUÍA hasta que el contrato lo recoja | Test de cabeceras |
| API-12 | **El servidor verifica el token** (`Authorization: Bearer`) en cada petición autenticada y rechaza los vencidos, ajenos o mal firmados; la identidad sale siempre del token verificado y **nunca de un campo del cuerpo**. Cómo se verifica (localmente con el JWKS del proyecto, o con `getUser`, que es lo que hace `apps/api/lib/http/auth.ts` hoy) es una decisión abierta: el contrato REST (paso 4) manda medir antes de decidir | OBLIGATORIA | Test con token vencido, ajeno y mal firmado; la identidad no viene del cuerpo |

## 3. Clientes nativos

Reglas comunes a iOS y Android. Lo propio de cada plataforma está en `swift.md` y `kotlin.md`.

| ID | Regla | Nivel | Verificación |
|---|---|---|---|
| CLI-1 | **El cliente HTTP se genera** desde `packages/contracts/openapi/v1.json`, copiado a cada app por `scripts/sync-openapi.sh`; sin DTOs escritos a mano | OBLIGATORIA | CI: `scripts/sync-openapi.sh --check` y compilación (Kotlin en cada PR; Swift a diario, D-48) |
| CLI-2 | **Lector tolerante**: se ignoran los campos desconocidos; un valor de enum desconocido decodifica a un caso `unknown` y la UI muestra una reserva; un `code` de error desconocido muestra un mensaje genérico. Decodificar nunca tumba la app | OBLIGATORIA | Test con los fixtures de `packages/contracts/fixtures/forward-compat/` (por crear: un campo nuevo y un valor de enum nuevo) |
| CLI-3 | Cada petición envía las cabeceras de cliente del contrato (`x-tindivo-platform`, `x-tindivo-app`, `x-tindivo-app-version`, `x-tindivo-build`). La API las registra por ruta: de ese registro sale el tráfico por versión que exigen MIG-3 y CLI-15 | OBLIGATORIA | Consulta de tráfico por ruta y versión |
| CLI-4 | **Actualización obligatoria y configuración remota según el contrato**: ante `426 client_upgrade_required` (con la cabecera `x-tindivo-min-version`), la app muestra la pantalla de actualización con enlace a la tienda; al abrir y al volver a primer plano lee `GET /api/v1/config` (versiones mínimas por app y plataforma, *flags* y *kill switches* con la forma del contrato) | OBLIGATORIA antes de publicar | Test + ensayo con un `426` forzado en el entorno de pruebas |
| CLI-5 | **Dinero**: `Decimal` (Swift) o `BigDecimal` (Kotlin), parseado desde la cadena de la API; nunca `Double` ni `Float`; formato de moneda con la configuración regional `es-PE` | OBLIGATORIA | Lint + test |
| CLI-6 | La `Idempotency-Key` se genera al iniciar la intención (al pulsar «Confirmar pedido»), se guarda en disco con el carrito y se reutiliza en cada reintento hasta una respuesta definitiva (2xx o 4xx); después se descarta | OBLIGATORIA | Test: cerrar la app entre el envío y la respuesta, reintentar y comprobar un solo pedido |
| CLI-7 | La sesión vive detrás de una interfaz propia (`SessionStore`); el SDK de Supabase Auth solo dentro de su implementación; tokens en Keychain (iOS) o cifrados con clave del Android Keystore (Android); el refresco del token es transparente y único: dos peticiones simultáneas no disparan dos refrescos | OBLIGATORIA | Regla de imports + test de refresco concurrente |
| CLI-8 | Los **payloads de push y los deep links** tienen esquema en `packages/contracts` y se versionan como la API (API-3). Si el contrato ya los define, manda su forma; si no, se añaden al contrato (hoy no hay esquema de deep links) | OBLIGATORIA | Diff en CI + test de decodificación |
| CLI-9 | **Notificaciones transaccionales y promocionales con consentimientos separados.** El promocional se pide con un texto propio y explícito (guía 4.5.4 de Apple), se guarda en el servidor con fecha, plataforma y versión del texto, y se revoca desde la app. En Android, canales `orders` y `offers`. El servidor no envía una promoción sin consentimiento promocional vigente | OBLIGATORIA antes de enviar la primera promoción a una app nativa | Test: una promoción a un usuario sin consentimiento no se envía y queda registrada como omitida |
| CLI-10 | **Red**: 10 s para conectar y 30 s por petición; reintentos automáticos solo en `GET` y en `POST` con `Idempotency-Key`, ante error de red, `5xx` o `429`, como mucho 2, con espera exponencial y aleatoria (base 0,5 s) y respetando `Retry-After`; nunca ante otro `4xx`. Sin conexión, la app lo muestra y no pierde el carrito | OBLIGATORIA | Test con transporte simulado |
| CLI-11 | **Permisos en contexto**, nunca al abrir la app por primera vez: notificaciones, después de confirmar el primer pedido; ubicación, solo al elegir una dirección en el mapa, si se usa. Antes del diálogo del sistema, una pantalla propia explica para qué sirve | OBLIGATORIA | Test de UI + revisión |
| CLI-12 | Errores y *crashes* se reportan a la herramienta elegida (DA-08) con la versión y el identificador de petición que use el contrato, **sin datos personales** (nombre, teléfono, dirección, coordenadas exactas, tokens) | OBLIGATORIA antes de publicar | Revisión de un evento de prueba en crudo |
| CLI-13 | Todo texto visible sale del catálogo de cadenas de la plataforma, en español de Perú; tamaño de letra dinámico soportado; objetivos táctiles de al menos 44 pt (iOS) y 48 dp (Android); toda imagen con significado lleva descripción accesible | OBLIGATORIA | Lint de cadenas literales + revisión con letra grande |
| CLI-14 | Toda publicación a producción pasa antes por pruebas internas (TestFlight o la pista interna de Google Play) y sale con liberación gradual (App Store) o despliegue escalonado (Google Play); se pausa si suben los *crashes* | OBLIGATORIA | Registro en `Docs/operacion/publicar-apps-nativas.md` (por crear) |
| CLI-15 | El backend soporta toda versión publicada que no reciba `426`. Subir la versión mínima es una decisión registrada en `Docs/trabajo/decisiones-abiertas.md`, con el tráfico por versión de los últimos 30 días (CLI-3) | OBLIGATORIA | Registro + consulta |

## 4. Migraciones

| ID | Regla | Nivel |
|---|---|---|
| MIG-1 | Solo por la CLI (`supabase db push`); nunca por el panel ni por MCP | OBLIGATORIA |
| MIG-2 | Idempotentes y con **estrategia de recuperación** escrita: un *rollback* SQL en `supabase/rollbacks/` cuando sirve, y cómo recuperar los datos cuando un *rollback* no los devuelve | OBLIGATORIA |
| MIG-3 | **Expandir y después contraer**: lo viejo se quita en otra migración, cuando ningún cliente lo usa, comprobado con el tráfico por versión (CLI-3) y la versión mínima vigente (CLI-4) | OBLIGATORIA |
| MIG-4 | `supabase migration list` antes de numerar | OBLIGATORIA |
| MIG-5 | La CI reconstruye la base desde cero y corre la integración | OBLIGATORIA (cuando exista) |
| MIG-6 | Una migración aplicada en producción no se edita: se corrige con otra | OBLIGATORIA |

## 5. Pruebas

| ID | Regla | Nivel |
|---|---|---|
| TST-1 | `domain/`: unitarias; rutas y funciones de la base: integración contra base aislada; dobles en `application/` solo donde aporten (no en cada caso de uso) | OBLIGATORIA para código nuevo |
| TST-2 | Donde haya riesgo de carrera o de fallo parcial (dinero, estado, cupos, idempotencia), se prueba con concurrencia y con fallo a mitad; no se exige para cambios triviales | OBLIGATORIA donde aplica |
| TST-3 | La integración corre en CI y no se cachea por error | OBLIGATORIA |
| TST-4 | Un *bug* arreglado deja un test que lo reproduce | OBLIGATORIA |
| TST-5 | **Contrato compartido**: las apps nativas decodifican los fixtures de `packages/contracts/fixtures/` (por crear), incluidos los de compatibilidad futura (CLI-2); la API valida sus respuestas contra los mismos esquemas en sus tests | OBLIGATORIA |
| TST-6 | El flujo crítico de compra de la app de clientes, como lo defina el plan móvil, tiene una prueba de UI por plataforma contra una API simulada | OBLIGATORIA antes de publicar |

## 6. Operación

| ID | Regla | Nivel |
|---|---|---|
| OPS-1 | **Copias de seguridad y restauración ensayada**: se restaura en una base aparte al menos una vez por trimestre y se anota cuánto tardó | OBLIGATORIA |
| OPS-2 | **Retención de datos personales** con purga automática: GPS, comprobantes, teléfonos, tokens de dispositivo y bitácoras (Ley 29733; lo legal lo revisa Jesús) | OBLIGATORIA |
| OPS-3 | **Secretos** en variables de entorno o en un gestor (incluido el Vault de Supabase); nunca en el repo, en tablas en texto plano ni en el binario de una app. Incluye las claves de firma (clave de subida de Android, certificados de Apple, clave de APNs), con respaldo fuera del repo; rotación documentada | OBLIGATORIA |
| OPS-4 | **Observabilidad**: errores con rastreador, incluidos los *crashes* de las apps nativas; latencia y tasa de errores por ruta; antigüedad del outbox; envíos push fallidos por plataforma | OBLIGATORIA antes del lanzamiento nativo |
| OPS-5 | **Alertas accionables**: pocas y con qué hacer (por ejemplo, «el outbox tiene eventos de más de 5 minutos») | OBLIGATORIA antes del lanzamiento nativo |
| OPS-6 | **Vuelta atrás.** Web y API: volver a la versión anterior con un procedimiento ensayado. Migraciones: MIG-2. Apps nativas: **no se revierten**; el backend sostiene las versiones soportadas (CLI-15), hay *kill switches* en el servidor (CLI-4), liberación gradual (CLI-14) y versión mínima para forzar la actualización. Los despliegues delicados, fuera de 18:00–23:00, salvo un incidente, que se documenta | OBLIGATORIA |
| OPS-7 | **Permisos mínimos**: cada proceso con el rol justo; `service_role` solo en procesos de servidor autorizados (la API y la función de push hoy), inventariados | OBLIGATORIA |
| OPS-8 | **Presupuesto operativo**: coste mensual por proveedor revisado y con aviso de consumo, incluidos los SMS de OTP | GUÍA |
| OPS-9 | **Incidentes de seguridad**: procedimiento en `Docs/operacion/incidentes.md` (por crear): quién detecta, contiene y notifica, y en qué plazo; lo legal lo revisa Jesús | OBLIGATORIA antes del lanzamiento nativo |
| OPS-10 | **Cuentas de las tiendas y de Firebase** (App Store Connect, Google Play Console) con doble factor y códigos de recuperación guardados fuera del teléfono | OBLIGATORIA antes de publicar |

## 7. Lista de revisión (cada cambio)

1. ¿Añade o quita acoplamiento? (DES)
2. ¿La regla está en un solo sitio, el que da la garantía que necesita? (DES-5)
3. ¿El contrato está en Zod, en el OpenAPI y es compatible? (API-2, API-3)
4. ¿Rompe una app instalada? (API-3, CLI-2, MIG-3)
5. ¿La base protege la invariante, o solo el código que hoy la llama?
6. ¿Hay tests del caso feliz, del acceso ajeno y del fallo a mitad?
7. ¿Se puede volver atrás? En una app nativa, ¿hay *kill switch*? (OPS-6)
8. ¿El PR declara su impacto documental? (`Docs/README.md` §5)

## 8. Mecanismos

Cada OBLIGATORIA con su mecanismo. «Pendiente» significa que, hasta montarlo, el PR aporta evidencia.

| Mecanismo | Reglas | Estado |
|---|---|---|
| Análisis de imports y llamadas por AST en `apps/*` | DES-1 | Pendiente |
| Test de enlace de rutas: cada `apps/api/app/api/v1/**/route.ts` enlaza un handler con el mismo método y ruta, y no hay handlers sin ruta | DES-3, TS-17 | Pendiente |
| Lint de imports restringidos por carpeta | DES-2, TS-13 | Pendiente (sin verificar si ya existe en la configuración de lint) |
| `dependency-cruiser`, más la comprobación de que `next` no está en el `package.json` de `packages/backend` | DES-4, DES-9, DES-11, TS-14 | Pendiente |
| `oasdiff breaking` contra la rama base, versión fijada (job `contract` de `.github/workflows/ci.yml`) | DES-6, API-3 | Montado |
| `spectral lint packages/contracts/openapi/v1.json --ruleset .spectral.yaml` | API-1, API-4, API-5, API-8 | Montado (Spectral 6 fijado, job `contract`); lo heredado que no cumple está en `excepciones.md` |
| Regenerar el OpenAPI y comparar con el versionado | API-2 | Pendiente |
| `scripts/sync-openapi.sh --check` (job `contract`) | CLI-1 | Montado, sin efecto todavía: el script omite las apps que aún no existen (`apps/customer-ios`, `apps/customer-android`) |
| Contador de filas de `excepciones.md` que no puede subir, contra la rama base (`scripts/check-excepciones.sh`, job `contract`) | Excepciones | Montado |
| Lint con información de tipos | TS-2, TS-7, TS-10 | Pendiente |
| SwiftLint en CI (runner macOS, a diario, D-48) | SW-6, SW-14 | Pendiente |
| ktlint, detekt y Android Lint en CI | KT-6, KT-14 | Pendiente |
| Consultas de catálogo en CI (con MIG-5) | DB-2, DB-3, DB-7, DB-15 | Pendiente |
| Integración en CI (job `api-integration`) | DB-6, TST-3 | Montado |
| pgTAP (`supabase test db`), si se adopta | DB-6 | Pendiente (el repo no tiene `supabase/tests`) |
