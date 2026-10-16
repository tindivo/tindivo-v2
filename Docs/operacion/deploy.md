# DEPLOY.md — Runbook de go-live (Tindivo 2.0)

> Verificado: 2026-10-10 · solo que las rutas y comandos existen; los pasos de go-live no se han vuelto a ejecutar
> desde el lanzamiento de agosto **(sin verificar)**. Antes de seguirlo, contrástalo con `Docs/planes/migraciones/`.

Checklist accionable para llevar el piloto a producción (San Jacinto · La Florencia · 1 moto).
Lo marcado **[tú]** requiere tus credenciales; el resto ya está preparado en el repo.

---

## 0. Pre-requisitos

- Proyecto Supabase **`tindivo-prod`** (`zpnipajgwfthxhdtzhly`). **No es "Web v2"**: aquel
  (`psjigdoinfpgrnedxeyf`) está ABANDONADO, y este documento lo nombraba como destino —aplicar
  migraciones ahí no rompe nada visible, que es justo lo peligroso: se cree hecho y no lo está.
  Ver `CLAUDE.md § Supabase`.
- Cuenta Vercel, cuenta Inngest Cloud (keys ya en `apps/api/.env.local`), dominio `tindivo.com`.

## 0.1 El orden: base de datos ANTES que apps

```bash
supabase db push      # aplica al remoto enlazado lo que falte
pnpm db:types         # regenera los tipos DESPUÉS del push
pnpm check:deploy     # tiene que salir en verde ANTES de desplegar las apps
```

**Este orden no es una preferencia, y equivocarlo no da un error visible.** El código de este
repo se escribe contra el esquema que va a haber —`database.types.ts` se edita a mano al escribir
la migración para que el árbol compile antes del push—, así que `pnpm type-check` compila igual
contra un prod que todavía no tiene las columnas. Cuando las apps salen primero:

- un `select` con una columna que no existe → PostgREST responde **400 por todo el select**, y el
  app lo descarta: el cliente ve «Añade tu primera dirección» aunque tenga tres guardadas;
- una RPC con un parámetro que no existe → **404**, y no se puede pedir.

Ninguno de los dos pinta un error. Por eso hay una puerta: `pnpm check:deploy` compara las
migraciones del repo con las aplicadas en el remoto, dice cuáles faltan y marca las que el código
YA asume. Si no puede consultar el remoto, **falla** — un permiso de despliegue dado a ciegas es
lo que viene a impedir.

## 1. Variables de entorno por app **[tú]**

Copia `.env.example` → `.env.local` (o configúralas en Vercel) por proyecto. Valores reales:

