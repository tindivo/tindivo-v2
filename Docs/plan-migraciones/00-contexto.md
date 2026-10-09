# 00 · Contexto del debate: mudar el hosting, después la base, y llegar a nativo sin romper nada

> 2026-10-08. Datos medidos por Claude en el repo (`develop`, `99d70a0` + `Docs/arquitectura/` sin commitear) y en
> `tindivo-prod` (solo lectura). Este fichero lo leen los dos participantes.

## Lo que pidió Jesús (textual, resumido sin cambiar el sentido)

> «Lo más cercano es que tendré que **migrar de servidor donde alojo esta web**; luego de eso tendré que hacer **más
> migraciones, tanto de DB y demás**. La idea es justamente que lo que son **notificaciones de las webs sea más
> fácil**. No sé si usa Server Components y hace llamadas directas en el frontend. El objetivo es que **el servicio sea
> independiente** y que lo pueda usar en las apps nativas. **Tengo temor de que luego no funcione como espero** al
> momento de la migración a las apps nativas; tiene que estar funcional con el frontend de las apps nativas.»

Antes había fijado la prioridad: **desacoplamiento**. No hay todavía destino de hosting decidido (ha hablado de un VPS
propio).

## Lo ya acordado (no se reabre)

- `Docs/customer_app_migration/debate-rest/conclusion.md`: REST `/api/v1` como contrato del dominio; Supabase para Auth
  y aviso Realtime; paso 0 de corrección (comprobante, idempotencia, bucket); compatibilidad antes del primer build;
  orden 0-7.
- `Docs/arquitectura/` (README, 01-05, `revision-codex.md`): monolito modular; desacoplar al tocar; estándares v2.1
  (propuesta sin aprobar); Hono, driver de Postgres y esquema por módulo son **ensayos**.

## Hechos medidos para este debate

### Qué hace cada app en el servidor

| App | Ficheros | Páginas | Páginas `"use client"` | Rutas de servidor | Sesión en servidor | Datos pedidos en servidor |
|---|---|---|---|---|---|---|
| **api** | — | — | — | 107 `route.ts` | Bearer | Todo |
| **customer** | 264 | 13 | 6 | 1 (`app/auth/callback/route.ts`) | Sí: `app/page.tsx`, `auth/callback`, `lib/supabase/server.ts` (cookies) | 5 páginas piden a la API con `revalidate` (home, negocio, store, entregas…); `opengraph-image`, `sitemap`, `robots`, `manifest` |
| **negocios** | 188 | 12 | **12** | 0 | No | No |
| **motorizados** | 106 | 8 | 7 (`efectivo/page.tsx` no lleva la directiva) | 0 | No | No |
| **admin** | 89 | 31 | **31** | 0 | No | No |

`next.config.ts` de negocios, motorizados y admin: solo `transpilePackages` y `poweredByHeader`. Ninguna app tiene
`middleware.ts`/`proxy.ts` salvo la API (CORS).

### Llamadas directas a Supabase desde los clientes (producción, sin tests)

customer 55 `.from()` + 6 `.rpc()`; negocios 96 + 3; motorizados 6 + 2; admin 12 + 0. API: 228 + 72.

### Push web hoy

- Las 4 apps tienen `public/sw.js` (con `push` y `notificationclick`) y registran `/sw.js`.
- La suscripción usa `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (variable de entorno de las 4 apps).
- El envío: la base (`dispatch_event`, vía `pg_net`) llama a la **Edge Function `send-push`** de Supabase (Deno,
  1 259 líneas), que firma con `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY`/`VAPID_SUBJECT` (secretos de la Edge Function)
  y escribe `push_delivery_log`.
- `push_subscriptions` tiene ~39 filas. Una suscripción Web Push está ligada al **origen** (dominio) y a la **clave
  VAPID**.
- **No hay nada del push en Vercel.**

### Dependencias de una mudanza de hosting

- **Variables por app:**
  - api: `ALLOWED_ORIGINS`, `ALLOW_VERCEL_PREVIEWS`, Supabase (URL, anon, service role), Twilio (3), Inngest
    (`INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`);
  - customer: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, Supabase, VAPID pública;
  - negocios y motorizados: API, Supabase, VAPID;
  - admin: lo mismo más `NEXT_PUBLIC_CUSTOMER_URL`.
- **Servicios externos que llaman a nuestro hosting:** Inngest Cloud llama a `https://apiv2.tindivo.com/api/inngest`
  (8 funciones, una con cron cada 5 min).
- **Servicios externos que dependen de nuestros dominios:** la configuración de Supabase Auth (Site URL y Redirect
  URLs: Google vuelve a `/auth/callback` del customer) y Google OAuth. **No es visible desde el repo.**
- **URLs fijas en el código:** solo los orígenes de CORS (`apps/api/lib/http/cors.ts`) y textos/comentarios. Ninguna
  llamada entre servicios con dominio fijo.
- **Específico de Vercel:** `@vercel/analytics` (customer), `@sparticuz/chromium` (PDF de la API), funciones en `iad1`.
  **No hay `vercel.json`**; no hay crons de Vercel.
- **Base en `us-west-2` (Oregón).** La ubicación del nuevo servidor decide la latencia API↔base (hoy Virginia↔Oregón).

### Base de datos y lo que la ata a Supabase (para la migración de base posterior)

- Extensiones: `pg_cron`, `pg_net`, `pg_trgm`, `pgcrypto`, `unaccent`, `uuid-ossp`, `supabase_vault`.
- 99 políticas dependen de `auth.uid()`/ayudantes.
- 12 jobs de `pg_cron`.
- `dispatch_event` usa `pg_net` → Edge Function.
- Storage: 6 buckets.
- Realtime: 14 canales en clientes.
