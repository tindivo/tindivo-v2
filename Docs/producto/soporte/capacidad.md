---
id: soporte
nombre: Soporte y legal
actores: [CUS]
lineas: [pedidos-restaurante, entregas, store]
depende_de: []
dinero: false
codigo:
  web: [apps/customer/lib/support.ts, apps/customer/components/support-link.tsx, apps/customer/app/terminos/page.tsx, apps/customer/app/privacidad/page.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/support/SupportContact.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/checkout/CheckoutNoticeViews.kt]
  ios: []
  backend: [apps/api/app/api/v1/public/config/route.ts, apps/api/lib/mappers/whatsapp-digits.ts, packages/core/src/constants.ts]
operaciones: [getPublicConfig]
reglas: [app_settings:support_whatsapp, app_settings:terms_version]
---

# Soporte y legal

> Verificado: 2026-11-19 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el AAAA-MM-DD (medio) — pendiente de su visto bueno

## Antes de tocar

- Es cómo el cliente pide ayuda a Tindivo y cómo llega a los Términos y la Privacidad. **El soporte es solo WhatsApp**: no hay chat, formulario ni llamada. Sin contacto con el negocio (decisión de Jesús, 2026-11-17).
- **Hay un solo WhatsApp de soporte: 906550166, o `51906550166` solo con dígitos** (decisión de Jesús, 2026-11-19). Lo trae `GET /config` (`supportWhatsapp`). El `+51987654321` que ponen las migraciones 0006 y 0086 es un relleno de la semilla, y la 0113 lo sustituye por `51906550166`. Respaldo: ese mismo número, escrito **en un solo sitio de cada app**, para cuando `GET /config` falle; la web lo tiene en `TINDIVO_SUPPORT_WHATSAPP` (`packages/core`).
- Todo mensaje a soporte sale **prellenado y revisable**: la persona lo ve y lo envía ella. Lleva el código del pedido como `#TDV-` más los 8 caracteres.
- El mensaje a soporte cuando el celular ya pertenece a otra cuenta (CUS-AUT-028, PR #201) entra en el lanzamiento y usa este mismo canal; su requisito vive en la capacidad de acceso.
- El texto de los Términos y de la Privacidad lo redacta otro agente; aquí solo se define **dónde y cómo los muestra la app**. La casilla de aceptación va siempre, desmarcada, en la pantalla de entrada (CUS-AUT-020).
- La reaceptación tras un cambio de Términos nunca bloquea el soporte (CUS-AUT-027).
- Los Términos, la Privacidad y el Libro de Reclamaciones viven en una **web estática en tindivo.com que reemplaza a la web del cliente** (que se apaga, D-27). La app abre esas direcciones y, además, lleva el texto de los Términos y la Privacidad empaquetado para leerlo sin salir (decisión de Jesús, 2026-11-19).
- El Libro de Reclamaciones virtual **ya no está en stand by**: se hará con el RUC de persona natural de Jesús, en la web estática. Aún no existe, y el enlace aparece en la app solo cuando exista.
- `dinero: false`. Si un día soporte ofrece un reembolso desde la app, pasa por Jesús y por Codex (invariante 9).
- Trampa conocida: Android escribe el número en una constante (defecto 1); quítala y deja el respaldo único, no la actualices.
- iOS aún no empieza: `codigo.ios` vacío.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-SUP-001 | La app debe ofrecer soporte por WhatsApp con un mensaje preescrito que incluya el código del pedido. | `apps/customer/lib/support.ts` · `feature/orders/SupportContact.kt` | |
| CUS-SUP-002 | La app debe dar acceso a los Términos y a la Privacidad: junto a la casilla de la pantalla de entrada, en «Cuenta» y donde se pide la reaceptación. Los enlaces abren la web estática en tindivo.com y la app lleva además el texto empaquetado para leerlo sin salir. | `apps/customer/app/terminos/page.tsx` · Decisión de Jesús, 2026-11-17 (O) · `app_settings:terms_version` | |
| CUS-SUP-003 | La app debe permitir ejercer los derechos ARCO (acceso, rectificación, cancelación y oposición) desde la propia app, con un botón que abre WhatsApp de soporte con un mensaje prellenado y revisable. | `apps/customer/app/privacidad/page.tsx` (hoy: «escríbenos por WhatsApp») · Ley N.° 29733 · Decisión de Jesús, 2026-11-19 (decisión 3) | |
| CUS-SUP-004 | La app debe ofrecer los reclamos por el WhatsApp de Tindivo y por el Libro de Reclamaciones virtual, que se hará con el RUC de persona natural de Jesús en la web estática de tindivo.com. | Decisión de Jesús, 2026-11-16 («Reclamos» y «Libro de Reclamaciones») · Decisión de Jesús, 2026-11-19 (decisión 4: sale del stand by) | |
| CUS-SUP-005 | Cuando el cliente tiene una restricción o una falta, la app debe decirle «Si crees que hubo un error, escríbenos por WhatsApp», sin apelación formal. | Decisión de Jesús, 2026-11-16 («Apelaciones»); la revisión formal de faltas pasó al backlog el 2026-11-17 | |
| CUS-SUP-006 | La app debe ofrecer «Ayuda con este pedido» en el seguimiento y en el detalle del pedido, y abrir el WhatsApp de soporte con «Hola, necesito ayuda con mi pedido #TDV-[CÓDIGO] de [NEGOCIO].». | Decisión de Jesús, 2026-11-17 (decisiones 3 y 4) | ★ |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-SUP-01 | Dado un número de soporte que trae `GET /config`, cuando el cliente toca cualquier ayuda por WhatsApp, entonces se abre `wa.me` con ese número (solo dígitos, con el 51) y ninguna pantalla lleva el número escrito. | CUS-SUP-001 |
| CA-SUP-02 | Dado un pedido del negocio «Pollería Don Beto» con código `#TDV-ABCD2345`, cuando el cliente toca «Ayuda con este pedido», entonces WhatsApp se abre con «Hola, necesito ayuda con mi pedido #TDV-ABCD2345 de Pollería Don Beto.» y la persona lo puede editar antes de enviarlo. | CUS-SUP-006, CUS-SUP-001 |
| CA-SUP-03 | Dado el seguimiento de un pedido en curso y el detalle de uno ya cerrado, entonces ambos muestran «Ayuda con este pedido» como fila secundaria de al menos 48 dp, y ninguno muestra teléfono ni WhatsApp del negocio. | CUS-SUP-006 |
| CA-SUP-04 | Dado que la app no puede leer el número de soporte, entonces la ayuda sigue ofreciéndose con el número de respaldo, que es `51906550166` y está escrito en un solo sitio de la app, y nunca queda un botón que no hace nada. | CUS-SUP-001 |
| CA-SUP-05 | Dado la pantalla de entrada, entonces «Términos» y «Privacidad» son enlaces de al menos 48 dp junto a la casilla, y «Cuenta» ofrece los mismos dos enlaces. | CUS-SUP-002 |
| CA-SUP-06 | Dado una cuenta con términos desactualizados, cuando la persona toca cualquier ayuda por WhatsApp, entonces se abre sin pedir la reaceptación. | CUS-SUP-002, CUS-SUP-001 |
| CA-SUP-07 | Dado «Cuenta», cuando la persona toca «Ejercer mis derechos», entonces se abre WhatsApp de soporte con un mensaje prellenado que nombra el derecho, la persona lo puede editar antes de enviarlo y no se le pide crear una cuenta aparte. | CUS-SUP-003 |
| CA-SUP-08 | Dado un cliente con la cuenta en pausa o con pago adelantado obligatorio, entonces la pantalla que lo explica dice «Si crees que hubo un error, escríbenos por WhatsApp» y ofrece el botón, sin formulario de apelación. | CUS-SUP-005 |
| CA-SUP-09 | Dado un reclamo, entonces la app lo lleva al WhatsApp de Tindivo; el enlace al Libro de Reclamaciones virtual aparece solo cuando el Libro existe. | CUS-SUP-004 |

## Estado en Android hoy

Contrastado el 2026-11-19 con develop@25a6d537. Rutas bajo `apps/android/customer/src/main/kotlin/com/tindivo/customer/`. Es una foto: el estado vivo lo calcula `pnpm spec:traza`. La cita es por archivo y símbolo, no por línea (lo exige el validador).

| Requisito | Estado | Evidencia |
|---|---|---|
| CUS-SUP-001 | HECHO | `feature/orders/SupportContact.kt` (`SupportWhatsapp` lee `supportWhatsapp` de `GET /public/config`; `orderSupportLink`, `cancelledOrderSupportLink`); prueba `SupportContactTest`. Defectos 1 y 2. |
| CUS-SUP-002 | FALTA | Solo existe «Al continuar aceptas…» en el paso del nombre: `feature/profile/ProfileScreen.kt` (`TermsNotice`, abre `BuildConfig.WEB_BASE_URL` más `/terminos` y `/privacidad`). `feature/signin/SignInScreen.kt` no tiene casilla; `feature/account/AccountScreen.kt` no tiene enlaces legales. |
| CUS-SUP-003 | FALTA | No hay nada de ARCO en la app; `feature/deleteaccount/` es el borrado, que es solo uno de los derechos. |
| CUS-SUP-004 | FALTA | El Libro de Reclamaciones virtual no existe todavía (se hará con el RUC de persona natural de Jesús en la web estática; decisión del 2026-11-19). El reclamo por WhatsApp sí existe: `feature/orders/OrdersScreen.kt` («¿Problema con este pedido?») y `feature/checkout/CheckoutNoticeViews.kt` (`BlockedView`). |
| CUS-SUP-005 | FALTA | La frase parecida está en `res/values/strings.xml` (`checkout_pay_reason_required`: «Si crees que es un error, escríbenos») sin botón de WhatsApp; `BlockedView` tiene el botón, pero su texto no dice la frase. |
| CUS-SUP-006 | FALTA | El detalle ofrece «¿Algún problema? Escríbenos» (`feature/orders/OrderCancelViews.kt`, `SupportLink`) con «Hola, necesito ayuda con mi pedido #[CÓDIGO]», sin `TDV-` ni el negocio (`orderSupportLink`). No existe «Ayuda con este pedido». El motorizado sigue con su botón de WhatsApp (`feature/orders/DriverContact.kt`, `DriverBlock`): choca con CUS-TRK-021, que es de seguimiento. |

Resumen: HECHO 1 · FALTA 5 · DIFIERE 0.

## Reglas

- Número de soporte del servidor: `app_settings:support_whatsapp`.
- Versión vigente de los Términos: `app_settings:terms_version`.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-SUP-001 | Android escribe el número de soporte en una constante (`SUPPORT_WHATSAPP_URL`) en vez de leerlo de `GET /config`. | `feature/checkout/CheckoutNoticeViews.kt` |
| 2 | CUS-SUP-001 | Android no tiene número de respaldo: si `GET /config` falla, la ayuda no se muestra. La web sí lo tiene. Debe quedar `51906550166` en un solo sitio de la app (decisión del 2026-11-19). | `feature/orders/SupportContact.kt` |
| 3 | CUS-SUP-001 | La semilla de `app_settings.support_whatsapp` (migraciones 0006 y 0086) trae `+51987654321`, un relleno; la migración 0113 lo sustituye por `51906550166`, el único número vigente. Es historia, no hay nada que corregir; se anota para no confundirlo. | `supabase/migrations/0006_seed_app_settings.sql` · `0113_config_support_and_timers.sql` |
| 4 | CUS-SUP-002 | La política de privacidad no menciona la ubicación GPS ni los datos del dispositivo (lo corrige el agente que redacta lo legal). | `apps/customer/app/privacidad/page.tsx` |
| 5 | CUS-SUP-006 | El mensaje de ayuda del detalle usa el código sin `TDV-` y no lleva el negocio. | `feature/orders/SupportContact.kt` |
