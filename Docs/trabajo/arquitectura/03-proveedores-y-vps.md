# 03 · ¿Dependemos siempre de Supabase y Vercel? ¿Funcionaría en mi VPS?

> Medido el 2026-10-08 en el repo y en `tindivo-prod` (solo lectura).

## Respuesta corta

- **Vercel: dependencia baja.** La API y los cuatro frontends son Next.js sobre Node. En un VPS se construyen y se
  arrancan con `next build` + `next start` y funcionan igual. Lo único atado al modelo *serverless* es el PDF de
  rendimiento (`@sparticuz/chromium`), que en un servidor propio se cambia por un Chromium normal.
- **Supabase: dependencia alta, pero no por la base.** La base es **Postgres 17 estándar** y sus extensiones son
  casi todas de Postgres. Lo que ata es todo lo que rodea a la base: **el cliente de Supabase como capa de datos (480
  llamadas `.from()`/`.rpc()` en código de producción)**, el login, Storage, Realtime y la Edge Function de push.
- **Notificaciones:** Supabase **no envía push**. Hoy lo hace una función propia (Web Push con claves VAPID) que la
  base llama por HTTP. Para Android e iOS hay que usar **FCM y APNs** (de Google y Apple, sin coste por envío; APNs requiere la cuenta
  de Apple Developer) en cualquier caso,
  estés en Supabase o no.

## Inventario: qué usamos, de quién, y qué costaría cambiarlo

| Capacidad | Hoy | Cuánto se usa (medido) | Alternativa portable | Esfuerzo de salida |
|---|---|---|---|---|
| **Base de datos** | Supabase (Postgres 17, Oregón) | 52 tablas, 127 funciones, 99 políticas RLS | Cualquier Postgres 17: RDS, Neon, Postgres propio en el VPS | **Medio**. El SQL es estándar; `auth.uid()` y los roles `anon`/`authenticated` se pueden recrear, porque `auth.uid()` solo lee el usuario del token |
| **Acceso a datos desde código** | `supabase-js` → PostgREST por HTTPS; en la API, 85 rutas crean el cliente `service_role` y 6 usan el token del usuario | Producción: API 228 `.from()` + 72 `.rpc()`; frontends 169 + 11 (los tests de integración también lo usan) | Repositorios con un driver de Postgres (`postgres`/`pg`) o Kysely | **Alto mientras esté repartido**; bajo si antes se mete detrás de repositorios (ver `05-estandares.md`) |
| **Login** | Supabase Auth (GoTrue): Google, correo, JWT ES256 | 127 usos de `.auth.` | GoTrue propio (es *open source*), Keycloak, Better Auth… | **Alto**: hay que migrar usuarios y sesiones. **Recomendación: quedarse**, y aislarlo para que solo dos sitios lo conozcan |
| **Archivos** | Supabase Storage (6 buckets) | 12 usos en código, 3 políticas en `storage.objects` | S3, Cloudflare R2, MinIO en el VPS | **Bajo** si va detrás de una interfaz `FileStorage` |
| **Tiempo real** | Supabase Realtime (`postgres_changes` y *broadcast*) | 14 canales en código, 4 migraciones | WebSocket o SSE propios, o push + recargar | **Medio**. En nativo ya se acordó usarlo solo como aviso |
| **Tareas programadas** | `pg_cron` (12 jobs) + Inngest (8 funciones, una con cron cada 5 min) | — | `pg_cron` existe en cualquier Postgres; o una cola en Postgres (`pg-boss`, Graphile Worker) | **Bajo-medio**, y es una mejora: hoy los temporizadores están en dos sitios |
| **HTTP desde la base** | `pg_net` | 1 función viva (`dispatch_event` → Edge Function) | Un *worker* que lea el outbox | **Bajo**, y también es una mejora |
| **Push** | Edge Function `send-push` (Deno, 1 259 líneas, Web Push/VAPID) | Única vía de avisos | Módulo de notificaciones en Node + **FCM/APNs** para nativo + Web Push para la web | **Medio**. Hay que hacerlo igual para las apps |
| **Secretos en la base** | `supabase_vault` | — | Variables de entorno del *worker* | Bajo |
| **Hosting de las 5 apps** | Vercel (funciones en `iad1`) | `@vercel/analytics` en el customer; nada en `vercel.json` | VPS con Node 22, Docker, Caddy o Nginx | **Bajo** |
| **Temporizadores de pedido** | Inngest (SaaS) | 8 funciones | Inngest autoalojado o cola en Postgres | Medio |
| **SMS / OTP** | Twilio | 1 ruta | Cualquier proveedor detrás de una interfaz | Bajo |
| **Rate limiting** | Upstash (instalado, **sin usar**) | 0 | Redis propio | Nulo |

