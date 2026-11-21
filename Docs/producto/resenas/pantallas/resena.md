---
canvas: []
requisitos: [CUS-REV-001, CUS-REV-002, CUS-REV-003]
operaciones: [getCustomerPendingReview, createCustomerReview, dismissCustomerReview]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/reviews/components/*.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/reviews/ReviewSheets.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/reviews/ReviewHost.kt]
  ios: []
---

# ¿Cómo estuvo tu pedido?

| | |
|---|---|
| **Tarea de la persona** | Decir en segundos cómo le fue con un pedido ya entregado, o dejarlo para después. |
| **Se llega desde** | El inicio con sesión (sale sola si hay un pedido pendiente), el seguimiento al salir y el historial; y «Calificar» dentro del detalle de un pedido entregado. |
| **Se sale hacia** | «Enviar» o «Ahora no»: vuelve a la pantalla de donde vino, sin más pasos. |

Son dos hojas sobre la pantalla en que está la persona; no se navega a otra. La fuente de trabajo no cita ningún tablero del canvas para la reseña: se parte del comportamiento actual (web y Android).

## Contenido

1. **La pregunta:** «¿Cómo estuvo tu pedido?» con el negocio y «tu nota le llega directo al negocio», cinco estrellas y «Ahora no». Tocar una estrella ya es la respuesta: abre el detalle con esa nota.
2. **El detalle:** «¿Cómo estuvo tu pedido de [negocio]?», las estrellas con su palabra (de «Muy mal» a «Muy bien»), «¿Algo que destacar?» con las etiquetas que da el servidor, «¿Quieres contarnos algo más? (opcional)» con un contador, y «Enviar».
3. **La privacidad, a la vista:** «Tu nota la ve [negocio]. Lo que escribas lo lee solo el equipo de Tindivo.»
4. **Sin número escrito a mano:** el largo máximo del comentario y las etiquetas salen de `app_settings:reviews`.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Sin pedido pendiente | No sale nada | CUS-REV-001 |
| Pregunta | Estrellas y «Ahora no» | CUS-REV-001 |
| Detalle | Estrellas, etiquetas, comentario y «Enviar»; sin nota, «Enviar» no se puede tocar | CUS-REV-002 |
| Enviando | «Enviando…», sin cerrar ni cambiar lo escrito | CUS-REV-002 |
| Error al enviar | El mensaje del servidor si lo explicó; si no, «No se pudo enviar. Inténtalo de nuevo.»; el detalle sigue abierto | CUS-REV-002 |
| «Ahora no» | La hoja se cierra al instante; el aviso al servidor sale detrás | CUS-REV-003 |
| Pedido activo en pantalla | La pregunta no sale mientras haya un pedido activo | CUS-REV-001 |

## Diferencias por plataforma

- La web consulta la base directo; Android usa la API. Las dos muestran lo mismo.
- La web se apaga: no se corrige.
