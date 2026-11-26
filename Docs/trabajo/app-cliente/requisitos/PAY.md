# CUS-PAY · Pago y comprobante

> Estado: **propuesto**, pendiente de aprobación de Jesús · Parte de `Docs/planes/app-cliente/README.md` · Android `feature/` `orders` (pago) · Formato: `Docs/trabajo/movil/03-requisitos/00-formato-y-convenciones.md` con la columna `Est.` partida en **Android** e **iOS** (✅ hecho · 🟡 parcial · ⚠️ defecto · ⬜ por hacer · 📝 sin verificar en código · — no aplica). Rutas Android relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/` (las de `core/` están en `apps/android/core/`; `res/` y `AndroidManifest.xml`, en `apps/android/customer/src/main/`). ⚙ = parámetro de `app_settings` (se lee de `GET /config`, nunca va escrito en la app). ★ = crítico de paridad.

## Requisitos

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-PAY-001 ★ | La app debe mostrar de quién es el turno del dinero en el prepago. | **Tres esperas**: `pending_acceptance` (**negocio** confirma disponibilidad, ⚙ 8 min) → `awaiting_payment` (**cliente** paga y sube captura, ⚙ 15 min) → `validando` (**cajera** revisa, ⚙ 10 min). Etapas 1/2/3/hecho. Un mismo `prepay_timeout` cierra dos de ellas. | `features/tracking/lib/prepay-stage.ts`; `deadline.ts` · Android: `feature/orders/PrepayModels.kt:50` (cuenta atrás del pago; las otras dos esperas no se verificaron) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-PAY-002 | Cuando el negocio acepta, la app debe mostrar cómo pagar: cuenta de cobro, QR, total y plazo. | `GET /customer/orders/:id/prepay-info` → nombre, número Yape/Plin, QR (`paymentQr`, hay un QR de reserva 0184), total, `hasProof`, `proofAttempt`. | `api/.../prepay-info/route.ts`; `components/prepay-proof-section.tsx:13-24` · Android: `feature/orders/PrepayPayeeCard.kt` (número, QR y total) | ✅ | ⬜ | ADAPTAR · M1 |
| CUS-PAY-003 | Cuando el cliente elige una captura, la app debe validarla, comprimirla y mostrar vista previa. | Perfil `proof`: lado mayor **1600 px**, calidad **0,92**; si la compresión falla, sube el original (nunca impedir pagar); validación de tipo y tamaño de entrada. | `packages/images/src/profiles.ts:52`; `prepay-proof-section.tsx:134-159` · Android: `feature/orders/ProofImageEncoder.kt:24-84` (lado mayor y calidad JPEG) | ✅ | ⬜ | ADAPTAR · M1 |
| CUS-PAY-004 | La app debe subir el comprobante a almacenamiento privado y registrar su ruta. | Ruta `payment-proofs/<user>/<pedido>/attempt-<n>-<ts>.<ext>` (**única por intento**); luego `POST /customer/orders/:id/prepay-proof {path}`; la ruta debe empezar por `<user_id>/`. | `prepay-proof-section.tsx:161-190`; `.../prepay-proof/route.ts:24-30` · Android: `feature/orders/ProofSender.kt` | ✅ | ⬜ | ADAPTAR · M1 |
| CUS-PAY-005 ★ | La app debe permitir **como máximo 2 intentos** de comprobante. | Primer rechazo (`validate_fail_retry`): vuelve a `awaiting_payment` con «Te queda 1 intento»; segundo rechazo: cancelación `proof_rejected_final`. | `prepay-proof/route.ts:41-43`; `send-push/index.ts:631-644` · Android: `res/values/strings.xml` (`prepay_last_try`: «Te queda 1 intento») | ✅ | ⬜ | IGUAL · M1 |
| CUS-PAY-006 | La app debe mostrar al cliente el comprobante que envió. | URL firmada de **10 min** desde Storage (bucket privado, RLS por carpeta). | `prepay-proof-section.tsx:110-132` | ⬜ | ⬜ | ADAPTAR · M1 |
| CUS-PAY-007 | Cuando el cliente vuelve de su billetera, la app debe resaltar el botón de subir la captura. | Solo cuenta el viaje completo (oculta→visible); la pista dura 6 s. | `prepay-proof-section.tsx:71-108` | 📝 | ⬜ | ADAPTAR · M1 |
| CUS-PAY-008 ★ | La app debe impedir pedidos nuevos mientras exista un caso de pago sin resolver. | Un pedido cancelado por `proof_rejected_final` bloquea si: dentro de **24 h** sin apelar; apelación `pending`/`in_review`; aprobada con devolución `pending`. Libre si: apelación rechazada; aprobada con devolución `completed`; pasadas 24 h sin apelar. | `lib/payment-block.ts` | ⬜ | ⬜ | IGUAL · M1 |
| CUS-PAY-009 | Cuando el pedido se cancela por comprobante rechazado, la app debe ofrecer **solicitar revisión de pago**. | `POST /customer/orders/:id/appeal` (RPC `create_appeal_report`); respuesta por WhatsApp en ≤ **24 h**; pasos del caso (pendiente → en revisión → aprobada/rechazada; devolución pendiente/completada); si se rechaza, **strike**. | `features/tracking/components/appeal-section/*`; `create_appeal_report`, `resolve_appeal` · Android: `feature/orders/OrderCancelViews.kt:185-201` (la revisión va por WhatsApp (`appealViaSupport`), no por `POST /appeal`) | 🟡 | ⬜ | IGUAL · M1 |
| CUS-PAY-010 | La app debe mostrar el resumen de reclamos y el comprobante de devolución. | Contadores desde `reports` (RLS `rep_participant_read`); el comprobante de devolución usa URL firmada **por la API** (exige `service_role`). | `use-account-page.ts:139-166`; `.../customer/appeals/route.ts` | 📝 | ⬜ | IGUAL · M1 |

## Requisitos nuevos (decisiones de Jesús, noviembre de 2026)

Fuente de cada fila: la decisión que la origina. Android: verificado contra `apps/android/` el 2026-11-17; iOS aún no empieza.

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-PAY-011 | **Modificado por CUS-PAY-014: ya no es agnóstico a la marca; el número, el titular y «Copiar» siguen, dentro del seguimiento y no en una hoja** (Decisión de Jesús, 2026-11-17). Cuando el cliente paga por billetera, la app debe mostrar el número del negocio, el titular y «Copiar» como acción principal. | Agnóstico a la billetera: no se presenta como «Yape» o «Plin» de marca. La fuente habla de «pago al recibir»; hoy la cuenta que muestra la app es la de `prepay-info` (prepago): confirmar el alcance. Aplica a Seguimiento y a donde se muestre la cuenta (CUS-TRK-018). | Decisión de Jesús, 2026-11-16 (`tindivo-auditorias/2026-11-16-ux-movil/PATRONES-V2.md` §12) · Android: `feature/orders/PrepayPayeeCard.kt` (número y «Copiar»; titular no verificado; todavía rotula Yape/Plin) | 🟡 | ⬜ | ADAPTAR · M1 |
| CUS-PAY-012 | **Reemplazado por CUS-PAY-017: el rótulo es «Con Yape o Plin»** (Decisión de Jesús, 2026-11-17). La app debe rotular la cuenta de cobro «Desde Yape, Plin o tu billetera». | Sustituye los rótulos por marca (`prepay_wallet_*`). | Decisión de Jesús, 2026-11-16 (encargo; `tindivo-auditorias/2026-11-16-ux-movil/PATRONES-V2.md` §12) · Android: hoy «Yape o Plin» / «Yape del restaurante» | ⬜ | ⬜ | IGUAL · M1 |
| CUS-PAY-013 | **Modificado por CUS-PAY-014: la subida de captura va en la tarjeta de pago del seguimiento** (Decisión de Jesús, 2026-11-17). La app debe dejar el QR de cobro y la subida de la captura a un toque, sin ocuparle la pantalla al cliente. | La captura sigue las reglas de CUS-PAY-003 y CUS-PAY-004. Hoy el QR está a la vista («toca para agrandar») y la captura se sube con «Ya pagué · Subir captura». | Decisión de Jesús, 2026-11-16 (encargo; pantalla `Comprobante` del rediseño v3) · Android: `feature/orders/PrepayPayeeCard.kt`, `feature/orders/PrepaySection.kt` | 🟡 | ⬜ | ADAPTAR · M1 |

## Criterios de aceptación ★
```
CA-PAY-01 · Máximo dos comprobantes                                        (CUS-PAY-005)
  Dado un prepago con proofAttempt = 1 rechazado por la cajera
  Entonces el pedido vuelve a awaiting_payment y la app dice «Te queda 1 intento»
  Cuando el segundo comprobante también es rechazado
  Entonces el pedido queda cancelled con cancel_reason = proof_rejected_final
  Y la app muestra «Solicitar revisión de pago»
  Y crear un pedido nuevo está bloqueado (CUS-PAY-008)
```

## Notas
- CUS-PAY-009 (solicitar revisión de pago): su destino depende de la decisión C (auditoría de faltas sin apelación formal).

## Decisiones de Jesús, 2026-11-17

Los requisitos que cambian conservan su ID y llevan la marca **reemplazado por** o **retirado** en su fila; los nuevos siguen la numeración del área. Android: sin verificar contra el código (⬜ = por hacer); iOS aún no empieza. Donde se cita la junta del 17-nov (`tindivo-auditorias/2026-11-16-ux-movil/v3/junta-17nov/conclusion.md` y `junta-17nov-b/conclusion.md`), el detalle es propuesta de la junta, no decisión de Jesús.

| ID | Requisito | Reglas y validaciones clave | Fuente | Android | iOS | Móvil |
|---|---|---|---|---|---|---|
| CUS-PAY-014 ★ | Cuando el negocio acepta el pedido, la app debe mostrar el pago dentro del seguimiento, en una tarjeta, no en una hoja. | La tarjeta lleva: «Paga a [NEGOCIO]», «Con Yape o Plin», el número del negocio, «Titular: [nombre]», «Copiar» y «Total S/ [TOTAL]». Confiable: «Subir captura» es opcional y la alternativa es «Pagaré al motorizado al llegar». No confiable: la captura es obligatoria (pantalla `PAY-comprobante`). Es un solo pago; las incidencias van a «Ayuda con este pedido» (WhatsApp de soporte). El destino mostrado se fija al crear el pedido (junta B, punto 10). | Decisión de Jesús, 2026-11-17 (decisión 2; maquetas `Seguimiento-pago`, `Seguimiento`) | ⬜ | ⬜ | IGUAL · M1 |
| CUS-PAY-015 ★ | La app debe avisar antes de enviar la captura que el restaurante y el motorizado asignado podrán verla, y solo el restaurante confirma el pago. | Aviso (maqueta): «El restaurante y el motorizado asignado podrán ver esta captura. Muestra solo esta operación y oculta información ajena al pago.» La captura prueba solo que se envió una imagen: **solo el restaurante, contra su cuenta, confirma el pago**; el motorizado nunca aprueba. Para el no confiable la captura es obligatoria y la aprueba el restaurante. **Dinero y datos: revisión de Jesús y de Codex antes de implementar** (invariante 9; Ley 29733 por verificar). | Decisión de Jesús, 2026-11-17 (decisión 2; junta A, tema 7) | ⬜ | ⬜ | IGUAL · M1 |
| CUS-PAY-016 | La app debe tratar el pago como uno solo y mandar toda incidencia de pago a «Ayuda con este pedido». | Sin segundo pago ni pago dividido. «Ayuda con este pedido» abre el WhatsApp de soporte (CUS-SUP-006). | Decisión de Jesús, 2026-11-17 (decisión 2) | ⬜ | ⬜ | IGUAL · M1 |
| CUS-PAY-017 | La app debe rotular la cuenta de cobro «Con Yape o Plin». | Reemplaza «Billetera digital» y «Desde Yape, Plin o tu billetera» (CUS-PAY-012). | Decisión de Jesús, 2026-11-17 (decisión 1) | ⬜ | ⬜ | IGUAL · M1 |
