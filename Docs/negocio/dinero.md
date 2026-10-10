# Dinero: quién paga qué, quién le debe a quién y cómo se cuadra

> Verificado: 2026-10-10 · entorno: `tindivo-prod` (solo lectura: definiciones vivas de las funciones y conteos) +
> `develop@7d00aa4` · Principios: `Docs/negocio/plataforma.md` · Nombres: `Docs/glosario.md` · Revisado por Codex
> (`Docs/trabajo/squash/debate/02-codex-dinero.md`)

Todo cambio en lo que describe este archivo requiere la revisión de Jesús antes de aplicarse (`AGENTS.md`,
invariante 9). Este archivo describe **lo que hace el sistema**; lo que todavía no aprobó Jesús está marcado y
preguntado en `Docs/trabajo/squash/preguntas-dinero.md`.

## En una frase

El cliente le paga al negocio la comida y el envío; el negocio le debe a Tindivo el envío y una comisión por cada
pedido entregado, y se los paga aparte. El efectivo que cobra el motorizado es del negocio y se le rinde pedido a pedido.
En Tindivo Entregas, el cliente le paga el transporte al motorizado y el motorizado se lo rinde a Tindivo.

## Precios vivos

Mandan los valores de `app_settings`, no este archivo; al 2026-10-10:

| Concepto | Valor | Dónde vive | Lo paga |
|---|---|---|---|
| Envío, banda **cerca** | S/ 2.00 | `delivery_bands.near` | El cliente, al negocio |
| Envío, banda **lejos** | S/ 2.50 | `delivery_bands.far` | El cliente, al negocio |
| Comisión, pedido **con entrega** | S/ 1.50 | `commissions.delivery` | El negocio, a Tindivo |
| Comisión, **recojo** en el local | S/ 1.00 | `commissions.pickup` | El negocio, a Tindivo |
| Transporte de **Entregas** | S/ 3.00 | `courier.pricing.basePrice` | El cliente, a Tindivo (vía el motorizado) |

- Un negocio puede tener comisión propia (`businesses.commission_override_delivery` / `_pickup`); hoy ninguno la tiene.
- En todas las semanas con cargos, desde la primera (2026-08-03), la comisión fue S/ 1.50 por pedido con entrega y
  S/ 1.00 por recojo. `DECISIONS.md §4` dice S/ 1.00: **pendiente de confirmar** (pregunta 1 de plataforma).
- **La banda (cerca o lejos) se fija al crear el pedido**: la calcula el sistema por ubicación en los de la app y la
  pone la cajera en los manuales (desde la `0120`). Al recoger, el código todavía permite que el parámetro `band` del
  motorizado sustituya la banda guardada, sin recalcular el envío. Después de entregar, Jesús puede corregir la banda mientras el cargo de envío siga pendiente
  (`admin_correct_delivery_band`): cambia el reparto entre comida y envío y conserva el total que pagó el cliente.
- Antes de que el motorizado llegue al local, la cajera puede modificar el total y la forma de pago de un pedido manual
  (`update_business_manual_order`).

## La deuda del negocio con Tindivo

1. **Al entregar**, un trigger (`generate_delivery_charges`) crea en `business_charges` un cargo `pending` por cada
   importe positivo: el **envío** cobrado (`delivery_fee`) y la **comisión** (`commission`). El recojo y el envío gratis
   no generan cargo de envío. Un pedido cancelado no genera estos cargos, pero puede generar uno de reembolso (abajo).
2. **La deuda** (`businesses.balance_due`) es la suma de los cargos `pending`. Es derivada: la recalcula un trigger
   (`recalc_business_balance`) con cada cambio en los cargos; nadie la escribe a mano.
3. **El pago:** cuando el negocio paga (Yape, efectivo u otro), Jesús lo registra eligiendo los cargos exactos que
   cubre (`settle_business_charges`). El monto tiene que coincidir al céntimo con la suma de esos cargos; queda un
   `restaurant_payments` y los cargos pasan a `settled`. El código no fija una periodicidad: se liquida cuando el
   negocio paga (`DECISIONS.md §4` dice «semanal»: pendiente de confirmar).
4. **Bloqueo por deuda: solo manual.** Jesús puede suspender a un negocio y marcar que es por deuda
   (`block_business(…, p_for_debt)`, `0180`; comprobado en la definición viva); registrar un pago levanta esa marca solo si la deuda queda en cero o
   menos. No hay corte automático: la `0178` lo introdujo y la `0179` lo retiró como decisión de producto, porque
   dejaba a un negocio sin vender un viernes por la noche sin que nadie lo hubiera decidido. `debt_block_threshold`
   (S/ 600) es un aviso que ve el negocio, no un corte.

