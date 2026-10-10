# Pedidos de restaurante: el ciclo de un pedido

> Verificado: 2026-10-10 · entorno: `tindivo-prod` (solo lectura: `advance_order`, `app_settings.timers`, `cron.job`,
> conteos de 30 días) + `develop@7d00aa4` · Dinero: `Docs/negocio/dinero.md` · Nombres: `Docs/glosario.md`

## La referencia está en el código

Los estados y las transiciones permitidas **no se copian aquí**: los define `ORDER_TRANSITIONS` en
`packages/contracts/src/order-status.ts`, y la vista simplificada que ve el cliente, `STATUS_TO_TRACKING` en el mismo
archivo. Este documento explica quién mueve cada paso, con qué plazos y por qué.

## Dos caminos

- **Con entrega:** el negocio acepta y cocina, un motorizado lo toma, lo recoge y lo entrega.
- **Recojo en el local:** igual hasta salir de cocina; entonces queda en el mostrador (`ready_for_pickup`) hasta que el
  cliente llega. **En el mostrador no se fía:** un recojo llega a cocina pagado. Un recojo «ahora» (el cliente está
  delante) no pasa por validación: la cajera lo ve antes de aceptar.

Los dos terminan en `delivered`, que es **terminal**: nada saca un pedido de ahí.

## Quién mueve cada paso

Todo pasa por la función `advance_order`, que rechaza la acción si quien la pide no tiene el rol o el pedido no está en
el estado que toca.

| Acción | Quién | Qué hace |
|---|---|---|
| `accept` | Negocio | Acepta el pedido y lo manda a cocina, o lo deja esperando el pago si es prepago |
| `preparing` | Negocio | Pasa a cocina un pedido confirmado |
| `ready` | Negocio | Sale de cocina: a la cola de motorizados (`waiting_driver`) o al mostrador (`ready_for_pickup`) |
| `handover` | Negocio o admin | Entrega en el mostrador un recojo, declarando cómo pagó |
| `pickup_no_show` | Negocio o admin | Cierra un recojo cuyo cliente no vino (cancela y marca la falta) |
| `cancel` | Negocio o admin | Cancela cualquier pedido no cerrado |
| `take` | Motorizado | Toma un pedido de la cola y va al local |
| `arrived` | Motorizado | Llegó al local |
| `pickup` | Motorizado | Recogió; **declara la banda** (cerca o lejos), que fija el envío |
| `arrived_customer` | Motorizado | Llegó al domicilio (necesario antes de un no-show) |
| `deliver` | Motorizado | Entregó; **declara el cobro real** (efectivo, Yape, mixto o prepago) y calcula lo que rinde |
| `no_show` | Motorizado | El cliente no aparece, tras esperar el plazo desde que llegó: cancela |
| `release` | Motorizado | Suelta un pedido antes de recogerlo, con motivo obligatorio; vuelve a la cola |

Fuera de `advance_order` escriben el estado: la validación de la cajera (`validate_order`), la cancelación del cliente
(`cancel_customer_order`), los vencimientos (`expire_order`, `cancel_expired_prepay_orders`), la ampliación del tiempo
de cocina (`extend_order_prep`), el traspaso entre motorizados (`apply_order_transfer`) y la creación
(`create_customer_order`, que usan **los dos canales**: la app y la cajera).

## Plazos

Mandan los valores de `app_settings.timers`; al 2026-10-10:

| Plazo | Valor | Para qué |
|---|---|---|
| `acceptanceMinutes` | 8 min | El negocio acepta, o el pedido se cancela (`pending_acceptance_timeout`) |
| `validationMinutes` | 5 min | La cajera valida a un cliente nuevo o con strike, o se cancela (`validation_timeout`) |
| `paymentMinutes` | 15 min | El cliente de prepago paga y sube la captura |
| `prepayVerificationMinutes` | 10 min | El negocio verifica el comprobante |
| `prepExtensionMinutes` · `maxPrepExtensions` | 10 min · 2 veces | Ampliar el tiempo de cocina |
| `queueLeadMinutes` | 10 min | El pedido aparece en la cola de motorizados cuando le quedan 10 min de cocina |
| `travelMinutesMin` · `Max` | 20 · 25 min | El tiempo de viaje que se suma al estimado que ve el cliente |
| `noShowWaitMinutes` | 5 min | Lo que espera el motorizado en el domicilio antes de poder reportar no-show |
| `deliveryLateMinutes` | 20 min | La tarjeta del motorizado se pone roja si la entrega tarda más |
| `transferTtlSeconds` | 30 s | Lo que dura una oferta de traspaso entre motorizados |
| `shiftAvailabilityGraceMinutes` | 10 min | Margen al cerrar la franja horaria de un plato |

**Por qué un solo sitio:** un plazo que se le enseña a alguien tiene que salir del sitio que de verdad cancela. Antes
de la `0174`, el mismo plazo estaba escrito en tres sitios y cambiar uno no cambiaba lo que pasaba. Los vencimientos los
aplica el cron `auto-cancel-prepay-timeout` (`cancel_expired_prepay_orders`, que cubre aceptación, validación y pago)
y `expire_order`.

## Lo que pasa de verdad (30 días al 2026-10-10)

- **497 entregados y 22 cancelados (4 %).** Motivos: el negocio, 13; el cliente, 6; venció la aceptación, 2; venció la
  validación, 1.
- **Cómo pagaron los entregados:** Yape 182, efectivo 175, prepago 139, mixto 1.
- **Solo 12 pedidos pasaron por validación** (zona GPS dudosa, cliente nuevo, regla general: 4 cada uno).
- **El 84 % lo teclea la cajera**: cualquier regla nueva en la creación del pedido la sufre sobre todo ella. Por eso
  las reglas de catálogo y horario se aplican solo al canal del cliente (`p_source = 'customer_pwa'`), salvo decisión
  escrita.

## Pendientes

La validación y los strikes (quién valida, cuándo se exige prepago, cuándo se bloquea) son el área de antifraude, que
se reescribe aparte.
