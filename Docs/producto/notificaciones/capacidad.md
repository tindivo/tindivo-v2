---
id: notificaciones
nombre: Notificaciones
actores: [CUS]
lineas: [pedidos-restaurante, entregas]
depende_de: []
dinero: false
codigo:
  web: [apps/customer/lib/push.ts, apps/customer/lib/use-push-offer.ts, apps/customer/components/push-manager.tsx, apps/customer/components/push-permission-sheet.tsx]
  android: []
  ios: []
  backend: [supabase/functions/send-push/**, packages/backend/src/modules/notifications/**, apps/api/app/api/v1/push/devices/**, packages/contracts/src/native-push.ts, packages/contracts/src/push-devices.ts]
operaciones: [registerPushDevice, unregisterPushDevice]
reglas: [NATIVE_PUSH_PAYLOAD_VERSION, PUSH_ENVIRONMENTS]
---

# Notificaciones

> Verificado: 2026-11-19 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el 2026-11-19 (conversación con Claude Code; fecha confirmada por él el 2026-11-23: «si»)

## Antes de tocar

- Son los avisos del sistema operativo sobre los pedidos del cliente: la hoja que pide el permiso, el interruptor de
  Cuenta, la franja «Notificaciones desactivadas» y el dispositivo registrado para recibirlos.
- **No son obligatorias** (Jesús, 2026-11-17): un solo interruptor, «Avisos de tus pedidos». Ninguna parte del pedido
  depende del permiso. Las promociones quedan fuera del lanzamiento: sin interruptor, casilla ni consentimiento comercial.
- Motor: FCM y APNs **directos** desde `send-push`, solo para lo transaccional (D-25). Campañas y promociones, fuera.
- El aviso es **solo la notificación del sistema**: el seguimiento retiró el tono y el sonido dentro de la pantalla
  (CUS-TRK-011, Jesús, 2026-11-19).
- Seguridad y datos personales: el token de FCM o APNs es una credencial. Vive en `push_devices` (solo servidor, RLS sin
  políticas), la API nunca lo devuelve y se borra con la cuenta. **Todo cambio aquí pasa por Codex** (S04, S02, P02).
- Los textos de los avisos salen de `send-push`; la app solo repone los suyos al abrir (backlog: alinearlos, ver Defectos).
- El estado por plataforma lo da `pnpm spec:traza notificaciones`. El push nativo de Android vive aún en el PR #170
  (sin integrar): al entrar a `develop`, se rellena `codigo.android`. iOS aún no empieza: `codigo.ios` vacío.
- Los avisos de estado (CUS-TRK-010) y la notificación viva (CUS-TRK-017) son de seguimiento y migran con él.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-NOT-001 | Cuando el primer pedido queda confirmado, la app debe ofrecer una sola vez, en una hoja sobre el detalle del pedido, activar las notificaciones; solo «Sí, activar» abre el diálogo del sistema y, si se deniega, no se vuelve a preguntar. | Decisión de Jesús, 2026-11-16, modificada el 2026-11-17 (CUS-NOT-005) | ★ |
| CUS-NOT-002 | La app debe ofrecer en Cuenta un solo interruptor, «Avisos de tus pedidos», que muestra el estado efectivo y lleva a Ajustes del sistema si este ya bloqueó el diálogo. | Decisión de Jesús, 2026-11-16 y 2026-11-17 | |
| CUS-NOT-003 | Mientras las notificaciones estén desactivadas, la app debe mostrar en el detalle del pedido la franja «Notificaciones desactivadas» con su salida («Abrir Ajustes» o «Activar en Cuenta»). | Decisión de Jesús, 2026-11-16 y 2026-11-17 | |
| CUS-NOT-004 | La app no debe condicionar ninguna parte del pedido al permiso de notificaciones. | Decisión de Jesús, 2026-11-16 | ★ |
| CUS-NOT-005 | La app no debe obligar las notificaciones: debe pedir el permiso una sola vez, tras el primer pedido confirmado, con un solo interruptor «Avisos de tus pedidos» en Cuenta. | Decisión de Jesús, 2026-11-17 (decisión 7) | |
| CUS-NOT-006 | La app no debe ofrecer avisos de promociones en el lanzamiento: sin interruptor, casilla ni consentimiento comercial. | Decisión de Jesús, 2026-11-17 (decisiones 7 y 18) | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-NOT-01 | Dado el primer pedido confirmado de la persona, cuando abre su detalle, entonces ve la hoja una sola vez; conteste lo que conteste, no vuelve a verla en pedidos posteriores ni al reabrir la app. | CUS-NOT-001, CUS-NOT-005 |
| CA-NOT-02 | Dado la hoja abierta, cuando toca «Ahora no», entonces se cierra sin mostrar el diálogo del sistema. | CUS-NOT-001 |
| CA-NOT-03 | Dado una persona que no activó las notificaciones, entonces puede confirmar y seguir pidiendo, y el seguimiento se actualiza igual por sondeo. | CUS-NOT-004 |
| CA-NOT-04 | Dado la hoja abierta, entonces su texto habla solo de avisos del pedido y no hay casilla ni interruptor de promociones en ninguna pantalla. | CUS-NOT-006, CUS-NOT-005 |
| CA-NOT-05 | Dado un dispositivo con las notificaciones desactivadas, cuando se abre el detalle de un pedido, entonces aparece la franja; al volver de Ajustes con el permiso concedido, desaparece sin repetir la hoja ni perder el pedido. | CUS-NOT-003 |
| CA-NOT-06 | Dado el interruptor de Cuenta, entonces refleja el estado efectivo (permiso y registro) y, si el sistema ya bloqueó el diálogo, al tocarlo lleva a Ajustes. | CUS-NOT-002 |
| CA-NOT-07 | Dado un Android anterior a 13, cuando toca «Sí, activar», entonces el dispositivo se registra sin diálogo del sistema. | CUS-NOT-001 |
| CA-NOT-08 | Dado «Sí, activar» sin conexión, entonces la hoja se cierra, el registro se reintenta en silencio y no se muestra ningún error. | CUS-NOT-001, CUS-NOT-004 |

## Reglas

- Versión del payload nativo: `NATIVE_PUSH_PAYLOAD_VERSION`.
- Entornos de registro de un dispositivo: `PUSH_ENVIRONMENTS`.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-NOT-001, CUS-NOT-002, CUS-NOT-003, CUS-NOT-005 | Android no tiene hoja, interruptor ni franja en `develop`: no existe el módulo `feature/notifications`. | `apps/android/customer/` |
| 2 | CUS-NOT-001 | La web del cliente ofrece el permiso en cada pedido y deja repetir tras un descarte, y registra Web Push, no el dispositivo nativo; se apaga y no se corrige. | `apps/customer/lib/use-push-offer.ts` |
| 3 | CUS-NOT-001 | `send-push` pone al aviso de iOS un `thread-id` igual a su etiqueta: los avisos de un mismo pedido no se agrupan en la bandeja, a diferencia de Android. | `supabase/functions/send-push/native.ts` |
| 4 | todos | Los textos del push y los de la app dicen lo mismo con otras palabras («Tu pedido salió» frente a «Tu pedido va en camino»); falta una tabla única y aprobada (backlog del 16-nov). | `supabase/functions/send-push/index.ts` |
| 5 | invariante 5 | La etiqueta del aviso lleva el tipo de evento, la acción y el `shortId`, no solo el tipo y el `shortId` que dice `AGENTS.md`. | `supabase/functions/send-push/index.ts` |
