# Conclusión común · Backend REST para las apps nativas y squash de migraciones

> Debate Claude + Codex, 2026-10-07/08, sobre `develop` en `0306918` y `tindivo-prod` en la migración 0247. Tres
> rondas, y una consulta de solo lectura a la base viva para cerrar lo que el código no mostraba. **Esta conclusión
> manda sobre [`../06-contrato-rest-movil.md`](../06-contrato-rest-movil.md)** donde discrepen.

## En cinco líneas

1. **La API REST (`/api/v1`) es el contrato del dominio de las apps nativas.** No se crea una API móvil aparte ni se
   reescribe el dominio en SQL: las RPC siguen siendo la autoridad.
2. **Antes que nada, corregir la carrera del comprobante y la recuperación idempotente, y acordar límites del bucket de
   comprobantes.** Son riesgos presentes en producción. No hay incidente observado de resurrección; para los demás
   hallazgos no se ha acreditado que no haya habido incidentes.
3. **La compatibilidad (versión de app, `/config`, cliente obsoleto) va antes del primer build distribuido**, aunque
   sea a pruebas internas.
4. **Las optimizaciones (JWT local, región) se miden antes de decidirse.** No son requisito para construir las rutas.
5. **Squash de migraciones: todavía no.** Primero, una foto legible del estado actual y una CI que reconstruya la base.
   El squash se decide con un ensayo delante.

## 1. La arquitectura acordada

| Pieza | Frontera |
|---|---|
| **Datos y acciones del negocio** (catálogo, cotización, pedidos, Entregas, Store, perfil, direcciones, reseñas) | **Solo REST.** Las apps no leen ni escriben tablas ni RPC de Supabase |
| **Sesión** | SDK de Supabase Auth (Google, Apple, renovación). El token viaja como `Authorization: Bearer` |
| **Tiempo real** | Push nativo como canal principal; Realtime solo como aviso de «algo cambió», y la app vuelve a pedir por REST. Recuperación al reconectar y al volver al primer plano |
| **Archivos** (comprobante) | Carga autorizada por el servidor; el servidor comprueba propiedad, tipo, tamaño y asociación al pedido, y el archivo **no puede cambiar** una vez registrado |
| **Autorización** | La de verdad se comprueba **dentro de la operación** (rol vigente y propiedad o asignación del recurso). Un *claim* del token orienta, no autoriza. **Las lecturas privadas también verifican permisos efectivos.** Recibir `p_actor_user_id` no prueba autorización: cada RPC debe validarla |
| **Respuestas** | Rutas nuevas con `{ data }`; las rutas vigentes conservan su forma (`raw()`, `204`) y se documentan tal cual en OpenAPI. Errores RFC 9457 con **códigos de razón estables añadidos**, sin retirar los vigentes |

**Ajuste al análisis del 2026-09-20 (`04-decisiones-abiertas.md` §3.1, opción C mixta):** queda sustituido. Mantener
vistas o RPC públicas **además** de REST no garantiza ahorrar mantenimiento, y aquí recomendamos una sola superficie del
dominio; y direcciones, catálogo y nulabilidad también
rompen una app instalada, no solo dinero y estados. Negocios Android necesita las mismas garantías de compatibilidad
que Customer, aunque su documentación pueda ser más corta.

## 2. Lo que encontramos y está confirmado