Medido al 2026-10-10: S/ 3,165.00 liquidados (S/ 3,144.50 de comisión y envío más S/ 20.50 de reembolso) y S/ 273.00
pendientes entre los cuatro aliados. Los 23 pagos registrados suman S/ 3,165.00 y **cada pago coincide al céntimo con
los cargos que liquidó**; no hay cargos liquidados sin pago.

## Promociones de envío gratis

En los 16 pedidos entregados con `delivery_fee_source = 'promo'`, el envío al cliente y el cargo de envío al negocio
fueron S/ 0.00, con comisión de S/ 1.50: **el envío gratis lo absorbió Tindivo**. El código contempla una promoción
general (`app_settings.promo_free_delivery`, hoy `active: false`) y envío gratis por plato (`0227`); los datos no dicen
qué promoción originó cada pedido.

## El efectivo del motorizado

- **El sencillo lo pone la caja.** Antes de salir, la cajera le da al motorizado el cambio para el vuelto
  (`change_advanced`); el motorizado nunca pone plata propia. (Regla confirmada por Jesús el 2026-08-11.)
- **Lo que rinde** por pedido = adelanto + parte en efectivo del pedido (`cash_owed_at_delivery`, que calcula
  `advance_order` al entregar desde la `0146`). Si el cliente paga exacto o por Yape, el motorizado devuelve el adelanto
  igual.
- **La rendición es pedido a pedido**: el motorizado declara que entregó el efectivo (`deliver_order_cash` → un
  `cash_settlements` en `pending_confirmation`, con la fecha de servicio); el negocio lo confirma (`confirm_order_cash`)
  o lo disputa con lo que contó (`dispute_cash_settlement`, que abre un reporte `cash_difference`); Jesús resuelve la
  disputa con un monto (`resolve_cash_settlement`). Quién cubre un faltante no lo dice el código.
- **En un recojo no hay efectivo que rendir:** el negocio cobra en el mostrador, lo declara al aceptar o entregar, y
  se genera la comisión de recojo.

Medido al 2026-10-10: 340 rendiciones confirmadas (S/ 15,776.70), 1 pendiente y ninguna disputa.

## Reembolsos al cliente

El código registra tres caminos de **cargos de reembolso** (`refund_charge`) contra el negocio. **Registrar el cargo no
ejecuta ninguna devolución**: quién le devuelve al cliente, y cuándo corresponde cargar la deuda con Tindivo, lo
decide Jesús (preguntas 1 a 3).

| Caso | Qué registra el sistema | Función |
|---|---|---|
| El negocio, Jesús o el plazo de aceptación cancela un **prepago ya verificado** | Un cargo por el total (comida + envío). No aplica a no-show ni a comprobante rechazado en firme. Si el cargo falla, abre un reporte `prepay_refund_review` | `handle_prepaid_refund_on_cancel` |
| **Apelación aprobada** (el negocio rechazó por error un comprobante) | Exige la captura del Yape o Plin enviado al cliente; carga el total al negocio | `register_appeal_refund` |
| **Reclamación de fraude** aprobada | Carga el monto reclamado al negocio | `resolve_fraud_claim` |

Medido: un solo `refund_charge` en la historia, S/ 20.50, del pedido `GWYVM24F`: **el cargo automático** por un prepago
verificado que canceló el negocio (2026-08-21; liquidado el 2026-08-30). Ninguna apelación con reembolso, ninguna
reclamación de fraude.

## Tindivo Entregas

El cliente paga los S/ 3 al motorizado al recoger o al entregar (según quién paga), en efectivo o Yape. El motorizado
registra el cobro al avanzar la entrega (`driver_courier_step` → `advance_courier_order`, `transport_collected_at`),
lo rinde a Tindivo (`driver_remit_courier_fee` → `remitted_at`) y Jesús confirma haberlo recibido
(`admin_confirm_courier_remittance`). El producto llega siempre pagado: el motorizado no lo cobra ni lo paga. Si una
entrega se cancela después del cobro, el cobro se conserva y se puede rendir; el código no devuelve nada.

Medido: 3 entregas con S/ 9.00 **declarados como rendidos** por el motorizado y sin confirmación de Jesús.

## Tindivo Store

Store registra precio y estado vendido de cada pieza; eso no es un cobro ni una liquidación. El único vendedor es
Jesús y cobra al cerrar la venta por WhatsApp, fuera de la plataforma (`DECISIONS.md §32`).
