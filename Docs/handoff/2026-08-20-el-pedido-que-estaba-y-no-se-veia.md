# Handoff — el pedido que estaba y no se veía

> El encargo fue uno solo: *"cuando creo un pedido manual desde el dashboard de
> negocios, hay veces en las que no se ve de inmediato en cocina; es como si
> creara pero no está, pero sí aparece al motorizado"*. El pedido siempre estuvo
> bien creado. Lo que fallaba era que el tablero se enterase — y tirando de ese
> hilo salió un contador que lleva doce días mintiendo, cuatro índices duplicados
> que el linter no ve, y una definición de "jornada" que existe desde la 0154 y
> **no usa absolutamente nadie**.

---

## Lo urgente (si solo lees una cosa)

Todo hecho y commiteado en `develop`, **nada pusheado y nada en producción**:

| Commit | Qué |
|---|---|
| `6fe4fd0` | El síntoma original: el pedido manual no aparecía en cocina |
| `b30b8a0` | Este handoff |
| `74dd6dd` | `0176` + `serviceDate()`: una noche es un día, en toda la app |
| `39e3b8e` | `0177`: cinco índices que nadie puede usar |
| `50bcd57` | El contador de doce días y el chip que no cuadraba con su lista |

**`0176` y `0177` están aplicadas SOLO en local** (`supabase migration up`), con
sus guards en verde y verificadas contra el objeto vivo. Faltan tres cosas, en
este orden:

1. `supabase db push` a `tindivo-prod`.
2. `pnpm db:types` — **después** del push, que apunta al remoto.
3. Comprobar que `drivers_user_id_key` y `businesses_user_id_key` empiezan a
   sumar escaneos: es la confirmación de que el gemelo tomó el relevo de los
   índices borrados. Ver la sección de índices.

Y una cosa que conviene saber antes de tocar nada: **el Realtime de `negocios`
se deja eventos**, medido contra producción. No es que el canal esté caído — se
reporta sano y entrega la mitad de las veces. Cualquier pantalla que dependa solo
de Realtime para estar al día está apoyada en algo que falla la mitad de las
veces.

---

## El hallazgo estructural

**Crear un pedido era la única mutación del dashboard que no refrescaba el
tablero.** Las nueve acciones de `use-order-actions.ts` llaman a `refetchOrders()`
después de mutar. `useCreateOrder` hacía `router.replace('/')` y nada más.

Y eso solo se nota porque el chrome del dashboard —que es quien tiene el estado
`rows`— **vive en el layout**: navegar `/nuevo → /` no lo remonta ni dispara
ninguna consulta. El tablero se quedaba exactamente como estaba antes de abrir el
formulario, esperando a que llegara un evento de Realtime.

**La lección: en un layout persistente, "navegar a otra pantalla" no refresca
nada.** La intuición de que volver a una página la recarga es de la web de toda
la vida, y en el App Router con estado en el layout es falsa.

---

## Cómo se midió que Realtime falla

Esta es la parte que vale para el futuro, porque el método sirve para cualquier
duda parecida.

La consulta del tablero es identificable en `edge_logs` por su firma
(`...driver:drivers(full_name)&order=created_at.desc&limit=100`). Cruzando la
hora exacta de cada pedido manual en `orders` con el siguiente GET de esa firma
—mismo negocio, misma sesión, mismo dispositivo Windows— sale esto:

| Pedido creado | Siguiente refresco | |
|---|---|---|
| 00:53:33 | 00:53:34.9 → **1,5 s** | Realtime |
| 01:06:55 | 01:08:33 → **97,9 s** | se perdió el evento |
| 01:20:52 | 01:27:26 → **6 min 34 s** | se perdió, y el poll tampoco corrió |
| 01:33:34 | 01:33:35.6 → **1,1 s** | Realtime |
| 02:39:24 | 02:39:25 → **~1 s** | Realtime |
| 02:53:48 | 02:54:41 → **53 s** | se perdió |
| 02:57:23 | 02:57:25 → **1,2 s** | Realtime |

En los tres fallos el fetch anterior había sido 16-29 s antes, así que **no fue
el dedupe del hook**: el evento no llegó. Y hay tramos largos con huecos de
exactamente `90.0, 90.0, 90.0` — el poll solo, sin un evento en varios minutos.