| # | Hallazgo | Evidencia | Estado |
|---|---|---|---|
| H-1 | **El comprobante puede devolver a `validando` un pedido recién cancelado.** La ruta lee `awaiting_payment` y después actualiza solo por `id`, sin repetir el estado ni comprobar errores; el cron `auto-cancel-prepay-timeout` llama a `cancel_expired_prepay_orders` cada minuto (`* * * * *`, `cron.job` en prod) | `apps/api/app/api/v1/customer/orders/[id]/prepay-proof/route.ts:32-65`; los 10 triggers vivos de `orders` no validan transiciones (consulta de Claude a `pg_trigger` en prod) | **Carrera confirmada, sin incidente observado** (0 pedidos con `cancelled_at` fuera de `cancelled`). No se sabe su frecuencia |
| H-2 | **El evento del comprobante no pasa por el outbox.** La ruta no lo inserta y avisa por Inngest *best-effort*; ningún trigger cubre ese evento: `handle_orders_outbox_events` sí escribe en `outbox_events`, pero solo la cancelación por `proof_rejected_final` | Definición viva de `handle_orders_outbox_events` y `pg_proc` (consulta de Claude en prod); `apps/api/app/api/v1/customer/orders/[id]/prepay-proof/route.ts:56-73` | Confirmado |
| H-3 | **La idempotencia no es atómica con el pedido.** Si la función cae tras crear el pedido, la clave queda `reserved` hasta la purga diaria posterior a sus 24 h; mientras tanto, los reintentos reciben 409, y **tras la purga un reintento podría crear otro pedido** | `apps/api/lib/http/idempotency.ts:45-85`; cron `prune-idempotency-keys` en prod | Confirmado |
| H-4 | **La reproducción de un pedido ya creado va después de guards cambiantes** (teléfono, tope de contraentrega) y **no filtra por usuario**; la clave primaria es `(key, scope)` | `apps/api/app/api/v1/customer/orders/route.ts:45-183`; `supabase/migrations/0002_tables.sql:617-627` | Confirmado |
| H-5 | **`payment-proofs` sin límite de tamaño ni de tipo**, y los comprobantes se pueden sobrescribir | `storage.buckets` en prod (consulta de Claude); `supabase/migrations/0060_storage_proofs_update_policy.sql:5-14` | Confirmado |
| H-6 | **El customer depende de Supabase directo**: 65 llamadas, 16 de ellas escrituras (direcciones, perfil, términos, reseñas), y guardar una dirección predeterminada son dos escrituras no atómicas | Recuento y clasificación de Claude sobre el grep de `apps/customer`; `apps/customer/lib/address-save.ts:73-111` | Confirmado |
| H-7 | **El checkout calcula dinero y elegibilidad en React**, y la ruta de crear pedido recalcula subtotal y envío en TypeScript, aparte de la RPC | `apps/customer/features/checkout/hooks/use-checkout-state.ts:332-599`; `apps/api/app/api/v1/customer/orders/route.ts:115-175` | Confirmado |
| H-8 | **Errores sin razón estable**: códigos genéricos y clasificación por regex sobre el mensaje; Entregas tiene prefijos estables y la API los pierde | `apps/api/lib/http/rpc-error.ts:8-51`; `apps/api/app/api/v1/customer/courier-orders/route.ts:19-35` | Confirmado |
| H-9 | **Sin OpenAPI, sin versión de cliente, sin `/config`; CI no corre integración ni reconstruye la base** | Inventario de rutas; `.github/workflows/ci.yml:52-99` | Confirmado |
| H-10 | **Base en Oregón (`us-west-2`), función en Virginia (`iad1`)**; `/health` midió 0,48-0,93 s desde Perú en seis peticiones (dos tandas: 0,61-0,93 y 0,48-0,84) | `pooler-url` de la CLI; cabecera `x-vercel-id` | Acreditado; **el efecto de moverla no está medido** |

## 3. El orden de trabajo

Cada paso deja producción funcionando, es compatible hacia atrás y los despliegues delicados van **fuera de
18:00-23:00**. Ningún paso se da por hecho sin sus pruebas.

