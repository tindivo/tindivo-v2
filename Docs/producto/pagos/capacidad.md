---
id: pagos
nombre: Pago y comprobante
actores: [CUS, ADM]
lineas: [pedidos-restaurante]
depende_de: []
dinero: true
codigo:
  web: [apps/customer/components/prepay-proof-section.tsx, apps/customer/lib/payment-block.ts, apps/customer/features/tracking/components/tracking-prepay.tsx, apps/customer/features/tracking/components/prepay-rail.tsx, apps/customer/features/tracking/lib/prepay-stage.ts]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/Prepay*.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/Proof*.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/orders/JpegStructure.kt]
  ios: []
  backend: [apps/api/app/api/v1/customer/orders/[id]/prepay-info/**, apps/api/app/api/v1/customer/orders/[id]/prepay-proof/**, apps/api/app/api/v1/customer/orders/[id]/appeal/**, apps/api/app/api/v1/customer/appeals/**, apps/api/lib/mappers/appeal.ts]
operaciones: [getOrderAppeal, createOrderAppeal, listAppeals]
reglas: [PREPAY_PROOF_CONTENT_TYPES, app_settings:timers, app_settings:strikes]
---

# Pago y comprobante

> Verificado: 2026-11-19 · entorno: develop@25a6d537 (código) · Flujo de pago aprobado por Jesús el 2026-11-27 (conversación con Claude Code); el resto, PILOTO pendiente de su visto bueno

## Antes de tocar

- Es lo que pasa con el dinero después de confirmar el pedido: de quién es el turno, a quién se le paga, la captura del comprobante, los dos intentos y el caso de pago sin resolver. Vive en el seguimiento del pedido (capacidad de seguimiento, aún sin migrar a `Docs/producto/`) y no en el checkout, que solo elige la forma de pago (capacidad `checkout`).
- `dinero: true`: Tindivo **no retiene fondos**; el cliente le paga directo al negocio con Yape o Plin. La app no calcula ni cobra nada: muestra el total del pedido y el número del negocio. Todo cambio aquí pasa por Codex y por la revisión de Jesús (invariante 9 de `AGENTS.md`).
- Es **un solo pago**: sin segundo pago ni pago dividido. Toda incidencia de pago va a «Ayuda con este pedido» (el WhatsApp de soporte), no a un flujo dentro de la app (CUS-PAY-016).
- Cuándo se paga: el pedido prepago nace esperando que el negocio acepte; al aceptar, el cliente paga y sube la captura, que en el prepago es obligatoria (al confiable con «Yape o Plin» le es opcional, CUS-PAY-014); el negocio la revisa. Los plazos viven en `app_settings:timers`, nunca en la app.
- Quién confirma: **solo el restaurante, contra su cuenta, confirma el pago**. La captura prueba únicamente que se envió una imagen. El motorizado la ve pero nunca la aprueba (CUS-PAY-015).
- La captura la ven el restaurante, el motorizado asignado y el admin (este último para decidir y dar soporte, ADM-PAY-001); la app avisa antes de enviar que la ven el restaurante y el motorizado. La retención de las capturas y la Ley 29733 siguen por verificar (punto V de `Docs/trabajo/app-cliente/decisiones-abiertas.md`).
- Flujo de pago aprobado por Jesús el 2026-11-27: el cliente ve dos métodos, «Efectivo» y «Yape o Plin». Con «Yape o Plin», el pedido va primero al negocio; cuando este acepta, el cliente confiable **puede** (si quiere) subir la captura de su comprobante, que ven el negocio, el motorizado asignado y el admin; también puede pagar en la puerta. **La captura nunca se pide antes de que el negocio acepte.** **Solo el negocio confirma el ingreso**; el motorizado la ve y nunca la aprueba. El servidor se construye antes que la app (Jesús, 2026-11-19, opción A).
- Dónde está ese servidor: la cotización que le da al confiable dos opciones es el PR #244 (firmado, aún sin integrar a `develop` el 2026-11-27); el servidor de la captura del confiable (registrarla tras la aceptación, que la vea el motorizado, que el negocio confirme o rechace el ingreso) es el PR #245 y su sucesor. Mientras no entren, `getPrepayInfo` solo atiende a `awaiting_payment`. Todo pasa por Codex y por la revisión de Jesús antes de aplicarse.
- Pendiente de Jesús, sin regla nueva hasta que responda: PG-1 (con qué se paga en la puerta tras elegir «Yape o Plin»: CA-PAY-12), PG-2 (qué ve el cliente no confiable; mientras, su captura sigue obligatoria, CUS-PAY-014), PG-3 (qué ve el cliente nuevo: CUS-CHK-024 en `checkout`) y PG-4 (el texto de la alternativa; mientras, «Pagaré al motorizado al llegar»). Las cuatro preguntas, con sus alternativas y la recomendación, se le hicieron a Jesús el 2026-11-27; este cambio no toca `Docs/trabajo/decisiones-abiertas.md`, que lleva otro PR.
- Formatos del comprobante: D-40 de `Docs/planes/movil/contrato-rest.md` fija lo que el servidor **admite** (JPEG, PNG, WebP y HEIC/HEIF, 15 MB); lo que **producen las apps** lo fija CUS-PAY-003 (siempre JPEG, sin EXIF). En Android 8 no hay decodificador HEIC y se pide una captura de pantalla. La web del cliente **no se toca** (se apaga, D-27; la reemplaza una web estática en tindivo.com).
- iOS aún no empieza: `codigo.ios` vacío. La web del cliente se apaga y no se corrige.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-PAY-001 | La app debe mostrar de quién es el turno del dinero en el prepago: primero el negocio confirma que puede cumplir, luego el cliente paga y sube la captura, y luego el negocio la revisa; con etapas 1, 2, 3 y hecho. | `Docs/trabajo/app-cliente/requisitos/PAY.md` · `apps/customer/features/tracking/lib/prepay-stage.ts` · `app_settings:timers` | ★ |
| CUS-PAY-002 | Cuando el negocio acepta, la app debe mostrar cómo pagar: la cuenta de cobro, el QR si lo hay, el total y el plazo. | `PAY.md` · `getPrepayInfo` | |
| CUS-PAY-003 | Cuando el cliente elige una captura, la app debe aceptar JPEG, PNG, WebP y HEIC/HEIF de hasta 15 MB, recodificarla **siempre a JPEG, sin EXIF ni ubicación**, con estas reglas de tamaño, en este orden de prioridad: (1) el lado mayor baja a **2200 px**, salvo que eso deje el lado menor por debajo de **1080 px**; entonces manda el ancho mínimo de 1080 (una captura de 1080×2400 se envía tal cual) y, en una imagen apaisada, ese mínimo se aplica al lado menor (el alto); (2) el lado mayor **nunca pasa de 4400 px**: si una imagen muy larga no puede cumplir a la vez el mínimo de 1080 y el tope, gana el tope y el lado menor baja de 1080; y (3) una imagen menor no se agranda. Calidad **85**, y mostrar una vista previa. El peso objetivo es de 150 a 500 KB y el tope, 1,5 MB. En Android, ante una caída de red hace **un reintento automático** (`callTimeout` de 120 s) y, en Android 8, que no decodifica HEIC, muestra un mensaje claro que pide una captura de pantalla. En iOS, elige con PHPicker y recodifica a JPEG. | `PAY.md` (modificado por la decisión de Jesús del 2026-11-19, D-40) · `PREPAY_PROOF_CONTENT_TYPES` · D-40 de `Docs/planes/movil/contrato-rest.md` · medición de causas de fallo de subida, 2026-11-19 | ★ |
| CUS-PAY-004 | La app debe subir la captura al almacenamiento privado con la URL firmada que da la API y registrar su ruta; la ruta es única por intento. | `PAY.md` · `createPrepayProofUploadUrl` · `confirmPrepayProof` | |
| CUS-PAY-005 | La app debe permitir como máximo dos intentos de comprobante: tras el primer rechazo vuelve a esperar el pago con «Te queda 1 intento»; tras el segundo, el pedido se cancela por comprobante rechazado en firme. | `PAY.md` | ★ |
| CUS-PAY-006 | La app debe mostrarle al cliente el comprobante que envió, con una URL firmada de pocos minutos. | `PAY.md` | |
| CUS-PAY-007 | Cuando el cliente vuelve de su billetera, la app debe resaltar el botón de subir la captura durante unos segundos. | `PAY.md` | |
| CUS-PAY-008 | La app debe impedir pedidos nuevos mientras exista un caso de pago sin resolver; la regla de cuándo bloquea la decide el servidor. | `PAY.md` · `apps/customer/lib/payment-block.ts` | ★ |
| CUS-PAY-009 | Cuando el pedido se cancela por comprobante rechazado en firme, la app debe ofrecer pedir la revisión del pago por «Ayuda con este pedido». | `PAY.md` · CUS-PAY-016 · punto C del backlog | |
| CUS-PAY-010 | La app debe mostrar el resumen de reclamos del cliente y el comprobante de devolución, con una URL firmada que emite la API. | `PAY.md` · `listAppeals` | |
| CUS-PAY-011 | Cuando el cliente paga con Yape o Plin, la app debe mostrar el número del negocio, el titular y «Copiar» como acción principal, dentro del seguimiento y no en una hoja. | `PAY.md` (modificado por CUS-PAY-014) | |
| CUS-PAY-013 | La app debe dejar el QR de cobro y la subida de la captura a un toque, dentro de la tarjeta de pago del seguimiento, sin ocuparle la pantalla al cliente. | `PAY.md` (modificado por CUS-PAY-014) | |
| CUS-PAY-014 | Cuando el negocio acepta el pedido, la app debe mostrar el pago dentro del seguimiento, en una tarjeta: «Paga a [NEGOCIO]», «Con Yape o Plin», el número del negocio, «Titular: [nombre]», «Copiar» y «Total S/ [TOTAL]». El cliente confiable puede pagar con «Efectivo» o con «Yape o Plin»; si elige «Yape o Plin», «Subir captura» le es opcional y la alternativa es «Pagaré al motorizado al llegar»; al no confiable, la captura le es obligatoria. La captura la ven el negocio, el motorizado y el admin; solo el negocio confirma el ingreso. | `PAY.md` · Decisión de Jesús, 2026-11-17 (decisión 2) · Decisión de Jesús, 2026-11-19 (pago único, opción A) · Decisión de Jesús, 2026-11-27 | ★ |
| CUS-PAY-015 | Antes de enviar la captura, la app debe avisar que el restaurante y el motorizado asignado podrán verla, y que solo el restaurante confirma el pago. | `PAY.md` · Decisión de Jesús, 2026-11-17 (decisión 2) · `Docs/negocio/dinero.md` | ★ |
| CUS-PAY-016 | La app debe tratar el pago como uno solo y mandar toda incidencia de pago a «Ayuda con este pedido». | `PAY.md` · Decisión de Jesús, 2026-11-17 (decisión 2) | |
| CUS-PAY-017 | La app debe rotular la cuenta de cobro «Con Yape o Plin». | `PAY.md` · Decisión de Jesús, 2026-11-17 (decisión 1) | |
| ADM-PAY-001 | El admin debe poder auditar las capturas de pago: ver la captura de cada pedido, quién la subió, cuándo y el estado de confirmación del negocio, para decidir y dar soporte (hoy se hace por WhatsApp). Es de solo lectura: el admin no confirma ni rechaza el pago. | Decisión de Jesús, 2026-11-19 · `Docs/negocio/dinero.md` | ★ |
| SYS-PAY-001 | El servidor debe validar el tipo de la captura por sus bytes mágicos (JPEG, PNG, WebP, HEIC/HEIF) y no por el `Content-Type` declarado, rechazar la que no coincida y alertar cuando un comprobante pese más de 2 MB (señal de un cliente que no recomprimió). | Decisión de Jesús, 2026-11-19 · D-40 de `Docs/planes/movil/contrato-rest.md` | ★ |
| SYS-PAY-002 | Debe existir telemetría de la subida de la captura, sin datos personales (tipo y tamaño de entrada y de salida, tiempo de subida, código de error, plataforma), para medir una tasa de éxito de «elegir captura» a «comprobante registrado» de al menos 99 %. Hoy no hay ninguna: añadirla es requisito. | Decisión de Jesús, 2026-11-19 | |

Retirado el 2026-11-17: CUS-PAY-012 (el rótulo «Desde Yape, Plin o tu billetera»), reemplazado por CUS-PAY-017.

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-PAY-01 | Dado un prepago con el primer comprobante rechazado por el negocio, entonces el pedido vuelve a esperar el pago y la app dice «Te queda 1 intento»; cuando el segundo también es rechazado, el pedido queda cancelado por comprobante rechazado en firme, la app ofrece pedir la revisión del pago por «Ayuda con este pedido» y crear un pedido nuevo está bloqueado. | CUS-PAY-005, CUS-PAY-009, CUS-PAY-008 |
| CA-PAY-P2 | Dado que la persona toca «Copiar», entonces el botón dice «Copiado» con check durante 2 s, luego vuelve a «Copiar» y el portapapeles contiene el número de la cuenta de cobro. | CUS-PAY-011 |
| CA-PAY-P3 | Dado un cliente confiable que eligió «Yape o Plin» y no sube captura, entonces el pedido avanza igual y la tarjeta puede ignorarse. | CUS-PAY-014 |
| CA-PAY-P4 | Dado la pantalla del comprobante sin captura, entonces «Enviar comprobante» está deshabilitado y se lee «Adjunta la captura para enviar»; al elegir una imagen válida, se habilita. | CUS-PAY-003, CUS-PAY-014 |
| CA-PAY-P6 | Dado el plazo de pago vigente, entonces el reloj cuenta hacia atrás y con menos de 2 min pasa a rojo; al llegar a cero, el pedido se cancela y la pantalla lo dice. | CUS-PAY-001 |
| CA-PAY-P7 | Dado un primer comprobante rechazado, entonces vuelve la pantalla del comprobante con «Te queda 1 intento»; un segundo rechazo cancela el pedido y bloquea pedidos nuevos hasta resolver el caso. | CUS-PAY-005, CUS-PAY-008 |
| CA-PAY-08 | Dada una captura PNG de 1080x2400, cuando el cliente la sube desde Android o iOS, entonces el archivo enviado es JPEG sin EXIF, con 1080 px de ancho como mínimo (no se reduce a 720), calidad 85 y no más de 1,5 MB; y dada una imagen de 900 px de ancho, no se agranda. | CUS-PAY-003 |
| CA-PAY-09 | Dado un archivo cuyo contenido no es JPEG, PNG, WebP ni HEIC/HEIF pero que declara `image/jpeg`, cuando se confirma, entonces el servidor lo rechaza; y dado un comprobante de más de 2 MB, entonces se emite la alerta. | SYS-PAY-001 |
| CA-PAY-10 | Dado un pedido con captura, cuando el admin abre su auditoría, entonces ve la captura, quién la subió, cuándo y si el negocio confirmó el ingreso, y no tiene ninguna acción para confirmarlo ni rechazarlo. | ADM-PAY-001 |
| CA-PAY-11 | Dada una imagen larga de 1080x6000, cuando el cliente la sube desde Android o iOS, entonces el archivo enviado mide 792x4400 (el lado mayor nunca pasa de 4400, aunque el lado menor baje de 1080); dada una apaisada de 6000x1080, entonces mide 4400x792; y dada una de 1080x2400, se envía con ese mismo tamaño. | CUS-PAY-003 |
| CA-PAY-12 | Dado un pedido con «Yape o Plin» sin captura, cuando el motorizado llega a la puerta, entonces la falta de captura no frena la entrega y el cliente paga en la puerta. **Con qué paga ahí está pendiente de Jesús (PG-1)**: la opción propuesta, que es lo que ya hace la app del motorizado, es Yape, Plin o efectivo (este sin vuelto garantizado), con el motorizado registrando el pago que de verdad recibió; no es regla hasta que Jesús la confirme. | CUS-PAY-014 |
| CA-PAY-P8 | Dado que la persona va a enviar una captura, entonces ve antes el aviso «El restaurante y el motorizado asignado podrán ver esta captura. Muestra solo esta operación y oculta información ajena al pago.». | CUS-PAY-015 |

Retirados: CA-PAY-P1 (la hoja de pago sin marca, revertida por CUS-PAY-017) y CA-PAY-P5 (la cuenta secundaria «Usa otra cuenta», en discusión: decisión G).

## Reglas

- Formatos de imagen que admite el comprobante: `PREPAY_PROOF_CONTENT_TYPES`; el tope de tamaño de entrada lo fija el contrato REST. La salida de las apps y quién ve la captura están en los requisitos.
- Plazos de aceptación, de pago y de revisión: `app_settings:timers`.
- Faltas que dejan al cliente solo con prepago o bloqueado: `app_settings:strikes`.
- Tindivo no retiene fondos y el dinero se ajusta solo en el libro de cargos: [Dinero](../../negocio/dinero.md).

## Defectos

Estado en Android contrastado el 2026-11-19 contra `develop@25a6d537`; el defecto 3, el 2026-11-27 contra `develop@8ea8dd99`. Solo lo que falta o se difiere; lo demás está hecho (el detalle con evidencia va en el cuerpo del PR).

| # | Requisito | Estado | Hallazgo | Dónde |
|---|---|---|---|---|
| 1 | CUS-PAY-003 | FALTA | Un HEIC se lee solo desde Android 9; la versión mínima de la app es Android 8, donde la foto queda «no se pudo leer» y falta el mensaje que pide una captura de pantalla. Tampoco hay prueba de HEIC, de PNG ni de WebP, ni reintento automático ante caída de red, y `callTimeout` es de 90 s en lugar de 120 s. | `feature/orders/ProofImageEncoder.kt` · `ProofSender.kt` · `core/network/.../ProofUploader.kt` |
| 2 | CUS-PAY-003 | FALTA | Android reduce el lado mayor a 1600 px (una captura 1080x2400 queda en 720 px de ancho y el número de operación se ve chico) y usa calidad 80; deben ser 2200 px con ancho mínimo 1080 y calidad 85. | `feature/orders/ProofJpeg.kt` · `ProofImageEncoder.kt` |
| 3 | CUS-PAY-014, CUS-PAY-011, CUS-PAY-013, CUS-PAY-017 | FALTA | La sección vive dentro del detalle del pedido y solo para `awaiting_payment`; rotula «Yape», «Plin» o «Yape o Plin» según el negocio; no hay «Titular» confirmado, ni «Pagaré al motorizado al llegar», ni tarjeta para el confiable con «Yape o Plin». Android aún no la tiene; el servidor que la alimenta es el PR #245 y su sucesor, que no están en `develop`. | `feature/orders/PrepaySection.kt` · `PrepayPayeeCard.kt` · `PrepayModels.kt` |
| 4 | CUS-PAY-015 | FALTA | No existe el aviso de que el restaurante y el motorizado verán la captura. | `feature/orders/PrepaySection.kt` |
| 5 | CUS-PAY-006 | FALTA | La app no muestra de nuevo el comprobante enviado. | `feature/orders/` |
| 6 | CUS-PAY-007 | FALTA | No se resalta el botón al volver de la billetera. | `feature/orders/PrepaySection.kt` |
| 7 | CUS-PAY-008 | FALTA | No hay compuerta de caso de pago sin resolver; hoy la regla solo existe calculada en el cliente web. Decidido el 2026-11-19: `createOrder` devuelve un código de error con el caso y la app solo lo muestra; el código de ese error no existe aún en el servidor. | `apps/customer/lib/payment-block.ts` |
| 8 | CUS-PAY-010 | FALTA | No hay resumen de reclamos ni comprobante de devolución. | `feature/orders/` |
| 9 | CUS-PAY-001 | FALTA | La sección solo pinta la cuenta atrás del pago; no pinta las etapas 1, 2, 3 ni las otras dos esperas. | `feature/orders/PrepayModels.kt` |
| 10 | CUS-PAY-016 | FALTA | No existe «Ayuda con este pedido»; los textos de cancelación dicen «escríbenos por WhatsApp» y llevan al contacto de soporte. | `feature/orders/SupportContact.kt` · `res/values/strings.xml` |
| 11 | ADM-PAY-001 | FALTA | El admin no tiene una vista de auditoría de capturas: hoy se audita por WhatsApp. | `apps/admin` |
| 12 | SYS-PAY-001 | FALTA | El servidor valida el `Content-Type` declarado, no los bytes del archivo, y no alerta por peso; solo comprueba que el archivo exista (`proof_file_missing`). | `packages/backend/src/modules/ordering/infra/proof-upload.ts` |
| 13 | SYS-PAY-002 | FALTA | Ningún intento de subida registra tipo, tamaño, vía ni error: no hay telemetría y la tasa de éxito es desconocida. | `apps/android/customer/` · `apps/api/` |
