# PAY · Pagar y subir comprobante (prepago)

> Maquetas: `Comprobante-vacio` (sin captura), `Comprobante` (captura lista) y `Comprobante-plin` (cuenta secundaria
> abierta). Decisión posterior a la maqueta: la cuenta secundaria ya **no** se llama «Plin», se llama **«Usa otra cuenta»**.

| | |
|---|---|
| **Tarea de la persona** | Pagar exacto al negocio dentro del plazo y enviar la captura como comprobante. |
| **Se llega desde** | `TRK-seguimiento`, cuando el pedido prepago pasa a `awaiting_payment` (el negocio aceptó): «Restaurante confirmó. Paga ahora». Notificación «Ya puedes pagar». |
| **Se sale hacia** | «Enviar comprobante» → vuelve a `TRK-seguimiento` en «Verificando tu comprobante de pago». Plazo vencido → seguimiento cancelado («Se acabó el tiempo para pagar»). Dos rechazos → caso de pago (CUS-PAY-008/009). |
| **Requisitos** | CUS-PAY-001 ★, 002, 003, 004, 005 ★, 006, 007, 008 ★, 009 · CUS-TRK-005 ★ (reloj de pago, ⚙ 15 min) · (requisito nuevo: cuenta secundaria «Usa otra cuenta») · (requisito nuevo: pago por billetera sin marca) |
| **Endpoints** | `GET /customer/orders/{id}/prepay-info` (cuenta, QR, total, plazo) · `POST /customer/orders/{id}/prepay-proof/upload-url` (URL firmada) · `PUT` binario a esa URL · `POST /customer/orders/{id}/prepay-proof` (`path` ya subido) · `GET /customer/orders/{id}` (refresco) · `POST /customer/orders/{id}/appeal` (si cancela por comprobante) |
| **Estado** | Android: 🟡 hay `PrepaySection` dentro del detalle del pedido (sin pantalla propia, sin cuenta secundaria) · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Barra superior:** volver · «Pagar y subir comprobante» · reloj «Quedan [PLAZO]» (rojo `#991B1B` sobre `#FEE2E2` con
   menos de 2 min).
2. **Monto:** «Paga exacto a La Florencia» y «S/ [TOTAL]» grande.
3. **Tarjeta de cuenta:** rótulo «Billetera digital» (sin marca), número «987 123 456», titular «Rosa M. Huamán», «Copiar»
   (cambia a «Copiado» con check) y «Ver QR» (hoja con el QR grande y «Guardar»).
4. **«¿No funciona? Usa otra cuenta»**: enlace de texto. Despliega la cuenta secundaria (acordeón con `aria-expanded`): la
   primera se colapsa a una línea («Billetera digital · 987 123 456») y la secundaria se expande con su número («955 321 876»),
   titular, «Copiar» y «Ver QR». Tocar la fila colapsada invierte el acordeón.
5. **Captura:** sin captura, «Subir captura» (selector del sistema: cámara o galería). Con captura: miniatura, «Captura lista» y
   «Cambiar».
6. **Barra de acción (fija):** «Enviar comprobante». Sin captura: deshabilitado (`#E0E4E8` / `#50565D`) y la línea «Adjunta la captura
   para enviar». Con captura: naranja.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando datos de pago | Esqueletos de monto y cuenta; botón deshabilitado | CUS-PAY-002 |
