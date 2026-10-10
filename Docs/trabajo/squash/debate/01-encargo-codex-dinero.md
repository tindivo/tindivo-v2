# Encargo a Codex: auditoría de `Docs/negocio/dinero.md`

Worktree `tindivo-v2-docs`, rama `docs/canon-dinero`, commit `b8a4f88`. Declara rama y commit al empezar. Encargo
cerrado: es la primera regla de dinero que entra al canon, y por eso entras tú. Jesús no está; lees tú, decide él.

## Qué es

Claude escribió `Docs/negocio/dinero.md` leyendo en `tindivo-prod` (solo lectura) las definiciones vivas de estas
funciones: `generate_delivery_charges`, `recalc_business_balance`, `settle_business_charges`,
`handle_prepaid_refund_on_cancel`, `register_appeal_refund`, `resolve_fraud_claim`, `admin_correct_delivery_band`,
`deliver_order_cash`, `confirm_order_cash`, `dispute_cash_settlement`, `resolve_cash_settlement`, `order_cash_owed`,
`driver_remit_courier_fee`, `admin_confirm_courier_remittance`, y la rama `deliver` de `advance_order`. Tú no tienes
la base: búscalas en `supabase/migrations/` (vale la última migración que define cada una) y avisa si la última
versión del repo no dice lo mismo que el documento.

Las preguntas para Jesús que salieron: `Docs/trabajo/squash/preguntas-dinero.md`.

## Datos medidos en `tindivo-prod` el 2026-10-10 (crudos; no los tienes de otra forma)

```
app_settings.commissions        = {"pickup":1, "delivery":1.5}
app_settings.delivery_bands     = {"far":2.5, "near":2}
app_settings.courier.pricing    = {"basePrice":3}
businesses.commission_override_* = null en los 4 negocios

business_charges (tipo, estado, n, total):
  commission    pending   80   120.00 | commission    settled 900 1346.50
  delivery_fee  pending   75   153.00 | delivery_fee  settled 882 1798.00
  refund_charge settled    1    20.50
fraud_coverage_claims: 0 filas · reports de tipo rejected_proof_disputed / prepay_refund_review / cash_difference: 0
restaurant_payments: efectivo 12 = 1817.50 · yape 10 = 1340.50 · otro 1 = 7.00
cash_settlements: confirmed 340 = 15776.70 · pending_confirmation 1 = 29.50 · order_count medio 1.00
courier_orders: 3 rendidos (remitted_at) sin confirmar, fee total 9.00
comisión por semana desde 2026-08-03: delivery siempre 1.50, pickup siempre 1.00
pedidos entregados por delivery_fee_source: business 849 · system 95+7 pickup · promo 16 (envío cliente 0.00,
  envío cargado al negocio 0.00, comisión 1.50) · admin 9 · null 4
blocked_for_debt = true: ninguna función SQL lo escribe; en apps/ solo se lee
```

## Ataca solo esto

1. ¿Alguna afirmación de `dinero.md` es falsa o más fuerte de lo que prueban las funciones o los datos?
2. ¿Falta algún flujo que mueva dinero (otra función, otra tabla, un camino desde la API) que el documento omite?
3. ¿Algo está escrito como regla aprobada cuando es solo lo que hace el código? (El estándar §4 lo prohíbe.)
4. ¿Las seis preguntas para Jesús están bien planteadas? ¿Falta alguna?

Respuesta corta, en español, con texto exacto de cada cambio. Veredicto: firmo / firmo con cambios / no firmo.