**Por qué el motorizado sí lo veía**, que era la parte más desconcertante del
reporte: su app sondea cada **15 s** (`use-driver-orders.ts`, `POLL_MS`), no cada
90, y además recibe push en `OrderCreated` (`send-push/index.ts:171`). La cajera
no recibe push **a propósito** —`newOrderBusinessNotes` descarta `preparing`
porque "lo acaba de teclear ella"—, así que se quedaba con el único canal que
falla y sin red de seguridad.

**Queda una pregunta abierta**: la única diferencia estructural entre el canal
que pierde eventos y el que no es que `negocios` filtra
(`filter: business_id=eq.${bizId}`) y `motorizados` no. Es una hipótesis sin
comprobar. El método de arriba sirve para medirla.

---

## Lo que se arregló — `6fe4fd0`

Cuatro cosas, de más a menos culpable, más un número.

1. **`useCreateOrder` refresca antes de navegar.** `await refetchOrders({ force: true })`
   en los dos caminos (el normal y el reintento por conflicto de idempotencia).
   El pedido está en `rows` antes de que el tablero se pinte.
2. **La pestaña móvil ya no aterriza en un estado muerto.** "Nuevos" arranca
   seleccionada y su chip **no se dibuja** cuando el contador está a cero
   (deliberado). Como el pedido manual nace en `preparing`, la cajera enviaba el
   pedido y volvía a una pantalla que decía *"Sin pedidos nuevos"* con las tres
   pestañas visibles **todas sin seleccionar**. Se resuelve derivando
   (`resolveMobileTab`), no navegando: así cubre también el otro camino al mismo
   sitio — quedarse en "Nuevos" cuando el último pasa a cocina y el chip
   desaparece bajo los pies.
3. **Los refetch ya no se descartan, se aplazan.** Los guardas de solapamiento y
   cooldown de `usePolledQuery` hacían `return` a secas. Para el `setInterval` da
   igual, vuelve solo; para un evento de Realtime, que ocurre **una** vez, es
   perderlo. Ahora se anotan (`pendingRef`, timer de cooldown) y se saldan al
   terminar el fetch en vuelo o al expirar la ventana.
4. **Catch-up al reconectar el canal.** `postgres_changes` no reenvía lo que pasó
   mientras estuvo caído, y el backoff llega a 30 s. Al volver a `SUBSCRIBED`
   **tras una caída** se refresca; en el primero no, que ahí ya hizo la carga
   inicial `usePolledQuery`.
5. El poll de respaldo baja de **90 s a 30 s**. Con `pending_acceptance`
   autocancelándose a los 5 minutos, 90 s de ceguera eran un tercio del plazo.

Verificado: `type-check` limpio, 61 tests (5 ficheros), `next build` de negocios
OK, y biome con **exactamente las mismas 21 advertencias** que antes de tocar
nada (todas preexistentes).

---

## El contador que lleva doce días mintiendo

`chrome.tsx` hace `if (v.status === 'delivered') n.today++` sobre las **100 filas
más recientes sin ningún filtro de fecha**. No hay ninguna noción de "hoy" en ese
contador. Medido contra producción:

| Negocio | Dice el tablero | Entregados hoy de verdad | El más viejo que cuenta |
|---|---|---|---|
| Pizza Priamo | **80** | 0 | 8 de agosto |
| La Florencia | **21** | 0 | 13 de agosto |
| Pollería Nadia | **19** | 0 | 15 de agosto |

Y no crece indefinidamente por casualidad: **se congelará en 100** cuando el tope
del `.limit(100)` lo alcance, dejando de moverse sin avisar.

Hay una segunda incoherencia encima: el chip "Entregados" cuenta **solo
`delivered`** y sin recortar, mientras la lista de debajo enseña
**`delivered` + `cancelled`** recortada a 40 (`page.tsx`, `.slice(0, 40)`). Priamo
ve un `80` encima de 40 filas que incluyen cancelados.

Las dos salen de lo mismo: **la consulta del tablero no tiene ventana**, y cada
consumidor recorta a su manera.

---

## `current_service_date` existe desde la 0154 y no la usa nadie

Buscando cómo definir esa ventana apareció lo de verdad interesante. La migración
**0154** ya resolvió el problema de la jornada nocturna:

