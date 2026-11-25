---
id: seguimiento
nombre: Seguimiento del pedido
actores: [CUS]
lineas: [pedidos-restaurante]
depende_de: []
dinero: true
codigo:
  web: [apps/customer/features/tracking/**, apps/customer/app/pedido/**]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderCancelViews.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/CancelOrderViewModel.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderCommon.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailSections.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDetailViewModel.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderDisplay.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderErrors.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderHeadline.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderMapping.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderModels.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderRoutes.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/OrderTextRes.kt]
  ios: []
  backend: [apps/api/app/api/v1/customer/orders/**, apps/api/app/api/v1/public/orders/**, apps/api/lib/mappers/customer-orders.ts, packages/contracts/src/order-status.ts]
operaciones: [getOrderTracking]
reglas: [ORDER_TRANSITIONS, TERMINAL_STATUSES, STATUS_TO_TRACKING, toTrackingStep, isTerminal, ACTIVE_ORDER_STATUSES, CANCEL_REASONS, app_settings:timers]
---

# Seguimiento del pedido

> Verificado: 2026-11-18 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el 2026-11-19 (conversación con Claude Code: «apruebo las recomendaciones de los cuatro»), salvo los puntos de «Abierto»

## Antes de tocar

- Es lo que ve el cliente desde que confirma un pedido hasta que se entrega o se cancela: la espera a que el negocio acepte,
  los cuatro pasos, el tiempo estimado, el motorizado, la cancelación y el motivo de un cancelado.
- `dinero: true`: muestra totales, vuelto y si ya pagó, y la cancelación decide si se dice «sin costo». Todo cambio pasa
  por Codex. Los montos son solo para mostrar: el servidor manda el importe y la app no suma ni redondea.
- Estados, transiciones y proyección a cuatro pasos viven en `packages/contracts` (`order-status.ts`): la app los cita.
  `delivered` es terminal: ninguna pantalla lo reabre ni sigue consultándolo.
- El pago dentro del seguimiento es de `pagos`; «Ayuda con este pedido», de `soporte`; la oferta de activar avisos,
  de `notificaciones`; la lista y «Volver a pedir», de `mis-pedidos`; calificar, de `resenas`. Aquí solo se deja el sitio.
- Fuera de esta capacidad: CUS-TRK-007 se retiró (lo reemplaza CUS-TRK-021), CUS-TRK-016 es solo web y CUS-TRK-018 pasa a `pagos`.
- El cliente nunca ve teléfono, WhatsApp ni placa del motorizado: el servidor manda `driver.phone` siempre en `null` al cliente.
- Android comparte `feature/orders` con `pagos` y `soporte`: no es dueña de `Prepay*`, `Proof*`, `Jpeg*` ni `SupportContact`.
- `getCustomerOrder` trae, como campos opcionales, `pendingAcceptanceAt`, `validatingAt` y `travelMinutes`: de ahí salen la cuenta
  atrás y el rango; una app anterior los ignora. iOS aún no empieza: `codigo.ios` vacío.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-TRK-001 | La app debe mostrar el seguimiento de un pedido solo al cliente con sesión, y el servidor debe comprobar que el pedido es suyo; la vista pública por código es solo de la web, que se apaga. | `Docs/trabajo/app-cliente/requisitos/TRK.md` · `getCustomerOrder` | |
| CUS-TRK-002 | La app debe proyectar el estado del pedido en cuatro pasos (Recibido, Preparando, En camino, Entregado) y mostrar el cancelado aparte; en recojo el tercer paso dice «Listo». | `packages/contracts/src/order-status.ts` (`STATUS_TO_TRACKING`) | ★ |
| CUS-TRK-003 | La app debe mostrar un subtítulo y un mensaje de pie según el estado y la forma de pago. | `TRK.md` · `apps/customer/features/tracking/lib/format.ts` | |
| CUS-TRK-004 | La app debe mostrar el tiempo estimado como rango y nunca como hora exacta; sin base de cálculo, no debe mostrar nada. | `TRK.md` · `apps/customer/features/tracking/lib/format.ts` | ★ |
| CUS-TRK-005 | Mientras corra un plazo (aceptación, pago o verificación), la app debe mostrar una cuenta atrás con su sujeto, en rojo en el último tercio con tope de 3 minutos, y «Confirmando…» cuando venza. | `TRK.md` · `apps/customer/features/tracking/lib/deadline.ts` · `app_settings:timers` | ★ |
| CUS-TRK-006 | La app debe permitir cancelar solo mientras el servidor lo permita, con confirmación; tras aceptar el negocio, la cancelación va por soporte. | `TRK.md` · `cancel_customer_order` | ★ |
| CUS-TRK-008 | La app debe mostrar el detalle del pedido: productos con opciones, totales, forma de pago y, en efectivo, con cuánto paga y el vuelto. | `TRK.md` · `apps/customer/features/tracking/components/tracking-items.tsx` | |
| CUS-TRK-009 | La app debe mostrar al dueño del pedido la nota que escribió para el motorizado. | `TRK.md` · `getCustomerOrder` | |
| CUS-TRK-010 | Cuando el estado del pedido cambie, la app debe avisar con la notificación del sistema que define la capacidad `notificaciones`; el aviso depende solo del estado de destino y no avisa el paso a `validando` con comprobante. | `TRK.md` · `apps/customer/features/tracking/lib/alerts.ts` · Decisión de Jesús, 2026-11-19 (solo la notificación del sistema) | |
| CUS-TRK-012 | Mientras el pedido siga vivo, la app debe evitar que la pantalla se apague. | `TRK.md` · `apps/customer/features/tracking/hooks/use-wake-lock.ts` | |
| CUS-TRK-013 | Cuando el primer pedido queda confirmado, la app debe ofrecer activar las notificaciones una sola vez; esa oferta la define y la lleva la capacidad `notificaciones` (CUS-NOT-005). | Decisión de Jesús, 2026-11-17 (decisión A) | |
| CUS-TRK-014 | La app debe refrescar el estado al volver a primer plano y, mientras la pantalla esté visible y el pedido siga vivo, cada 8 segundos. | `TRK.md` · `apps/customer/features/tracking/hooks/use-tracking.ts` | |
| CUS-TRK-015 | Cuando el pedido esté cancelado, la app debe explicar el motivo según `cancel_reason`, si ya pagó y el método (la falta «no se presentó» de recojo no es la de delivery), y dejar abierta la ayuda por WhatsApp. | `TRK.md` · `apps/customer/features/tracking/lib/format.ts` · `packages/contracts/src/enums.ts` (`CANCEL_REASONS`) | |
| CUS-TRK-017 | **Diferido, fuera del lanzamiento.** La app debería mostrar una notificación viva (Live Activity en iOS) con el estado del pedido; hoy solo está planeada para después del lanzamiento. | `TRK.md` · `Docs/trabajo/movil/03-requisitos/NAT-capacidades-nativas.md` (`NAT-LIV-001`, fase posterior al lanzamiento) | |
| CUS-TRK-019 | Cuando el cliente confirma el pedido, la app debe mostrar «Esperando que el negocio acepte» hasta que el negocio acepte o venza el plazo; vale para todo pedido, también el prepago, y no muestra ningún dato de pago. | Decisión de Jesús, 2026-11-17 (decisión 2; tablero `Seguimiento-aceptacion`) | ★ |
| CUS-TRK-020 | Cuando el negocio acepta, la app debe seguir con el pedido dentro del seguimiento, sin hoja de pago aparte, cambiar el titular según el estado (CUS-TRK-003) sin mover el paso de «Recibido» hasta que el pedido llegue a `preparing`, y mostrar el pago según la capacidad `pagos`. | Decisión de Jesús, 2026-11-17 (decisión 2) | ★ |
| CUS-TRK-021 | La app debe mostrar el nombre completo del motorizado y ningún dato de contacto: ni teléfono, ni WhatsApp, ni placa, y el servidor no debe enviar el teléfono al cliente (siempre `null`); al llegar debe decir «[Nombre] llegó · Sal a recibir tu pedido». | Decisión de Jesús, 2026-11-17 (decisión 3; tableros `Seguimiento*`) | |
| CUS-TRK-022 | Cuando el cliente no sale a recibir, el motorizado se va; si el cliente no se comunica durante la noche, el pedido se marca «no se presentó» con la función existente y el cliente recibe la falta; Jesús puede confirmarla o anularla desde el admin. | Decisión de Jesús, 2026-11-17 (decisión 10) · efecto en dinero abierto (ver «Abierto») | ★ |
| CUS-TRK-023 | Cuando el cliente abre un pedido que no es suyo, la app debe decir «No puedes abrir este pedido», con «Mis pedidos» y «Entrar con otra cuenta», sin nombre, negocio, monto ni estado; sin sesión, «Inicia sesión para intentar abrir este pedido» y conserva el enlace. | Decisión de Jesús, 2026-11-17 (decisión 12) | |
| CUS-TRK-024 | La app debe mostrar sobre la tira de cuatro etapas la moto avanzando: se acerca al local mientras se prepara y, al recoger, salta al tramo hacia la casa. | Canvas v35, tableros `Seguimiento` y `Seguimiento-recogiendo` (requisito del tablero, numerado con la aprobación de Jesús del 2026-11-19) | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-TRK-01 | Dado un pedido de efectivo en `validando` o `pending_acceptance` de su dueño, entonces se ofrece «Cancelar» con confirmación; en cualquier otro estado, no. Dado un pedido prepagado, entonces solo se ofrece en `pending_acceptance` y sin pago enviado; con comprobante enviado, el texto dice que ya está en revisión y se resuelve por soporte. | CUS-TRK-006 |
| CA-TRK-02 | Dado un pedido en `ready_for_pickup` con método recojo, entonces el paso activo es el tercero, «Listo para recoger · Pásalo a recoger en el local»; dado un pedido en `picked_up` con delivery, entonces el paso activo dice «En camino · El motorizado va en ruta». | CUS-TRK-002 |
| CA-TRK-03 | Dado cada estado de `STATUS_TO_TRACKING`, entonces el paso que muestra la app es el del contrato, y un estado que la app no conoce se muestra como «Tu pedido sigue en curso» sin inventar un paso. | CUS-TRK-002 |
| CA-TRK-04 | Dado un pedido con `estimatedReadyAt` y `travelMinutes`, entonces se ve «Llega en [A]–[B] min» y nunca una hora de reloj; en recojo no se suma trayecto, con el motorizado en la puerta o en un estado terminal no se muestra, y sin base de cálculo no se muestra nada. | CUS-TRK-004 |
| CA-TRK-05 | Dado un plazo en curso, entonces se ve la cuenta atrás con su sujeto; con menos de un tercio del plazo queda en rojo (tope de 3 minutos); vencido, dice «Confirmando…» hasta que el servidor resuelva. | CUS-TRK-005 |
| CA-TRK-06 | Dado un pedido recién creado, en efectivo o en Yape o Plin, entonces se ve «Esperando que el negocio acepte» con «Responde en hasta [plazo de aceptación] min» y ningún dato de pago ni número de cuenta. | CUS-TRK-019 |
| CA-TRK-07 | Dado la pantalla de espera abierta, cuando el negocio acepta (`confirmed` o `awaiting_payment`), entonces el seguimiento sigue en la misma pantalla, sin hoja de pago aparte, con el bloque de pago de `pagos`, y el paso activo sigue siendo «Recibido»; recién con `preparing` pasa a «Preparando». | CUS-TRK-020 |
| CA-TRK-08 | Dado un pedido con el motorizado en camino, entregado o en la puerta, entonces se ve su nombre completo y nunca teléfono, WhatsApp ni placa, y la respuesta de la API al cliente trae `driver.phone` en `null`; al marcar «Llegué» dice «[Nombre] llegó · Sal a recibir tu pedido». | CUS-TRK-021 |
| CA-TRK-09 | Dado un pedido que el servidor responde como no encontrado o ajeno, entonces se ve «No puedes abrir este pedido» con «Mis pedidos» y «Entrar con otra cuenta», sin ningún dato del pedido; al cambiar de cuenta se limpia lo guardado. | CUS-TRK-023 |
| CA-TRK-10 | Dado un pedido cancelado por `no_show` en delivery, entonces el texto es el de entrega sin éxito y deja abierta la ayuda por WhatsApp; en recojo, el de pedido sin recoger. | CUS-TRK-015, CUS-TRK-022 |
| CA-TRK-11 | Dado un pedido cancelado con prepago pagado o con comprobante enviado, entonces el texto no dice «sin costo» ni «no se te cobró»: pide escribir por WhatsApp para coordinarlo. | CUS-TRK-015 |
| CA-TRK-12 | Dado un pedido en `delivered`, entonces se ve «Entregado · ¡Buen provecho!» y la app no vuelve a consultarlo. | CUS-TRK-002, CUS-TRK-014 |
| CA-TRK-13 | Dado un pedido vivo con la pantalla visible, entonces la app lo consulta cada 8 segundos, conserva lo último mostrado si falla una consulta y lo vuelve a consultar al volver a primer plano. | CUS-TRK-014 |
| CA-TRK-14 | Dado un pedido vivo con la pantalla abierta, entonces la pantalla no se apaga; al terminar el pedido, vuelve a su comportamiento normal. | CUS-TRK-012 |
| CA-TRK-15 | Dado un cambio de estado, entonces el cliente recibe la notificación del sistema con el mensaje del estado de destino; el paso a `validando` con comprobante no avisa. | CUS-TRK-010 |

Los criterios CA-TRK-01 y CA-TRK-02 vienen de la web y se conservan; CA-TRK-03 a CA-TRK-15 reemplazan a los CA-TRK-P1 a CA-TRK-P6 del borrador (el P3, que mostraba el teléfono, quedó retirado por la decisión del 2026-11-17 y es ahora CA-TRK-08).

## Reglas

- Estados y transiciones del pedido: `ORDER_TRANSITIONS`; los terminales, `TERMINAL_STATUSES` e `isTerminal`; `delivered` no tiene salida.
- Proyección a cuatro pasos: `STATUS_TO_TRACKING` y `toTrackingStep`.
- Pedido vivo: `ACTIVE_ORDER_STATUSES`.
- Motivos de cancelación: `CANCEL_REASONS`.
- Plazos de aceptación, pago y verificación: `app_settings:timers`; la app los lee de la configuración pública, nunca los escribe.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-TRK-021 | Android ofrecía «Escribirle por WhatsApp» con el motorizado en la puerta; se quitó. El nombre sigue viéndose solo desde que va en camino, llegó o se entregó. | `feature/orders/OrderMapping.kt` · `feature/orders/OrderDetailSections.kt` |
| 2 | CUS-TRK-021 | Antes de la 0292, `get_tracking` entregaba `driverPhone` con el motorizado en la puerta por la ruta pública `public/orders/{shortId}`, sin sesión, a quien tuviera el código; `getCustomerOrder` también lo mandaba. Ahora los dos lo mandan en `null` y la web del cliente, que se apaga, se queda sin botón de llamar. | `supabase/migrations/0292_el_seguimiento_publico_no_da_el_telefono.sql` · `apps/api/lib/mappers/customer-orders.ts` |
| 3 | CUS-TRK-004, CUS-TRK-005 | `getCustomerOrder` ahora trae las horas y el trayecto; Android calcula únicamente el reloj del pago. | `feature/orders/PrepayModels.kt` |
| 4 | CUS-TRK-019 | Android no tiene una pantalla de espera aparte (tablero `Seguimiento-aceptacion`): la espera es un bloque del detalle, visible en `pending_acceptance` para todo pago, con título, estado y cuenta atrás; faltan la ilustración, el resumen corto y las acciones propias de esa pantalla. | `feature/orders/TrackingClocksUi.kt` · `feature/orders/OrderDetailScreen.kt` |
| 5 | CUS-TRK-020 | La maqueta decía «Preparando» al aceptar; manda la proyección del contrato (Recibido hasta `preparing`) con otro titular. Falta el texto del titular tras aceptar en efectivo (ver «Abierto»). | `packages/contracts/src/order-status.ts` |
| 6 | CUS-TRK-023 | Android dice «No puedes abrir este pedido» con «Mis pedidos» y «Entrar con otra cuenta»; sin verificar que, sin sesión, se conserve el enlace y se diga «Inicia sesión para intentar abrir este pedido». | `feature/orders/OrderDetailScreen.kt` · `feature/orders/OrderDetailViewModel.kt` |
| 7 | CUS-TRK-010, CUS-TRK-012 | Android no avisa al cambiar el estado ni mantiene la pantalla encendida. | `feature/orders/` |
| 8 | CUS-TRK-005 | La cuenta atrás de verificación no sale: `getPublicConfig` no trae su plazo; solo están los de aceptación y pago. | `packages/contracts/src/openapi/public-responses.ts` |
| 9 | CUS-TRK-022 | El canon de antifraude dice que el motorizado reporta a los 5 minutos de espera y que hay falta al instante; la decisión del 2026-11-17 dice que se va y que la falta nace de noche con confirmación de Jesús (decisión para Jesús 8). No se comprobó que el admin tenga hoy esa pantalla de confirmar o anular. | `Docs/negocio/antifraude.md` · `apps/admin/app/incidentes/page.tsx` |
| 10 | CUS-TRK-008 | La ruta pública `public/orders/{shortId}` manda `paysWith`, `changeToGive`, `amount`, `deliveryFee` y `total` como número JSON y no como cadena decimal (API-8). Es previo a este cambio y no se cambia: es el contrato v1 de las apps ya instaladas. | `packages/contracts/src/openapi/public-responses.ts` |

## Abierto

- **Foto del motorizado** (punto H): solo iniciales o foto con consentimiento. Es un dato personal de un tercero; Jesús no la resolvió el 2026-11-19. Entrada DA-19 de `Docs/trabajo/decisiones-abiertas.md`.
- **«No se presentó» (CUS-TRK-022):** efecto de la falta, destino del dinero prepagado y el choque con `Docs/negocio/antifraude.md`. Toca el ledger: lo decide Jesús (invariante 9) y no se implementa nada antes. Entrada DA-20.
- **«Responde en hasta [n] min» (CA-TRK-06):** el criterio aprobado dice el plazo completo; la cuenta atrás de CUS-TRK-005 se muestra aparte, en `m:ss` y sin texto propio, como la web. Jesús decide si se muestra el plazo completo o lo que queda, y si la cuenta atrás lleva un texto (DA-25).
- **Titular tras aceptar un pedido en efectivo:** no hay un texto aprobado distinto del de «Recibido»; se usa el existente hasta que Jesús lo defina.