| Paso | Qué | «Hecho» cuando… | Riesgo para prod |
|---|---|---|---|
| **0 · Corrección** | **(a)** Parche del comprobante: `UPDATE` condicionado por dueño, estado, intención e intento leído; comprobar error y filas afectadas; 409 y sin avisos si no cambia nada. **(b)** RPC transaccional del comprobante: bloqueo de fila, objeto existente y del pedido, evento al outbox en la misma transacción, archivo inmutable tras registrarlo, ruta por pedido e intento compatible con los existentes, reconfirmar el mismo archivo sin gastar intento. **(c)** Idempotencia: reproducción antes de los guards, aislada por usuario (en el *replay* y en el *wrapper*), y recuperación ligada al pedido creado (la clave guardada con el pedido, dentro de la RPC). **(d)** Límites de tamaño y tipo del bucket de comprobantes, **tras acordar formatos y probar archivos reales** | Pruebas de concurrencia con el vencimiento del plazo, de repetición de la misma confirmación y de fallo de escritura sin respuesta de éxito; se rechaza sobrescribir un archivo registrado. En idempotencia, las pruebas cubren restaurantes y Entregas, claves ajenas, payload distinto, fallo después del *commit* y antes de guardar la respuesta, purga y recuperación: repetir una creación confirmada recupera el resultado sin duplicarla. La corrección define **unicidad y retención** de las claves; no basta filtrar el *replay* | Medio: cambios transaccionales, por eso se hacen aditivos y con pruebas |
| **1 · Inventario y contrato actual** | Flujos de Customer **y Negocios Android** (restaurantes, Entregas, Store) mapeados a su ruta y a su autoridad de negocio; OpenAPI del contrato **tal como es hoy**, con ejemplos; **integración automatizada en CI** contra una base aislada | El OpenAPI genera modelos que compilan en Swift y Kotlin, y CI corre la suite de integración | Nulo |
| **2 · Compatibilidad mínima** | Cabeceras de plataforma, app y build (CORS ampliado); `GET /config` siempre accesible; respuesta de cliente obsoleto **con mínimos independientes por app y plataforma**; clientes web sin cabeceras siguen funcionando; códigos de razón estables añadidos | Pruebas automatizadas: mínimos independientes por app y plataforma, `/config` accesible sin sesión, versión vieja recibe el error documentado y las peticiones web sin cabeceras pasan | Bajo |
| **3 · Rutas que faltan** | `POST /customer/checkout/quote` (reutiliza los predicados SQL; crear pedido vuelve a validar; sin exponer señales antifraude; avisa si cambió antes de confirmar), perfil, direcciones atómicas, historial de pedidos y entregas, reseñas, lugares del mapa y directorio; tiempo del servidor para la disponibilidad de platos | Cada ruta con prueba de integración y en OpenAPI | Bajo: rutas nuevas |
| **2-3 · Recorrido nativo temprano** | Un recorrido pequeño en Swift y Kotlin: sesión y renovación, catálogo, cotización, pedido con pérdida de red, vuelta al primer plano | Funciona en un Android y un iPhone reales | Bajo (entorno aislado) |
| **4 · Auth y región** | Medir antes: TTL efectivo, renovación, cierre de sesión, revocación y bloqueo con una configuración igual a la de producción. Después decidir verificación local del JWT, dónde se mantiene `getUser` (incluidas las acciones de Negocios) y la región según el plan de Vercel | Decisión tomada con mediciones antes y después | Medio si se cambia auth; nulo mientras se mide |
| **5 · Avisos nativos** | Registro de dispositivos APNs/FCM y envío desde el outbox con reintentos, **manteniendo Web Push** | Probado el registro, la rotación del token, la baja y el cambio de usuario en el mismo aparato, y el reintento del envío; un pedido de prueba avisa en Android y en iPhone | Bajo |
| **6 · La PWA se muda** | El customer deja de leer y escribir Supabase directo, por partes | Ningún acceso directo al dominio; las excepciones autorizadas de Storage y Realtime están inventariadas; e2e verde. Un grep vacío no demuestra por sí solo equivalencia funcional | Medio: cambia la web en uso |
| **7 · Publicación** | Recorrido completo, borrado de cuenta, Sign in with Apple, textos legales | Requisitos vigentes de App Store y Google Play identificados uno por uno y verificados; no se declara cumplimiento genérico | Bajo |

**La operación real ayuda a validar el contrato (paso 6), pero no sustituye las pruebas** de los pasos 0-3.

## 4. Squash de migraciones

**El problema es real:** 246 migraciones, 54 073 líneas, 78 rollbacks. `create_customer_order` se redefine 36 veces y
`cancel_expired_prepay_orders` aparece en 13 ficheros (`grep -l` de Claude; coincide por casualidad con los 13 que usan `cron.schedule`): para saber cómo es hoy una función hay que encontrar su
última versión.

**Postura común: el squash no es la primera respuesta.** El objetivo real (que un agente lea el estado actual) lo
resuelve mejor una foto legible, sin tocar el historial ni producción.

1. **Foto del estado actual por objeto** (tablas, funciones, políticas, triggers, grants), con fecha y procedencia
   (prod frente a reconstrucción local) y un índice por dominio. Antes de añadir ficheros, revisar
   `schema_paths = ["./migrations"]` de `supabase/config.toml`, que la CLI podría leer.