```sql
create or replace function public.current_service_date(p_at timestamptz default now())
-- 'Jornada operativa a la que pertenece un instante. Empieza a las 05:00 de
--  Lima para que la madrugada cuente como el día anterior.'
  select (timezone('America/Lima', coalesce(p_at, now())) - interval '5 hours')::date
```

Su propia cabecera dice el porqué: *"Un negocio que cierra a la 1 de la madrugada
sigue en la jornada del día anterior: si usáramos la fecha natural, a las 00:00 le
saltaría otra vez el '¿abren hoy?' en plena faena."*

**Y no la llama nadie fuera de la propia 0154.** Ocho sitios deciden "qué día es"
con la fecha de calendario:

| Sitio | Qué decide | Estado |
|---|---|---|
| `deliver_order_cash` (0157:122) | `settlement_date` de cada liquidación | vivo |
| `negocios use-cash-settlements.ts:236,240` | arrastre / cerrado hoy / historial | vivo |
| `negocios driver-card.tsx` `cuando()` | si marca "ayer" en cada línea | vivo |
| `motorizados efectivo-list.tsx` `cuando()` | ídem | vivo |
| `generate_settlements` (0017:32) | período de la factura de comisiones | sin llamador |
| `create_cash_settlement` (0018:40) | agrupación por día | muerto desde 0157 |
| backfill 0111:91 | histórico | no se toca |
| el arreglo del tablero | jornada del historial | **iba a ser el noveno** |

El patrón **ya mordió antes** y se arregló en un solo sitio: el endpoint del
motorizado lleva escrito *"Cuando esta consulta sí filtraba por el día de Lima,
ese dinero desaparecía de la pantalla a medianoche sin que nada hubiera pasado"*.

### Un diagnóstico que corregí a mitad

Primero afirmé que el repo "se contradice todas las noches". **Es falso**, y la
razón importa: la **0157** ya sacó `settlement_date` de toda decisión de
agrupación (*"y ya no participa en ninguna decisión de agrupación"*), y el
`create_cash_settlement` de la 0111 —el que sí agrupaba por fecha, y que habría
dejado un ciclo huérfano cada noche— **ya no lo llama nadie desde la app**.

Los datos lo confirman: **0 de 44 liquidaciones** tienen `settlement_date`
distinto de su jornada. Y se ve por qué:

| Hora Lima de entrega | 18 | 19 | 20 | 21 | 22 | 23 | 00-05 |
|---|---|---|---|---|---|---|---|
| Entregas | 2 | 31 | 32 | 24 | 21 | 8 | **0** |

Ningún turno configurado cruza medianoche: Florencia y Priamo cierran 23:00,
Nadia 22:00, y `crosses_midnight` es `false` en las 20 filas de horario.

**Conclusión honesta: hoy es latente, no vivo.** Se vuelve vivo el día que un
negocio ponga cierre a las 00:30 — que el esquema soporta explícitamente y que en
un delivery nocturno es cuestión de tiempo. Ese día fallan los cuatro sitios vivos
a la vez. Arreglarlo ahora cuesta un backfill de **cero filas**; después, no.

**La lección: "se contradice" y "se contradice hoy" son afirmaciones distintas, y
la diferencia la dan los datos, no la lectura del código.**

---

## Audit de índices

### El linter de Supabase no detecta índices duplicados

Hay que buscarlos a mano, comparando columnas, método y predicado sobre
`pg_index`. Salieron **cuatro**, y los dos más calientes de la base están entre
ellos:

| Índice | Lo cubre | Escaneos | Tipo |
|---|---|---|---|
| `drivers_user_id_idx` | `drivers_user_id_key` | **37.606** | duplicado exacto |
| `businesses_user_id_idx` | `businesses_user_id_key` | **15.976** | duplicado exacto |
| `orders_short_id_idx` | `orders_short_id_key` | 707 | duplicado exacto |
| `ps_user_idx` | `push_subscriptions_user_id_endpoint_key` | 130 | prefijo redundante |

Los cuatro gemelos únicos tienen **0 escaneos**. Eso NO significa que estén
muertos: con dos btrees equivalentes el planner elige uno y se queda con él. Al
quitar el sobrante, los escaneos pasan al que queda, con el mismo coste.

Verificado antes de proponer el drop: ninguno de los cuatro respalda constraint
(`pg_constraint`), ninguno se nombra en el repo salvo en su `create index` de la
0002, y las tablas están en `REPLICA IDENTITY FULL` (ninguno hace de identidad de
réplica).

