# Backlog

> Trabajo, no norma. Ideas y arreglos pendientes, con su origen. Cuando se decide hacer uno, pasa a un plan en
> `Docs/planes/` o a un PR. Hay cuatro backlogs viejos por fusionar aquí: `Docs/backlog/backlog.md`,
> `Docs/14-roadmap-y-fuera-de-mvp.md`, `Docs/Entregas/backlog-entregas.md` y `Docs/Encargos/06-backlog.md`.

| # | Qué | Por qué | Origen |
|---|---|---|---|
| 1 | **Foto de no-show:** al cumplirse los 5 minutos de espera, pedir al motorizado una foto de que el cliente no sale, como prueba del reporte | Hoy el no-show no se usa y, si se usara, no habría evidencia | Jesús, 2026-10-10 |
| 2 | **Retirar la cobertura de fraude** (`fraud_coverage_claims`, `resolve_fraud_claim`, `app_settings.fraud_coverage`) | Nunca se usó; los casos se coordinan por WhatsApp. Además suma deuda al negocio en vez de cubrirlo | Jesús, 2026-10-10 |
| 3 | **Quitar el cargo automático de reembolso al cancelar** (`handle_prepaid_refund_on_cancel`): el cargo nace solo del reclamo del cliente (ADR 0036) | Su único uso fue un cargo falso: una cancelación para volver a crear el pedido (`GWYVM24F`), que La Florencia pagó. Toca dinero | Jesús, 2026-10-10 |
| 4 | **El motorizado ve el comprobante del prepago** | Ayuda al restaurante a validar. Si el negocio avanzó por error sin comprobante, o falta un sol, el motorizado lo sabe y cobra en la puerta | Jesús, 2026-10-10 |
| 5 | **Pago más flexible según la confianza del cliente.** Confiable: dos opciones, efectivo contraentrega o Yape/Plin; el Yape se puede subir mientras se prepara o mostrar al motorizado al llegar, y el restaurante ve si ya se subió. No confiable: prepago, avisando que el restaurante no empieza a preparar hasta que suba la captura | Que el pedido avance sin esperar la captura y se optimicen los tiempos | Jesús, 2026-10-10 |
| 6 | **Editar un pedido ya enviado** | Clientes que se equivocan de pedido escriben a Jesús para cambiarlo, cuando el restaurante ya lo pasó a cocina | Jesús, 2026-10-10 |
| 7 | **Confirmar la dirección en el checkout** (un aviso de confirmación o mejor UX al elegir o crear dirección) | Un cliente creó o editó una dirección en el checkout y pidió con la anterior | Jesús, 2026-10-10 |
| 8 | **Marcar al «usuario nuevo en la plataforma»** en la tarjeta del negocio, con un ícono que diga qué filtro pasó (ubicación en San Jacinto, directorio, pedido previo) | La cajera casi no llama: así ve de un vistazo quién entró solo por ubicación, que es la señal falsificable | Jesús, 2026-10-10 |