2. **CI que reconstruya la base** desde migraciones (hoy no lo hace) y la compare con la foto. La comparación cubre
   también **cron, grants, Auth, Storage y Realtime**, no solo `public`, con exclusiones explícitas para las
   diferencias legítimas de entorno. Una diferencia sin explicar es un hallazgo.
3. **Inventario de datos** que separe datos iniciales, valores operativos y datos personales, e indique para cada
   uno si exige **presencia**, **valor exacto** o **validación semántica**. Comparar solo claves de `app_settings`
   no basta.
4. **Solo entonces, un ensayo de compactación en una rama**, con la versión de la CLI fijada: base nueva desde la
   línea base frente a base reconstruida desde el historial, actualización de una base existente y reconciliación
   del historial ensayada. **La línea base nunca se ejecuta sobre producción**, y el historial, los rollbacks y la
   correspondencia de versiones se conservan en git (hay 764 coincidencias de números con formato de migración en archivos TypeScript/TSX, muchas de ellas comentarios que explican el porqué).
5. **Jesús decide** si compactar, con el ensayo delante.

Mientras tanto, se corrige la documentación contradictoria: `supabase/config.toml:2` dice que las migraciones se
aplican por MCP y `CLAUDE.md` exige la CLI (manda la CLI).

## 5. Lo que NO afirmamos y NO hacemos

- No hay una «latencia mínima universal» medida, ni está probado que mover la región sea gratis o cuánto ahorra.
- No está probado que `getUser` detecte al instante una sesión revocada.
- La carrera del comprobante **no ha causado un incidente observado**. Es un defecto confirmado, no un incidente.
- No hay una receta definitiva de `migration repair`.
- No se crea `/api/mobile/v1` ni `/api/v2` para cambios aditivos, no se reescribe el dominio, no se mete un ORM, no se
  retiran de golpe los accesos de la PWA y no se construye un agregador de home sin medición.

## 6. Lo que decide Jesús

| # | Decisión | Lo que recomendamos |
|---|---|---|
| D-21 | Superficie de las apps | **REST como contrato del dominio** con las fronteras del §1 (sustituye a la opción C) |
| D-38 | La PWA se muda al mismo contrato | Sí, gradualmente (paso 6) |
| D-39 | Representación del dinero en campos **nuevos** | Decimal como cadena (`"12.50"`) con moneda explícita; los campos existentes no cambian de tipo en silencio |
| D-40 | Formatos y tamaño máximo de los comprobantes | Por acordar tras revisar el flujo actual y probar archivos reales (fotos de Yape/Plin, capturas). **Decidido el 2026-10-09 (Jesús lo delegó en Claude):** JPEG, PNG, WebP y HEIC/HEIF, 15 MB, el mismo tope que la app ya aplica (`MAX_INPUT_BYTES`); en prod, el más pesado de 56 comprobantes mide 1,4 MB |
| D-41 | Política de versiones | Mínimos independientes para Negocios Android, Customer Android y Customer iOS |
| D-42 | Squash | Decidir tras el ensayo del §4 |
| D-43 | Empezar el paso 0 | Aprobar el arranque. Precondición operativa, no decisión: un entorno aislado disponible para pruebas (Supabase local encendido) |

## 7. Cómo se llegó aquí

| Archivo | Qué es |
|---|---|
| [`01-claude.md`](01-claude.md) · [`../06-contrato-rest-movil.md`](../06-contrato-rest-movil.md) | Apertura de Claude, escrita sin leer a Codex |
| [`00-codex-apertura-sin-acceso.md`](00-codex-apertura-sin-acceso.md) | Primera apertura de Codex, sin acceso al repo: su sandbox de Windows rechazaba todos los comandos |
| [`01-codex.md`](01-codex.md) | Apertura de Codex con un paquete de evidencia cruda (código y salidas de comandos, sin la postura de Claude). Encontró H-1, H-3 y H-4 |
| [`02-claude.md`](02-claude.md) · [`02-codex.md`](02-codex.md) | Réplicas. Codex corrige «atascada para siempre» y detecta H-2 |
| [`03-claude.md`](03-claude.md) · [`03-codex.md`](03-codex.md) | Ronda con la base viva (solo lectura). Codex firma con cambios; sin desacuerdos de fondo |
| [`04-codex-auditoria.md`](04-codex-auditoria.md) | Auditoría de esta conclusión por Codex |
