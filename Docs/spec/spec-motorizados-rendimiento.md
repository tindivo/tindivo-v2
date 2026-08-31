# Spec de trabajo — Rendimiento de la app Motorizados

**Repo:** `tindivo-v2` · **Rama base:** `develop` · **Commit de referencia:** `2539573`
**Fecha de la auditoría:** 2026-08-29
**Estado del baseline:** `pnpm type-check` limpio · `pnpm test` 92/92 en verde (5 archivos)

> Auditoría de `apps/motorizados` y del camino de API que consume. Las partes están
> ordenadas por relación coste/beneficio: la PARTE 1 sola quita cerca de la mitad
> del tráfico de la app en todas las rutas.

---

## Método y procedencia de los números

Todo lo cuantificado aquí se midió, no se estimó a ojo. Cuando un número viene de
la base, viene de **`tindivo-prod`** (remoto, ref `zpnipajgwfthxhdtzhly`), leído por
MCP. Ninguna consulta se lanzó contra la local, y ninguna escribió nada.

- **Peso del board:** las 50 filas de `BOARD_COLUMNS` suman **24 948 bytes** en crudo
  (`sum(octet_length(t::text))`). La respuesta PostgREST, con claves JSON, ronda los
  50 KB sin comprimir.
- **Volumen real:** pico de **29 pedidos/día** en todo el sistema (2026-08-17).
- **Push:** 4 099 envíos registrados en `push_delivery_log` entre el 2026-08-10 y hoy,
  **100 % `ok`, cero errores de cualquier tipo**.

---

## REGLAS DURAS — leer antes de escribir una línea

1. **Una parte a la vez.** No empieces la PARTE N+1 hasta que el humano confirme que
   la N pasó. Si un criterio falla, detente y reporta.

2. **Alcance de archivos.** Cada parte lista los archivos que puede tocar. Si crees
   que necesitas uno de fuera, **detente y explica por qué**. No lo modifiques y sigas.

3. **Esto es un refactor de rendimiento, no de comportamiento.** Salvo donde la parte
   diga explícitamente lo contrario (PARTE 2), la app tiene que hacer exactamente lo
   mismo después que antes. Menos peticiones, mismos píxeles.

4. **Los comentarios largos que hay en estos archivos son documentación ganada a
   base de bugs.** Al mover código, el comentario se mueve con él. Si un comentario
   deja de ser cierto, se reescribe; **no se borra en silencio**.

5. **Nada de SQL contra producción.** Si algo requiere SQL, produce el SQL y detente.
   El humano lo ejecuta.

6. **Migraciones aplicadas son inmutables.** Si algo cambia, es una migración nueva.
   Antes de crear una, `supabase migration list` para ver el primer número libre —
   dos agentes pueden coger el mismo `NNNN_` y el error estalla en `schema_migrations`,
   lejos de la causa.

7. **Evidencia de red, no de código.** Para las partes 1 y 3 la prueba no es el diff:
   es el panel de red con el contador de peticiones antes y después. Un diff que
   "debería" reducir peticiones no vale.

8. **No inventes.** Si algo no lo encuentras, escribe `NO ENCONTRADO`.

---

## PARTE 0 — Gate de estado limpio

**Esto lo hace el humano, no el agente.**

En el momento de escribir este spec el árbol tenía 4 archivos modificados sin
commitear, y ninguno es de este trabajo:

```
 M apps/customer/components/map-picker-inner.tsx
 M apps/motorizados/components/order/address-capture-sheet.tsx
 M apps/motorizados/components/order/map-picker-inner.tsx
 M apps/motorizados/components/order/map-readonly-inner.tsx
```

Son de otro agente trabajando sobre los mapas. Dos de ellos están en `apps/motorizados`,
así que sin resolver esto el diff de cualquier parte de abajo es imposible de separar
de ese trabajo.

**Criterio de paso:** `git status --short` vacío, o mostrando únicamente archivos de
la parte en curso.

---

# BLOQUE I — Peticiones duplicadas

Este bloque es el grueso del coste y no cambia ni un píxel.

## Diagnóstico común

`useDriverOrders`, `useCashSummary`, `useAvailability`, `usePushSubscription` y
`useDriverTimers` son **hooks con estado propio, no stores**. Cada montaje trae su
fetch, su canal realtime y su poll.

El patrón correcto **ya existe en este repo**: `useTeam` (`hooks/use-team.ts`) es un
store de módulo con `useSyncExternalStore` y contador de referencias, y su cabecera
documenta exactamente por qué. `useNow` es lo mismo para el reloj. Las partes de abajo
no inventan un patrón: aplican el que ya está escrito y probado aquí al lado.

---

## PARTE 1 — `useDriverOrders` a store

### El problema

`CapacityIndicator` vive en `DriverShell`, o sea que se monta en **todas** las rutas
del grupo `(driver)`. Llama a `useDriverOrders` para pintar `1/3`. La página también
lo llama. Resultado: **dos instancias completas en todas partes**.

Cada instancia son, al montar:

- `supabase.from('drivers').select('id')` — `use-driver-orders.ts:87`
- `supabase.rpc('driver_businesses')` — `use-driver-orders.ts:80`
- `supabase.from('orders').select(BOARD_COLUMNS).limit(50)` — ~50 KB
- un canal realtime sobre `orders` — `use-driver-orders.ts:96`
- un `setInterval` de 15 s desfasado 7 s

Y en régimen, **8 fetches de board por minuto donde bastan 4**.

Lo peor no es el poll: son **los dos canales realtime sobre la misma tabla**. Un solo
cambio de fila dispara **dos refetches completos de 50 filas**, no uno.

