# Preguntas para Jesús: área de dinero

> 2026-10-10 · Salen de escribir `Docs/negocio/dinero.md` desde las definiciones vivas de `tindivo-prod` (solo
> lectura). Ninguna es un defecto activo: las rutas dudosas nunca se usaron o se usaron una vez. Se borra cuando estén
> respondidas.

## 1. Prepago verificado y cancelado: ¿quién le devuelve al cliente?

`handle_prepaid_refund_on_cancel` carga al negocio el total del pedido como deuda **con Tindivo** cuando cancela un
prepago que ya estaba verificado. Eso solo cuadra si **Tindivo** le devuelve el dinero al cliente. Si es el negocio
quien le devuelve directamente (el Yape fue a su cuenta), con ese cargo pagaría dos veces.

Nunca ha ocurrido (el único reembolso de la historia fue por apelación). **Recomendación:** que el negocio le devuelva
directamente al cliente y que el cargo automático desaparezca; el cargo a la deuda queda solo para cuando Jesús adelanta
la devolución (apelaciones). **¿Cómo quieres que funcione?**

## 2. La «cobertura de fraude» suma deuda al negocio

`resolve_fraud_claim`, al aprobar una reclamación, crea un `refund_charge` **positivo** contra el negocio: el negocio
pasa a deber más. Si la cobertura existe para proteger al negocio de un cliente que lo estafó, el signo está al revés
(debería restar deuda). Nunca se ha usado. **¿Para qué existe la cobertura de fraude?** Si no hay un caso de uso,
recomiendo retirarla antes de que alguien la use.

## 3. Las apelaciones son la excepción a «no retener fondos»

Con una apelación aprobada, Jesús le devuelve el dinero al cliente y se lo cobra al negocio por la deuda: Tindivo
adelanta. Es lo que hacía el fondo de contingencia que se eliminó en la `0123`. **¿Lo aceptas como la única excepción
del principio?** Si sí, se escribe así en el canon (hoy `plataforma.md` lo describe como «excepción viva en el
código», sin aprobación tuya).

## 4. Bloqueo por deuda

Existe la marca `blocked_for_debt` y el pago la quita, pero nada la pone: no hay bloqueo automático. **¿Quieres que lo
haya?** (Con qué umbral o plazo.) Si no, recomiendo retirar la marca para que nadie crea que protege algo.

## 5. Sueldo del motorizado y punto de equilibrio

`DECISIONS.md §4` dice: sueldo fijo de **~S/ 30 por noche** (no por entrega) y equilibrio en **~10 pedidos por noche**.
La base no lo guarda. Hoy hay tres motorizados y ~17 pedidos entregados por noche de media. **¿Siguen valiendo?**
(Misma pregunta que la 2 de plataforma: se responde una vez.)

## 6. Pendiente operativo (no es pregunta)

Hay **3 rendiciones de Entregas (S/ 9.00) sin confirmar**: el motorizado las rindió y falta tu confirmación en el
panel de admin.

## Lo que ya no es pregunta (documentación vieja, corregida en el canon)

- **La comisión es S/ 1.50**, no S/ 1.00 (pregunta 1 de plataforma; evidencia: toda la historia de cargos).
- **El efectivo se rinde pedido a pedido**, no en una liquidación diaria: 340 rendiciones, una por pedido.
- **Las comisiones no se liquidan cada semana por regla**: se liquidan cuando el negocio paga.
- **`advance_order` calcula bien lo que rinde el motorizado** desde la `0146` (la nota que decía lo contrario era de la
  `0140`).
