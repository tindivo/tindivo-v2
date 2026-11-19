---
canvas: [Checkout, Checkout-confiable, Checkout-adelantado]
requisitos: [CUS-CHK-001, CUS-CHK-002, CUS-CHK-003, CUS-CHK-005, CUS-CHK-006, CUS-CHK-007, CUS-CHK-008, CUS-CHK-009, CUS-CHK-010, CUS-CHK-011, CUS-CHK-012, CUS-CHK-013, CUS-CHK-014, CUS-CHK-015, CUS-CHK-016, CUS-CHK-017, CUS-CHK-018, CUS-CHK-019, CUS-CHK-020, CUS-CHK-023, CUS-CHK-024, CUS-CHK-025, CUS-CHK-026, CUS-CHK-027, CUS-CHK-028, CUS-CRT-008, CUS-ADR-011, CUS-ADR-012, CUS-ADR-013, CUS-ADR-014, CUS-ADR-015]
operaciones: [quoteCheckout, createOrder, getClientConfig, getPublicConfig, listCustomerAddresses, createCustomerAddress, sendPhoneCode, verifyPhoneCode]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/checkout/components/*.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutBagSection.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutDeliverySection.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutPaymentSection.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutCashSection.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutTotalsSection.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutBottomBar.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutNoticeViews.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutSheets.kt]
  ios: []
---

# Confirmar pedido

> Maquetas: canvas «Tindivo app — pantallas», tableros `5 · Confirmar: confiable, efectivo`, `5b · Confiable, Yape o Plin` y `5c · No confiable: solo adelantado`. Donde la maqueta `Checkout-adelantado` dibuja «Yape o Plin al recibir» en gris, sobra: ya no existe (decisión de Jesús, 2026-11-17).

| | |
|---|---|
| **Tarea de la persona** | Revisar a dónde llega, quién recibe y cómo paga, y confirmar. Una sola acción primaria. |
| **Se llega desde** | `bolsa/bolsa` → «Continuar». Si no hay sesión o faltan datos, antes pasa por la capacidad de acceso (aún sin migrar a `Docs/producto/`). |
| **Se sale hacia** | Pedido creado: el seguimiento, **reemplazando** esta pantalla (CUS-CHK-011); mientras el negocio no acepte, `TRK-esperando-aceptacion`. Volver: la bolsa. |

- Las hojas de dirección y de celular viven dentro del checkout: `direcciones/elegir-direccion` para «Cambiar» la dirección y la hoja de verificación del celular de la capacidad de acceso. Cambiar el celular exige verificarlo de nuevo.
- Con un caso de pago sin resolver no se entra: se lleva al caso (CUS-CHK-019, capacidad `pagos`).

## Contenido, de arriba abajo

1. **Barra superior (fija).** Volver, nombre del negocio, «[N] productos · llega en [PLAZO] min» y «Ver», que abre una hoja con los productos, sus opciones y notas (CUS-CHK-001). No lleva el título «Confirmar pedido»: lo dice el botón.
2. **Tarjeta de entrega** (solo delivery; en recojo no existe, CUS-CHK-018, CUS-ADR-014):
   - Dirección: «[línea] · [etiqueta]» y la referencia debajo. «Cambiar» abre la hoja de elegir dirección.
   - Quién recibe: nombre y celular. «Cambiar» abre la verificación del celular.
   - Nota para el motorizado: campo de una línea, opcional, de hasta 200 caracteres, con «Nota para el motorizado (opcional)» (CUS-CHK-005).
3. **«¿Cómo pagas?»**: las opciones dependen de la decisión del servidor (`quoteCheckout`), nunca de la app (CUS-CHK-006, CUS-CHK-007):

   | Situación del cliente | Opciones habilitadas | Opciones en gris |
   |---|---|---|
   | **Confiable** (`trusted`) | «Efectivo» y «Yape o Plin» (con logos; «Ves el número cuando el negocio acepte»). Sin selector «Al recibir» / «Pagar ahora» | ninguna |
   | **No confiable** por faltas o riesgo (`risk_blocked`) | «Yape o Plin por adelantado» y «Pagas apenas el local acepte» | «Efectivo», con candado y el motivo **una sola vez**: «Por pedidos anteriores sin recibir» |
   | **No confiable por monto** (total con envío sobre el umbral) | igual | motivo: «Pedido mayor a S/ [umbral]» |
   | **Sin historial con GPS en cobertura** (`no_history`) | las del confiable; el pedido pasa a `validando` (la cajera llama) | ninguna; bajo el botón: «Te llamaremos para confirmar tu pedido» y, debajo, el número verificado (CUS-CHK-027) |

   - La opción elegida se expande; las demás quedan en una línea.
   - **Efectivo elegido:** «¿Con cuánto pagas?» con chips «Exacto», «S/ 20», «S/ 50», «S/ 100» y «Otro», y las reglas de billete y vuelto de CUS-CHK-008. Si el vuelto de la noche es cero: «Esta noche el negocio no tiene vuelto». El chip «S/ 20» sigue como está hasta que Jesús lo decida (punto Y de `Docs/trabajo/app-cliente/decisiones-abiertas.md`).
   - **Yape o Plin:** con los logos de Yape y de Plin. No se paga aquí: el número aparece en el seguimiento cuando el negocio acepta (CUS-PAY-014).
   - **Recojo** (sin tarjeta de entrega): solo «Yape o Plin por adelantado» y la línea «Pagas por adelantado y lo preparamos apenas confirmemos el pago» (CUS-CHK-028). No hay pregunta «¿Vas al local ahora?».
4. **Resumen:** siempre «Subtotal S/ [SUBTOTAL]», «Envío S/ [ENVÍO]» y «Total S/ [TOTAL]» (CUS-CHK-026); el envío se tacha si hay promoción (CUS-CHK-016). Los montos son los de la cotización.
5. **Términos:** «Al confirmar aceptas los Términos y la Privacidad», con enlaces de 48 dp de alto.
6. **Barra de acción (fija):** «Confirmar pedido» y la píldora «S/ [TOTAL]». Si falta algo, el botón dice qué hacer y lleva al campo, en el orden de CUS-CHK-013.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Cargando la cotización | Esqueletos en resumen y pagos; botón deshabilitado | CUS-CHK-014 |
| Revalidando la bolsa | Botón deshabilitado con «Estamos verificando tu bolsa con el menú actual.» | CUS-CHK-014 |
| Falta un dato | Botón con la acción («Agrega tu dirección», «Verifica tu celular», «¿Con cuánto pagas?») | CUS-CHK-013 |
| GPS dudoso con historial y pago al recibir | Hoja de bloqueo: «Reintentar» o «Pagar por adelantado» | CUS-CHK-009 |
| Negocio cerrado o pausado | Aviso y botón deshabilitado | CUS-CAT-012 y CUS-CAT-014 (catálogo, aún sin migrar) |
| Caso de pago sin resolver | No se entra: se lleva al caso | CUS-CHK-019 |
| Cuenta bloqueada | Vista de bloqueo con soporte por WhatsApp | CUS-CHK-012 |
| Error del servidor | Mensaje comprensible según el `code`, nunca el texto crudo | CUS-CHK-020 |
| El total o las opciones cambiaron | La app lo dice y pide revisar antes de volver a confirmar | CUS-CHK-007 |
| Enviando | Botón con progreso; no se puede tocar dos veces; misma `Idempotency-Key` si hay que reintentar | CUS-CHK-010 |
| No sabemos si el pedido llegó | Aviso para revisar «Mis pedidos» antes de repetir | CUS-CHK-010 |

## Movimiento

Botón: escala 0,97 al tocar. Opción elegida: se expande en 200 ms. Opciones en gris: si se tocan, la línea del motivo vibra 150 ms. Al confirmar: check animado y paso al seguimiento. Respeta «reducir movimiento».

## Diferencias por plataforma

- La web del cliente se apaga: no recibe el rediseño.
- En Android el recojo hoy conserva la pregunta «¿Vas al local ahora?», y la app aún no lee el GPS; ambas cosas están en los defectos de la capacidad.
