# Spec · El efectivo se rinde pedido por pedido, y todo lo que el motorizado lleva encima vuelve

**Estado:** cerrado para implementación.
**Escrito:** 2026-08-12. **Revisado:** 2026-08-11 — la fórmula estaba en neto y dejaba escapar el adelanto en el caso más común; corregida a la lectura gross del legacy tras confirmar Jesús que el sencillo lo pone siempre la cajera.
**Precede a:** cualquier despliegue de la pantalla de Efectivo del motorizado.

---

## 1. Las dos cosas que hay que arreglar

### 1.1 · La rendición es a ciegas

Hoy la pantalla de Efectivo del motorizado (`apps/motorizados/features/efectivo/components/efectivo-list.tsx`) enseña **una cifra por restaurante** y un botón para entregarla. Nada más: ni qué pedidos la componen, ni de cuándo son.

Eso obliga a rendir sin poder comprobar. Si la cajera cuenta el fajo y sale distinto, no hay forma de señalar **cuál** pedido no cuadra — solo queda disputar el total, que es lo que convierte una diferencia de S/ 5 en una conversación de veinte minutos.

El legacy sí lo desglosa (`tindivo-delivery`, `features/motorizado/efectivo/components/efectivo-list.tsx:158-172`): dentro de cada restaurante lista **cada pedido** con nombre del cliente —o el código si no hay nombre— y su importe. **Las entregas son individuales**, así que la rendición tiene que poder leerse individual.

**Falta además la fecha y hora de entrega**, que el legacy tampoco muestra. Es lo que permite ordenar la conversación con la cajera: "el de las 19:40, el de Carmen".

### 1.2 · El adelanto de vuelto no vuelve

**Este es el importante, y es dinero.**

Cuando un pedido necesita vuelto, ese vuelto **sale del negocio**: la cajera se lo adelanta al motorizado antes de que salga. Ese dinero es del restaurante y está en el bolsillo del motorizado.

**El sencillo lo pone SIEMPRE la cajera** (confirmado por Jesús, 2026-08-11). El motorizado nunca pone fondo propio, y por eso cada adelanto es deuda suya desde que sale del local. Toda la fórmula de abajo cuelga de este hecho: si el sencillo fuera del motorizado, v2 estaría bien hoy y este spec sobraría.

| Situación | Lo que el motorizado lleva encima | Lo que v2 le reclama hoy |
|---|---|---|
| Pedido en efectivo S/ 45, adelanto S/ 5, cliente paga con S/ 50 | **el billete de S/ 50** | S/ 45 ❌ |
| Mismo pedido, **cliente paga exacto** | S/ 45 **+ S/ 5 del adelanto** | S/ 45 ❌ |
| Mismo pedido, **cliente paga por Yape** | **S/ 5 del adelanto** | **S/ 0** ❌ |
| Pedido Yape, **cliente paga en efectivo** | el total | el total ✅ |

**Tres de cuatro, y la que más ocurre es la primera.** Ahí el motorizado se queda con el billete de S/ 50 del cliente y le devolvió los S/ 5 que le adelantó la caja: si rinde 45, esos 5 son dinero del negocio que se queda en su bolsillo. La caja salió con 5 menos y vuelve con 45 por un pedido de 45 — le falta el adelanto.

Ninguna de las tres es fraude: es que **nadie se lo recuerda**, y al final del turno ni él sabe que lo tiene.

El legacy sí lo contempla, y lo dice en su propio código
(`apps/api/app/api/v1/driver/cash-summary/route.ts:47-49`):

> `cash_owed_at_delivery > 0` (cualquier `payment_status` — cubre el caso de cliente que paga yape pero **driver debe devolver el vuelto que el restaurante le adelantó**)

O sea: en el legacy `cash_owed_at_delivery` **no es "lo que cobró"**, es **"todo el dinero del negocio que tiene encima"**.

---

## 2. El principio

> **Todo dinero del negocio en posesión del motorizado se rinde. Sin excepciones,
> y sin depender de cómo terminó pagando el cliente.**

Son dos fuentes, y hoy solo se cuenta una:

```
efectivo a rendir  =  el adelanto que le dio la caja
                   +  el efectivo que recibió del cliente
                   −  el vuelto que le devolvió al cliente
```

**Ojo con "el efectivo que recibió": es el billete completo, no el total del
pedido.** Un pedido de S/ 45 pagado con S/ 50 aporta 50, y los 5 que el
motorizado devolvió salen restados. Leerlo en neto (45, con el vuelto ya
descontado) es exactamente lo que fuga hoy: da por devuelto un adelanto que
nunca volvió a la caja.

La fórmula se simplifica sola, y esa es la forma que conviene implementar:

```
efectivo a rendir  =  adelanto  +  parte en efectivo del pedido
```

porque *recibido − devuelto* es siempre la parte en efectivo del pedido, pague
el cliente con el billete que pague. Es la misma fórmula del legacy
(`tindivo-delivery`, `packages/core/.../order.ts:1219-1245`).