Efectos colaterales del mismo defecto:

- **Tres consultas a `drivers` en el mismo montaje** para leer una sola fila: dos
  piden `id` (`use-driver-orders.ts:87`, ×2 instancias) y una pide `full_name`
  (`driver-shell.tsx:39`).
- **`rpc('driver_businesses')` ×2**, más una tercera vía `useDriverBusinesses` si
  estás en `/restaurantes`.
- **`/restaurantes` y `/perfil` pagan un fetch de 50 pedidos cada 15 s** para pintar
  un indicador de mochila, sin que haya ningún tablero en pantalla.

### El caso aparte: `/pedido/[id]`

`app/pedido/[id]/page.tsx:50` monta el board **entero** —50 filas, el RPC de locales,
la consulta de `drivers`, un canal y un poll— para consumir exactamente dos escalares:

```
313:  const blockedByOverdue = mode === 'preview' && board.hasOverdueAvailable && !esUrgente
314:  const blockedByCapacity = mode === 'preview' && board.mySlots >= 3
```

Encima de su propio `load()` cada 20 s, su propio canal y su propio `visibilitychange`.
Son ~7 peticiones/minuto en la pantalla que el motorizado tiene abierta **mientras
conduce**, que es justo donde la señal del pueblo es peor y la batería más cara.

**CORRECCIÓN sobre la primera versión de este spec.** Escribí que con el store esta
página «hereda la instancia caliente y no pide nada». **Es falso.** La página está
fuera del grupo `(driver)`, así que al navegar a ella `DriverShell` se desmonta
entero: el `refCount` del store baja a cero, corre `stop()`, y la propia página vuelve
a arrancarlo. No hay nada caliente que heredar.

Consecuencia: **`/pedido/[id]` no mejora en la PARTE 1** — se queda igual que hoy, en
1 board cada 15 s. No empeora tampoco. Y es un camino frecuente, no marginal: las
notificaciones push enlazan directamente aquí, así que la apertura en frío es lo
normal, no la excepción.

Bajarlo a cero exige decidir de dónde salen esos dos escalares sin traer el pool
entero, y eso es un cambio de diseño, no un dedupe. **Queda fuera del alcance de la
PARTE 1** y anotado en el ANEXO como A3.

### Archivos permitidos

- `apps/motorizados/hooks/use-driver-orders.ts`
- `apps/motorizados/components/capacity-indicator.tsx`
- `apps/motorizados/components/driver-shell.tsx`
- `apps/motorizados/components/home/home.tsx`
- `apps/motorizados/app/(driver)/historial/page.tsx`
- `apps/motorizados/app/pedido/[id]/page.tsx`

### Qué hacer

1. Convertir `use-driver-orders.ts` en store de módulo, **calcado de `use-team.ts`**:
   `subscribe` con `refCount`, `start()` con el primer suscriptor, `stop()` con el
   último, `useSyncExternalStore` para leer el snapshot.

2. **Conservar entero** el comentario del poll de respaldo (`use-driver-orders.ts:104-133`).
   Explica por qué el poll no sustituye al realtime y por qué va desfasado 7 s respecto
   a `useTeam`. Con un solo board ese desfase **sigue haciendo falta**: son dos endpoints
   distintos y salir a la vez cada 15 s sigue siendo una estampida.

3. **Los derivados (`available`, `upcoming`, `mine`, …) dependen de `now` y `now` NO
   entra en el store.** El store guarda `orders` + `businesses` + `myDriverId`; los
   filtros por tiempo se quedan en el hook, alimentados por el `useNow()` de quien
   llama. Meter el reloj dentro del store obligaría a notificar a todos los
   suscriptores cada segundo, que es cambiar un problema por otro.

4. Unificar la consulta de `drivers`: **una sola** que traiga `id, full_name`, expuesta
   por el store. `DriverShell` lee el nombre de ahí y borra su `useEffect`.

5. `driver_businesses` sale del store una vez. Decide y **escribe en el diff** si
   `useDriverBusinesses` (que además trae los QRs) pasa a consumir esa misma lista o
   se queda aparte por los QRs; las dos opciones valen, la que no vale es no decidirlo.

### Criterio de paso

### RESULTADO — medido el 2026-08-29 · ✅ PASA

Medido en Chrome contra el dev server (`:3004`) con la base local, vía
`performance.getEntriesByType('resource')`. Dos avisos de método, porque sin ellos
los números no se reproducen:

1. **`performance.setResourceTimingBufferSize(5000)` antes de medir.** El buffer por
   defecto son 250 entradas y a partir de ahí **descarta en silencio**: el conteo se
   queda plano y parece que no hay tráfico.
2. **Hay que forzar `document.visibilityState = 'visible'`.** La pestaña que conduce
   la automatización está en segundo plano, y el poll se niega a correr ahí — que es
   justo lo que promete el código. Sin el override se miden ceros.

**Arranque** (una carga de `/`). Dev duplica por StrictMode; producción es la mitad:

| Petición | Antes | Después |
|---|---|---|
| `drivers?select=` | 6 | **1** |
| `orders?select=…` | 4 | **1** |
| `rpc/driver_businesses` | 4 | **1** |
| `app_settings?key=timers` | 6 | 6 → es la **PARTE 3** |

El 1 en vez de 3 sale de la guarda de `generation`: el montaje que StrictMode descarta
ni siquiera llega a consultar.

**Régimen**, marcas de tiempo reales de cada `orders?select=`:

```
ANTES:    t = 100, 100, 115, 115, 130, 130     →  2 cada 15 s  =  8/min
DESPUÉS:  t =  25,  40,  55                    →  1 cada 15 s  =  4/min
```

