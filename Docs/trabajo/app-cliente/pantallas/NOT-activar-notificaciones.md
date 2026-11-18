# NOT · Activar notificaciones

> **Decisiones de Jesús del 2026-11-17 que cambian esta pantalla** (donde choquen con el texto de abajo, manda esto):
> - No son obligatorias; el permiso se pide tras el primer pedido confirmado; un solo interruptor, «Avisos de tus pedidos»; las promociones quedan fuera del lanzamiento (CUS-NOT-005, 006).
> - «Pedidos y novedades» y el «consentimiento comercial conforme a la Ley 29733» de la cabecera quedan reemplazados.

> **Decisión A resuelta el 2026-11-17: las notificaciones no son obligatorias.** El permiso se pide tras el primer pedido confirmado (CUS-NOT-005).
> Maqueta: tablero `Onboarding-4-notificaciones`: hoja sobre el Seguimiento atenuado.

| | |
|---|---|
| **Tarea de la persona** | Decidir, una sola vez, si quiere recibir avisos de sus pedidos y novedades. |
| **Se llega desde** | Aparece **una sola vez**, sobre el detalle del primer pedido confirmado (`TRK-seguimiento` atenuado). No se pide en el acceso (`AUT-entrar`). |
| **Se sale hacia** | «Sí, activar» → diálogo de permiso del sistema (Android 13+) y la hoja se cierra conteste lo que conteste. «Ahora no» → la hoja se cierra sin diálogo y no se vuelve a preguntar. Después, el interruptor «Notificaciones · Pedidos y novedades» en `ACC-cuenta`. |
| **Requisitos** | CUS-TRK-010, CUS-TRK-013 · CUS-AUT-018 · (requisito nuevo: un único permiso que cubre estados del pedido y novedades/promociones, con consentimiento comercial conforme a la Ley 29733) · (requisito nuevo: interruptor «Notificaciones» en Cuenta) · (requisito nuevo: avisos de cambio de Términos por notificación) |
| **Endpoints** | `PUT /push/devices/{installId}` (registrar el dispositivo y su token) · `DELETE /push/devices/{installId}` (apagar) · (endpoint nuevo: guardar la preferencia y la fecha de consentimiento comercial si no basta con registrar el dispositivo) |
| **Estado** | Android: ⬜ no existe (carpeta `feature/notifications` por crear) · iOS: ⬜ |

## Contenido, de arriba abajo

Hoja inferior sobre el seguimiento atenuado:

1. **Ilustración:** una campana que suena una vez (ondas, 600 ms).
2. **Título:** «¿Activar notificaciones?»
3. **Texto:** «Te avisamos de tus pedidos.» (la maqueta dice «y novedades»: reemplazado; las promociones quedan fuera del lanzamiento, CUS-NOT-006). Propuesta de la junta B: «Activa las notificaciones para recibir avisos de tu pedido».
4. **Botón primario:** «Sí, activar».
5. **Acción secundaria:** «Ahora no».

Nada del pedido depende del permiso: el seguimiento sigue funcionando por sondeo.

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Primera vez, pedido confirmado | La hoja sube sobre el seguimiento | CUS-TRK-013 |
| Ya preguntada | No se vuelve a mostrar | CUS-TRK-013 |
| Permiso ya concedido | No se muestra | CUS-TRK-013 |
| Permiso bloqueado por el sistema | No se muestra; el interruptor de Cuenta lleva a Ajustes | (requisito nuevo: notificaciones) |
| Android anterior a 13 | No hay diálogo de permiso: «Sí, activar» registra el dispositivo directamente | (requisito nuevo: notificaciones) |
| «Sí, activar» + permiso denegado | La hoja se cierra igual; el interruptor de Cuenta queda apagado | (requisito nuevo: notificaciones) |
| Sin conexión al registrar | Se reintenta en silencio; no se muestra error | (requisito nuevo: notificaciones) |

## Criterios de aceptación propios de la pantalla

```
CA-NOT-P1 · Se pregunta una sola vez
  Dado el primer pedido confirmado de la persona
  Cuando abre el seguimiento
  Entonces ve «¿Activar notificaciones?» una sola vez
  Y, conteste lo que conteste, no se vuelve a mostrar en pedidos posteriores

CA-NOT-P2 · «Ahora no» no abre el diálogo del sistema
  Dado la hoja abierta
  Cuando la persona toca «Ahora no»
  Entonces la hoja se cierra sin mostrar el diálogo de permiso del sistema

CA-NOT-P3 · El pedido no depende del permiso
  Dado una persona que no activó notificaciones
  Entonces el seguimiento se actualiza igual por sondeo (cada 8 s) y los avisos críticos se leen dentro de la app

CA-NOT-P4 · [REEMPLAZADO, decisión de Jesús 2026-11-17] El texto no ofrece promociones
  Dado la hoja abierta
  Entonces el texto habla solo de avisos del pedido
```

## Movimiento

La hoja sube 250 ms; la campana suena una vez (ondas, 600 ms). Con «reducir movimiento»: sin ondas ni subida animada.

## Pendiente (va a `decisiones-abiertas.md`)

- **Decisión A de Jesús (obligatorias o no):** la maqueta las trata como opcionales («Ahora no» las cierra para siempre). Si fueran obligatorias, esta hoja no tendría «Ahora no» y hay que definir qué pasa cuando el sistema las deniega.
- **Documento ↔ documento:** las decisiones de Jesús del 2026-11-16 («Notificaciones al instalar») dicen que se pregunta «al instalar»; la maqueta las pregunta después del primer pedido confirmado, y `CUS-TRK-013` las ofrece una vez por pedido con tope de 2 descartes. No se elige.
- **Maqueta ↔ código:** no hay código de notificaciones en Android. El servidor ya tiene `PUT /push/devices/{installId}`, pero la app no lo llama.
- La etiqueta de cada notificación sigue la regla `${event_type}-${shortId}` (invariante 5 de `AGENTS.md`).
- El consentimiento comercial (Ley 29733) necesita registrar versión y fecha de lo que la persona aceptó; falta decidir dónde se guarda.
