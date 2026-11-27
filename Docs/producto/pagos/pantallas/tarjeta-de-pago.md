---
canvas: [Seguimiento-pago, Seguimiento]
requisitos: [CUS-PAY-001, CUS-PAY-002, CUS-PAY-003, CUS-PAY-004, CUS-PAY-005, CUS-PAY-011, CUS-PAY-013, CUS-PAY-014, CUS-PAY-015, CUS-PAY-016, CUS-PAY-017]
operaciones: [getPrepayInfo, createPrepayProofUploadUrl, confirmPrepayProof]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/tracking/components/tracking-prepay.tsx, apps/customer/features/tracking/components/prepay-rail.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/PrepaySection.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/PrepayPayeeCard.kt]
  ios: []
---

# Tarjeta de pago del seguimiento

> Reemplaza a la hoja «Pago al recibir» de la maqueta (`Seguimiento-pago`): el pago ya no se muestra en una hoja sino dentro del seguimiento, en una tarjeta, una vez que el negocio acepta (decisión de Jesús, 2026-11-17, CUS-PAY-014). Conserva los textos de aquella hoja.

| | |
|---|---|
| **Tarea de la persona** | Pagar al negocio el total de su pedido con Yape o Plin: copiar el número, pagar desde su billetera y, si quiere (o debe), dejar la captura. |
| **Se llega desde** | El seguimiento del pedido (capacidad de seguimiento, aún sin migrar), cuando el negocio acepta. |
| **Se sale hacia** | «Subir captura» abre el selector del sistema y, con la captura elegida, `pagos/comprobante`. «Ayuda con este pedido» abre el WhatsApp de soporte. |

La tarjeta vive dentro del seguimiento; no es una pantalla aparte. Qué ofrece depende de quién es el cliente, y eso lo decide el servidor:

- **Cliente confiable** (puede pagar con «Efectivo» o con «Yape o Plin»; esto es cuando eligió «Yape o Plin»): «Subir captura» es opcional. La alternativa es «Pagaré al motorizado al llegar». El pedido avanza igual sin captura (CUS-PAY-014).
- **Cliente no confiable** (prepago): la captura es obligatoria y se sube en `pagos/comprobante`.

## Contenido, de arriba abajo

1. **Título:** «Paga a [NEGOCIO]» y debajo «Con Yape o Plin», con los logos (CUS-PAY-017).
2. **Monto:** «Total S/ [TOTAL]» grande, el del pedido.
3. **Cuenta de cobro:** el número del negocio, «Titular: [nombre]» y «Copiar» (cambia a «Copiado» con check durante 2 s) (CUS-PAY-011).
4. **QR:** «Ver QR» abre una hoja inferior con el código grande. Si la cuenta no tiene QR: «Esta cuenta no tiene QR: transfiere al número desde tu billetera.» (CUS-PAY-013).
5. **Acción:** «Subir captura» (botón primario). Antes de enviarla, el aviso de que el restaurante y el motorizado asignado podrán verla y de que solo el restaurante confirma el pago (CUS-PAY-015).
6. **Solo el confiable:** «Pagaré al motorizado al llegar» (el texto está pendiente de Jesús, PG-4; mientras, rige este).
7. **Ayuda:** «Ayuda con este pedido», para cualquier incidencia de pago (CUS-PAY-016).

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando datos de pago | Esqueleto de monto y cuenta | CUS-PAY-002 |
| Error al cargar | «No pudimos cargar los datos para pagar.» y «Reintentar» | CUS-PAY-002 |
| Sin cuenta publicada | «Todavía no vemos a qué número pagar. Vuelve a abrir tu pedido en un momento.» | CUS-PAY-002 |
| Sin captura todavía | «Subir captura» disponible; el confiable puede pagar al llegar | CUS-PAY-014 |
| Captura elegida | Vista previa «Tu captura» con «Cambiar» y «Enviar comprobante» | CUS-PAY-003 |
| Enviando | Botón con progreso, «Subiendo…» | CUS-PAY-004 |
| Enviada | «Recibimos tu comprobante. El negocio lo está revisando.» | CUS-PAY-004 |
| Sin conexión al enviar | «No pudimos enviarlo: revisa tu conexión. Tu captura sigue aquí.» | CUS-PAY-004 |
| Imagen ilegible o muy pesada | «No pudimos leer esa imagen. Elige otra captura.» o «La imagen es demasiado pesada. Elige otra captura.» y «Elegir otra captura» | CUS-PAY-003 |
| El pedido ya no espera pago | «Tu pedido ya no está esperando el pago. Estamos actualizando su estado.» y se retira la oferta | CUS-PAY-001 |
| Segundo intento | «Tu comprobante no fue válido. Revisa e intenta de nuevo. Te queda 1 intento.» (máximo dos intentos) | CUS-PAY-005 |

## Movimiento

La tarjeta entra con subida de 8 px y fundido en 200 ms. «Copiar» cambia a «Copiado» con check. «Ver QR» abre una hoja inferior. Con «reducir movimiento»: sin animaciones.

## Diferencias por plataforma

- Android aún no tiene esta tarjeta (contrastado el 2026-11-27 contra `develop@8ea8dd99`): la sección de pago solo existe para el prepago (`awaiting_payment`), y el cliente confiable con «Yape o Plin» paga en la puerta (intención de pago `pending_yape`) sin ver la cuenta del negocio ni «Subir captura». El servidor de la captura del confiable es el PR #245 y su sucesor, y la cotización de dos opciones, el PR #244: ninguno está en `develop`. Jesús decidió el 2026-11-19 (opción A) que ese servidor se construye antes que la app. La captura del confiable la ven el negocio, el motorizado y el admin, nunca antes de que el negocio acepte; solo el negocio confirma el ingreso.
- iOS aún no empieza.
