# 02 · Rendimiento y latencia

> **Pregunta:** ¿qué hace que la app se sienta lenta y qué cuellos de botella tiene el backend?
> **Respuesta corta:** el backend **no está saturado** (8,7 h de CPU de base en 58 días); la
> lentitud viene de **cuántas veces y hasta dónde viaja cada petición**. Es un problema de
> *forma de la petición* y de *geografía*, no de volumen.
> Etiquetas y escalas: [`00-veredicto-y-metodo.md`](00-veredicto-y-metodo.md).

## Lo que se midió (y cómo leerlo)

Mediciones hechas el **2026-09-20 desde el equipo de trabajo**, con `curl` a endpoints **públicos y
sin efectos** (`GET`), abriendo **una conexión TLS nueva en cada llamada**. Por eso incluyen ~150-200
ms de negociación TLS que una app nativa con HTTP/2 y conexiones reutilizadas **no pagaría**. Son
medidas de *orden de magnitud*, no un benchmark; `n` = 5-8 por punto. `[PRUEBA]`

| Qué se llamó | Rondas a la base | TTFB típico | Lectura |
|---|---|---|---|
| `GET /health` (sin lógica) | 0 | **0,46-0,47 s** | El *suelo* de la API desde aquí |
| `GET /public/schedule` | 1 (una RPC) | **0,55-0,77 s** (mediana ≈ 0,60) | **+~0,13 s por ronda** |
| `GET /public/search?q=pizza` | 1 (una RPC) | 0,55-0,71 s (≈ 0,59) | idem |
| `GET /public/businesses` (*cache miss*) | 2-3 | 0,83-1,19 s | +~0,4 s |
| `GET /public/businesses/al-punto` (*miss*) | 2 rondas (8 consultas, 2 en paralelo + 7) | 0,86-1,10 s | +~0,5 s |
| `GET /public/businesses` (*cache hit* del borde) | 0 (sirve el borde) | **0,31-0,33 s** | El borde de Vercel funciona |
| Primera llamada tras un rato inactivo | — | **1,2-1,4 s** | *Arranque en frío* ≈ +0,9 s (n = 3) |

Y en la cabecera de respuesta: **`x-vercel-id: gru1::iad1::…`** = el borde que atiende es **São
Paulo (`gru1`)** y **la función corre en Washington D. C. (`iad1`)**. El gateway de Supabase
responde detrás de Cloudflare **Lima** (`cf-ray …-LIM`), lo que solo dice dónde está el borde, no la
base.

---

## PER-01 · Cada petición autenticada pierde ~0,27 s antes de empezar a trabajar

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S-M |

**En una frase.** Antes de ejecutar la lógica de cualquier ruta protegida, la API hace **dos
consultas de red a Supabase** solo para saber quién eres y qué rol tienes.

**Evidencia.**
- `requireUser` valida el JWT llamando a `supabase.auth.getUser(token)` con el cliente
  *service-role*: **una llamada HTTP a GoTrue por petición** (`apps/api/lib/http/auth.ts:16-31`).
- `requireRole` **además** consulta `user_roles` (`auth.ts:34-47`): **una segunda ronda**.
- `DECISIONS.md:503` prometía lo contrario: «JWT `app_metadata.user_roles` leído por el
  middleware **sin query a DB**». **No está implementado.** `[CÓDIGO]`
- Con ~0,13 s por ronda (tabla de arriba), son **~0,27 s** que cada endpoint autenticado paga
  **antes** de su primera línea útil. `[PRUEBA]` (derivado)

**Por qué importa.** Es un coste fijo sobre las 85 rutas; en móvil se nota en cada gesto.

**Dirección.** (1) **Verificar el JWT localmente** (clave pública/JWKS del proyecto o secreto, con
`jose`): cero rondas. (2) **Llevar los roles en los *claims*** con un *Custom Access Token Hook*
de Supabase, que es lo que el diseño original quería. (3) Mantener `user_roles` como fuente de
verdad y **refrescar el claim** al cambiar roles.

---

## PER-02 · La función (Virginia) y la base (Oregón) están en costas opuestas de EE. UU.

| | |
|---|---|
| **Severidad** | Alto (**confirmado** el 2026-09-20) |
| **Bloquea el móvil** | No |
| **Esfuerzo** | **S** (mover la función: es configuración) · L (mover la base) |

**En una frase.** La base está en **`us-west-2` (Oregón)** y la función de la API en **`iad1` (Washington D. C.)**:
cada ronda función→base cruza el país y cuesta ~0,13 s; con ambas en Oregón debería costar 10-30 ms.