Los **pares** del «antes» son la firma exacta del defecto: dos instancias del hook
disparando el mismo fetch en el mismo segundo.

**Canales realtime.** Navegar `/` → `/historial` → `/` **no produce ningún `phx_join`
nuevo** (interceptado en `WebSocket.prototype.send`, verificado con un control
positivo sobre el tráfico saliente del socket): la shell no se desmonta, el `refCount`
nunca llega a cero y el canal se reutiliza. La unicidad del canal es además
estructural: hay **un solo** `.channel(canalUnico('drv-orders'))` en todo el
código, dentro de `start()`, y `start()` solo corre en la transición 0→1 del
`refCount`. No se contó el canal por instrumentación directa; se deduce de esas dos
cosas más el emparejamiento de fetches de arriba.

**Y además:**

- Indicador de mochila y nombre del motorizado: correctos (`3/3`, iniciales `ME`).
  Ojo con una falsa alarma: el motorizado del seed local se llama literalmente
  «Motorizado E2E», así que la cabecera dice «Motorizado» porque ese **es** su
  primer nombre, no porque el prop llegue nulo.
- `pnpm test` 92/92 · `pnpm type-check` limpio · `biome check` limpio.
- Único error en consola: `[availability] load failed`, porque la API de `:3001` no
  estaba levantada en esa máquina. Ambiental, preexistente, ajeno a este cambio.

### Trampa conocida

`canalUnico()` existe porque un `useRef` sobrevive al ciclo desmontar-montar de
StrictMode y la segunda suscripción pedía el mismo topic que la primera, que aún no
se había dado de baja. **El store hereda ese riesgo agravado**: en desarrollo React
monta y desmonta el árbol, y con `refCount` mal llevado `stop()` puede correr después
de que el nuevo `start()` ya abrió el canal. `use-team.ts` ya resuelve esto; cópialo,
no lo reinventes.

---

## PARTE 2 — La alarma de vencidos

**Esta parte SÍ cambia el comportamiento, y es el motivo por el que existe.**

### 2.1 · La alarma solo suena si ya estás mirando la pestaña

`useOverdueFeedback` se llama dentro de `available-tab.tsx:41`, y `AvailableTab` solo
se monta cuando `tab === 'available'` (`home.tsx:107`).

Con el motorizado en la pestaña "Míos" —que es **donde la propia app lo deposita al
arrancar si tiene trabajo** (`home.tsx:47`)— un pedido que entra en rojo no pita ni
vibra. Y al cambiar a "En espera" tampoco: `primedRef` arranca en `false` y el efecto
marca como *ya vistos* todos los vencidos que hubiera (`use-overdue-feedback.ts:16-20`).
`seenRef` y `primedRef` son `useRef` dentro del componente, así que **cada cambio de
pestaña destruye el estado de la alarma**.

Neto: el pitido solo existe para pedidos que se ponen rojos mientras el motorizado ya
está mirando esa pestaña concreta.

Es el espejo exacto del invariante de `negocios` documentado en
`lib/orders/attention.ts`: allí el sonido era global y las tarjetas locales, y esa
asimetría perdió un pedido en producción. **Aquí es al revés** — el dato es global
(`board.hasOverdueAvailable` ya se calcula en `use-driver-orders.ts:181` para toda la
app) y el sonido es local. El mismo fallo, girado.

### 2.2 · El pitido se agota solo a las ~6 alertas

`playAlertBeep` (`use-overdue-feedback.ts:47`) hace `new AudioCtx()` en cada llamada
y **nunca cierra el contexto**. `osc.stop()` para el oscilador, no libera el contexto.

Chrome limita a 6 `AudioContext` por documento. A partir del séptimo el constructor
lanza, y el `try/catch` de la línea 36 se lo traga en silencio. **Una noche con 6
alertas y el resto del turno es mudo, sin ningún síntoma.** La vibración sigue
funcionando, lo que hace el fallo todavía más difícil de notar: el motorizado siente
el aviso y da por hecho que el sonido está desactivado a propósito.

### Archivos permitidos

- `apps/motorizados/hooks/use-overdue-feedback.ts`
- `apps/motorizados/components/home/available-tab.tsx`
- `apps/motorizados/components/home/home.tsx`
- `apps/motorizados/components/driver-shell.tsx`

### Qué hacer

1. **Subir la alarma al chrome.** `useOverdueFeedback` pasa a llamarse donde el board
   vive de verdad, no donde se pinta una pestaña. Con la PARTE 1 hecha, el store ya da
   el dato desde cualquier sitio. Sonará en `/`, `/efectivo`, `/historial` y
   `/restaurantes` por igual.

2. **`seenRef` fuera del componente.** Que sobreviva al cambio de pestaña y a la
   navegación entre rutas. Al montar el store, no al montar una pestaña.

3. **Un solo `AudioContext` de módulo**, creado perezosamente y reutilizado. Si está
   en estado `suspended` (política de autoplay), `resume()` antes de sonar. Nunca más
   de uno vivo.

4. **La condición de sonar y la de ver salen de la misma llamada.** Si añades un
   aviso visual, que lea el mismo valor que dispara el sonido, no un filtro paralelo.
   Es la regla que `negocios` aprendió pagando un pedido.

### RESULTADO — medido el 2026-08-30 · ✅ PASA (con una reserva)

**La alarma ya no depende de la pestaña. Probado en runtime**, y más fuerte de lo que
pedía el criterio: se probó desde **`/efectivo`**, que no es siquiera la pantalla del
tablero.

Montaje: se creó un pedido `waiting_driver` sin motorizado con
`estimated_ready_at = now() - 12 min` en la base local, con `navigator.vibrate`
interceptado en el navegador.

