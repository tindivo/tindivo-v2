# Preguntas para Jesús: área de dinero

> 2026-10-10 · Salen de escribir `Docs/negocio/dinero.md` desde las definiciones vivas de `tindivo-prod` (solo
> lectura), con la revisión de Codex. El uso escaso o nulo de una ruta no demuestra que no tenga defectos. Que el
> sistema haga algo tampoco demuestra que esté aprobado: por eso las confirmaciones también son preguntas. Se borra
> cuando estén respondidas.

## 0. Nueva, de la respuesta de Jesús: ¿se le devuelven S/ 20.50 a La Florencia?

`GWYVM24F` no tuvo devolución (Jesús: se canceló para avanzar con el pedido, que se entregó como `EFFF947D`), pero el
cargo automático le sumó S/ 20.50 y La Florencia los pagó el 2026-08-30 dentro de su Yape de S/ 111.50. **Le pagó a
Tindivo S/ 20.50 de más.** ¿Se le devuelven o se le descuentan de su próxima liquidación? Corregirlo toca dinero:
espera tu decisión.

## 1. Prepago verificado y cancelado: ¿quién le devuelve al cliente?

`handle_prepaid_refund_on_cancel` carga al negocio el total del pedido como deuda **con Tindivo** cuando se cancela un
prepago ya verificado. Eso solo cuadra si **Tindivo** le devolvió el dinero al cliente; si el negocio le devolvió
directamente (el Yape fue a su cuenta), con ese cargo pagó dos veces.

**El único caso fue un falso positivo** (pregunta 0): la cancelación era para volver a crear el pedido, no una
devolución. Con la función de adelantar pedido no debería repetirse, pero el cargo automático sigue ahí. Para adelante: **¿quién devuelve, con qué evidencia y
cuándo corresponde cargar deuda con Tindivo?** Recomendación: que el negocio devuelva directamente y que el cargo
automático exista solo cuando Tindivo adelantó la devolución.

## 2. ~~Cobertura de fraude~~ — respondida

**Jesús, 2026-10-10:** fue una función «por si acaso» y nunca se usó: los casos se coordinan por WhatsApp. Queda en
el backlog retirarla del código (`Docs/trabajo/backlog.md`).

<details><summary>Lo que se preguntó</summary>


`app_settings.fraud_coverage` dice que Tindivo cubre el 50 % de la pérdida, hasta S/ 200 al mes, pero ninguna función
lee esos valores. Y `resolve_fraud_claim`, al aprobar una reclamación, **suma** deuda al negocio. Nunca se ha usado.
Recomendación: definir para quién es la cobertura y quién paga antes de cambiar el signo o retirar el flujo.

</details>

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
del mismo día. **La comisión ya la confirmó Jesús (S/ 1.50).** Queda la periodicidad: **¿se liquida cuando el negocio paga, o
quieres una fecha fija? ¿El efectivo se rinde el mismo día?**

## 6. Sueldo del motorizado y punto de equilibrio

`§4` dice ~S/ 30 por motorizado por noche y equilibrio en ~10 pedidos por noche; la base no lo guarda. **¿Sigue vigente
el sueldo? ¿Con qué costos y con cuántos motorizados se calcula hoy el equilibrio?**

## 7. Faltantes de efectivo

Cuando el negocio disputa una rendición, Jesús la resuelve con un monto, pero el código no dice **quién cubre la
diferencia**: el motorizado, el negocio o Tindivo. Nunca ha habido una disputa. **¿Quién la cubre?**

## 8. Entregas cancelada después de cobrar

Si una entrega se cancela después de que el motorizado cobró los S/ 3, el cobro se conserva y se puede rendir. **¿Se le
devuelve al cliente? ¿Quién y cuándo?**

## 9. ~~Ventas de Store~~ — respondida por `DECISIONS.md §32`

Jesús es el único vendedor y cobra al cerrar la venta por WhatsApp, fuera de la plataforma. Ver
`Docs/negocio/servicios/store.md`.

## Pendiente operativo

Las 3 rendiciones de Entregas (S/ 9.00) sin confirmar: no es un problema. Jesús todavía no ha enseñado a los
motorizados el flujo de rendición (2026-10-10).