## ¿Qué pasa si mañana lo subo a mi VPS?

**Las apps (Vercel → VPS): pueden funcionar igual, pero hay que probarlo**, no darlo por hecho. Cuidados:

1. Construir cada app con `next build` y servirla con `next start`, o mejor con `output: 'standalone'` dentro de
   Docker. Las cinco detrás de Caddy, que da HTTPS automático por subdominio.
2. El PDF: cambiar `@sparticuz/chromium` por Chromium instalado en la imagen.
3. Probar lo que en Vercel viene dado: caché de páginas (`revalidate`), imágenes optimizadas, el *proxy*, el reinicio
   de procesos, el cierre ordenado y la recuperación tras una caída. Usar la misma versión de Node que la CI.
4. Lo que **pierdes** respecto a Vercel: CDN global, escalado automático, *previews* por rama y cero mantenimiento.
   Lo que **asumes**: actualizaciones del sistema, monitoreo, reinicios y certificados.
5. Lo que **ganas**: la función junto a la base, si el VPS está en la misma región, y un coste fijo.

**La base (Supabase → Postgres propio): posible, pero no conviene todavía.** Supabase es Postgres más seis servicios
(Auth, PostgREST, Storage, Realtime, Edge Functions, panel). Autoalojar todo eso con `docker compose` es posible y
*open source*, pero para un desarrollador solo significa operar copias de seguridad, actualizaciones y seguridad de
siete servicios con dinero real dentro. Según el análisis de septiembre (por reverificar en el panel), el plan gratuito no incluye copias de seguridad
(`../movil/02-auditoria-backend/06-proceso-calidad-y-operacion.md`, `PRO-06`).

## Mi opinión: diseñar para poder irte, no irte

La independencia de un proveedor no se consigue mudándose: se consigue **teniendo las dependencias en pocos sitios
y detrás de interfaces**. Es decir, **desacoplando**. Así, el día que convenga cambiar algo (precio, región, escala), se cambia una
implementación y no 480 llamadas. Ojo: eso da portabilidad entre proveedores de Postgres, no independencia de
Postgres, porque el dominio seguirá en PL/pgSQL. En concreto:

| Regla | Efecto |
|---|---|
| El código de negocio no importa `@supabase/*`. Solo lo hacen los **adaptadores** (repositorios, `FileStorage`, `AuthVerifier`, `RealtimePublisher`) | Cambiar de proveedor = cambiar un adaptador |
| La API accede a la base **detrás de funciones de acceso del módulo**; dentro, hoy `supabase-js`. Un driver de Postgres se **ensaya** solo donde resuelva una transacción o una latencia medida, y sin ampliar privilegios: una conexión SQL no lleva la identidad del usuario, el token sí | El día que convenga cambiar el acceso, se cambia dentro del módulo |
| Los temporizadores y el push convergen en **una entrega durable común** con consumidores idempotentes | Inngest, `pg_net` y la Edge Function **se mantienen hasta demostrar** el reemplazo y su recuperación; dónde corre el consumidor (periódico o persistente) se decide y se prueba |
| Los frontends y las apps nativas solo hablan con la API (ya acordado) | Supabase deja de ser una dependencia de los clientes |
| Cada app con su `Dockerfile` desde ya, aunque siga en Vercel | El VPS deja de ser un proyecto y pasa a ser un despliegue más |

**Lo que no recomiendo:** cambiar de proveedor ahora. Supabase y Vercel te dan, por poco dinero, operación que un
desarrollador solo no puede igualar. Lo que sí: subir a planes de pago antes del lanzamiento público (copias de
seguridad y uso comercial, `D-37`) y aplicar las reglas de arriba **a medida que se toca cada pieza**.