---

## 3. Dónde está v2 hoy

Lo que YA existe y funciona (migraciones `0140` y `0141`, con tests):

- `orders.cash_owed_at_delivery` — la escribe `advance_order('deliver')` y es la **única fuente** del corte de caja. Cuatro consumidores la leen: `create_cash_settlement`, el enlace de pedidos, `/driver/cash-settlements` y la pantalla de "¡Entregado!".
- La hoja de entrega registra el cobro real: método, división de un mixto y billete del cliente, validados en el servidor.
- `paid_mixed` cuenta **su parte en efectivo**, no el total.

Lo que **falta**:

- **El adelanto no se modela.** No hay columna que diga "el negocio le adelantó S/ X a este motorizado por este pedido". `contingency_advances` existe en el esquema pero es otra cosa (fondo de contingencia, eliminado en `0123`).
- Con `paid_cash`, `advance_order` escribe `cash_owed_at_delivery = v_total` (`0140:242-245`): el total del pedido, no el billete que el motorizado tiene en la mano. Fuga el adelanto en el caso más común.
- Con `paid_yape` o `paid_prepaid` escribe `cash_owed_at_delivery = 0` (`0140:247-253`) — correcto para lo cobrado, **incompleto para lo que lleva encima**.
- El endpoint `/driver/cash-settlements` agrega por negocio y **no devuelve los pedidos**.

Y algo que ya existe y **sirve de fuente para el adelanto**: `orders.change_to_give` se persiste al crear, tanto en manual (`0131`, recuperado tras la regresión de `0092`) como en B2C (`0143`). O sea, el dato "cuánto sencillo le tuvo que dar la caja" ya está en la fila antes de salir. El comentario `PENDIENTE` de `apps/motorizados/lib/payment.ts:21-23` que dice lo contrario quedó obsoleto con `0131`.

---

## 4. Qué hay que construir

### 4.1 · Modelar el adelanto

**Decisión previa, y es de producto, no técnica:** ¿cuándo se considera adelantado el vuelto?

- **Opción A — implícito.** El adelanto es el vuelto que el pedido ya tenía planeado: `change_to_give` de la fila, que se persiste al crear desde `0131`/`0143`. Cero fricción, cero pantallas nuevas; pero asume que la cajera dio de verdad ese sencillo, y en el piloto ella teclea `client_pays_with` mirando lo que el cliente dijo por teléfono.
- **Opción B — explícito.** La cajera marca al entregar el pedido al motorizado cuánto vuelto le da. Es la verdad, pero es un paso más para ella.

**Decisión: A**, con la columna preparada para B. El importe es el mismo en el caso normal, y A no pide nada a la cajera. Si aparecen discrepancias, se sube a B sin migrar datos.

Columna: `orders.change_advanced` (`numeric(10,2)`, nullable). La escribe el mismo `advance_order` que ya toca el resto.

**Por qué una columna y no leer `change_to_give` al liquidar.** Porque `advance_order` la PISA al entregar (`0140:415`): después de la entrega esa columna vale *el vuelto que se dio*, no *el que se adelantó*. Son distintos justo en los casos que este spec viene a arreglar. `change_advanced` es el snapshot de la pre-imagen, tomado dentro de la misma transacción.

El valor sale de la pre-imagen `v_order`, nunca de `p_params` — el motorizado no declara el adelanto, ya lo tiene en el bolsillo desde antes de salir:

```
parte_efectivo_planeada = total            si payment_intent = 'pending_cash'
                        = cash_amount      si 'pending_mixed'
                        = 0                en cualquier otro caso

adelanto = 0                                          si parte_efectivo_planeada = 0
         = COALESCE(change_to_give,                   si no
                    client_pays_with − parte_efectivo_planeada,
                    0)
```

El `COALESCE` cubre las filas manuales creadas entre `0092` y `0131`, donde `change_to_give` llegó NULL.

### 4.2 · La fórmula, en un solo sitio

`advance_order('deliver')` (migración nueva, sobre lo que dejó `0140`):

```
cash_owed_at_delivery = adelanto + parte en efectivo del pedido
```

donde la *parte en efectivo* la manda `payment_real` (el cobro REAL, no el planeado): el total en `paid_cash`, `cash_amount` en `paid_mixed`, y 0 en `paid_yape` / `paid_prepaid`.

Por caso, con un pedido de S/ 45 y adelanto de S/ 5:

| `payment_real` | Adelanto | Parte en efectivo | `cash_owed_at_delivery` | Hoy |
|---|---|---|---|---|
| `paid_cash`, paga con S/ 50 | 5 | 45 | **50** | 45 |
| `paid_cash`, **paga exacto** | 5 | 45 | **50** | 45 |
| `paid_mixed` (20 efectivo) | 5 | 20 | **25** | 20 |
| `paid_yape` | 5 | 0 | **5** | 0 |
| `paid_prepaid` | 5 | 0 | **5** | 0 |
| Cualquiera **sin adelanto** | 0 | la que sea | la parte en efectivo | igual |