```
1. Carga con un vencido ya presente  →  vibraciones: []      (prime correcto,
                                                              no revienta al abrir)
2. Navegación real a /efectivo       →  vibraciones: []
3. INSERT de un vencido NUEVO        →  vibraciones: ["400,150,400,150,400"]
```

Ese patrón es exactamente el de la alarma de vencidos. Antes del cambio esto era
**imposible**: el hook solo existía dentro de `AvailableTab`.

**RESERVA — el `AudioContext` único NO se probó en runtime.** Lo intenté dos veces
parcheando `AudioContext.prototype.createOscillator` y las dos veces **congelé el
renderer** (CDP `Runtime.evaluate` a 45 s sin respuesta). Desistí para no quemar más
tiempo. Lo que sí se puede afirmar es estructural y se lee en tres líneas: hay un
`let ctx` de módulo y `getCtx()` devuelve el existente si no es `null`, así que solo
puede construirse uno. Pero **no hay evidencia de ejecución de las 7 alertas**, que es
lo que el criterio pedía. Queda pendiente y es barato de hacer a mano: siete vencidos
seguidos en un turno, y comprobar que el séptimo se oye.

**Nota de método para quien repita esto:** los pedidos de prueba **desaparecen solos**.
`seed-e2e-clean` borra los transaccionales del cliente de prueba, así que si alguien
corre e2e en paralelo te quedas sin montaje a media medición — y el tablero vacío
parece una regresión tuya cuando no lo es.

### Nota sobre el reloj de la base

Para forzar un `overdue` en local: los relojes de `orders` **no se siembran en el
`INSERT`**, un trigger los pisa con `now()`. Hay que hacer `UPDATE` después.

---

## PARTE 3 — El resto de los duplicados

### El problema

| Hook | Dónde se duplica | Coste |
|---|---|---|
| `useDriverTimers` | `order-card.tsx:147`, **una por tarjeta** | N consultas idénticas a `app_settings` |
| `useCashSummary` | `driver-shell.tsx:34` + `efectivo-list.tsx:48` | ×2 en `/efectivo`, y 2 canales sobre `cash_settlements` |
| `useAvailability` | `shift-status.tsx:33` + `perfil/page.tsx:48` | ×2 en `/perfil` |
| `usePushSubscription` | `shift-status.tsx:33` + `perfil/page.tsx:49` | ×2 en `/perfil` |

**`useDriverTimers` es el más llamativo.** Su propia cabecera
(`use-queue-lead.ts:9-13`) dice, textualmente, que los dos umbrales van juntos porque
"un hook gemelo habría hecho la MISMA consulta otra vez por cada tarjeta montada". El
razonamiento es correcto y está a medias: evitó el hook gemelo, pero no el montaje
gemelo. Con 6 tarjetas en pantalla son 6 consultas idénticas a `app_settings`, y en
`/historial` una por pedido entregado.

`useCashSummary` duplicado además significa que **cada confirmación de la cajera
dispara dos recargas** en la pantalla que los dos están mirando a la vez.

`usePushSubscription` duplicado son **2 × `GET /push/subscriptions/me` por minuto**
en `/perfil`, porque su `checkStatus` corre en un `setInterval` de 60 s
(`use-push-subscription.ts:266`).

### Archivos permitidos

- `apps/motorizados/hooks/use-queue-lead.ts`
- `apps/motorizados/hooks/use-availability.ts`
- `apps/motorizados/hooks/use-push-subscription.ts`
- `apps/motorizados/features/efectivo/hooks/use-cash-summary.ts`
- `apps/motorizados/components/home/order-card.tsx`
- `apps/motorizados/components/shift-status.tsx`
- `apps/motorizados/app/(driver)/perfil/page.tsx`
- `apps/motorizados/features/efectivo/components/efectivo-list.tsx`

### Qué hacer

Los cuatro al mismo patrón de store. Dos avisos:

- **`useAvailability` y `usePushSubscription` tienen escrituras, no solo lecturas.**
  `setAvailable` y `subscribe`/`unsubscribe` mutan estado real. Al hacerlos store, esas
  acciones tienen que **emitir a todos los suscriptores**: si `/perfil` apaga el turno,
  el `ShiftStatus` de la barra tiene que enterarse en el mismo render. Hoy funciona por
  accidente (son dos instancias que recargan por su cuenta); con el store tiene que
  funcionar a propósito.

- **`useAvailability` no lleva estado optimista, y eso es deliberado** — su cabecera
  explica que el servidor valida el horario y puede rechazar el cambio. El store **no
  puede introducir optimismo** por conveniencia.

### RESULTADO — 2026-08-30 · ✅ TRES DE CUATRO HECHOS

`useDriverTimers`, `useCashSummary` y `useAvailability` pasan a store, mismo patrón
que la PARTE 1. `lint`, `type-check` y `test` (92/92) en verde.

**`usePushSubscription` NO se convirtió, y es una decisión, no un olvido.** Es el más
complejo de los cuatro —auto-heal con debounce por `ref`, validación de propiedad del
endpoint, reacción a `SIGNED_IN` con `forceRefresh`, mensajes del service worker— y su
duplicación cuesta **una** petición por minuto en una sola ruta. La peor relación
riesgo/beneficio del spec: romper el auto-heal deja al motorizado sin avisos en
silencio, que es exactamente el fallo que ese código existe para evitar. Se queda
como está.

