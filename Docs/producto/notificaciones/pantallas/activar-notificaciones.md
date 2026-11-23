---
canvas: [Onboarding-4-notificaciones]
requisitos: [CUS-NOT-001, CUS-NOT-002, CUS-NOT-004, CUS-NOT-005, CUS-NOT-006]
operaciones: [registerPushDevice, unregisterPushDevice]
textos: []
tokens: []
codigo:
  web: [apps/customer/components/push-permission-sheet.tsx]
  android: []
  ios: []
---

# Activar notificaciones

| | |
|---|---|
| **Tarea de la persona** | Decidir, una sola vez, si quiere recibir avisos de sus pedidos. |
| **Se llega desde** | Aparece **una sola vez**, sobre el detalle del primer pedido confirmado (el seguimiento, atenuado). No se pide en el acceso ni al abrir la app. |
| **Se sale hacia** | «Sí, activar»: el diálogo de permiso del sistema (Android 13 o superior; en iOS, el de `UNUserNotificationCenter`) y la hoja se cierra conteste lo que conteste. «Ahora no»: se cierra sin diálogo y no se vuelve a preguntar. Después, el interruptor «Avisos de tus pedidos» en Cuenta. |

## Contenido, de arriba abajo

Hoja inferior sobre el seguimiento atenuado:

1. Ilustración: una campana que suena una vez.
2. Título: «¿Activar notificaciones?»
3. Texto: «Te avisamos de tus pedidos.»
4. Botón primario: «Sí, activar».
5. Acción secundaria: «Ahora no».

Nada del pedido depende del permiso: el seguimiento sigue funcionando por sondeo.

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Primer pedido confirmado | La hoja sube sobre el seguimiento | CUS-NOT-001, CA-NOT-01 |
| Ya preguntada | No se vuelve a mostrar | CUS-NOT-005, CA-NOT-01 |
| Permiso ya concedido | No se muestra | CUS-NOT-001, CA-NOT-09 |
| Permiso bloqueado por el sistema | No se muestra; el interruptor de Cuenta lleva a Ajustes | CUS-NOT-002, CA-NOT-06 |
| Android anterior a 13 | «Sí, activar» registra el dispositivo, sin diálogo del sistema | CA-NOT-07 |
| «Sí, activar» con el permiso denegado | La hoja se cierra igual; el interruptor de Cuenta queda apagado | CUS-NOT-004 |
| «Ahora no» | Se cierra sin diálogo del sistema | CA-NOT-02 |
| Sin conexión al registrar | Se reintenta en silencio; no se muestra error | CA-NOT-08 |

## Diferencias por plataforma

- La web del cliente no recibe esta hoja: se apaga y no se corrige.
- iOS pide el permiso con su diálogo del sistema, que aparece una sola vez: por eso la hoja propia va antes y es la
  única pregunta (SW-10 de `Docs/arquitectura/estandares/swift.md`).
- Movimiento: la hoja sube en 250 ms y la campana suena una vez (ondas, 600 ms); con «reducir movimiento», sin ondas ni
  subida animada.
