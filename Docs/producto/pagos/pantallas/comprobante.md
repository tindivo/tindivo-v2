---
canvas: [Comprobante-vacio, Comprobante]
requisitos: [CUS-PAY-001, CUS-PAY-002, CUS-PAY-003, CUS-PAY-004, CUS-PAY-005, CUS-PAY-006, CUS-PAY-007, CUS-PAY-008, CUS-PAY-009, CUS-PAY-011, CUS-PAY-013, CUS-PAY-015, CUS-PAY-016, CUS-PAY-017]
operaciones: [getPrepayInfo, createPrepayProofUploadUrl, confirmPrepayProof, getCustomerOrder]
textos: []
tokens: []
codigo:
  web: [apps/customer/components/prepay-proof-section.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/PrepaySection.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/PrepayPayeeCard.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/PrepayViewModel.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/ProofImageEncoder.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/ProofSender.kt]
  ios: []
---

# Pagar y subir comprobante

> Maquetas: `Comprobante-vacio` (sin captura) y `Comprobante` (captura lista). La maqueta `Comprobante-plin`, con la cuenta secundaria, queda fuera hasta que Jesús decida la cuenta secundaria (decisión G de `Docs/trabajo/app-cliente/decisiones-abiertas.md`).

| | |
|---|---|
| **Tarea de la persona** | Pagar exacto al negocio dentro del plazo y enviar la captura como comprobante. |
| **Se llega desde** | La tarjeta de pago del seguimiento (`pagos/tarjeta-de-pago`), cuando el pedido pasa a esperar el pago porque el negocio aceptó: «Restaurante confirmó. Paga ahora». También desde la notificación «Ya puedes pagar». |
| **Se sale hacia** | «Enviar comprobante»: vuelve al seguimiento en «Verificando tu comprobante de pago». Plazo vencido: el seguimiento cancelado («Se acabó el tiempo para pagar»). Dos rechazos: el caso de pago (CUS-PAY-008, CUS-PAY-009). |

Es la pantalla de la **captura obligatoria**: la del cliente no confiable, o la del confiable que decide subirla. La captura la revisa el restaurante, que es el único que confirma el pago (CUS-PAY-015). Es un solo pago: cualquier incidencia va a «Ayuda con este pedido» (CUS-PAY-016).

## Contenido, de arriba abajo

1. **Barra superior:** volver, «Pagar y subir comprobante» y el reloj «Quedan [PLAZO]», que pasa a rojo con menos de 2 min.
2. **Monto:** «Paga exacto a [NEGOCIO]» y «S/ [TOTAL]» grande. El total es el del pedido, el que fijó el servidor.
3. **Tarjeta de cuenta:** rótulo «Con Yape o Plin» (con logos), el número del negocio, «Titular: [nombre]», «Copiar» (cambia a «Copiado» con check) y «Ver QR» (hoja con el QR grande).
4. **Captura:** sin captura, «Subir captura» (el selector del sistema: cámara o galería). Con captura: miniatura, «Captura lista» y «Cambiar».
5. **Aviso antes de enviar:** «El restaurante y el motorizado asignado podrán ver esta captura. Muestra solo esta operación y oculta información ajena al pago.» (CUS-PAY-015).
6. **Barra de acción (fija):** «Enviar comprobante». Sin captura queda deshabilitado y dice «Adjunta la captura para enviar»; con captura, se habilita.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando datos de pago | Esqueletos de monto y cuenta; botón deshabilitado | CUS-PAY-002 |
| Error al cargar | «No pudimos cargar los datos para pagar.» y «Reintentar» | CUS-PAY-002 |
| Sin captura | «Subir captura»; botón gris con «Adjunta la captura para enviar» | CUS-PAY-003 |
| Captura lista | Miniatura, «Captura lista», «Cambiar»; botón habilitado | CUS-PAY-003 |
| Quedan menos de 2 min | Reloj rojo | CUS-PAY-001 |
| Enviando | Botón con progreso («Subiendo…») y luego check | CUS-PAY-004 |
| Enviado | «Recibimos tu comprobante. El negocio lo está revisando.» | CUS-PAY-004 |
| Comprobante inválido, primer intento | «Tu comprobante no fue válido. Revisa e intenta de nuevo. Te queda 1 intento.» | CUS-PAY-005 |
| Comprobante inválido, segundo intento | Pedido cancelado por comprobante rechazado en firme: «No pudimos validar tu pago» y la vía de «Ayuda con este pedido» | CUS-PAY-005, CUS-PAY-009 |
| Plazo vencido | «Se acabó el tiempo para pagar» y «Estamos revisando en qué quedó tu pedido.» | CUS-PAY-001 |
| Sin conexión al enviar | «No pudimos enviarlo: revisa tu conexión. Tu captura sigue aquí.» | CUS-PAY-004 |
| Imagen ilegible o muy pesada | «No pudimos leer esa imagen. Elige otra captura.» o «La imagen es demasiado pesada. Elige otra captura.» y «Elegir otra captura» | CUS-PAY-003 |
| El pedido ya no espera pago | Se retira la pantalla y se refresca el seguimiento: «Tu pedido ya no está esperando el pago. Estamos actualizando su estado.» | CUS-PAY-001 |
| Sin cuenta publicada | «Todavía no vemos a qué número pagar. Vuelve a abrir tu pedido en un momento.» | CUS-PAY-002 |

## Movimiento

Al abrir, la tarjeta de cuenta entra con subida de 8 px y fundido en 200 ms. «Copiar» cambia a «Copiado» con check (escala 0,97 al tocar). «Ver QR» abre una hoja inferior. Al elegir la captura, la miniatura entra con escala de 0,9 a 1 y el botón pasa de gris a naranja. Al enviar, el botón muestra progreso circular y luego check. Con «reducir movimiento»: sin animaciones.

## Diferencias por plataforma

- Hoy Android no tiene pantalla propia: la sección vive dentro del detalle del pedido y solo para el pedido que espera el pago. «Guardar» el QR necesita permiso o la API de medios: sin definir.
