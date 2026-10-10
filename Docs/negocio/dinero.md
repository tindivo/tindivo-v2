# Dinero: quién paga qué, quién le debe a quién y cómo se cuadra

> Verificado: 2026-10-10 · entorno: `tindivo-prod` (solo lectura: definiciones vivas de las funciones y conteos) +
> `develop@7d00aa4` · Principios: `Docs/negocio/plataforma.md` · Nombres: `Docs/glosario.md`

Todo cambio en lo que describe este archivo requiere la revisión de Jesús antes de aplicarse (`AGENTS.md`,
invariante 9).

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
- **La banda la declara el motorizado al recoger.** Si se equivocó, Jesús la corrige mientras el cargo de envío siga
  sin liquidar (`admin_correct_delivery_band`): se recalcula el envío y el monto de la comida, nunca el total que pagó
  el cliente.
- **Toda la historia de producción** cobró S/ 1.50 de comisión por pedido con entrega y S/ 1.00 por recojo.

## La deuda del negocio con Tindivo

1. **Al entregar** un pedido, un trigger (`generate_delivery_charges`) crea en `business_charges` dos cargos
   `pending`: el **envío** que cobró (`delivery_fee`) y la **comisión** (`commission`). Un pedido cancelado no crea
   ninguno.
2. **La deuda** (`businesses.balance_due`) es la suma de los cargos `pending`. Es derivada: la recalcula un trigger
   (`recalc_business_balance`) con cada cambio en los cargos; nadie la escribe a mano.
3. **El pago:** cuando el negocio paga (Yape, efectivo u otro), Jesús lo registra eligiendo los cargos exactos que
   cubre (`settle_business_charges`). El monto tiene que coincidir al céntimo con la suma de esos cargos; queda un
   `restaurant_payments` y los cargos pasan a `settled`.
4. **No hay bloqueo automático por deuda.** El pago desbloquea a un negocio marcado `blocked_for_debt`, pero nada en la
   base ni en la API lo marca (comprobado). Tampoco hay una fecha fija de liquidación: se liquida cuando el negocio paga.

Medido al 2026-10-10: S/ 3,144.50 en cargos liquidados y S/ 273.00 pendientes entre los cuatro aliados. Los 23 pagos
registrados suman S/ 3,165.00, que es lo liquidado más un reembolso de S/ 20.50: **cuadra al céntimo**.

## Promociones de envío gratis

En un pedido con envío gratis (`delivery_fee_source = 'promo'`), el cliente no paga envío y **al negocio no se le carga
envío**; la comisión se cobra igual. **El envío gratis lo absorbe Tindivo.** Hubo 16 pedidos así (promoción de
lanzamiento de inicios de septiembre, hoy inactiva en `app_settings.promo_free_delivery`, y envío gratis por plato
desde la `0227`).

## El efectivo del motorizado

- **El sencillo lo pone la caja.** Antes de salir, la cajera le da al motorizado el cambio para el vuelto
  (`change_advanced`); el motorizado nunca pone plata propia. (Regla confirmada por Jesús el 2026-08-11.)
- **Lo que rinde** por pedido = adelanto + parte en efectivo del pedido (`cash_owed_at_delivery`, que calcula
  `advance_order` al entregar desde la `0146`). Si el cliente paga exacto o por Yape, el motorizado devuelve el adelanto
  igual.
- **La rendición es pedido a pedido**, no una liquidación diaria: el motorizado declara que entregó el efectivo
  (`deliver_order_cash` → un `cash_settlements` en `pending_confirmation`, con la fecha de servicio); el negocio lo
  confirma (`confirm_order_cash`) o lo disputa con lo que contó (`dispute_cash_settlement`, que abre un reporte
  `cash_difference`); Jesús resuelve la disputa con un monto (`resolve_cash_settlement`).

Medido al 2026-10-10: 340 rendiciones confirmadas (S/ 15,776.70), 1 pendiente y **ninguna disputa** en la historia.

## Reembolsos al cliente

Tindivo no cobra al cliente, así que un reembolso sale del negocio. Tres caminos lo cargan a su deuda como
`refund_charge`:

| Caso | Qué pasa | Función |
|---|---|---|
| El negocio, Jesús o el plazo de aceptación cancela un **prepago ya verificado** | Se carga automáticamente el total (comida + envío). No aplica si fue no-show o comprobante rechazado en firme | `handle_prepaid_refund_on_cancel` |
| **Apelación aprobada**: el negocio rechazó por error un comprobante | Jesús le devuelve el total al cliente (con la captura del Yape o Plin) y se lo carga al negocio | `register_appeal_refund` |
| **Reclamación de fraude** aprobada | Se carga el monto reclamado al negocio | `resolve_fraud_claim` |

En toda la historia hubo **un** reembolso (S/ 20.50) y ninguna reclamación de fraude. Las preguntas sobre quién le
devuelve al cliente en cada caso están en la sección de pendientes.

## Tindivo Entregas

El cliente paga los S/ 3 al motorizado al recoger o al entregar (según quién paga), en efectivo o Yape. El motorizado
marca el cobro (`transport_collected_at`), lo rinde a Tindivo (`driver_remit_courier_fee` → `remitted_at`) y Jesús
confirma haberlo recibido (`admin_confirm_courier_remittance`). El producto llega siempre pagado: el motorizado no lo
cobra ni lo paga.

Medido al 2026-10-10: 3 entregas, S/ 9.00 rendidos y **sin confirmar por Jesús**.

## Pendientes

Preguntas abiertas en `Docs/trabajo/squash/preguntas-dinero.md`: quién le devuelve al cliente en un prepago cancelado,
el signo de la cobertura de fraude, si debe existir el bloqueo por deuda, el sueldo del motorizado y el punto de
equilibrio.