**Los conteos de esta parte NO son medibles en dev, y conviene saber por qué.** En
desarrollo React monta, desmonta y remonta (StrictMode). Con un store por conteo de
referencias eso lleva `refCount` a 0 entre medias, dispara `stop()` y el siguiente
`start()` vuelve a pedir: en `/` se miden `api_cash: 2` y `api_availability: 3` aunque
haya un solo consumidor. `useTeam`, que ya era store desde antes, mide igual (`2`).
La PARTE 1 se libró de esto solo porque su guarda de `generation` suprime el arranque
descartado.

Para medirlo de verdad haría falta un build de producción. La deduplicación en sí es
estructural y del mismo tipo ya verificado en la PARTE 1: un `start()` por store,
detrás de la transición 0→1 del `refCount`.

**Pendiente de comprobar a mano:** que apagar el turno desde `/perfil` cambie el punto
de color de la barra superior sin recargar. Es el único cambio de comportamiento
observable de esta parte (antes funcionaba por accidente, con dos instancias
recargando por su cuenta; ahora las dos leen el mismo snapshot).

---

# BLOQUE II — Coste por petición y por render

## PARTE 4 — Los round-trips de la API

### El problema

`requireRole` (`apps/api/lib/http/auth.ts`) hace **dos round-trips a Supabase en cada
petición**: `auth.getUser(token)` por HTTP contra Auth, y un `select` a `user_roles`.

Encima de eso, cada endpoint suma los suyos **en serie**:

- **`/driver/team`**: `requireRole` (2) → `drivers` (1) → `Promise.all` de 2 (1) →
  `requesters` (1) = **~5 saltos en serie**, y se llama **cada 15 s**.
- **`/driver/orders/[id]`**: `requireRole` (2) → `drivers` (1) → `orders` (1) →
  `driver_restaurants` (1) → `Promise.all` de 4 (1) = **~6 en serie**, cada 20 s.

Es la explicación mecánica del piso de 470-750 ms que ya estaba medido: no es la
consulta, es la cadena.

### Lo que NO se puede hacer

**El rol no viaja en el JWT.** No hay `custom_access_token_hook` en ninguna migración
(verificado por `grep` sobre `supabase/migrations/`), así que el `select` a
`user_roles` **hace falta** y no se puede sustituir por una claim. No lo intentes sin
una migración que añada el hook, y eso es un cambio que toca las cuatro apps a la vez
— fuera del alcance de este spec.

### Lo que sí

1. **`auth.getUser(token)` → verificación local del JWT.** Es un round-trip HTTP para
   validar una firma que se puede validar en proceso (`jose` + JWKS cacheado). Quita
   1 salto de **todas** las peticiones de **todas** las apps.

2. **Cachear el rol por token unos segundos** (30-60 s, en memoria del proceso). Quita
   el segundo salto en las ráfagas, que es justo el patrón de un poll cada 15 s.

3. **Fusionar `drivers` en el `Promise.all`** donde el resultado no condiciona la
   consulta siguiente. En `/driver/team` el `drivers` sí condiciona (hace falta el `id`
   para filtrar), así que ahí lo que toca es lo de abajo.

4. **`/driver/team`: quitar el cuarto salto.** La consulta de `requesters` es un
   `select` a `drivers` por `id` que se puede resolver con un embed en la consulta de
   `order_transfer_requests`, igual que ya se hace con `orders(...)` y `businesses(...)`.

### Archivos permitidos

- `apps/api/lib/http/auth.ts`
- `apps/api/app/api/v1/driver/team/route.ts`
- `apps/api/app/api/v1/driver/orders/[id]/route.ts`

### Criterio de paso

- `pnpm test` de `apps/api` en verde. **Ojo:** son tests de integración contra la base
  local. Si has hecho `supabase db reset` en algún momento, corre `pnpm db:seed:e2e`
  antes o fallarán en masa por precondición ausente, con errores que apuntan a otro sitio.
- Medición de `/driver/team` y `/driver/orders/[id]`: **p50 antes y después**, 20
  llamadas cada uno, con el `Authorization` de un motorizado real. Pega los dos números.
- Un token expirado sigue devolviendo **401**, no 500. Un usuario sin rol `driver`
  sigue devolviendo **403**. Pega las dos respuestas.

### Aviso de alcance

Esta parte toca código compartido por las cuatro apps. Si `requireRole` cambia, **las
suites de `admin`, `negocios` y `customer` tienen que correr también**. No la cierres
con solo los tests de motorizados.

### RESULTADO — 2026-08-31 · ✅ SOLO LA 4.4, Y LAS OTRAS TRES SE DESCARTAN

Hecha la **4.4** y nada más. `requireRole` **no se ha tocado**, así que el aviso de
alcance de arriba no llegó a aplicar: las suites de `admin`, `negocios` y `customer`
no hacía falta correrlas.

**Qué cambió.** El `select` suelto a `drivers` que resolvía el nombre del solicitante
desaparece; ahora viaja embebido en la consulta de `order_transfer_requests`. Un salto
en serie menos en `/driver/team`, que se llama cada 15 s.

El embed necesita nombrar la constraint
(`drivers!order_transfer_requests_to_driver_id_fkey`) porque la tabla tiene **dos** FK
a `drivers`. Sin nombrarla, PostgREST responde **300 / `PGRST201`** — comprobado a
propósito como control negativo, y su propio `hint` nombra la constraint que se usó.
La cardinalidad que declara es `many-to-one`, o sea objeto y no array, que es lo que
el mapeo asume.

**Verificación funcional (la que importa).** No había ni hay ningún test que cubra
`/driver/team`, así que se verificó contra el endpoint vivo con un JWT de motorizado
real y una solicitud pendiente sembrada a mano:

