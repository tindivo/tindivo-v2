# Apertura de Claude

> Escrita el 2026-10-07 **antes** de leer a Codex. El detalle y la evidencia están en
> [`../06-contrato-rest-movil.md`](../06-contrato-rest-movil.md); aquí van las tesis numeradas para debatirlas una a una.

**T1 · Superficie.** Las apps nativas consumen **solo la API REST** para datos y acciones. Supabase queda para la
sesión (SDK de Auth: Google, Apple, refresco) y Realtime como «timbre» de «algo cambió», nunca como fuente de datos.
Cambio así la recomendación C (mixto) del 2026-09-20. Motivo principal: una app instalada que lee tablas congela el
esquema (`orders` tiene 98 columnas) y no se puede actualizar a la fuerza.

**T2 · El dominio no se toca.** Las RPC de Postgres siguen siendo la autoridad sobre dinero, estados y antifraude;
la API las envuelve.

**T3 · La latencia que frenaba REST se arregla.** Verificación local del JWT (prod ya firma con ES256, JWKS público),
roles en el token con un *Custom Access Token Hook*, y la función de Vercel en `pdx1` junto a la base (hoy `iad1`;
`/health` sin base tarda 0,6-0,9 s).

**T4 · Falta un `POST /customer/checkout/quote`.** `use-checkout-state.ts` (724 líneas) calcula envío, promos, tope
de contraentrega, vuelto máximo y bloqueo por riesgo; la ruta y la RPC lo recalculan. Sin `quote`, cada app nativa
copia esa lógica.

**T5 · Errores con código de negocio estable** (`business_paused`, `courier_closed`, `phone_not_verified`…) en vez
de `forbidden`/`conflict` + texto en español; y una sola envoltura `{ data }` (hoy tres rutas públicas devuelven sin
envoltura).

**T6 · Contrato versionado.** Cabeceras `X-Client-Platform/Version/Build`, `GET /config` con versión mínima y
parámetros, `426` para versiones viejas, OpenAPI generado desde Zod 4 (`z.toJSONSchema`) y clientes generados.

**T7 · Rate limiting** con Upstash (instalado y sin usar) antes de abrir al público; idempotencia en todo `POST` que
cree algo; dinero como cadena decimal.

**T8 · La web del customer se muda al mismo contrato (fase F3).** Es la forma más barata de probarlo: cada noche de
operación real lo ejercita antes de escribir Swift o Kotlin.

**Orden propuesto:** F0 cimientos (T3, T5, T6 sin OpenAPI, T7) → F1 OpenAPI → F2 rutas `/me` y `quote` → F3 la web
se muda → F4 avisos nativos (APNs/FCM) → F5 borrado de cuenta y Sign in with Apple.

## Segundo tema (añadido por Jesús): squash de migraciones

**Medido:** 246 migraciones, 54 000 líneas, 3 MB, más 78 rollbacks. `create_customer_order` se redefine **36 veces**
y `advance_order` 24: para saber cómo es hoy una función hay que encontrar la última de 36 versiones. El problema de
lectura es real.

**T9 · El objetivo real se resuelve con una foto del esquema, no con un squash.** Propongo generar, después de cada
migración, un **volcado del estado actual partido por objeto** (`supabase/schema/functions/create_customer_order.sql`,
`tables/orders.sql`, `policies/…`), comprobado en CI contra la base. El agente lee **un** fichero por objeto, sin tocar
el historial ni producción. Es el `PRO-03` del análisis anterior («sin volcado de esquema»).

**T10 · El squash, si se hace, va después y con red.** `supabase migration squash` vuelca el **esquema**, no los
**datos**, y aquí las migraciones también siembran cosas que no son esquema: 15 ficheros insertan `app_settings`, 13
programan `cron.schedule`, 3 crean buckets, 3 ponen políticas en `storage.objects`, 3 tocan la publicación de
Realtime y una añade un trigger en `auth.users`. Un squash ingenuo produce una base nueva **sin configuración ni
crons**, y los tests de esquema no lo verían. Si se hace, las condiciones serían:

- una línea base `0000_baseline.sql` más un `0001_baseline_data.sql` escrito a mano con lo que no es esquema;
- en producción, `supabase migration repair` para marcar como aplicadas solo las de la línea base, **sin ejecutar
  nada** contra la base viva;
- verificar que `db reset` desde cero y `tindivo-prod` dan **diff vacío**, en esquema y en
  `app_settings`/`cron.job`/`storage.buckets`;
- conservar el historial: etiqueta `pre-squash` en git y mover los 246 ficheros a `supabase/archive/` (fuera de la
  ruta que lee la CLI), porque **764 comentarios del código citan migraciones por número** («desde la 0171…») y son el
  rastro del porqué.

**Mi postura:** primero T9, que da el 90 % del beneficio con riesgo cero. El squash, como segundo paso opcional y
fuera del horario de pedidos.

**Riesgos que veo en mi propia propuesta:** F3 toca la web en uso (es el único paso de riesgo medio); más rutas
significan más superficie que mantener para una sola persona; y la verificación local del JWT deja de detectar una
sesión revocada hasta que caduca el token (1 h).