La fila de `paid_prepaid` es teórica: un pedido `prepaid` de origen se paga antes de que el motorizado salga, así que la caja nunca le adelanta sencillo y su adelanto es siempre 0. Solo se alcanza forzando ese método sobre un pedido que sí tenía plan en efectivo, y ahí la fórmula responde bien.

**Las cuatro primeras filas cambian de número.** Solo la última se queda igual, y es la que amarra que un pedido sin vuelto no se mueva ni un céntimo.

**"Pagó exacto" deja de necesitar nada especial.** El spec anterior daba por hecho que había que hacer viajar el `kind: 'cash_exact'` de la hoja hasta el RPC. No hace falta: el adelanto sale del plan, no de lo que el cliente acabó tendiendo, así que "pagó exacto" y "pagó con billete" dan el mismo `cash_owed` — que es justo lo correcto, porque el motorizado acaba con el mismo dinero encima en los dos casos. La hoja puede seguir mandando `clientPaysWith = total` sin tocarla.

**Lo que SÍ hay que mover: la validación del billete.** Hoy `0140:255-259` exige `client_pays_with >= cash_owed`. Con la fórmula nueva, `cash_owed` incluye el adelanto y esa comparación empieza a rechazar entregas legítimas — el camino "pagó exacto" manda `clientPaysWith = total`, que es menor que `total + adelanto`. La comparación correcta es contra **la parte en efectivo del pedido**: el billete tiene que cubrir lo que se le cobra al cliente, no el sencillo que el motorizado ya traía. Lo mismo aplica al `change_to_give` que se escribe al cerrar: `billete − parte en efectivo`.

### 4.3 · El desglose por pedido

`GET /driver/cash-settlements` devuelve, dentro de cada negocio, la lista de pedidos:

```ts
orders: {
  orderId: string
  shortId: string
  customerName: string | null   // cae al shortId si falta
  deliveredAt: string           // fecha y hora — lo que pide el spec
  cashOwed: number              // cash_owed_at_delivery
  breakdown?: {                 // solo si hay adelanto, para poder explicar el número
    collected: number
    unusedAdvance: number
  }
}[]
```

Y la pantalla los lista bajo cada negocio: **nombre (o `#código`) · hora · importe**, con el desglose visible cuando el número no sea evidente — que es justo el caso del adelanto, donde el motorizado va a preguntar "¿por qué debo S/ 5 de un pedido que se pagó por Yape?".

---

## 5. Orden de implementación

**No es negociable, es dinero:**

1. **Migración**: columna `change_advanced` + `advance_order('deliver')` escribiendo la fórmula completa, con la validación del billete movida a la parte en efectivo.
2. **Backfill**: las filas ya entregadas se quedan como están. **No se recalculan**: los ciclos cerrados son contabilidad, y reescribirlos cambia lo que la cajera ya contó.
3. **Tests de integración** de los casos de la tabla de §4.2, en `deliver-change-advance.integration.test.ts`. El que amarra que nada se mueva es el pedido **sin adelanto**.

   Los tests de `0140`/`0141` **no cambian ni una línea**, y conviene entender por qué antes de tocarlos: ninguno sembraba un adelanto (`client_pays_with` y `change_to_give` llegaban NULL del seeder), así que todos describen el caso sin vuelto, donde la fórmula nueva da exactamente lo mismo. Si alguno hubiera empezado a fallar, no sería ruido: sería que el importe se movió donde no debía.
4. **Endpoint** devolviendo el desglose.
5. **Pantalla**.

Como en `0140`/`0141`: la base primero. Si se para a medias, queda una base que registra la verdad aunque la UI no la enseñe todavía. Al revés, la app pediría dinero que nadie calculó.

---

## 6. Cómo generar la función

`advance_order` tiene ~390 líneas y se re-crea entera en cada migración. **No transcribirla a mano.** El método que funcionó en `0140`:

```bash
docker exec supabase_db_<ref> psql -U postgres -d postgres -tAc \
  "select pg_get_functiondef(p.oid) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname='public' and p.proname='advance_order';"
```

Se toca **solo** la rama `deliver` con un script, y se verifica con `diff` contra el volcado: en `0140` salieron **1 línea fuera y 389 idénticas**. Cualquier otra diferencia es una rama perdida.

---

## 7. Lo que este spec NO cubre

- **La cajera confirmando la recepción** (`confirm_cash_settlement`) no cambia: sigue contando un fajo contra un total.
- **Las disputas** tampoco. Con el desglose por pedido serán más fáciles de resolver, pero el flujo es el mismo.
- **Métricas de admin** (`0027:25`, `0030:27`) siguen sumando `order_amount` con `payment_real = 'paid_cash'`. Con el adelanto en juego dejan de reflejar el efectivo que circula. Es una decisión aparte: ¿esas métricas miden ventas en efectivo o dinero movido?
- **El QR alternativo** — ver `DEUDA-09` del backlog.
