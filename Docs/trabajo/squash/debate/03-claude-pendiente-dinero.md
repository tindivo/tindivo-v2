# Pendiente: aplicar la revisión de Codex a `dinero.md`

Codex **no firmó** (`02-codex-dinero.md`). Sus cambios son correctos y están **sin aplicar** (se cortó la sesión por
límite de uso). `dinero.md` no debe fusionarse como canon hasta aplicarlos. Comprobado después en `tindivo-prod`:

- Los 23 pagos cuadran uno a uno con sus cargos; ningún cargo liquidado sin pago.
- El único `refund_charge` (S/ 20.50, pedido `GWYVM24F`) **no vino de una apelación**: fue el cargo automático por
  un prepago verificado que canceló el negocio (`business_cancelled`, 2026-08-21, liquidado el 2026-08-30). La
  pregunta 1 ya ocurrió una vez: ¿el negocio también le devolvió al cliente? Si sí, pagó dos veces.
- El bloqueo por deuda **sí** se marca: a mano, con `block_business(…, p_for_debt)` (`0180`). Que no sea automático es
  decisión de producto de la `0179`. `debt_block_threshold` (S/ 600) es un aviso, no un corte.
- `fraud_coverage` en `app_settings` = Tindivo cubre el 50 %, hasta S/ 200 al mes: la cobertura protege al negocio, y
  `resolve_fraud_claim` le suma deuda. Ninguna función lee ese porcentaje.
- `update_business_manual_order` existe; la promoción general está inactiva.

Además corregir fuera de `dinero.md`: la banda (glosario y `pedidos-restaurante.md`) no la declara siempre el motorizado.
Y una lección: no cambiar de rama en un worktree mientras Codex lo está leyendo (estándar §7.5).