**Evidencia.**
- La función corre en **`iad1`**, verificado en `x-vercel-id: gru1::iad1::…`; no hay `vercel.json` en el
  repositorio, así que es la región por defecto. `[PRUEBA]`
- La base está en **`us-west-2`**: el fichero que la CLI de Supabase deja al enlazar el proyecto
  (`supabase/.temp/pooler-url`) apunta a `aws-1-us-west-2.pooler.supabase.com` para `tindivo-prod`. `[CÓDIGO]`
  (Antes constaba como «sin determinar»; el único dato del repo, `DECISIONS.md:60` con `us-east-2`, es de un
  proyecto abandonado.)
- Con base y función juntas, una RPC simple añadiría ~10-30 ms; se midieron **~130 ms** por ronda. `[PRUEBA]`
- Para un usuario en Perú, el borde de Vercel ya termina en **São Paulo (`gru1`)**. Mover la función a **`pdx1`
  (Portland, Oregón)** añade unas decenas de ms por petición (`gru1→pdx1`) pero **quita ~0,1 s por cada ronda**:
  sale ganando toda petición con 2 o más rondas (casi todas las autenticadas; crear un pedido tiene 11-17).

**Por qué importa.** Es la palanca de latencia más barata: no cambia código, cambia dónde corre, y es reversible.

**Dirección.** (1) Fijar la región de las funciones a **`pdx1`** (`regions` en `apps/api/vercel.json` o *Settings →
Functions*) en la API y en los frontends que consultan la base desde el servidor; en el plan Hobby se puede fijar una
región principal. (2) Medir antes y después con los mismos `curl`. (3) **No** mover la base ahora: sería una
migración de proyecto; se reevalúa con mediciones desde Perú y tras pasar a Pro. Pasos y comprobaciones en
`05-arranque/02-planes-region-y-mejoras-rapidas.md` §1.

---

## PER-03 · Crear un pedido encadena entre 11 y 17 rondas secuenciales

| | |
|---|---|
| **Severidad** | Alto |
| **Bloquea el móvil** | No |
| **Esfuerzo** | M |

**En una frase.** La acción más importante del cliente es también la más lenta, y buena parte de
sus consultas son **comprobaciones que la RPC ya hace**.

**Evidencia (secuencia real en `POST /customer/orders`, `apps/api/app/api/v1/customer/orders/route.ts`).**

| # | Ronda | Línea |
|---|---|---|
| 1-2 | `auth.getUser` + `user_roles` (`requireRole`) | `:40` |
| 3 | `customer_profiles` (¿teléfono verificado?) | `:46-50` |
| 4-8 | *Solo contraentrega*: RPC `customer_contraentrega_decision`, `app_settings.prepay_threshold`, `menu_items`, `menu_modifier_options`, `app_settings.delivery_bands` | `:90-161` |
| 9 | `idempotency_keys` (replay temprano) | `:183` |
| 10 | `businesses` | `:196` |
| 11 | `business_schedule` | `:238` |
| 12-13 | `hasConfirmedOpening` (1-2 consultas) | `:261` |
| 14 | `idempotency_keys` (reservar clave) | `:270` |
| 15 | **RPC `create_customer_order`** (media **148 ms** dentro de la base, máx. 359) | `:274` |
| 16 | `idempotency_keys` (marcar completada) | `:270` |
| 17 | Envío del evento a **Inngest Cloud** (HTTP externo) | `:370-371` |

**11 rondas en prepago, hasta 17 en contraentrega con modificadores y envío.** A ~0,13 s por ronda
son **1,4-2,2 s de servidor**, más el suelo de 0,47 s, más la RPC: **del orden de 2-3 s de punta a
punta** (estimación a partir de costes medidos; no se midió el pedido completo porque exige una
cuenta real). `[CÓDIGO]` `[PRUEBA]` (derivado)

Casi todas las comprobaciones (teléfono verificado, umbral de prepago, precios, capacidades, pausa,
horario) **las repite en buena parte la propia RPC** dentro de su transacción
(`create_customer_order` contiene al menos 17 `RAISE EXCEPTION` de negocio, 16 mensajes distintos);
la ruta las hace «por defensa en profundidad», y ya costó tres incidentes (véase `ARQ-03`).
`[DB-PROD]`

