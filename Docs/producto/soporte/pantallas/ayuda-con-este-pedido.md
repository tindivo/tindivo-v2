---
canvas: [Seguimiento-aceptacion, Seguimiento]
requisitos: [CUS-SUP-001, CUS-SUP-005, CUS-SUP-006]
operaciones: [getPublicConfig]
textos: []
tokens: []
codigo:
  web: [apps/customer/components/support-link.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderCancelViews.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrdersScreen.kt]
  ios: []
---

# Ayuda con este pedido

| | |
|---|---|
| **Tarea de la persona** | Pedirle ayuda a Tindivo por un pedido concreto, sin buscar un teléfono. |
| **Se llega desde** | Dentro de un pedido: «Esperando que el negocio acepte», el seguimiento y el detalle del pedido (también el cancelado), y la fila cancelada del historial («¿Problema con este pedido?»). |
| **Se sale hacia** | WhatsApp, con el mensaje de soporte escrito y listo para enviar. La persona vuelve a la app con «atrás». |

No es una pantalla propia: es una fila de texto con ícono que vive dentro de las pantallas de pedido de la capacidad de seguimiento. Esta ficha define la fila y su mensaje; las pantallas que la alojan están en la capacidad de seguimiento.

## Contenido

1. Una **fila secundaria** de al menos 48 dp, con ícono y el texto «Ayuda con este pedido». Va debajo de «Cancelar pedido» y de «Ver resumen del pedido»; no compite con el botón principal.
2. Al tocarla se abre WhatsApp con el número de soporte (`supportWhatsapp` de `GET /config`) y el mensaje: «Hola, necesito ayuda con mi pedido #TDV-[CÓDIGO] de [NEGOCIO].» La persona lo puede editar antes de enviarlo.
3. **Sin selector de motivos.** Quién responde, en qué horario y qué puede resolver sigue abierto (decisión abierta U de la fuente).
4. En un pedido cancelado, la fila del historial dice «¿Problema con este pedido?» y su mensaje deja el motivo para que la persona lo escriba.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Con número | La fila, activa | CUS-SUP-006 |
| Sin poder leer el número | La fila con el número de respaldo; nunca desaparece ni queda muerta | CUS-SUP-001 |
| Pedido con la cuenta en pausa o con pago adelantado obligatorio | La frase «Si crees que hubo un error, escríbenos por WhatsApp» con su botón | CUS-SUP-005 |
| Con términos desactualizados | La fila funciona igual: el soporte nunca se bloquea | CUS-SUP-001 |

## Diferencias por plataforma

- La web hoy dice «¿Algún problema? Escríbenos» (`support-link.tsx`) y se apaga: no recibe el texto nuevo.
- Android ya lee el número de `GET /config`, pero con otro texto y sin el negocio; falta alinearlo (ver «Estado en Android hoy» de la capacidad).
- El motorizado deja de mostrarse con teléfono o WhatsApp (CUS-TRK-021): esa pantalla no ofrece otra vía de contacto.