```
{ "shortId": "PERFTEST", "total": 42, "businessName": "La Florencia E2E",
  "deliveryReference": "Jr. Los Pinos, casa azul",
  "requesterName": "Motorizado 2 E2E", "reason": "me queda de camino" }
```

`apps/api` en verde, **225/225** (27 archivos). `type-check` y `biome` limpios.
El pedido y la solicitud sembrados se borraron, confirmado con un `select`, no con el
204 del `DELETE`.

**La medición p50, y por qué no dice lo que parecía decir.** Primera pasada:
213 ms antes → 173 ms después. Segunda pasada, invirtiendo el orden para descartar
sesgo de calentamiento: **185 ms antes → 190 ms después**. O sea que los 40 ms de la
primera eran **ruido, no señal**, y hay que decirlo así.

Medido el salto que se elimina por separado, contra el Postgres **local**:
`p50 = 13 ms` (p90 34 ms, n=40). Está por debajo de la banda de ruido de Next en modo
dev (±20-40 ms end-to-end), y por eso el A/B no lo resuelve. **La mejora es real y
estructural —una ida y vuelta menos— pero en local no es medible; donde se nota es en
prod, donde API y base no comparten máquina.** Ojo con esto antes de pedir un número
de mejora end-to-end en esta caja.

**Lo que NO se hizo, y por qué (decisión, no olvido):**

- **4.1 (verificar el JWT en proceso con `jose` + JWKS)** — es el que más rinde por
  petición de todo el spec, y el único cambio que puede tumbar `admin`, `negocios` y
  `customer` a la vez. El piso de 470-750 ms no es lo que le duele al motorizado con
  10 pedidos por noche. Riesgo/beneficio malo **hoy**; el día que haya volumen, esta
  es la primera que hay que retomar.
- **4.2 (cachear el rol por token)** — barata de escribir y cara de razonar: hay que
  decidir qué pasa cuando a alguien se le revoca un rol y su token sigue vivo 30-60 s.
  Con 1-2 motorizados, una ráfaga de polls cada 15 s no justifica abrir esa puerta.
- **4.3 (fusionar `drivers` en el `Promise.all`)** — **no se puede**, y el propio spec
  ya lo decía: en `/driver/team` el `id` del driver condiciona los filtros de las dos
  consultas siguientes, así que no hay nada que paralelizar.

---

## PARTE 5 — Render

Ninguno de estos es urgente por sí solo. Van juntos porque son el mismo gesto.

### 5.1 · Todo el árbol de tarjetas se repinta cada segundo

`useNow()` a 1000 ms en `home.tsx:16` → objeto nuevo de `useDriverOrders` →
`AvailableTab` → N × `OrderCard` **sin `memo`**, cada una recalculando `buildCardVM`
(446 líneas de `lib/orders/card-view-model.ts`). En el mismo tick, `derived`
(`use-driver-orders.ts:157`) rehace 4 filtros sobre 50 elementos.

### 5.2 · Un efecto por segundo que casi nunca hace nada

`overdueSet` (`available-tab.tsx:38`) tiene `now` en sus deps, así que cambia de
identidad cada segundo. El `useEffect` de `useOverdueFeedback` corre **3 600 veces por
hora** para salir por el `return` temprano casi siempre.

### 5.3 · `localStorage` síncrono en el cuerpo del render

`app/pedido/[id]/page.tsx:120`:

```
const optimisticStatus = detail ? getOptimistic()[detail.order.id] : undefined
```

`getOptimistic()` lee `localStorage` y hace `JSON.parse`. En el cuerpo del render, con
un ticker de 1 s detrás: **una lectura síncrona bloqueante por segundo**, en la
pantalla que se usa conduciendo.

### 5.4 · `SwipeToTake` renderiza por `pointermove`

`setX` en cada `pointermove` (`swipe-to-take.tsx:163`) son ~60-120 renders/s durante
el arrastre. **Está mitigado sin querer:** `children` conserva identidad de elemento,
así que React se salta el subárbol de `OrderCard`. Pero el ticker de 1 s crea un `card`
nuevo **en mitad del gesto** y rompe esa suerte justo cuando el dedo está encima.

Arreglar 5.1 arregla 5.4 de rebote. No toques el gesto por su cuenta.

### 5.5 · `--drv-transfer-h` no la publica nadie

`home.tsx:61` y `home.tsx:73` la leen con fallback `0px`. El comentario dice que la
escribe `TransferWatcher`, pero ese componente **pasó a ser un modal a pantalla
completa** y ya no mide nada. No rompe el layout —los `max()` caen al valor de
siempre— pero son dos cálculos muertos y un comentario que miente sobre el contrato.
Bórralo, y borra el comentario con él.

### Archivos permitidos

- `apps/motorizados/components/home/order-card.tsx`
- `apps/motorizados/components/home/available-tab.tsx`
- `apps/motorizados/components/home/home.tsx`
- `apps/motorizados/app/pedido/[id]/page.tsx`
- `apps/motorizados/hooks/use-overdue-feedback.ts`

### RESULTADO — 2026-08-30 · ⚠️ LA PARTE SE CAE CASI ENTERA

**Los puntos 5.1, 5.2 y 5.4 estaban mal diagnosticados. No se aplican.**

**5.1 y 5.4 — el repintado por segundo NO es desperdicio, es el contador.**
`buildClock` (`card-view-model.ts:281,288,301`) pinta el reloj con `mmss()`, que
devuelve **MM:SS con los segundos visibles**. O sea que cada tarjeta TIENE que
repintarse cada segundo: bajar la cadencia haría tartamudear el contador delante del
motorizado. Y `memo` en `OrderCard` no evita nada, porque `now` es un prop que cambia
cada segundo — el comparador daría distinto siempre.