**Por qué importa.** Sobre una red móvil de pueblo, 2-3 s de servidor + red es la diferencia entre
«pedí» y «¿se colgó?». (Ya pasó con «Ir a pagar», 2026-09-09, documentado en
`packages/api-client/src/index.ts:40-57`.)

**Dirección.** Que **una sola RPC** haga todas las comprobaciones y devuelva un error de dominio
estructurado (ver `DAT-03`); la ruta se reduce a *autenticar → idempotencia → RPC*. Paralelizar
las lecturas que quedasen independientes (`Promise.all`). Enviar el evento a Inngest **fuera del
camino crítico** (o eliminarlo, `ARQ-06`).

---

## PER-04 · Polling en todas partes

| | |
|---|---|
| **Severidad** | Medio |
| **Bloquea el móvil** | No |
| **Esfuerzo** | M |

**Evidencia.** `[CÓDIGO]` `[DB-PROD]`
- **Tracking del cliente:** `GET /public/orders/:shortId` **cada 8 s** mientras la pestaña es
  visible (`features/tracking/hooks/use-tracking.ts:51-66`), más Realtime como acelerador. Los
  datos lo confirman: **4 836 llamadas a `get_tracking`** en 58 días para **97 pedidos** del canal
  cliente ≈ **50 por pedido** (~15 ms cada una en la base).
- **Bandeja del motorizado:** *poll* de 15 s (DECISIONS §29).
- **Cuatro crons cada minuto, 24 h**, incluidos los que barren la cola de un negocio cerrado
  (≈ 5 800 ejecuciones diarias). `[DB-PROD]`
- `is_within_platform_schedule` se consulta **7 906 veces** por PostgREST (12 ms cada una): un dato
  casi estático leído por sondeo. `[DB-PROD]`

**Por qué importa.** Con push nativo, Live Activities y *Broadcast*, casi todo este sondeo sobra: en
iOS, además, un sondeo en segundo plano ni siquiera se ejecuta.

**Dirección.** Push + Live Activity + *Broadcast* por pedido como camino principal; sondeo solo en
primer plano, con *backoff* y `If-None-Match`; poner `max-age` a lo casi estático.

---

## PER-05 · El 65 % del tiempo de la base es el propio Realtime (`postgres_changes`)

| | |
|---|---|
| **Severidad** | Medio (hoy) · Alto (con escala) |
| **Bloquea el móvil** | No |
| **Esfuerzo** | M |

**Evidencia.** `[DB-PROD]` `pg_stat_statements`, ventana 2026-07-24 → 2026-09-20 (58 días):

| Consumidor | Tiempo | Peso |
|---|---|---|
| Realtime: consulta del WAL (`SELECT wal->>… as type`, **2,71 M llamadas**, 7,6 ms de media) | 20,49 M ms | **65,2 %** |
| Realtime: introspección de la publicación | 1,30 M ms | 4,2 % |
| Funciones de los crons (`cancel_expired_prepay_orders`, `enqueue_overdue_orders`, `expire_order_transfers`, `enqueue_queued_orders`, `close_drivers_outside_schedule`) | 4,60 M ms | 14,6 % |
| RPC de la aplicación vía PostgREST (`advance_order`, `create_customer_order`…) | 2,65 M ms | **8,4 %** |
| Total | 31,41 M ms (**8,7 h**) | |

`orders` (98 columnas) está en la publicación de Realtime, y cada `UPDATE` se autoriza **por
suscriptor** contra las políticas RLS. El coste crece con *suscriptores × cambios*.

**Por qué importa.** Hoy no duele. Pero un móvil con el seguimiento abierto sería **otro
suscriptor de `postgres_changes` sobre la tabla más caliente**. El equipo ya lo entendió para la
bandeja de motorizados (migración 0231: *Broadcast* privado en vez de `postgres_changes`).

**Dirección.** Para el cliente nativo, **no** usar `postgres_changes` sobre `orders`: un canal
*Broadcast* privado por pedido (`order:<id>`, emitido por trigger con `realtime.send`) o, mejor, el
propio push. Retirar de la publicación las tablas que ya no lo necesitan.

---

## PER-06 · Políticas RLS múltiples e índices: ruido hoy, deuda mañana

| | |
|---|---|
| **Severidad** | Bajo |
| **Bloquea el móvil** | No |
| **Esfuerzo** | S-M |

**Evidencia.** `[ADVISOR]` (performance, `tindivo-prod`):
- **63 avisos `multiple_permissive_policies`:** `orders` tiene **4 políticas de lectura** que se
  evalúan en cada consulta (`ord_admin_all`, `ord_business_read`, `ord_customer_read`,
  `ord_driver_read`); el patrón se repite en `menu_items`, `business_schedule`, etc.
