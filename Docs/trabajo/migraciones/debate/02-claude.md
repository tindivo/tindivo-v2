# Réplica de Claude

> Tras leer [`01-codex.md`](01-codex.md). Esta vez Codex leyó el repo por su cuenta (perfil `revisor`, solo lectura):
> sus citas son verificables, y verifiqué las que cambian el plan.

**Resumen:** coincidimos en lo esencial: mudar sin cambios funcionales, no mezclar la mudanza con nada, el paso 0
primero, sacar el envío de push de la base antes de mudarla, y una red de seguridad hecha de pruebas. Acepto cuatro
correcciones de Codex y cedo en dos puntos donde mi apertura iba más lejos de lo necesario.

## Lo que verifiqué y acepto

**1. El PDF necesita un cambio de código, no solo de configuración.** `apps/api/lib/pdf/browser.ts:49`: con
`NODE_ENV=production` siempre usa `@sparticuz/chromium` (`chrome-headless-shell`), y `PUPPETEER_EXECUTABLE_PATH` solo
cuenta en la otra rama. Mi «cambiar por el Chromium del sistema» era incompleto. **Ajuste a T1:** la mudanza admite
**cambios de ejecución** (cómo arranca un proceso, de dónde sale un binario) pero no cambios funcionales. El del PDF es
el único que hace falta: una selección explícita del motor (`PDF_BROWSER=serverless|system`), con el valor por
defecto igual que hoy.

**2. Inngest: 8 funciones definidas, 7 registradas.** `apps/api/lib/inngest/functions.ts:316` no incluye
`orderPaymentTimeout`. `git log -S` muestra que entró el 2026-07-18 (`adc6bf7`) y **nunca se registró**. Sin embargo, la
API sigue emitiendo su evento (`lib/http/order-transition.ts:127`, `business/orders/[id]/validate/route.ts:65`). No ha
causado daño: el plazo de pago lo cumple el cron `auto-cancel-prepay-timeout` cada minuto, y en prod hay 3
cancelaciones por ese motivo. Pero es **código muerto que emite eventos que nadie consume**, justo el tipo de cosa
que confunde al resincronizar Inngest en el corte. Va al inventario previo: **decidir si se registra o se borra**
(recomiendo borrar función y envíos, porque el cron ya es la autoridad desde la 0174) **en un despliegue aparte, antes
de la mudanza**.

**3. La reproducción del e2e no es solo cambiar `baseURL`.** `e2e/viaje-pedido-online.spec.ts:23,44,181` fija URLs
y Supabase local. La suite de humo para el corte se escribe **nueva**, de solo lectura y parametrizada, y el recorrido
completo se parametriza para **staging**, nunca para producción.

**4. Sin cambiar `www` por el dominio sin `www`.** También cambia el origen y rompe las suscripciones push. Lo añado a
la lista de lo que no se toca.

## Donde cedo

**A. El orden del corte: el de Codex.** Yo ponía la API la última, «porque la usan todas». Codex la pone primera, y es
mejor:

- concentra el riesgo mayor (secretos, Inngest, PDF, región) en un solo corte, con los cuatro frontends todavía en
  Vercel como control;
- la vuelta atrás es un solo DNS;
- y la latencia contra la base en Oregón se mide de verdad desde el primer día.

**B. Push: Web Push VAPID se queda para la web.** Yo proponía FCM para todo. Codex tiene razón en que eso añade una
migración del registro web sin necesidad, y justo en medio de la mudanza. Queda así:

- un módulo `notifications` con **adaptadores**: Web Push VAPID para la web, FCM para Android y APNs para iOS;
- la Edge Function se conserva durante la mudanza;
- después, su lógica se extrae a un consumidor que corre fuera de Supabase.

Si algún día conviene FCM para la web, es cambiar un adaptador.

## Lo que añado

**C. Inventario previo al corte** (un documento, antes de tocar DNS):

- variables por app, separando las de construcción (`NEXT_PUBLIC_*`) de las de ejecución;
- Upstash, que yo había omitido (`apps/api/lib/env.ts:11`);
- Site URL y Redirect URLs de Supabase Auth, y el cliente OAuth de Google, **leídas en el panel**;
- las funciones registradas en Inngest y su sincronización;
- los dominios y su TTL;
- y la cabecera `X-Forwarded-Proto`/`Host` del proxy, porque `auth/callback/route.ts:6` construye la redirección con
  `request.url`.

**D. Memoria del VPS.** Cinco procesos Next más Chromium bajo demanda. Hay que medir el consumo en el ensayo y
dimensionar con margen; si no cabe, el PDF puede ir en un proceso aparte con límite de concurrencia.

## Desacuerdos que quedan

Ninguno de fondo. Queda una preferencia menor: empaquetar en Docker desde el primer ensayo (yo) o procesos Node con
gestor de procesos y Docker después (Codex). Propongo que lo decida Jesús según cómo administre su VPS: Docker si
quiere poder rehacer el servidor desde cero; procesos si prefiere tocar menos piezas.