| Error al cargar | «No pudimos cargar los datos para pagar.» + «Reintentar» | CUS-PAY-002 |
| Sin captura | «Subir captura»; CTA gris con «Adjunta la captura para enviar» | CUS-PAY-003 |
| Captura lista | Miniatura, «Captura lista», «Cambiar»; CTA naranja | CUS-PAY-003 |
| Cuenta secundaria abierta | Acordeón con la primera colapsada; sigue sin captura | PATRONES-V2 §12 |
| Quedan menos de 2 min | Reloj rojo | CUS-TRK-005 |
| Enviando | CTA con progreso circular («Subiendo…») y luego check | CUS-PAY-004 |
| Enviado | «Recibimos tu comprobante. El negocio lo está revisando.» | CUS-PAY-004 |
| Comprobante inválido, 1.er intento | «Tu comprobante no fue válido. Revisa e intenta de nuevo. Te queda 1 intento.» | CUS-PAY-005 |
| Comprobante inválido, 2.º intento | Pedido cancelado por `proof_rejected_final`: «No pudimos validar tu pago» y opción de solicitar revisión | CUS-PAY-005, CUS-PAY-009 |
| Plazo vencido | «Se acabó el tiempo para pagar» · «Estamos revisando en qué quedó tu pedido.» | CUS-TRK-005 |
| Sin conexión al enviar | «No pudimos enviarlo: revisa tu conexión. Tu captura sigue aquí.» | CUS-PAY-004 |
| Imagen ilegible / muy pesada | «No pudimos leer esa imagen. Elige otra captura.» / «La imagen es demasiado pesada. Elige otra captura.» | CUS-PAY-003 |
| El pedido ya no espera pago (409) | Se retira la pantalla y se refresca el seguimiento | CUS-PAY-001 |
| Sin cuenta publicada | «Todavía no vemos a qué número pagar. Vuelve a abrir tu pedido en un momento.» | CUS-PAY-002 |

## Criterios de aceptación propios de la pantalla

```
CA-PAY-P4 · Sin captura no se envía
  Dado la pantalla sin captura
  Entonces «Enviar comprobante» está deshabilitado y se lee «Adjunta la captura para enviar»
  Y al elegir una imagen válida pasa a naranja y se habilita

CA-PAY-P5 · «Usa otra cuenta» alterna las cuentas
  Dado la cuenta principal expandida y una secundaria disponible
  Cuando la persona toca «¿No funciona? Usa otra cuenta»
  Entonces la principal se colapsa a una línea y la secundaria se expande
  Y tocar la línea colapsada invierte el estado; solo una cuenta está expandida a la vez

CA-PAY-P6 · Se paga exacto y a tiempo
  Dado el plazo de pago vigente (⚙ 15 min)
  Entonces el reloj cuenta hacia atrás; con menos de 2 min el reloj pasa a rojo
  Y al llegar a 0 el pedido se cancela y la pantalla lo dice

CA-PAY-P7 · Máximo dos intentos
  Dado un primer comprobante rechazado
  Entonces vuelve «Pagar y subir comprobante» con «Te queda 1 intento»
  Y un segundo rechazo cancela el pedido y bloquea pedidos nuevos hasta resolver el caso (CUS-PAY-008)
```

## Movimiento

Al abrir, la tarjeta de cuenta entra con subida de 8 px y fundido (200 ms). «Copiar» cambia a «Copiado» con check (escala 0,97
al tocar). «Ver QR» abre una hoja inferior (radio 28). La cuenta secundaria se despliega con altura animada de 200 ms y
colapsa la principal a una línea. El reloj pasa a rojo con menos de 2 min. Al elegir la captura, la miniatura entra con escala
0,9 a 1 y el CTA pasa de gris a naranja. Al enviar, el CTA muestra progreso circular y luego check. Con «reducir
movimiento»: sin animaciones.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** la maqueta es una pantalla propia con reloj en la barra; el código es una sección dentro del detalle del pedido, con el plazo en una línea («minutos que quedan»).
- **Maqueta ↔ código:** la maqueta dice «Billetera digital» y «Usa otra cuenta»; el código nombra la cuenta «Yape», «Plin» o «Yape o Plin» («[billetera] del restaurante») y tiene un solo número. El servidor devuelve una cuenta de cobro por pedido: la cuenta secundaria necesita un campo nuevo (endpoint nuevo: `prepay-info` con lista de cuentas).
- **Maqueta ↔ código:** la maqueta titula «Paga exacto a La Florencia»; el código «Paga tu pedido» y «Transfiere exacto».
- La maqueta no dibuja el segundo intento ni el caso `proof_rejected_final`; hoy los cubre el seguimiento cancelado.
- «Guardar» el QR necesita permiso o API de medios: sin definir.
