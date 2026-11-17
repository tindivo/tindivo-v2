# PAY · Pago al recibir (hoja del seguimiento)

> Maqueta: hoja `Seguimiento-pago`, que se abre sobre `Seguimiento` desde «Ver QR o subir captura». Decisión de Jesús
> (2026-11-16, PATRONES-V2 §12): el pago por billetera es **agnóstico a la marca**: número del negocio + titular +
> «Copiar» como acción principal; nunca «Yape» o «Plin» como marca.

| | |
|---|---|
| **Tarea de la persona** | Pagar al negocio el total de un pedido con billetera digital «al recibir»: copiar el número, pagar desde su billetera y, si quiere, dejar la captura. |
| **Se llega desde** | `TRK-seguimiento`, bloque «Paga al recibir» → «Ver QR o subir captura». |
| **Se sale hacia** | Cerrar (X, scrim o deslizar) → `TRK-seguimiento`. «Subir captura» → selector del sistema (cámara o galería) y luego «Captura enviada». |
| **Requisitos** | CUS-CHK-006 ★ (formas de pago permitidas) · CUS-PAY-002, 003, 004, 007 · (requisito nuevo: hoja de pago al recibir con número, titular, QR y captura opcional) · (requisito nuevo: pago por billetera sin marca) |
| **Endpoints** | `GET /customer/orders/{id}/prepay-info` (cuenta de cobro, QR y total) · `POST /customer/orders/{id}/prepay-proof/upload-url` · `POST /customer/orders/{id}/prepay-proof` · (endpoint nuevo: confirmar que `prepay-info` y la subida de captura también valen para un pedido de pago «al recibir», hoy solo atienden a `awaiting_payment`) |
| **Estado** | Android: ⬜ no existe esta hoja; el código solo tiene el prepago (`PrepaySection`) · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Asa y título:** «Paga a La Florencia» y debajo «Desde Yape, Plin o tu billetera» (única línea con los nombres de marca,
   como ayuda de dónde abrir).
2. **Monto:** «S/ [TOTAL]» grande, `tnum`.
3. **Cuenta de cobro:** número «987 654 321», «Titular: Rosa Mendoza Quispe» y «Copiar» (cambia a «Copiado» con check 2 s).
4. **QR:** «Ver QR» abre una hoja inferior con el código grande y «Guardar». Si la cuenta no tiene QR: «Esta cuenta no tiene
   QR: transfiere al número desde tu billetera.»
5. **Acción:** «Subir captura» (botón primario). Tocarlo abre el selector del sistema; al elegir una imagen se comprime
   (lado mayor 1600 px, calidad 0,92) y se envía. La hoja pasa a «Captura enviada» y avisa que el negocio la revisa.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando datos de pago | Esqueleto de monto y cuenta | CUS-PAY-002 |
| Error al cargar | «No pudimos cargar los datos para pagar.» + «Reintentar» | CUS-PAY-002 |
| Sin cuenta publicada | «Todavía no vemos a qué número pagar. Vuelve a abrir tu pedido en un momento.» | CUS-PAY-002 |
| Sin captura todavía | «Subir captura» disponible; el pago puede hacerse igual al recibir | CUS-PAY-003 |
| Captura elegida | Vista previa «Tu captura» con «Cambiar» y «Enviar comprobante» | CUS-PAY-003 |
| Enviando | Botón con progreso, «Subiendo…» | CUS-PAY-004 |
| Enviada | «Captura enviada» (la maqueta) / «Recibimos tu comprobante. El negocio lo está revisando.» (código) | CUS-PAY-004 |
| Sin conexión al enviar | «No pudimos enviarlo: revisa tu conexión. Tu captura sigue aquí.» | CUS-PAY-004 |
| Imagen ilegible o muy pesada | «No pudimos leer esa imagen. Elige otra captura.» / «La imagen es demasiado pesada. Elige otra captura.» + «Elegir otra captura» | CUS-PAY-003 |
| El pedido ya no espera pago (409) | «Tu pedido ya no está esperando el pago. Estamos actualizando su estado.» y se retira la oferta | CUS-PAY-001 |
| Segundo intento | «Tu comprobante no fue válido. Revisa e intenta de nuevo. Te queda 1 intento.» (máximo 2 intentos) | CUS-PAY-005 |

## Criterios de aceptación propios de la pantalla

```
CA-PAY-P1 · Copiar es la acción principal y no nombra una marca
  Dado la hoja abierta con una cuenta de cobro
  Entonces «Copiar» está junto al número y el titular
  Y la hoja no usa logos ni la palabra «Yape» o «Plin» como botón; solo aparecen en la línea de ayuda

CA-PAY-P2 · «Copiado» vuelve solo
  Dado que la persona toca «Copiar»
  Entonces el botón dice «Copiado» con check durante 2 s y luego vuelve a «Copiar»
  Y el portapapeles contiene el número de la cuenta de cobro

CA-PAY-P3 · La captura no bloquea el pedido
  Dado un pago «al recibir» sin captura
  Entonces el pedido avanza igual y la hoja puede cerrarse sin subir nada
```

## Movimiento

La hoja sube 250 ms con el fondo oscureciéndose. «Subir captura» abre el selector; la hoja pasa a «Captura enviada» y el
negocio la revisa. Se cierra con la X, el scrim o deslizando hacia abajo. Con «reducir movimiento»: sin animaciones.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** la maqueta ofrece esta hoja para pago **al recibir**; el código solo muestra la cuenta y la subida de captura cuando el pedido es **prepago** y está en `awaiting_payment`. No se elige: ¿la captura en pago al recibir es opcional y quién la revisa (cajera o motorizado)?
- **Maqueta ↔ código:** el código nombra la billetera «Yape», «Plin» o «Yape o Plin» según el negocio; la maqueta pide no usar marca. Hoy «Paga tu pedido» / «Transfiere exacto» / «Ya pagué · Subir captura».
- ¿A quién se le paga al recibir: al número del negocio (la maqueta) o al motorizado (`CHK-confirmar-pedido` dice «Le transfieres al motorizado en tu puerta» en el código)? Es una decisión de dinero.
- «Guardar» el QR necesita permiso de almacenamiento o la API de medios: sin definir.