- **30 claves foráneas sin índice** (nivel INFO), casi todas columnas de auditoría
  (`*_by`, `updated_by`); las que importan: `customer_order_items.menu_item_id`,
  `customer_incidents.order_id`/`customer_user_id`.
- **13 índices sin uso** (INFO), incluidos `orders_waiting_queue_idx`, `orders_requires_validation_idx`,
  `orders_customer_gps_distance_idx`, `orders_pickup_timing_idx`. Con 716 pedidos «sin uso» no
  significa «sobra»; sí indica que se crean índices de forma especulativa.
- **Bien hecho:** no hay `auth_rls_initplan` (las políticas envuelven `auth.uid()` en `(select …)`,
  se ve en `pg_policies`) ni `function_search_path_mutable`.

**Dirección.** Fusionar políticas por rol y acción cuando el volumen lo pida; indexar solo FK que
participen en joins o en borrados en cascada. No es urgente.

---

## PER-07 · La Edge Function `send-push`: serial, con arranque en frío y sin métricas

| | |
|---|---|
| **Severidad** | Medio (Alto para marketing) |
| **Bloquea el móvil** | Parcial |
| **Esfuerzo** | M |

**Evidencia.** `[CÓDIGO]` `supabase/functions/send-push/index.ts` (**1 127 líneas**) `[PRUEBA]`
- Cada suscripción se envía **en serie** con tres `await` (enviar, `insert` en el log, `update`
  de la suscripción): `:1064-1117`. Cada evento hace **5-8 consultas** para armar el texto
  (`orderBrief`, `driverFirstName`, `timerMinutes`…).
- El disparador (`dispatch_event`) usa `net.http_post` sin comprobar la respuesta; `pg_net` corta a
  ~2 s por defecto.
- Una llamada **sin efectos** (evento inexistente) tardó **2,28 s** de punta a punta desde el equipo
  de trabajo, con arranque en frío.
- El objetivo declarado («P99 < 5 s», `DECISIONS.md:491`) **no se mide en ningún sitio**.

**Por qué importa.** Para transaccionales a un puñado de usuarios funciona. Para una **campaña de
marketing** a cientos o miles de dispositivos, el envío serial no sirve.

**Dirección.** Separar **resolver** (qué avisar a quién, en la base o en un worker) de **enviar**
(lotes paralelos con límite de concurrencia hacia FCM/APNs), y medir latencia extremo a extremo
(ver `NOT-08`).

---

## Presupuesto de latencia: cómo debería verse una petición móvil

| Tramo | Hoy (medido/derivado) | Objetivo razonable |
|---|---|---|
| Red Perú → borde + TLS (conexión nueva) | ~0,2 s | ~0 (HTTP/2 reutilizado en nativo) |
| Borde `gru1` → función `iad1` | ~0,11-0,13 s | 0 si la función está en `gru1` |
| Autenticación (`getUser` + `user_roles`) | ~0,27 s | ~0 (JWT local + *claims*) |
| Rondas de la lógica (crear pedido) | 1,4-2,2 s | 1-2 rondas (~0,15-0,3 s) |
| RPC en la base | 0,15 s | 0,15 s |
| **Total crear pedido** | **≈ 2-3 s** | **≈ 0,5-0,8 s** |

Es una **estimación de lo que se gana**, no una promesa: depende de confirmar la región (`PER-02`).

## Resumen de este documento

| ID | Hallazgo | Sev. | Bloquea | Esf. |
|---|---|---|---|---|
| PER-01 | 2 rondas de autenticación por petición (~0,27 s) | Alto | No | S-M |
| PER-02 | Función en `iad1` y base en `us-west-2` (confirmado); ronda a la base ≈ 0,13 s | Alto | No | S / L |
| PER-03 | Crear pedido = 11-17 rondas secuenciales (≈ 2-3 s) | Alto | No | M |
| PER-04 | Sondeo de 8 s / 15 s / 1 min por todas partes | Medio | No | M |
| PER-05 | 65 % del tiempo de base es Realtime `postgres_changes` | Medio | No | M |
| PER-06 | 63 políticas permisivas múltiples, 30 FK sin índice, 13 índices sin uso | Bajo | No | S-M |
| PER-07 | `send-push` serial, arranque en frío, sin métricas | Medio | Parcial | M |
