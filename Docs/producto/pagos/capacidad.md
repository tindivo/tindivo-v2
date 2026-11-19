---
id: pagos
nombre: Pago y comprobante
actores: [CUS]
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

> Verificado: 2026-11-19 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el AAAA-MM-DD (medio) — PILOTO, pendiente de su visto bueno

## Antes de tocar

- Es lo que pasa con el dinero después de confirmar el pedido: de quién es el turno, a quién se le paga, la captura del comprobante, los dos intentos y el caso de pago sin resolver. Vive en el seguimiento del pedido (capacidad de seguimiento, aún sin migrar a `Docs/producto/`) y no en el checkout, que solo elige la forma de pago (capacidad `checkout`).
- `dinero: true`: Tindivo **no retiene fondos**; el cliente le paga directo al negocio con Yape o Plin. La app no calcula ni cobra nada: muestra el total del pedido y el número del negocio. Todo cambio aquí pasa por Codex y por la revisión de Jesús (invariante 9 de `AGENTS.md`).
- Es **un solo pago**: sin segundo pago ni pago dividido. Toda incidencia de pago va a «Ayuda con este pedido» (el WhatsApp de soporte), no a un flujo dentro de la app (CUS-PAY-016).
- Cuándo se paga: el pedido prepago nace esperando que el negocio acepte; al aceptar, el cliente paga y sube la captura; el negocio la revisa. Los plazos viven en `app_settings:timers`, nunca en la app.
- Quién confirma: **solo el restaurante, contra su cuenta, confirma el pago**. La captura prueba únicamente que se envió una imagen. El motorizado la ve pero nunca la aprueba (CUS-PAY-015).
- La captura la ven el restaurante y el motorizado asignado: la app debe avisarlo antes de enviar. La retención de las capturas y la Ley 29733 siguen por verificar (punto V de `Docs/trabajo/app-cliente/decisiones-abiertas.md`).
- Pago único del cliente de confianza (PR #112, `Docs/trabajo/pago-unico/evaluacion.md` en su rama): vale mientras siga el diseño aprobado. Su servidor **no existe aún** en `develop` (ni la tabla de capturas ni la confirmación del ingreso por el negocio); hoy `getPrepayInfo` solo atiende a `awaiting_payment`. Ver «Decisiones para Jesús» del PR.
- Formatos del comprobante: D-40 de `Docs/planes/movil/contrato-rest.md`. Android recodifica toda foto a JPEG antes de subirla (quita el EXIF con la ubicación), así que la lectura de HEIC depende del sistema.
- iOS aún no empieza: `codigo.ios` vacío. La web del cliente se apaga y no se corrige.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-PAY-001 | La app debe mostrar de quién es el turno del dinero en el prepago: primero el negocio confirma que puede cumplir, luego el cliente paga y sube la captura, y luego el negocio la revisa; con etapas 1, 2, 3 y hecho. | `Docs/trabajo/app-cliente/requisitos/PAY.md` · `apps/customer/features/tracking/lib/prepay-stage.ts` · `app_settings:timers` | ★ |
| CUS-PAY-002 | Cuando el negocio acepta, la app debe mostrar cómo pagar: la cuenta de cobro, el QR si lo hay, el total y el plazo. | `PAY.md` · `getPrepayInfo` | |
| CUS-PAY-003 | Cuando el cliente elige una captura, la app debe aceptar JPEG, PNG, WebP y HEIC/HEIF de hasta 15 MB, comprimirla (lado mayor de 1600 px) y mostrar una vista previa; si la compresión falla, no debe impedir pagar. | `PAY.md` · `PREPAY_PROOF_CONTENT_TYPES` · D-40 de `Docs/planes/movil/contrato-rest.md` | |
| CUS-PAY-004 | La app debe subir la captura al almacenamiento privado con la URL firmada que da la API y registrar su ruta; la ruta es única por intento. | `PAY.md` · `createPrepayProofUploadUrl` · `confirmPrepayProof` | |
| CUS-PAY-005 | La app debe permitir como máximo dos intentos de comprobante: tras el primer rechazo vuelve a esperar el pago con «Te queda 1 intento»; tras el segundo, el pedido se cancela por comprobante rechazado en firme. | `PAY.md` | ★ |
| CUS-PAY-006 | La app debe mostrarle al cliente el comprobante que envió, con una URL firmada de pocos minutos. | `PAY.md` | |
| CUS-PAY-007 | Cuando el cliente vuelve de su billetera, la app debe resaltar el botón de subir la captura durante unos segundos. | `PAY.md` | |
| CUS-PAY-008 | La app debe impedir pedidos nuevos mientras exista un caso de pago sin resolver; la regla de cuándo bloquea la decide el servidor. | `PAY.md` · `apps/customer/lib/payment-block.ts` | ★ |
| CUS-PAY-009 | Cuando el pedido se cancela por comprobante rechazado en firme, la app debe ofrecer pedir la revisión del pago por «Ayuda con este pedido». | `PAY.md` · CUS-PAY-016 · punto C del backlog | |
| CUS-PAY-010 | La app debe mostrar el resumen de reclamos del cliente y el comprobante de devolución, con una URL firmada que emite la API. | `PAY.md` · `listAppeals` | |
| CUS-PAY-011 | Cuando el cliente paga con Yape o Plin, la app debe mostrar el número del negocio, el titular y «Copiar» como acción principal, dentro del seguimiento y no en una hoja. | `PAY.md` (modificado por CUS-PAY-014) | |
| CUS-PAY-013 | La app debe dejar el QR de cobro y la subida de la captura a un toque, dentro de la tarjeta de pago del seguimiento, sin ocuparle la pantalla al cliente. | `PAY.md` (modificado por CUS-PAY-014) | |
| CUS-PAY-014 | Cuando el negocio acepta el pedido, la app debe mostrar el pago dentro del seguimiento, en una tarjeta: «Paga a [NEGOCIO]», «Con Yape o Plin», el número del negocio, «Titular: [nombre]», «Copiar» y «Total S/ [TOTAL]». Al cliente confiable, «Subir captura» le es opcional y la alternativa es «Pagaré al motorizado al llegar»; al no confiable, la captura le es obligatoria. | `PAY.md` · Decisión de Jesús, 2026-11-17 (decisión 2) | ★ |
| CUS-PAY-015 | Antes de enviar la captura, la app debe avisar que el restaurante y el motorizado asignado podrán verla, y que solo el restaurante confirma el pago. | `PAY.md` · Decisión de Jesús, 2026-11-17 (decisión 2) · `Docs/negocio/dinero.md` | ★ |
| CUS-PAY-016 | La app debe tratar el pago como uno solo y mandar toda incidencia de pago a «Ayuda con este pedido». | `PAY.md` · Decisión de Jesús, 2026-11-17 (decisión 2) | |
| CUS-PAY-017 | La app debe rotular la cuenta de cobro «Con Yape o Plin». | `PAY.md` · Decisión de Jesús, 2026-11-17 (decisión 1) | |

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
| CA-PAY-P8 | Dado que la persona va a enviar una captura, entonces ve antes el aviso «El restaurante y el motorizado asignado podrán ver esta captura. Muestra solo esta operación y oculta información ajena al pago.». | CUS-PAY-015 |

Retirados: CA-PAY-P1 (la hoja de pago sin marca, revertida por CUS-PAY-017) y CA-PAY-P5 (la cuenta secundaria «Usa otra cuenta», en discusión: decisión G).

## Reglas

- Formatos de imagen que admite el comprobante: `PREPAY_PROOF_CONTENT_TYPES`; el tope de tamaño lo fija el contrato REST.
- Plazos de aceptación, de pago y de revisión: `app_settings:timers`.
- Faltas que dejan al cliente solo con prepago o bloqueado: `app_settings:strikes`.
- Tindivo no retiene fondos y el dinero se ajusta solo en el libro de cargos: [Dinero](../../negocio/dinero.md).

## Defectos

Estado en Android contrastado el 2026-11-19 contra `develop@25a6d537`. Solo lo que falta o se difiere; lo demás está hecho (el detalle con evidencia va en el cuerpo del PR).

| # | Requisito | Estado | Hallazgo | Dónde |
|---|---|---|---|---|
| 1 | CUS-PAY-003 | FALTA | Un HEIC se lee solo desde Android 9; la versión mínima de la app es Android 8, donde la foto queda «no se pudo leer». Tampoco hay prueba de HEIC, de PNG ni de WebP. | `feature/orders/ProofImageEncoder.kt` |
| 2 | CUS-PAY-003 | FALTA | La calidad JPEG que sube Android es menor que la del perfil `proof` de la web. Y ante una foto ilegible la app no sube el original: la rechaza (la fuente dice que nunca debe impedir pagar). | `feature/orders/ProofJpeg.kt` · `ProofImageEncoder.kt` |
| 3 | CUS-PAY-014, CUS-PAY-011, CUS-PAY-013, CUS-PAY-017 | FALTA | La sección vive dentro del detalle del pedido y solo para `awaiting_payment`; rotula «Yape», «Plin» o «Yape o Plin» según el negocio; no hay «Titular» confirmado, ni «Pagaré al motorizado al llegar», ni tarjeta para el confiable. | `feature/orders/PrepaySection.kt` · `PrepayPayeeCard.kt` |
| 4 | CUS-PAY-015 | FALTA | No existe el aviso de que el restaurante y el motorizado verán la captura. | `feature/orders/PrepaySection.kt` |
| 5 | CUS-PAY-006 | FALTA | La app no muestra de nuevo el comprobante enviado. | `feature/orders/` |
| 6 | CUS-PAY-007 | FALTA | No se resalta el botón al volver de la billetera. | `feature/orders/PrepaySection.kt` |
| 7 | CUS-PAY-008 | FALTA | No hay compuerta de caso de pago sin resolver; hoy la regla solo existe calculada en el cliente web. | `apps/customer/lib/payment-block.ts` |
| 8 | CUS-PAY-010 | FALTA | No hay resumen de reclamos ni comprobante de devolución. | `feature/orders/` |
| 9 | CUS-PAY-001 | FALTA | La sección solo pinta la cuenta atrás del pago; no pinta las etapas 1, 2, 3 ni las otras dos esperas. | `feature/orders/PrepayModels.kt` |
| 10 | CUS-PAY-016 | FALTA | No existe «Ayuda con este pedido»; los textos de cancelación dicen «escríbenos por WhatsApp» y llevan al contacto de soporte. | `feature/orders/SupportContact.kt` · `res/values/strings.xml` |
