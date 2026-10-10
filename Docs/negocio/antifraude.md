# Antifraude: a quién se le fía la comida

> Verificado: 2026-10-10 · entorno: `tindivo-prod` (solo lectura: `app_settings`, funciones de riesgo, conteos) +
> `develop@7d00aa4` · Fuente de las reglas: `DECISIONS.md §8` · Pedidos: `Docs/negocio/servicios/pedidos-restaurante.md`

## Qué se protege

La comida que se cocina **antes de cobrar**. En contraentrega el negocio cocina y el motorizado cobra en la puerta: si
el cliente no aparece o no existe, el negocio pierde el plato. Todo el antifraude está pensado para ese caso; un
prepago ya pagó y no se valida por llamada.

El antifraude es **humano**: ante la duda, la cajera llama antes de cocinar. **Por qué:** en un pueblo, una llamada
distingue al vecino del pedido falso mejor que cualquier regla, y no deja a nadie sin pedir.

## Cómo se decide si un pedido de la app puede pagar al recibir

En este orden; el riesgo manda sobre cualquier historial:

1. **Cliente bloqueado** (`customer_is_blocked`): no puede pedir.
2. **Con strikes** (`customer_requires_prepayment`; strikes anclados al teléfono **y** a la dirección, de modo que
   cambiar uno no limpia el otro): con **2**, solo prepago; con **3**, bloqueo de **30 días**, tampoco prepago.
3. **Monto grande**: por encima de **S/ 80** (`prepay_threshold`), prepago aunque sea conocido.
4. **Compra previa** (`customer_trusted_for_contraentrega`), resuelta por el teléfono verificado por SMS: basta una
   entrega de esta cuenta, una entrega a este teléfono (también las manuales de la cajera) o cualquier fila de este
   teléfono en el directorio de direcciones. Con eso, contraentrega **sin llamada**. La tercera vía se puede conseguir
   llamando al restaurante y cancelando: se acepta a propósito, porque los strikes se evalúan antes.
5. **Sin historial pero con GPS en vivo dentro de San Jacinto**: puede pagar al recibir, **con llamada** (`validando`).
   **Por qué no sin llamada:** el GPS del navegador se falsifica fácil; tratarlo como compra previa regalaría
   contraentrega libre a un primer pedido falso.
6. **Cliente nuevo sin nada de lo anterior**: prepago, o llamada.

Los pedidos manuales de la cajera no pasan por estas reglas: ella tiene al cliente al teléfono.

## La llamada (`validando`)

La hace la **cajera**; Jesús escala. Tiene **5 minutos** (`timers.validationMinutes`) o el pedido se cancela
(`validation_timeout`). Los umbrales de cuándo pedir llamada viven en `app_settings.validation` (monto, mismo
teléfono repetido, picos de pedidos; la regla de direcciones cercanas está apagada desde la `0149` porque «tres pedidos
en media cuadra en una hora es una noche buena, no fraude»).

## En el mostrador no se fía

| | Entrega | Recojo «ahora» | Recojo «más tarde» |
|---|---|---|---|
| Efectivo en caja | ✅ | ✅ | ⛔ prepago |
| Yape al recibir | ✅ | no existe | no existe |
| Prepago con captura | ✅ | ✅ | ✅ |

**Por qué:** un recojo «más tarde» es el único caso en que se cocina sin el cliente delante **y** sin nadie que cobre
al final. Un recojo «ahora» se cobra al aceptar, antes de cocinar (`0224`). La regla vive en `customerPaymentIntents`
(`packages/contracts`) y en el CHECK `orders_pickup_payment_chk`; solo aplica al canal de la app.

## Strikes: de dónde salen

- **No-show en la puerta:** el motorizado espera **5 minutos** desde que marcó que llegó (`noShowWaitMinutes`) y lo
  reporta: strike, reporte para Jesús y aviso al cliente.
- **No-show en el mostrador** (`pickup_no_show`, `0220`): mismo plazo desde que el pedido quedó listo. Se ancla solo al
  teléfono (en un recojo no hay dirección). **Si el pedido ya estaba pagado, no hay strike** (`0224`): el negocio no
  perdió nada.

## Efectivo en la puerta

En los pedidos de la app, el billete máximo que acepta el motorizado es **S/ 100** (`max_cash_bill`) y el vuelto máximo,
**S/ 50** (`max_change`), salvo que la cajera declare otro vuelto para la noche (`0185`). La vía manual no valida el
vuelto: la cajera ya sabe con cuánto cuenta.

## Lo que pasa de verdad (al 2026-10-10)

- **Nunca se ha registrado un no-show, un strike ni un bloqueo**: ni un pedido cancelado por `no_show` o
  `pickup_no_show`, `customer_strikes` vacía y ningún perfil con `blocked_until` o contraentrega bloqueada, en unos
  1,000 pedidos entregados desde el 2026-08-08.
- En 30 días, **12 pedidos** pasaron por la llamada (4 por zona GPS dudosa, 4 por cliente nuevo con GPS local, 4 por la
  regla general) y **1** se canceló porque nadie validó a tiempo.

**En la práctica** (Jesús, 2026-10-10): el no-show no se ha usado. Si el cliente no sale, el motorizado sigue con
sus otros pedidos. Falta la prueba: una foto de que el cliente no sale, que debería pedirse al cumplirse los 5 minutos
de espera. Está en el backlog (`Docs/trabajo/backlog.md`).

## Pendientes

`Docs/trabajo/squash/preguntas-antifraude.md`: si las reglas de `DECISIONS.md §8` siguen siendo las que quieres.
