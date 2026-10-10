# Preguntas para Jesús: área de dinero

> 2026-10-10 · Salen de escribir `Docs/negocio/dinero.md` desde las definiciones vivas de `tindivo-prod` (solo
> lectura), con la revisión de Codex. El uso escaso o nulo de una ruta no demuestra que no tenga defectos. Que el
> sistema haga algo tampoco demuestra que esté aprobado: por eso las confirmaciones también son preguntas. Se borra
> cuando estén respondidas.

## 1. Prepago verificado y cancelado: ¿quién le devuelve al cliente?

`handle_prepaid_refund_on_cancel` carga al negocio el total del pedido como deuda **con Tindivo** cuando se cancela un
prepago ya verificado. Eso solo cuadra si **Tindivo** le devolvió el dinero al cliente; si el negocio le devolvió
directamente (el Yape fue a su cuenta), con ese cargo pagó dos veces.

**Ya pasó una vez:** pedido `GWYVM24F`, S/ 20.50, cancelado por el negocio el 2026-08-21; el cargo se liquidó el
2026-08-30. **¿Quién le devolvió al cliente en ese caso?** Y para adelante: **¿quién devuelve, con qué evidencia y
cuándo corresponde cargar deuda con Tindivo?** Recomendación: que el negocio devuelva directamente y que el cargo
automático exista solo cuando Tindivo adelantó la devolución.

## 2. Cobertura de fraude: ¿quién es el beneficiario y quién financia la pérdida?

`app_settings.fraud_coverage` dice que Tindivo cubre el 50 % de la pérdida, hasta S/ 200 al mes, pero ninguna función
lee esos valores. Y `resolve_fraud_claim`, al aprobar una reclamación, **suma** deuda al negocio. Nunca se ha usado.
Recomendación: definir para quién es la cobertura y quién paga antes de cambiar el signo o retirar el flujo.

## 3. Apelaciones: ¿autorizas que Jesús adelante dinero propio y lo recupere del negocio?

`register_appeal_refund` exige una captura de Yape o Plin y carga el total al negocio. Eso no acredita quién financió
la devolución. **¿Autorizas que Jesús adelante dinero propio y lo recupere del negocio?** Si sí, el principio de
`plataforma.md` lo dirá así.

## 4. Bloqueo por deuda: ¿solo manual?

Hoy es solo manual (`block_business` con `p_for_debt`, `0180`, comprobado en producción); el automático lo retiró la `0179` como decisión de
producto, y `debt_block_threshold` (S/ 600) es solo un aviso. **¿Confirmas que así debe quedar?**

## 5. Comisión y periodicidad frente a `DECISIONS.md §4`

`§4` dice comisión de S/ 1.00 y liquidación de comisiones **semanal** y de efectivo **diaria**. En las semanas
reportadas desde el 2026-08-03, la comisión fue S/ 1.50 por delivery y S/ 1.00 por recojo. El código permite liquidar
cuando se registra el pago y registra el efectivo por pedido; esa granularidad no determina si debe rendirse dentro
del mismo día. **¿Confirmas lo que hace producción
como regla vigente?** (Misma pregunta que la 1 de plataforma para la comisión.)

## 6. Sueldo del motorizado y punto de equilibrio

`§4` dice ~S/ 30 por motorizado por noche y equilibrio en ~10 pedidos por noche; la base no lo guarda. **¿Sigue vigente
el sueldo? ¿Con qué costos y con cuántos motorizados se calcula hoy el equilibrio?**

## 7. Faltantes de efectivo

Cuando el negocio disputa una rendición, Jesús la resuelve con un monto, pero el código no dice **quién cubre la
diferencia**: el motorizado, el negocio o Tindivo. Nunca ha habido una disputa. **¿Quién la cubre?**

## 8. Entregas cancelada después de cobrar

Si una entrega se cancela después de que el motorizado cobró los S/ 3, el cobro se conserva y se puede rendir. **¿Se le
devuelve al cliente? ¿Quién y cuándo?**

## 9. Ventas de Store

Store registra precio y estado vendido, pero no un cobro. **¿Quién cobra una venta de Store y cómo llega ese dinero
(o la parte de Tindivo) a Tindivo?**

## Pendiente operativo

Hay **3 rendiciones de Entregas (S/ 9.00)** que el motorizado declaró haber rendido y que esperan tu confirmación en
el panel de admin.