| Variable | customer | negocios | motorizados | admin | api |
|---|:--:|:--:|:--:|:--:|:--:|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `NEXT_PUBLIC_API_URL` (= `https://apiv2.tindivo.com/api/v1`) | ✓ | ✓ | ✓ | ✓ | — |
| `NEXT_PUBLIC_APP_URL` (= `https://www.tindivo.com`) | ✓ | — | — | — | — |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | ✓ | ✓ | ✓ | ✓ | — |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` (= número real) | ✓ | — | — | — | — |
| `NEXT_PUBLIC_CARTO_API_KEY` (mapa CARTO; obligatoria en prod, en dev sin ella se usa OSM) | ✓ | — | ✓ | — | — |
| `SUPABASE_SERVICE_ROLE_KEY` (**secreto**) | — | — | — | — | ✓ |
| `INNGEST_SIGNING_KEY` / `INNGEST_EVENT_KEY` (**secreto**) | — | — | — | — | ✓ |

> El service_role y las keys de Inngest **solo** van en `apps/api`. Nunca en las apps frontend.

### 1.1 Variables del límite de OTP por número (SEC-03) y la puerta del build

Si el entorno **puede mandar SMS reales** (las tres `TWILIO_*` presentes, sea production, preview o
development), `apps/api` exige además **`OTP_PHONE_HMAC_SECRET`**, **`UPSTASH_REDIS_REST_URL`** y
**`UPSTASH_REDIS_REST_TOKEN`**:

- **En el build:** `pnpm build` de `apps/api` corre antes `scripts/check-sms-config.mjs` y **falla** (exit 1)
  nombrando las que faltan, sin imprimir valores. Sin Twilio (dev, CI) no exige nada.
- **El build carga el entorno como Next** (`loadEnvConfig` de `@next/env`, que viene con `next`): un Twilio puesto
  en `.env.local` o `.env.production` también activa la puerta. Lo ya exportado en la shell o inyectado por Vercel
  manda sobre los archivos, igual que en Next. La normalización es una sola (`envValue` en `lib/otp/sms-guard.mjs`):
  se recorta y vacío o solo espacios cuenta como ausente, tanto en la puerta como en ejecución (un token `' tok '`
  se usa como `'tok'`; no pasa la puerta para fallar luego contra Redis). En `apps/api/lib/env.ts`, la URL y el
  token de Upstash y el secreto del HMAC en blanco también cuentan como ausentes.
- **En ejecución:** si aun así se llega a desplegar así, `POST /customer/phone/send-code` responde **503**, no
  envía SMS y manda una alerta push a los admins (una por tipo cada 30 min). Requiere desplegar la Edge Function
  `send-push` (`supabase functions deploy send-push`), que entiende el evento `OpsAlert`.
- **Alerta operativa (`OpsAlert`): emisor autenticado.** `send-push` solo atiende `OpsAlert` si la petición trae la
  cabecera `x-ops-alert-secret` con el valor de **`OPS_ALERT_SECRET`** (comparación en tiempo constante; sin
  secreto configurado en la función, rechaza todo con 403) y reserva su turno en la base con `claim_ops_alert`
  (migración `0263`: una alerta por tipo cada 30 min, atómico). Hay que poner **el mismo valor** en dos sitios
  (32+ bytes aleatorios; no se reutiliza `OTP_PHONE_HMAC_SECRET`):
  - Vercel, proyecto `tindivo-api`: `OPS_ALERT_SECRET` (solo en ejecución; no hace falta en el build).
  - Edge Function: `supabase secrets set --project-ref zpnipajgwfthxhdtzhly OPS_ALERT_SECRET="<valor>"`.

  Orden: `db push` (0263) → `secrets set` → `functions deploy send-push` → desplegar la API. Sin el secreto en la
  API, `alertOps` lo deja en el log y no manda nada; la alerta es un aviso, no sustituye a la puerta ni al 503.
- **Límite público por IP: hoy está INACTIVO en producción.** Upstash no está configurado en `tindivo-prod`
  (cola del plan, MV4 y SEC-03b), así que ese límite no corre. `RATE_LIMIT_PUBLIC_ENABLED=true` lo enciende y está
  **apagado por defecto**: poner Upstash NO lo activa. Si algún día se configura Upstash y se quiere el límite
  público, hay que poner **también** `RATE_LIMIT_PUBLIC_ENABLED=true`. El límite por número de OTP no depende de
  este flag.
- **Build Command en Vercel (confirmar en el panel, [tú]).** El repo no tiene `vercel.json` ni sobrescribe el
  comando de build; la puerta vive en el script `build` de `apps/api/package.json` (`node
  scripts/check-sms-config.mjs && next build`). En el proyecto `tindivo-api`, Settings > Build & Development >
  **Build Command** debe estar **sin sobrescribir** (o ser `pnpm build` / `turbo build`), **no** `next build` a
  secas: con eso la puerta no corre.
- `turbo.json` pasa estas variables al build (`globalPassThroughEnv`) y además las lista en `tasks.build.env`, que
  entra en el hash: sin eso, un build cacheado de una corrida sin Twilio se reutilizaría y la puerta no correría.
  Si añades otra que el build deba ver, hay que listarla en ambos sitios.
- Despliegue de `send-push`: antes que la API (orden arriba). Mientras no esté desplegada con la rama nueva,
  la alerta no llega.
- Vercel: los valores **Secret** (antes «Sensitive») son de solo escritura en el panel pero se inyectan en el
  build y en las funciones; la propia doc habla de redactarlos «During builds» si salen en los logs
  (<https://vercel.com/docs/environment-variables/sensitive-environment-variables>). Hay que asignarlas al
  entorno correcto (Production / Preview) y **redesplegar** tras cambiarlas.

> `NEXT_PUBLIC_APP_URL` es lo que `customer` usa como `metadataBase`: de ahí salen las URLs
> canónicas, las de Open Graph y las del `sitemap.xml`. Si apunta a otro dominio, el enlace
> compartido y lo que indexe Google apuntan ahí. Sin la variable cae en `https://www.tindivo.com`,
> que es el valor correcto en producción — el riesgo es dejarla puesta a un preview de Vercel.
>
> Va con `www` porque el apex `tindivo.com` responde **307 hacia `www.tindivo.com`**: ese es el
> dominio canónico real, aunque la tabla de proyectos de abajo diga "apex". Si algún día el
> redirect se invierte, esta variable y el defecto de `apps/customer/lib/seo.ts` cambian juntos.