**Un quinto, por otra razón distinta: `orders_risk_flags_gin_idx`.** Es un GIN
sobre jsonb y **no hay ni una consulta en el repo que use operadores de
contención** (`@>`, `?`, `?|`) sobre `risk_flags` — se lee como columna normal.
No está sin usar por pequeño: está sin usar **por imposible**, y un GIN paga
mantenimiento en cada escritura.

### Los otros 9 "unused index": NO tocar

El linter marca 10 sin usar. Nueve son falsos positivos, y el dato lo explica:

> `orders`: **143 filas, 112 kB de datos, 352 kB de índices, 20 índices.**

Con 143 filas el planner hace seq scan para casi todo. "Nunca usado" ahí
significa **"la tabla es demasiado pequeña"**, no "el índice sobra". Dropearlos
sería optimizar para hoy y pagarlo al crecer. Los redundantes son otra cosa:
nunca los va a elegir, tenga la tabla 143 filas o 143.000.

### Las 28 FK sin índice: tampoco

Una FK sin índice duele al **borrar la fila padre** (Postgres escanea la hija) o
al filtrar por esa columna. Revisados los caminos de borrado reales del repo
(`delivery_zones`, `driver_restaurants`, `push_subscriptions`, `menu_categories`,
modificadores): **en las 28 el padre es `users`, `orders` o `reports`, y ninguno
de los tres se borra nunca**. `menu_items` tampoco — no hay un solo `.delete()`
sobre esa tabla. Revisar el día que exista "borrar mi cuenta".

### Por qué esos índices están tan calientes (y no lo arregla ningún índice)

54 avisos de `multiple_permissive_policies`. En `orders` hay **cuatro policies
permisivas de SELECT** para `authenticated` (admin, business, driver, customer) y
Postgres las evalúa **todas, con OR, por cada fila**. De ahí que
`current_driver_id()` y `current_business_id()` acumulen 37.606 y 15.976 escaneos
sobre tablas de 4 y 6 filas.

Ese es el coste real y es estructural. **No se toca en esta sesión**: fusionar
policies de RLS es cirugía de seguridad y merece la suya.

**Suelto:** `business_charges` tiene la única policy del repo con `auth.uid()`
sin envolver (0073, escrita en otro estilo que el resto). Todas las de la 0004
usan `(select auth.uid())`. Se reevalúa por fila.

### Una falsa alarma que perseguí hasta el final

La 0073 creaba `Service role can manage charges` como `FOR ALL USING(true)` sin
cláusula `TO`, o sea **a PUBLIC**: sobre el papel, cualquier autenticado
leyendo y escribiendo todos los cargos. Comprobado el estado real en producción
con `pg_policy`: **la 0101 ya lo restringió a `service_role`**. No hay agujero.

**La lección: el `CREATE POLICY` de una migración no es el estado de la base.**
Una migración posterior pudo cambiarlo, y `pg_policy` es la única fuente.

---

## Lo que se hizo con todo eso

**`0176` — la jornada como definición única.** `deliver_order_cash` y
`generate_settlements` pasan a `current_service_date(...)`, más el backfill de
`cash_settlements.settlement_date` (0 filas hoy, que es justo el punto) y guards
que abortan si algún sitio queda con el cast viejo. No se toca el backfill
histórico de la 0111.

**`serviceDate()` en `packages/contracts`**, espejo exacto de la función de la
base, con tests de los dos bordes (04:59 y 05:01) y del cambio de mes y de año.
Lo consumen `use-cash-settlements.ts`, `driver-card.tsx`,
`motorizados/efectivo-list.tsx` y el tablero. Y **dos tests de integración
nuevos** fabrican la entrega de madrugada que en producción todavía no puede
ocurrir: son la red que sujeta el arreglo cuando alguien configure un cierre
después de medianoche.

**`0177` — los cinco índices** y el `(select auth.uid())` de `business_charges`.

**El tablero, segunda tanda.** La consulta partida en dos (`Promise.all`):
activos sin ventana de tiempo (`ACTIVE_ORDER_STATUSES`, que ya existía en
contracts) y cerrados de la jornada, ambas con `.eq('business_id', bizId)`. Fuera
el `.slice(0, 40)`. El rótulo "hoy" **se quedó**: bajo la jornada deja de ser
mentira sin cambiar la palabra.

