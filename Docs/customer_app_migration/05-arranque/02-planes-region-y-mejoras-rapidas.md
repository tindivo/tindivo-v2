# 05 · Arranque — 02 · Planes, región y mejoras rápidas

> Redactado el **2026-09-20**, a partir de lo que confirmaste (Supabase y Vercel **gratuitos**, regiones «US»)
> y de lo que verifiqué. Nada de esto se aplicó: son **propuestas para tu aprobación**. Amplía `PER-02`, `PRO-06`
> y `DAT-08`.

## 1. Regiones: ya no es una duda

| Pieza | Región | Cómo se sabe |
|---|---|---|
| Base de datos (Supabase `tindivo-prod`) | **`us-west-2` (Oregón, AWS)** | El fichero que la CLI de Supabase deja al enlazar el proyecto (`supabase/.temp/pooler-url`) apunta a `aws-1-us-west-2.pooler.supabase.com` |
| Funciones de la API (Vercel) | **`iad1` (Washington D. C.)** | Cabecera `x-vercel-id: gru1::iad1::…` en `https://apiv2.tindivo.com/api/v1/health`; no hay `vercel.json` en el repositorio, así que es la región por defecto |
| Borde de Vercel para Perú | `gru1` (São Paulo) | Misma cabecera |

**Están en costas opuestas de EE. UU.** Cada consulta de la función a la base cruza el país, y eso encaja con lo
medido: **≈ 0,13 s por ronda** en vez de los 10-30 ms de una base cercana. Crear un pedido encadena **11 a 17
rondas** (`PER-03`), así que esta desalineación puede explicar, por sí sola, del orden de **1-2 s** de cada pedido
(estimación: 11-17 rondas × ~0,1 s; hay que medirla tras el cambio).

### La corrección (gratis, reversible, sin tocar código de negocio)

Mover las funciones a **`pdx1` (Portland, Oregón)**, junto a la base:

1. **Por el panel:** proyecto de Vercel → *Settings → Functions → Function Region* → **Portland, USA (West) — `pdx1`** →
   volver a desplegar. **O en el repositorio:** `apps/api/vercel.json` con `{ "regions": ["pdx1"] }`.
2. En **Hobby** se puede fijar **una** región principal (no varias ni *failover*) ✔, que es justo lo que hace falta.
3. Repetirlo en los **cuatro frontends** que consultan la base desde el servidor (`@supabase/ssr`), empezando por la API.
4. **Medir antes y después** con la misma batería de `curl` del `anexos/C-consultas-de-medicion.md`. La cabecera
   debe pasar a `gru1::pdx1::…`. Esperado (a confirmar): cada ronda baja a decenas de milisegundos y `POST
   /customer/orders` baja del orden de un segundo; a cambio, **cada petición** paga unas decenas de ms más de
   viaje `gru1→pdx1`. Salen ganando todas las peticiones con **2 o más rondas** (casi todas las autenticadas).

### Lo que **no** conviene hacer ahora: mover Supabase

Oregón queda lejos de Perú, pero cambiar de región **es migrar el proyecto** (nueva base, nuevas claves, copiar
usuarios, *storage*, *cron*, extensiones, funciones y webhooks). Es un proyecto en sí mismo, con la operación en
marcha. Se reevalúa **después** de mover las funciones y de pasar a Pro, **con mediciones desde Perú** en la mano.
*Referencia de red:* desde el equipo de trabajo, la conexión al borde de Cloudflare tarda **0,22-0,50 s** y la
primera respuesta del gateway **0,47-1,10 s**. La red real del usuario pesa más que cualquier ajuste de servidor:
por eso importan el **número de viajes**, HTTP/2 y la **caché local** (`NAT-OFF`).

## 2. Supabase Free: lo que verifiqué y lo que significa para ti