Diagnostiqué "repintado inútil" sin comprobar qué pinta. Pinta la cuenta atrás.

**5.2 — ya no existe.** El efecto por segundo era el de `useOverdueFeedback` dentro de
`AvailableTab`; la PARTE 2 lo sacó de ahí. `overdueSet` sigue creándose cada segundo,
pero ahora solo se lee en render (`.has()`, `.size`), sin efecto detrás.

**5.3 — no se aplica, a propósito.** `getOptimistic()` en el cuerpo del render lee
`localStorage` y hace `JSON.parse` de un objeto diminuto: son microsegundos, no
milisegundos. Cachearlo bien es fiddly —hay que invalidar cuando una transición se
encola por fallo de red, que es justo cuando `load()` también falla y `detail` no
cambia— y equivocarse ahí significa que un pedido encolado deja de verse. Coste real
despreciable contra riesgo de un bug de verdad: no se toca.

**5.5 — ✅ HECHO.** `--drv-transfer-h` eliminada de `home.tsx`. No la publicaba nadie
desde que `TransferWatcher` pasó a ser modal a pantalla completa; las dos lecturas
caían siempre al fallback `0px`. Sustituidas por los valores fijos equivalentes
(`pt-20` y `top-[calc(44px+env(safe-area-inset-top))]`), así que el layout no se mueve.

### Criterio de paso

- React DevTools Profiler, 10 s en `/` con 6 tarjetas y sin tocar la pantalla:
  **número de renders de `OrderCard` antes y después**. Pega los dos.
- Arrastrar una tarjeta sigue tomándola, sigue vibrando al armar, y el `onClickCapture`
  sigue tragándose el click (no debe navegar a la ficha tras un arrastre).
- Los countdowns de traspaso siguen actualizando **cada segundo** y los dos sitios que
  pintan la misma solicitud siguen mostrando el mismo número en el mismo frame.

---

# BLOQUE III — Push y dispositivos

## PARTE 6 — Qué hacer con los dispositivos que sobran

### La respuesta corta: en prod, ahora mismo, no sobra ninguno

La sospecha era que Ernesto tenía ~3 dispositivos y había que limpiar. **Los datos de
`tindivo-prod` dicen otra cosa.** Ernesto tiene **2**, y las dos están vivas:

| Suscripción | Proveedor | Creada | Último OK | Envíos OK | Errores |
|---|---|---|---|---|---|
| `bb870b42…` | `web.push.apple.com` (iPhone 18.1.1) | 2026-08-16 | **2026-08-29** | **444** | **0** |
| `e844e734…` | `fcm.googleapis.com` (Android) | 2026-08-28 | **2026-08-29** | **40** | **0** |

Son un iPhone y un Android, los dos entregando hoy, con `failure_count = 0` y
`last_failed_at` nulo. **Ninguno es basura.** Nadie en toda la base pasa de 2
suscripciones.

Y el pipeline entero está sano: **4 099 envíos, 100 % `ok`, cero errores de cualquier
código** desde el 2026-08-10.

### La limpieza que pedías ya existe

`supabase/functions/send-push/index.ts:697` borra la suscripción ante un **404 o 410**
del proveedor, que es el contrato estándar de Web Push para "este endpoint ya no
existe". Y `POST /push/subscriptions` (`apps/api/app/api/v1/push/subscriptions/route.ts`)
hace **tres** limpiezas antes de dar de alta:

1. Borra el endpoint si lo reclamaba **otro usuario** (motorizado B entra en el
   teléfono de A sin que A cerrara sesión).
2. Borra los **zombies del mismo usuario en el mismo navegador** (mismo `user_agent`,
   endpoint distinto = endpoint rotado).
3. Upsert sobre `(user_id, endpoint)`.

Más `DELETE /push/subscriptions` en dos formas: `{ endpoint }` al cerrar sesión aquí,
y `{ all: true }` para "perdí mi teléfono", que `lib/sign-out.ts` encadena con
`signOutEverywhere`.

**El camino de purga por 404/410 nunca ha corrido en producción** — no porque falle,
sino porque nunca ha habido un solo error que lo dispare. Está sin estrenar, no roto.

### El problema real, que es el contrario del que temías

**El sistema no es demasiado laxo colapsando dispositivos. Es demasiado agresivo.**

La limpieza de zombies del paso 2 usa `user_agent` como identidad del dispositivo.
Y en `tindivo-prod`:

> **9 dispositivos distintos, de 9 usuarios distintos, comparten un `user_agent`
> byte a byte idéntico:**
> `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Mobile Safari/537.36`

Eso es la *UA reduction* de Chrome: en Android moderno el `user_agent` está congelado
en `Android 10; K` y **no distingue un teléfono de otro**. Lo mismo pasa con los 3
`Windows NT 10.0; Win64; x64`.

Hoy no ha hecho daño porque el borrado está acotado con `.eq('user_id', user.id)`, así
que entre usuarios distintos no hay colisión. **Pero dentro de un mismo usuario, dos
teléfonos Android se borrarían la suscripción mutuamente en cada registro**: el que
abre la app último deja al otro sin avisos, en silencio, y el otro no se entera hasta
que un pedido no le suena. Ernesto se salva solo porque sus dos equipos son de
plataformas distintas.

### El otro hueco: nada reapa el teléfono del cajón

La purga es **reactiva**: solo actúa cuando un envío falla con 404/410. Apple y FCM
solo devuelven 410 cuando el usuario desinstala la PWA o borra los datos del sitio.
Un teléfono viejo **abandonado pero no desinstalado** sigue siendo un endpoint
perfectamente válido: recibe el push, devuelve 201, y `last_successful_at` se actualiza.
Para el sistema está más vivo que nunca.