**Los dos `default` que se tragaban estados nuevos**, cerrados con `switch`
exhaustivo sobre `OrderStatus` y chequeo `never`. Tipar `status` destapó de paso
que `useOrderDetail` metía un `string` sin validar dentro del view-model — o sea
que por ahí entraba al tablero un estado que se saltaba toda la exhaustividad.
Ahora se valida con zod al rehidratar, y el `catch` fail-open que ya existía
cubre el caso raro.

### Una corrección al propio handoff

Más arriba esta página decía que `create_cash_settlement` era "código muerto".
**No es código muerto: no existe.** La 0157 la borró (`drop function`, línea
228). Se descubrió al intentar ponerle un `comment on function` y ver reventar la
migración. Conviene saberlo porque su código sigue leyéndose entero en la 0111 y
da toda la impresión de estar vivo.

### Lo que costó dos intentos

La primera versión de `0176` abortaba en su propio guard. El guard comprueba que
`deliver_order_cash` ya no contenga el cast de fecha natural, buscando esa cadena
en `pg_get_functiondef`... y **`pg_get_functiondef` incluye los comentarios del
cuerpo**. El comentario que explicaba qué se estaba cambiando citaba el cast
literal, así que la función fallaba por su propia explicación.

Y el guard tenía un segundo defecto que no llegó a dispararse: comparaba
`settlement_date` contra CADA pedido enlazado, mientras el backfill escribe un
`min(...)` por liquidación. Una liquidación de la época multi-pedido (0111) que
cubriera dos jornadas habría hecho abortar una migración que hizo exactamente lo
que debía. **En local las hay**, porque los tests de efectivo llamaban de verdad
a `create_cash_settlement` cuando existía. Ahora el guard agrega igual que el
backfill.

### Verificación

`pnpm type-check` 11/11, `pnpm test` 9/9 (**146 tests en `apps/api`**, dos más
que antes: los de madrugada), `pnpm lint` sin errores (92 warnings, la línea base
conocida) y `pnpm build` 5/5. Las dos migraciones aplicadas en local y
comprobadas **contra el objeto vivo**, no contra el fichero: las dos funciones
usan `current_service_date`, los cinco índices no están, los cuatro únicos que
los cubren sí, y la policy quedó envuelta.

---

## Deuda registrada, sin implementar

1. **El canal filtrado de `negocios`.** Única diferencia estructural con el de
   motorizados, que no pierde eventos. Hipótesis sin comprobar; el método de
   medición está en la sección de arriba.
2. **Las 54 policies permisivas múltiples.** Cirugía de RLS, sesión propia.
3. **`generate_settlements` (0017) no lo llama nadie.** La factura de comisiones
   negocio→Tindivo no está cableada a ninguna pantalla. La 0176 ya la dejó
   contando por jornada, para que el día que se cablee no arrastre el defecto.
4. **`apps/negocios` no tiene entorno DOM en los tests.** Los dos ficheros de
   `hooks/__tests__/` que parecen probar `usePolledQuery` **no importan el hook**:
   reimplementan la lógica y prueban la copia. Para cobertura real hace falta
   `@testing-library/react` + jsdom.
5. **`CLAUDE.md` dice "commits en inglés"** y los últimos 25 commits son en
   español. La convención viva es el español; conviene corregir la línea.

---

## Siguiente paso que yo daría

1. **Pushear y desplegar**, en este orden: `supabase db push` a `tindivo-prod`,
   luego `pnpm db:types` (apunta al remoto), luego el merge. Cinco commits
   viviendo solo en local es exactamente la situación que le costó un día entero
   a la sesión del 18-ago.
2. **Comprobar los contadores de índices** tras la 0177: que
   `drivers_user_id_key` y `businesses_user_id_key` empiecen a sumar escaneos es
   la confirmación de que el gemelo tomó el relevo. Es la única parte del cambio
   de índices que no puede verificarse antes de aplicarlo.
3. **Mirar el tablero de la cajera esta noche.** El contador ya no puede mentir
   por construcción, pero nadie ha visto todavía la pantalla con la consulta
   nueva y datos reales.
4. **Medir el canal filtrado** con el método de `edge_logs`, que es la única
   pregunta abierta que deja el arreglo del tablero.