| Límite del plan gratuito ✔ | Tu uso hoy `[DB-PROD]` | Riesgo |
|---|---|---|
| **Sin copias de seguridad** (ni descargables ni PITR) | **Ninguna** | **Alto** (véase §2.1) |
| Base de 500 MB | **148 MB** (de ellos **117 MB son el registro de `pg_cron`**; las tablas de la app suman 13 MB) | Medio: `DAT-08` |
| Se **pausa tras 1 semana sin actividad** | No aplica (hay pedidos todos los días) | Nulo |
| 1 GB de archivos | 36 MB (134 ficheros) | Bajo |
| 50 000 usuarios activos al mes | 86 usuarios | Nulo |
| 5 GB de salida de datos + 5 GB en caché | **No medido** (mira *Usage* en el panel) | Desconocido: subirá con la app y las campañas |
| CPU compartida | 8,7 h en 58 días | Bajo hoy |
| Sin acuerdo de servicio | — | Medio |

### 2.1 No tienes copias de seguridad, y tu propia documentación dice lo contrario

`Docs/13-deploy` afirma «free tier con backups diarios, retención 7 días». **No es así** según la documentación
pública de Supabase ✔: el plan gratuito **no incluye copias**. Compruébalo en *Database → Backups* del panel.
El plan **Pro (US$ 25 al mes)** incluye **copias diarias con 7 días de retención**, base de 8 GB y **no se pausa** ✔;
la recuperación a un punto en el tiempo (PITR) es un complemento aparte (**~US$ 100 al mes** ✔) y **no lo necesitas ahora**.

**Por qué importa más de lo que parece:** se han aplicado **51 migraciones en los últimos 30 días** y hay **dinero
registrado** (`cash_settlements`: 231 filas; `restaurant_payments`: 16; `business_charges`: 1 308). Una migración con
error o un `DELETE` mal acotado, **sin copia, no se recupera**.

### 2.2 `DAT-08`: el registro de `pg_cron` es el 79 % de tu base y crece sin límite

| Dato `[DB-PROD]` | Valor |
|---|---|
| `cron.job_run_details` | **117 MB**, **374 600 filas**, ~327 bytes por fila |
| Ritmo | **6 463 filas/día** (los 4 barridos de 1 minuto son ≈ 5 760) ≈ **2,1 MB/día** |
| Poda existente | Hay 6 trabajos de limpieza (`idempotency`, `push_delivery_log`, `subscriptions`, `rejections`, `domain_events`, `outbox`), **ninguno** para el propio registro de `pg_cron` |
| Proyección en Free | (500 − 148) MB ÷ 2,1 MB/día ≈ **167 días** → hacia **febrero-marzo de 2027**, antes si crecen los pedidos |

Un proyecto gratuito que supera su límite **pasa a solo lectura** (◦ según la documentación de Supabase; confírmalo
en tu panel): sería una **caída de escritura** en plena operación. Supabase recomienda purgar esta tabla a diario
y conservar una semana ✔. **Propuesta de migración** (sin aplicar; numeración `NNNN_` según `supabase migration list`):

```sql
-- Idempotente: reprograma si ya existe.
select cron.unschedule('prune-cron-job-run-details')
 where exists (select 1 from cron.job where jobname = 'prune-cron-job-run-details');
select cron.schedule('prune-cron-job-run-details', '0 7 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);
```

El espacio liberado **se reutiliza** y el crecimiento se detiene en ~15 MB de régimen (7 días × 6 463 filas × 327 B);
devolver los 117 MB al disco requiere `VACUUM FULL` (◦ puede exigir permisos que el rol `postgres` no tenga) y **no es
necesario** para evitar el tope.

## 3. Vercel Hobby: es para uso **no comercial**

Los términos de Vercel ✔ limitan el plan **Hobby** al **uso personal no comercial**; considera comercial **cualquier
despliegue usado para el beneficio económico de alguien involucrado en el proyecto**. Tindivo **cobra comisión de
delivery a los negocios**: es un uso comercial. Riesgo: **suspensión del proyecto**, en el peor momento (una noche
de pedidos o el día del lanzamiento con una campaña). El plan **Pro cuesta US$ 20 por usuario al mes**, con US$ 20
de crédito de uso incluidos ✔.

Además del cumplimiento: en Hobby solo hay una región y sin *failover* ✔; y el límite de tiempo de las funciones
y de los registros es menor (◦ no verificado: revísalo para el PDF con Chromium, `next.config.ts:57-62`).

