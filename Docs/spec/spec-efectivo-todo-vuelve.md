# Spec · El efectivo se rinde pedido por pedido, y todo lo que el motorizado lleva encima vuelve

**Estado:** propuesta, sin implementar.
**Escrito:** 2026-08-12.
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

Si el cliente acaba **pagando exacto**, o **cambia a Yape**, el motorizado se queda con ese adelanto — y hoy v2 **no lo pide de vuelta**:

| Situación | Lo que el motorizado lleva encima | Lo que v2 le reclama hoy |
|---|---|---|
| Pedido en efectivo S/ 45, adelanto S/ 5, cliente paga con S/ 50 | S/ 45 | S/ 45 ✅ |
| Mismo pedido, **cliente paga exacto** | S/ 45 **+ S/ 5 del adelanto** | S/ 45 ❌ |
| Mismo pedido, **cliente paga por Yape** | **S/ 5 del adelanto** | **S/ 0** ❌ |
| Pedido Yape, **cliente paga en efectivo** | el total | el total ✅ |

Las dos filas con ❌ son dinero del negocio que se queda en el bolsillo del motorizado sin que ningún sistema lo registre. No es fraude: es que **nadie se lo recuerda**, y al final del turno ni él sabe que lo tiene.

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
efectivo a rendir  =  lo cobrado en efectivo al cliente
                   +  el adelanto de vuelto que no se llegó a usar
```

---

## 3. Dónde está v2 hoy

Lo que YA existe y funciona (migraciones `0140` y `0141`, con tests):

- `orders.cash_owed_at_delivery` — la escribe `advance_order('deliver')` y es la **única fuente** del corte de caja. Cuatro consumidores la leen: `create_cash_settlement`, el enlace de pedidos, `/driver/cash-settlements` y la pantalla de "¡Entregado!".
- La hoja de entrega registra el cobro real: método, división de un mixto y billete del cliente, validados en el servidor.
- `paid_mixed` cuenta **su parte en efectivo**, no el total.

Lo que **falta**:

- **El adelanto no se modela.** No hay columna que diga "el negocio le adelantó S/ X a este motorizado por este pedido". `contingency_advances` existe en el esquema pero es otra cosa (fondo de contingencia, eliminado en `0123`).
- Con `paid_yape` o `paid_prepaid`, `advance_order` escribe `cash_owed_at_delivery = 0` — correcto para lo cobrado, **incompleto para lo que lleva encima**.
- El endpoint `/driver/cash-settlements` agrega por negocio y **no devuelve los pedidos**.

---

## 4. Qué hay que construir

### 4.1 · Modelar el adelanto

**Decisión previa, y es de producto, no técnica:** ¿cuándo se considera adelantado el vuelto?

- **Opción A — implícito.** Si `client_pays_with > total`, se asume que la cajera adelantó `client_pays_with - total`. Cero fricción, cero pantallas nuevas; pero asume un dato que nadie confirmó, y en el piloto la cajera teclea ese campo mirando lo que el cliente dijo por teléfono.
- **Opción B — explícito.** La cajera marca al entregar el pedido al motorizado cuánto vuelto le da. Es la verdad, pero es un paso más para ella.

**Recomendación: A para empezar**, con la columna preparada para B. El importe es el mismo en el caso normal, y A no pide nada a la cajera. Si aparecen discrepancias, se sube a B sin migrar datos.

Columna sugerida: `orders.change_advanced` (`numeric(10,2)`, nullable). La escribe el mismo `advance_order` que ya toca el resto.

### 4.2 · La fórmula, en un solo sitio

`advance_order('deliver')` (migración nueva, sobre lo que dejó `0140`):

```
cash_owed_at_delivery =
      (efectivo cobrado al cliente)          -- ya implementado
    + (adelanto - vuelto realmente entregado) -- lo que falta
```

Por caso:

| `payment_real` | Cobrado | Adelanto sin usar | `cash_owed_at_delivery` |
|---|---|---|---|
| `paid_cash`, cliente paga con billete | total | 0 | total |
| `paid_cash`, **paga exacto** | total | **el adelanto entero** | **total + adelanto** |
| `paid_mixed` | parte en efectivo | lo que sobre del adelanto | suma de ambos |
| `paid_yape` | 0 | **el adelanto entero** | **el adelanto** |
| `paid_prepaid` | 0 | el adelanto entero | el adelanto |

**Ojo con el camino "Pagó exacto" de la hoja de entrega.** Hoy manda `clientPaysWith = total` para que el vuelto salga 0. Con esta fórmula eso deja de bastar: hay que distinguir *"el cliente pagó justo y me quedo el adelanto"* de *"no había adelanto"*. La hoja ya tiene ese camino separado (`kind: 'cash_exact'`), así que el dato existe — hay que hacerlo viajar.

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

1. **Migración**: columna `change_advanced` + `advance_order('deliver')` escribiendo la fórmula completa. Genera el dato sin cambiar ningún importe existente.
2. **Backfill**: las filas ya entregadas se quedan como están. **No se recalculan**: los ciclos cerrados son contabilidad, y reescribirlos cambia lo que la cajera ya contó.
3. **Tests de integración** de los cinco casos de la tabla, más el de siempre (`paid_cash` con billete) verificando que **no se mueve ni un céntimo**.
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