Y no hay columna que lo delate. Miré si `updated_at` servía como señal de "cuándo abrió
la app este dispositivo por última vez", y **no sirve**: el trigger
`touch_push_subscriptions` (`touch_updated_at`) dispara en **cualquier** `UPDATE`,
incluido el `last_successful_at` que escribe `send-push` tras cada entrega. O sea que
`updated_at` mide *cuándo le mandamos algo*, no *cuándo alguien miró*.

**Ninguna columna actual distingue "segundo teléfono que uso de verdad" de "teléfono
en un cajón".** Esa información no está en la base.

### Qué hacer

Por orden. Los tres primeros son baratos; el cuarto es opcional.

**6.1 — No hagas nada con los datos de prod.** No borres las suscripciones de Ernesto.
Las dos funcionan y borrar una le apaga los avisos en un equipo que sí usa.

**6.2 — Cambiar la clave de la limpieza de zombies.** `user_agent` no identifica un
dispositivo. Genera un **id de instalación** en el cliente (`crypto.randomUUID()`
guardado en `localStorage` junto a `tindivo:push:last-sent-endpoint`), mándalo en el
`POST` y úsalo como clave del paso 2 en vez del `user_agent`. Es estable por
instalación de PWA, sobrevive a la rotación del endpoint, y **no colisiona entre dos
Android**. Requiere columna nueva → migración.

**6.3 — Enseñarle sus dispositivos al motorizado.** Es el único arreglo honesto para
"el teléfono del cajón": el sistema no puede distinguirlo, la persona sí. Una lista en
`/perfil` con una línea por suscripción —plataforma, alta, último aviso recibido— y un
botón de revocar. `DELETE /push/subscriptions` con `{ endpoint }` ya existe; solo falta
un `GET` que liste y la UI. Con 1-2 motorizados esto es más barato y más fiable que
cualquier heurística.

**6.4 — (Opcional) Un `last_seen_at` de verdad.** Si más adelante quieres reapar sin
intervención humana, hace falta una señal que hoy no existe: una columna que **solo**
bumpee el cliente cuando abre la app. El gancho ya está puesto y sale gratis —
`checkStatus` llama a `GET /push/subscriptions/me` cada 60 s
(`use-push-subscription.ts:266`), así que ese endpoint puede escribir `last_seen_at`
sin una sola petición nueva. Con eso, `last_seen_at < now() - 30 días` sí es una razón
defendible para dar de baja. **Sin esa columna, no montes ningún reaper por fecha:**
con `updated_at` o `last_successful_at` borrarías el teléfono que más funciona.

### Archivos permitidos

- `apps/api/app/api/v1/push/subscriptions/route.ts`
- `apps/api/app/api/v1/push/subscriptions/me/route.ts`
- `apps/motorizados/hooks/use-push-subscription.ts`
- `apps/motorizados/app/(driver)/perfil/page.tsx`
- `supabase/migrations/NNNN_*.sql` (nueva, número libre confirmado con `supabase migration list`)

### Criterio de paso

- **Dos navegadores distintos con el mismo `user_agent`** (dos perfiles de Chrome
  valen) suscritos al **mismo** usuario: **las dos suscripciones sobreviven**. Hoy la
  segunda mata a la primera. Pega el `select` de `push_subscriptions` antes y después.
- Cerrar sesión en uno deja **solo** el otro.
- La lista de `/perfil` muestra los dispositivos reales y el botón de revocar borra
  **el que dice**, no otro.
- `apps/api` en verde, incluido `lib/__tests__/push-subscriptions.integration.test.ts`.

---

## ANEXO — Techos que no son bugs todavía

No hay que hacer nada ahora. Anotados para que no sorprendan.

**A1 · El `.limit(50)` del board no tiene filtro de fecha.**
`use-driver-orders.ts:52`. La RLS (`0108_driver_visibility_a1.sql`) le da al motorizado
**todos** sus pedidos históricos, y `delivered` es terminal: nadie los limpia. El pico
real medido es de 29 pedidos/día en todo el sistema, y `deliveredToday` en `/historial`
se calcula filtrando esas 50 filas **en cliente**. Todavía cabe. El margen es una noche
buena. El día que se acerque, el arreglo es un filtro `created_at >= today` en la
consulta, no subir el límite.

**A2 · El canal de `orders` no lleva filtro.**
`use-driver-orders.ts:96` escucha `event: '*'` sobre la tabla entera. La RLS acota lo
que llega, así que es **correcto** — pero cualquier cambio en una fila visible provoca
un refetch de las 50, no un parche de esa fila. Con un solo restaurante en el piloto
da igual. Con cinco, no.

---

## Resumen ejecutivo

| Parte | Qué arregla | Coste | Riesgo |
|---|---|---|---|
| **1** | La mitad del tráfico, en todas las rutas | Medio | Medio (StrictMode + canales) |
| **2** | La alarma de vencidos, que hoy casi no suena | Bajo | Bajo |
| **3** | N consultas por tarjeta + 3 duplicados más | Bajo | Bajo |
| **4** | ~2 saltos de red en toda petición de toda app | Medio | **Alto** (toca las 4 apps) |
| **5** | Repintado por segundo, jank del arrastre | Bajo | Bajo |
| **6** | Que dos Android del mismo usuario no se maten | Medio | Bajo |

**Orden recomendado:** 1 → 2 → 3 → 5 → 6 → 4.

La 4 va al final a propósito: es la que más rinde por petición, pero es la única que
puede romper las otras tres apps, y conviene tener el resto estable antes de tocarla.