## 4. Presupuesto mensual orientativo

| Concepto | Hoy | Recomendado antes del lanzamiento público |
|---|---|---|
| Supabase | US$ 0 | **Pro US$ 25** (copias, sin pausa, 8 GB) |
| Vercel | US$ 0 | **Pro US$ 20** (uso comercial) |
| Firebase (FCM) | — | US$ 0 |
| Apple Developer | — | US$ 99 al año (≈ US$ 8,25/mes) |
| Google Play | — | US$ 25 una vez |
| Inngest · Twilio Verify | *no revisados* (`PRO-06`) | Revisar límites y coste por verificación |
| **Total** | **US$ 0** | **≈ US$ 53/mes** (Supabase + Vercel + Apple prorrateado; ≈ S/ 195 al cambio de ~3,7). Google Play: US$ 25 **solo la primera vez** |

## 5. Lo que puedes hacer **hoy**, en orden («Ola A» del registro de hallazgos)

| # | Acción | Coste | Esfuerzo | Cómo compruebas que funcionó |
|---|---|---|---|---|
| **A.1** | **Copias de seguridad**: pasar Supabase a Pro. Si aún no: **volcado nocturno cifrado** (`supabase db dump`) desde una tarea programada a un almacenamiento aparte | US$ 25/mes · gratis | S | *Database → Backups* muestra copias diarias; restaurar una en un proyecto de prueba |
| **A.2** | **Región de las funciones a `pdx1`** (§1) | Gratis | S | `x-vercel-id` = `gru1::pdx1::…`; mismas `curl` de antes y después |
| **A.3** | **Podar `cron.job_run_details`** (§2.2) | Gratis | S | `select pg_size_pretty(pg_total_relation_size('cron.job_run_details'))` deja de crecer |
| **A.4** | **Cerrar `send-push`** a la clave pública (`SEC-01`): exigir la `service_role` o un secreto compartido desde el disparador | Gratis | S | La llamada con la clave anónima devuelve 401 (era 200) |
| **A.5** | **Vercel Pro** (§3) | US$ 20/mes | S | El proyecto figura en Pro |
| A.6 | *(cuando puedas)* CI en verde: renovar la línea base de `check:ds` (`PRO-01`) | Gratis | S | El primer paso de CI ya no aborta |

A.2-A.4 **no cambian el comportamiento** que ve la cajera o el cliente. Como hay **operación real**, cada una se
hace en horario sin pedidos (fuera de 18:00-23:00 Lima) y con un plan de vuelta atrás.

## 6. Lo que no pude verificar (te lo dejo como pendiente)

- **Realtime** en el plan gratuito (conexiones simultáneas y mensajes por segundo): revísalo en *Usage*.
- **Inngest**: 50 000 ejecuciones gratis al mes según `Docs/13:146-150`; con 4 funciones por pedido el margen se acorta
  al crecer.
- **Twilio Verify**: coste por verificación y protección frente a abuso (`SEC-03`).
- **Tu uso real de salida de datos** en Supabase y de ancho de banda en Vercel.

## Fuentes (consultadas el 2026-09-20)

- Supabase: [precios](https://supabase.com/pricing) · [límites del plan gratuito 2026](https://www.itpathsolutions.com/supabase-free-tier-limits) ·
  [copias y PITR](https://axonbuild.com/blog/supabase-backup/) · [guía de precios 2026](https://uibakery.io/blog/supabase-pricing) ·
  [depuración de `pg_cron`](https://supabase.com/docs/guides/troubleshooting/pgcron-debugging-guide-n1KTaz) ·
  [limpiar `cron.job_run_details`](https://github.com/supabase/supabase/pull/50211)
- Vercel: [plan Hobby](https://vercel.com/docs/plans/hobby) · [uso justo](https://vercel.com/docs/limits/fair-use-guidelines) ·
  [regiones de funciones](https://vercel.com/docs/functions/configuring-functions/region) · [`vercel.json`](https://vercel.com/docs/project-configuration/vercel-json)