## 2. Edge Function secrets (Web Push) **[tú]**

El Edge Function `send-push` ya está desplegado. Para que **envíe** (no solo registre), setea sus secrets:

```bash
supabase secrets set --project-ref zpnipajgwfthxhdtzhly \
  VAPID_PUBLIC_KEY="<NEXT_PUBLIC_VAPID_PUBLIC_KEY>" \
  VAPID_PRIVATE_KEY="<privada de apps/api/.env.local>" \
  VAPID_SUBJECT="mailto:soporte@tindivo.com"
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase automáticamente al Edge Function.

> **Rota** la llave privada VAPID y la signing key de Inngest si se compartieron en texto plano.

## 2.2 send-push reclama el evento en la base **[tú]**

Hasta la migración 0264, `send-push` aceptaba a cualquiera con la clave anónima (pública en los bundles web):
un `POST /functions/v1/send-push` con un `event_type` real y el UUID de un pedido mandaba pushes falsos. Ahora
el trigger `dispatch_event` manda además el `event_id` del evento y la función lo **reclama en la base**
(`claim_push_event`, solo `service_role`): un solo uso por evento, solo si tiene menos de 15 minutos y solo si es
posterior al **corte** `app_settings.push_claim_since`. Lo que notifica sale de la base, no del cuerpo. Sin
`event_id` UUID responde **400**; con uno inexistente, viejo, anterior al corte o ya reclamado, **409**; en ambos
casos sin enviar nada. `OpsAlert` queda aparte: tiene su propio secreto (`x-ops-alert-secret`,
`OPS_ALERT_SECRET`).

No hay secreto compartido entre el trigger y la función a propósito: `pg_net` guarda las cabeceras en claro en
`net.http_request_queue` y el esquema `net` es de `supabase_admin` (legible por PUBLIC); ninguna migración puede cerrarlo.

**Por qué existe el corte.** La función vieja notifica sin escribir `push_claimed_at`. Sin corte, tras desplegar la
nueva, quien conociera el `event_id` de un evento ya enviado por la vieja podría reclamarlo (< 15 min) y provocar un
segundo envío. El corte deja **no reclamable todo evento anterior a él**, que es justo lo que la vieja ya envió.
Falla cerrado: sin fila, valor nulo o valor que no sea una fecha ISO válida, la función no reclama nada. La
migración **no** inserta la fila: la fija el operador (el PATCH de ajustes de la API no la expone).

**Orden seguro (no lo cambies).** Fuera de 18:00-23:00 (hora de Lima):

1. `supabase db push` (aplica la 0264: columna y función nuevas; el cuerpo conserva los campos viejos, así que la
   función hoy desplegada sigue funcionando).
2. `supabase secrets set --project-ref zpnipajgwfthxhdtzhly OPS_ALERT_SECRET="<valor>"` (el mismo que usa la API),
   si falta.
3. `supabase functions deploy send-push`.
4. **Espera 1 minuto**, para que drenen las instancias viejas de la función.
5. Fija el corte (SQL de escritura contra `tindivo-prod`, ejecutado por ti):

   ```sql
   insert into public.app_settings (key, value)
   values ('push_claim_since', to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')))
   on conflict (key) do update set value = excluded.value, updated_at = now();
   ```

6. Comprueba (solo lectura): `select key, value, updated_at from public.app_settings where key = 'push_claim_since';`
   debe mostrar la hora de hace un momento.
7. Despliega la API.
8. Smoke: un `POST` con solo la clave anónima y un `event_id` inventado debe dar **409**; sin `event_id`, **400**;
   un pedido de prueba real debe seguir notificando.

**Entre el deploy y el corte** la función nueva responde **409 a todo `POST` con `event_id`** (no hay corte, así que
no reclama nada): los avisos de esos instantes se pierden. El dueño lo aceptó; por eso el paso 5 va justo después
del minuto de espera. No les pasa a los `POST` sin `event_id` (siguen en 400) ni a `OpsAlert` (tiene su propio
secreto y no pasa por el reclamo).

**Rollback.** El orden importa: el corte se invalida **antes** de redesplegar la función anterior. Mientras la
vieja está viva envía sin escribir `push_claimed_at`; si el corte antiguo siguiera ahí, al volver a la nueva esos
eventos serían posteriores a él y reclamables otra vez (segundo envío, CAX-001).

1. Invalida el corte (SQL de escritura contra `tindivo-prod`, ejecutado por ti):

   ```sql
   delete from public.app_settings where key = 'push_claim_since';
   ```

   Comprueba (solo lectura): `select count(*) from public.app_settings where key = 'push_claim_since';` debe dar **0**.
   Desde ese instante la función nueva, si aún estuviera viva, responde 409 a todo `POST` con `event_id`
   (fallo cerrado).
2. Redespliega la función anterior: `supabase functions deploy send-push` desde el commit previo a la 0264 (el
   cuerpo conserva `event_type`, `aggregate_id` y `payload`, así que sigue funcionando).
   Comprueba (solo lectura): `supabase functions list --project-ref zpnipajgwfthxhdtzhly` muestra `send-push` con
   la hora de este deploy, y el siguiente aviso real llega con normalidad. No crees pedidos de prueba en producción.
3. Solo si también vuelve la base: `supabase/rollbacks/0264_send_push_reclama_el_evento_en_la_base.rollback.sql`
   (borra además la fila del corte, por si se hubiera vuelto a fijar). Comprueba (solo lectura):
   `select count(*) from pg_proc where proname = 'claim_push_event';` debe dar **0**.

**Volver a la función nueva** es idéntico al primer despliegue: `supabase functions deploy send-push` → **esperar
1 minuto** → fijar el corte a `now()` (paso 5 del orden seguro) → comprobar el paso 6. La fila del corte tiene
que estar ausente al hacer el deploy; si no lo estuviera (se redesplegó sin invalidarla), bórrala **antes** de
seguir:

```sql
delete from public.app_settings where key = 'push_claim_since';
```

con su comprobación (`select count(*) … where key = 'push_claim_since'` = 0).

**Regla fija:** si alguna vez se redespliega la función nueva con una fila de corte vieja presente, primero se
borra la fila.

## 2.1 Supabase Auth — onboarding del cliente **[tú]**

El onboarding del customer (bottom-sheet con Google + correo sin verificación) requiere
configuración manual en dashboards:

1. **Google Cloud Console** (console.cloud.google.com → APIs & Services → Credentials):
   - Crear **OAuth 2.0 Client ID** tipo "Web application".
   - Authorized JavaScript origins: `http://localhost:3000` y `https://tindivo.com`.
   - Authorized redirect URI: `https://zpnipajgwfthxhdtzhly.supabase.co/auth/v1/callback`.
2. **Supabase dashboard** (proyecto Web v2):
   - Authentication → Sign In / Providers → **Google: ON** (pegar Client ID + Secret del paso 1).
   - Authentication → Sign In / Providers → Email: **desactivar "Confirm email"**
     (el flujo es "sin verificación de correo; empiezas a pedir al instante").
   - Authentication → URL Configuration → Redirect URLs: añadir
     `http://localhost:3000/auth/callback` y `https://tindivo.com/auth/callback`.

> El mapa de direcciones usa **Leaflet + OpenStreetMap**: no requiere API key ni billing.

## 3. Vercel — 5 proyectos **[tú]**

Un proyecto por app, todos con root del monorepo y build filtrado:

| Proyecto | Root / build command | Dominio |
|---|---|---|
| tindivo-api | `pnpm --filter @tindivo/api build` | `apiv2.tindivo.com` (**no** `api.`) |
| tindivo-customer | `pnpm --filter @tindivo/customer build` | `tindivo.com` (apex) |
| tindivo-negocios | `pnpm --filter @tindivo/negocios build` | `negocios.tindivo.com` |
| tindivo-motorizados | `pnpm --filter @tindivo/motorizados build` | `motorizados.tindivo.com` |
| tindivo-admin | `pnpm --filter @tindivo/admin build` | `admin.tindivo.com` |

- Install command: `pnpm install --frozen-lockfile`. Output: `apps/<app>/.next`.
- La whitelist CORS (`apps/api/lib/http/cors.ts`) ya cubre los 4 orígenes frontend.

## 4. DNS **[tú]**

Apunta el apex `tindivo.com` + los CNAME `api`/`negocios`/`motorizados`/`admin` a Vercel.

## 5. Inngest Cloud **[tú]**

- Sirve el endpoint `https://apiv2.tindivo.com/api/inngest`.
- Registra la app en Inngest Cloud con la signing key. Quita `INNGEST_DEV=1` en prod.
- Funciones: `order-acceptance-timeout`, `cash-settlement-auto-confirm`, `order-validation-timeout`, `order-prepay-timeout`.

## 6. Seeds de go-live

Parámetros operativos (`app_settings`) ya sembrados: `commissions` (3.00/3.50/0.50), `delivery_bands`,
`timers`, `prepay_threshold` (100), `validation` (80), `strikes` (2), `contingency_fund` (250),
`platform_schedule` (mar–sáb 18:00–23:00), `coverage` (San Jacinto). Ajusta desde **Admin → Configuración**.

Crear los actores del piloto (necesitan cuenta Auth → vía Admin, no SQL puro):

1. **Admin → + Negocio**: crea *La Florencia* (capacidades: publica catálogo + delivery + recojo + usa moto Tindivo). Luego, como negocio, en **/configuracion** carga Yape/QR, ETA y horario; en **/menu** carga la carta.
2. **Admin → + Motorizado**: crea el motorizado del piloto.
3. **[tú]** Setea `NEXT_PUBLIC_SUPPORT_WHATSAPP` y `app_settings.support_whatsapp` con el número real (Admin → Configuración).
4. **[tú]** Confirma el fondo de contingencia real disponible en el Yape del admin (S/200–300).

## 7. Contenido legal **[tú]**

`/terminos` y `/privacidad` (Ley 29733) ya tienen contenido base en la app cliente. Revisa con
asesoría legal antes de operar (cláusula de adelanto del fondo para restaurantes, política de strikes).

## 8. Smoke post-deploy

1. `GET https://apiv2.tindivo.com/api/v1/health` → 200.
2. Las 4 apps cargan + se pueden instalar (PWA) en Android Chrome.
3. Flujo real: cliente nuevo → validación por llamada → aceptar → preparar → recoger → entregar (efectivo)
   → liquidación diaria (confirmar) → push recibido en cada paso (requiere HTTPS, ya disponible en prod).
4. Verifica que el push llega de verdad (paso 3 ya con VAPID secrets del Edge Function).

## 9. Observabilidad (opcional en piloto) **[tú]**

- Sentry (`SENTRY_DSN`) + UptimeRobot sobre `/health` de las 5 URLs.
- Cron `close-driver-shifts` (pg_cron, cada 15 min) ya activo: cierra disponibilidad fuera de horario.

---

**Estado del repo:** todas las fases funcionales (A–I) implementadas y verificadas e2e. Migraciones
0001–0029 en `supabase/migrations/`. Edge Function `send-push` desplegado. Falta solo lo marcado **[tú]**.
