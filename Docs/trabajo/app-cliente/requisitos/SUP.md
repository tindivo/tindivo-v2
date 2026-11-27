# CUS-SUP · Soporte y legal

> Estado: **propuesto**, pendiente de aprobación de Jesús · Parte de `Docs/planes/app-cliente/README.md` · Android `feature/` `account` · Formato: `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` con la columna `Est.` partida en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer · 📝 sin verificar en código · — no aplica). Rutas Android relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/` (las de `core/` están en `apps/android/core/`; `res/` y `AndroidManifest.xml`, en `apps/android/customer/src/main/`). ⚙ = parámetro de `app_settings` (se lee de `GET /config`, nunca va escrito en la app). ★ = crítico de paridad.

## Requisitos

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-SUP-001 | La app debe ofrecer soporte por WhatsApp con un mensaje preescrito. | Número ⚙ `support_whatsapp` (con *fallback* `TINDIVO_SUPPORT_WHATSAPP`); incluye el código del pedido. | `lib/support.ts`; `packages/core` · Android: `feature/orders/SupportContact.kt` | ✅ | ⬜ | ADAPTAR · M1 |
| CUS-SUP-002 | La app debe dar acceso a Términos y Privacidad. | Versión ⚙ `terms_version` (2026-05). La política **no menciona** la ubicación GPS, los datos de dispositivo ni las notificaciones (debe actualizarse antes de las tiendas, `MOB-10`). | `app/terminos/page.tsx`; `app/privacidad/page.tsx` · Android: `feature/profile/ProfileScreen.kt:160` (enlaces a Términos y Privacidad; la política aún no menciona GPS) | 🟡 | ⬜ | ADAPTAR · M1 |
| CUS-SUP-003 | La app debe permitir ejercer los derechos ARCO desde la propia app. | Hoy: «escríbenos por WhatsApp». | `privacidad/page.tsx:30-32` | 📝 | ⬜ | NUEVO · M1 |

## Requisitos nuevos (decisiones de Jesús, noviembre de 2026)

Fuente de cada fila: la decisión que la origina. Android: verificado contra `apps/android/` el 2026-11-17; iOS aún no empieza.

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-SUP-004 | La app debe ofrecer los reclamos por WhatsApp de Tindivo y por el Libro de Reclamaciones virtual. | WhatsApp: ⚙ `support_whatsapp`. El Libro de Reclamaciones estaba en stand by; lo destraba el RUC de persona natural de Jesús (confirmado por él; el número no se escribe en el repo). Tarea T5. | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-terminos-v3/decisiones-jesus-ronda2.md`, «Reclamos» y «Libro de Reclamaciones») · Android: WhatsApp sí (`feature/orders/SupportContact.kt`); Libro ⬜ | 🟡 | ⬜ | NUEVO · M1 |
| CUS-SUP-005 | Cuando el cliente tiene una restricción o una falta, la app debe decirle «Si crees que hubo un error, escríbenos por WhatsApp», sin apelación formal. | Pendiente del diseño de auditoría de faltas (decisión C). Convive con CUS-PAY-009, que es la revisión de pago tras un comprobante rechazado: su destino lo decide C. | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-terminos-v3/decisiones-jesus-ronda2.md`, «Apelaciones»; C2) · Android: existe un texto parecido en `checkout_pay_reason_required` («Si crees que es un error, escríbenos») | 🟡 | ⬜ | IGUAL · M1 |

## Defectos conocidos

Encontrados al especificar la web (2026-09/10); se corrigen en nativo, no se copian.

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 11 | CUS-SUP-002 | La política de privacidad no menciona ubicación GPS ni datos de dispositivo. | `app/privacidad/page.tsx` |

## Decisiones de Jesús, 2026-11-17

Los requisitos que cambian conservan su ID y llevan la marca **reemplazado por** o **retirado** en su fila; los nuevos siguen la numeración del área. Android: sin verificar contra el código (⬜ = por hacer); iOS aún no empieza. Donde se cita la junta del 17-nov (`tindivo-auditorias/2026-11-16-ux-movil/v3/junta-17nov/conclusion.md` y `junta-17nov-b/conclusion.md`), el detalle es propuesta de la junta, no decisión de Jesús.

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-SUP-006 ★ | La app debe ofrecer «Ayuda con este pedido» en el seguimiento y en el detalle del pedido, y abrir el WhatsApp de soporte de Tindivo. | Fila secundaria de 48 dp; mensaje prellenado, revisable antes de enviar: «Hola, necesito ayuda con mi pedido #TDV-[CÓDIGO] de [NEGOCIO].» (junta A, T3). Sin selector de motivos. Sustituye a «Ayuda por WhatsApp» y al contacto del negocio y del motorizado. WhatsApp: ⚙ `support_whatsapp`. **Quién responde, en qué horario y qué puede resolver sigue abierto** (decisiones-abiertas.md, punto U). | Decisión de Jesús, 2026-11-17 (decisiones 3 y 4) | 🟡 | ⬜ | IGUAL · M1 |

Nota: CUS-SUP-005 (falta y «Si crees que hubo un error, escríbenos por WhatsApp») sigue; la revisión formal de faltas pasó al backlog (decisión 10).

## Migrado a `Docs/producto/soporte/` (2026-11-19)

Esta área pasó a la capacidad `Docs/producto/soporte/` (ficha de pantallas incluida); allí manda. Decisiones de Jesús que recoge, además de las de arriba:

- Soporte solo por WhatsApp, sin contacto con el negocio (2026-11-17). El número vigente es 906550166 (E.164: 51906550166).
- El mensaje a soporte por WhatsApp para el celular de otra cuenta entra en el lanzamiento (CUS-AUT-028, PR #201).
- La casilla de Términos va siempre (CUS-AUT-020). Los enlaces legales cuando se apague la web (D-27) siguen abiertos.
