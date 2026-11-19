---
id: entregas
nombre: Tindivo Entregas
actores: [CUS]
lineas: [entregas]
depende_de: [direcciones]
dinero: true
codigo:
  web: [apps/customer/features/courier/**]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/**, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/home/CourierEntryCard.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/navigation/CourierNavigation.kt]
  ios: []
  backend: [apps/api/app/api/v1/customer/courier-orders/**, apps/api/app/api/v1/public/courier/**, packages/contracts/src/courier.ts, packages/contracts/src/courier-status.ts]
operaciones: [listCourierDirectory]
reglas: [COURIER_ITEM_DESCRIPTION_MAX, COURIER_MAX_WEIGHT_KG, COURIER_DRIVER_HINT_MAX, COURIER_TRANSITIONS, ADDRESS_REFERENCE_MIN, ADDRESS_REFERENCE_API_MIN, isGarbageText, app_settings:courier, app_settings:timers, app_settings:coverage_polygon]
---

# Tindivo Entregas

> Verificado: 2026-11-18 · entorno: develop@25a6d537 (código) · Aprobado por Jesús el 2026-11-19 (conversación con Claude Code: «apruebo las recomendaciones de los cuatro»); queda abierto CUS-ENT-020

## Antes de tocar

- Es el servicio del cliente para que un motorizado lleve de A a B algo **ya coordinado, pagado y listo**. Las reglas del
  negocio (qué es, horario, motorizado, dinero) viven en `Docs/negocio/servicios/entregas.md` y el ADR 0035.
- `dinero: true`: la app muestra montos (la tarifa en «Pedir entrega · S/ …», «Transporte: S/ …» y el importe de «Mis
  entregas»). Son **solo para mostrar**: la app no calcula ni envía importes; la tarifa la fija y la cobra el servidor
  (`create_courier_order`). Todo cambio aquí pasa por Codex.
- Depende de `direcciones`: los puntos A y B salen de «Mis direcciones», «Sitios anteriores» o el mapa; la referencia
  sigue `ADDRESS_REFERENCE_MIN` en los formularios (D-31) y la API acepta desde `ADDRESS_REFERENCE_API_MIN`.
- Apagado o fuera de horario (`app_settings:courier`): la app lo dice y no deja pedir; el servidor lo repite al crear.
- Qué se puede enviar lo decide el canon («Qué se lleva y qué no»). El servidor **no** revisa qué se envía: solo exige
  `weightConfirmed` y `prepaidConfirmed`, y cada casilla de la app manda su propio valor (CUS-ENT-008).
- El peso máximo sale del servidor: `GET /public/courier/status` devuelve `maxWeightKg` (campo opcional y aditivo,
  CUS-ENT-003). Una app instalada que no lo conoce sigue funcionando (API-3).
- Lo frágil no se marca al pedir: las apps envían `isFragile = false`. El lado del motorizado no está aquí.
- iOS aún no empieza: `codigo.ios` vacío.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-ENT-001 | La app debe ofrecer Tindivo Entregas desde una sola entrada, la tarjeta del Inicio, con «Tindivo Entregas» y «Llevamos tus cosas de un lugar a otro». | `negocio/servicios/entregas.md` («Cómo se pide») · Aprobado por Jesús, 2026-10-07 | |
| CUS-ENT-002 | Mientras Entregas esté apagado o fuera de horario, la app debe decir «Cerrado ahora» o «Abre a las [hora]» y no permitir pedir. | `negocio/servicios/entregas.md` («Reglas al pedir») · ADR 0035 | ★ |
| CUS-ENT-003 | La app debe mostrar el precio de partida y el peso máximo («Desde S/ [tarifa] · Hasta [peso] kg»); ambos vienen del servidor (`GET /public/courier/status`, `maxWeightKg`) tal cual, sin escribirlos en la app. | `negocio/servicios/entregas.md` («El dinero») | |
| CUS-ENT-004 | La app debe permitir marcar el punto de recojo (A) y el de entrega (B) en el mapa, con una referencia escrita obligatoria (largo de `ADDRESS_REFERENCE_MIN` y sin texto basura, `isGarbageText`, con el mismo criterio que el servidor), dentro de la zona de reparto. | `negocio/servicios/entregas.md` («Reglas al pedir») · Decisión de Jesús, 2026-11-18 (D-31: referencia de 15; vale también para Entregas) | ★ |
| CUS-ENT-005 | La app debe ofrecer atajos para elegir el lugar: «Soy yo», mis direcciones guardadas y sitios anteriores. Buscar un lugar por su nombre y recoger de un negocio del directorio quedan **diferidos**: el lanzamiento sale sin ellos. | `negocio/servicios/entregas.md` («Cómo se pide») · Decisión de Jesús, 2026-11-19 | |
| CUS-ENT-006 | La app debe pedir qué se lleva, con una descripción y una categoría. La comida sí va por Entregas; lo frágil no se marca al pedir. | `negocio/servicios/entregas.md` · Decisión de Jesús, 2026-11-11 | |
| CUS-ENT-007 | La app debe preguntar quién paga el transporte: quien entrega, al recoger, o quien recibe, al entregar. La tarifa se paga al motorizado. | `negocio/servicios/entregas.md` («El dinero») · Decisión de Jesús, 2026-11-16 | ★ |
| CUS-ENT-008 | La app debe exigir que la persona confirme, antes de pedir, que lo que envía **ya está listo y pagado** y que **está permitido**, con dos casillas separadas, cada una con su propio valor (`prepaidConfirmed` y `weightConfirmed`); sin las dos marcadas no hay pedido. | `negocio/servicios/entregas.md` («Reglas al pedir») · `CreateCourierOrderRequestSchema` · Decisión de Jesús, 2026-11-19 | ★ |
| CUS-ENT-009 | La app debe exigir nombre y celular verificado de quien pide. | `AGENTS.md` (antifraude humano) · `create_courier_order` | |
| CUS-ENT-010 | La app debe decir que el envío tiene que caber en la mochila del motorizado y pesar como máximo `courier.maxWeightKg` (el valor del servidor), sin medida en centímetros (a criterio del motorizado). | Decisión de Jesús, 2026-11-16, ratificada el 2026-11-17 | |
| CUS-ENT-012 | El servidor debe permitir como máximo `courier.maxActivePerPhone` entregas activas por celular; la app debe mostrar su explicación. | `negocio/servicios/entregas.md` («Reglas al pedir») | |
| CUS-ENT-013 | La app debe listar «Mis entregas» con ruta, código, importe y estado, paginar con «Ver más» y destacar la entrega en curso. | `negocio/servicios/entregas.md` | |
| CUS-ENT-014 | La app debe mostrar el seguimiento de la entrega con sus pasos (Pedido, Confirmado, En camino, Entregado), el motorizado, el transporte, quién paga y el código. | `COURIER_TRANSITIONS` (`packages/contracts/src/courier-status.ts`) | |
| CUS-ENT-015 | Cuando nadie ha aceptado la entrega, la app debe permitir cancelarla con confirmación; si un motorizado ya la tomó (409), debe decirlo y refrescar. | `POST /customer/courier-orders/{id}/cancel` | |
| CUS-ENT-016 | Mientras nadie acepte la entrega, la app debe mostrar la cuenta atrás hasta su cancelación automática (`timers.courierAcceptMinutes`); vencida, sin cobro. | `negocio/servicios/entregas.md` («El motorizado») | |
| CUS-ENT-017 | La app debe explicar el motivo cuando la entrega se cancela y decir siempre «No se cobró nada». | `negocio/servicios/entregas.md` | |
| CUS-ENT-018 | La app debe permitir pedir otra entrega a partir de una anterior («Pedir otra entrega» al entregarse, «Volver a pedir» al cancelarse). | `negocio/servicios/entregas.md` («Cómo se pide») | |
| CUS-ENT-019 | Si se corta la conexión al crear la entrega, la app debe conservar la clave de idempotencia y avisar que revise «Mis entregas» antes de pedir otra. | Contrato REST v1 (`Idempotency-Key`) · mismo criterio que CUS-CHK-010 | ★ |
| CUS-ENT-020 | **Abierto** hasta la revisión legal. La app debe indicar que los daños y pérdidas se atienden por el soporte de WhatsApp y que Tindivo responde por la conducta de sus motorizados. | Decisión de Jesús, 2026-11-16. La responsabilidad económica (tope de S/ 200) queda para la revisión legal | |
| CUS-ENT-021 | Cuando el destinatario no está al llegar el motorizado, el motorizado debe poder registrarlo con una foto y esperar `timers.courierWaitMinutes`; si nadie recibe, se lleva el producto y se reprograma. **Fuera del lanzamiento: por diseñar (M2).** | Decisión de Jesús, 2026-11-16 (T7) | |
| CUS-ENT-022 | La app debe informar qué no se puede enviar según la lista del canon («Qué se lleva y qué no»: la de inDrive; los documentos sí), sin declaración de efectivo ni joyas, y debe cambiar el texto que la contradice. Los medicamentos de venta libre se permiten (la categoría «Medicinas» se queda); los animales vivos y los objetos robados están prohibidos. | Decisión de Jesús, 2026-11-17 (decisión 19) y 2026-11-19 | ★ |

> **Retirado:** `CUS-ENT-011` (lista de prohibidos con efectivo y joyas declarables) → reemplazado por `CUS-ENT-022`
> (decisión de Jesús, 2026-11-17). Su ID no se reutiliza.

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-ENT-01 | Dado un formulario completo sin la casilla de «listo y pagado» o sin la de «permitido», cuando se toca «Pedir entrega», entonces no se envía nada y la app dice qué falta; con las dos marcadas, el cuerpo lleva `prepaidConfirmed` y `weightConfirmed` en `true`, cada uno de su casilla. | CUS-ENT-008 |
| CA-ENT-02 | Dado un punto A o B con una referencia por debajo de `ADDRESS_REFERENCE_MIN` o que `isGarbageText` rechaza, cuando se intenta confirmar, entonces la app no deja continuar. | CUS-ENT-004 |
| CA-ENT-03 | Dado un pin fuera del polígono de reparto, cuando se intenta elegirlo como punto A o B, entonces no se elige y se dice «Esta ubicación está fuera de la zona de reparto de San Jacinto». | CUS-ENT-004 |
| CA-ENT-04 | Dado el servicio apagado o fuera de horario, entonces la app dice «Cerrado ahora» (o «Abre a las [hora]») y «Pedir una entrega» no avanza. | CUS-ENT-002 |
| CA-ENT-05 | Dado un cuerpo de pedido, entonces no contiene ningún importe ni tarifa: la tarifa la fija el servidor y la app solo la muestra tal como llega. | CUS-ENT-003, CUS-ENT-007 |
| CA-ENT-06 | Dado una entrega con un motorizado asignado, cuando la persona intenta cancelar y el servidor responde 409, entonces la app dice que ya no se puede cancelar y refresca el detalle. | CUS-ENT-015 |
| CA-ENT-07 | Dado un envío de «Pedir entrega» que se cortó sin respuesta, cuando la persona vuelve a intentar, entonces se usa la misma `Idempotency-Key` y no se crean dos entregas. | CUS-ENT-019 |
| CA-ENT-08 | Dado una entrega sin aceptar, entonces la app muestra «Se cancela sola en [mm:ss]» hasta el plazo del servidor y, vencido, «Se acabó el tiempo» y «No se cobró nada». | CUS-ENT-016, CUS-ENT-017 |
| CA-ENT-09 | Dado una cuenta con `courier.maxActivePerPhone` entregas activas, cuando pide otra, entonces el servidor la rechaza y la app muestra su explicación. | CUS-ENT-012 |
| CA-ENT-10 | Dado el formulario de pedir, entonces el texto de lo permitido corresponde a la lista del canon (animales vivos y objetos robados incluidos) y ya no dice «sin nada que necesite receta especial ni refrigeración». | CUS-ENT-022, CUS-ENT-006 |
| CA-ENT-11 | Dado `GET /public/courier/status`, entonces devuelve `maxWeightKg` con el valor de `courier.maxWeightKg`, y la app muestra «Hasta [peso] kg» con ese valor; si el servidor no lo manda, la app no escribe un peso. | CUS-ENT-003, CUS-ENT-010 |

## Reglas

- Estados y transiciones de una entrega: `COURIER_TRANSITIONS`. `delivered` es terminal.
- Servicio, horario, tarifa base, peso máximo y límites por celular: `app_settings:courier`.
- Plazo para que alguien acepte y espera en el punto A: `app_settings:timers`.
- Zona de reparto: `app_settings:coverage_polygon`.
- Textos del pedido: `COURIER_ITEM_DESCRIPTION_MAX`, `COURIER_DRIVER_HINT_MAX`, `COURIER_MAX_WEIGHT_KG`.
- Referencia de cada punto: `ADDRESS_REFERENCE_MIN` (formulario), `ADDRESS_REFERENCE_API_MIN` (API) y `isGarbageText`.
- Dinero y tarifa: [dinero](../../negocio/dinero.md). Qué es y qué se lleva: [entregas](../../negocio/servicios/entregas.md).

## Abierto

- **CUS-ENT-020** (soporte de WhatsApp y responsabilidad por daños): espera la revisión legal; está en `Docs/trabajo/decisiones-abiertas.md` (DA-17).
- **Flujo de «pedir»**: se mantiene el de Android (portada y formulario con hojas) **si** el canvas v35 lo dibuja así; el agente no pudo abrir el canvas, así que Jesús lo confirma al revisar la ficha. Si el canvas muestra «mapa primero», la ficha cambia.

## Brecha con Android

Verificado el 2026-11-18 en develop@25a6d537. Rutas relativas a `apps/android/customer/src/main/kotlin/com/tindivo/customer/`;
`res/` es `apps/android/customer/src/main/res/`.

| Requisito | Estado | Evidencia |
|---|---|---|
| CUS-ENT-001 | DIFIERE | La entrada única existe (`feature/catalog/home/CourierEntryCard.kt`, `feature/catalog/home/CatalogHomeScreen.kt`). Pero «Pedir una entrega» abre la portada y luego el formulario (`navigation/CourierNavigation.kt`), no el mapa del punto A que aprobó Jesús el 2026-10-07. |
| CUS-ENT-002 | HECHO | `feature/courier/CourierText.kt` (`closedText`), `feature/courier/CourierHomeScreen.kt`; prueba «con el servicio cerrado no deja pedir» (`CourierRequestViewModelTest.kt`). |
| CUS-ENT-003 | DIFIERE | El precio sale del servidor (`CourierText.kt`, `CourierModels.kt`). «Hasta 5 kg» está escrito en `res/values/strings.xml`; `GET /public/courier/status` no devuelve el peso (`packages/contracts/src/courier.ts`). |
| CUS-ENT-004 | DIFIERE | Pin, zona y largo mínimo: HECHO (`CourierRequestSheets.kt`, `CourierRequestViewModel.kt`, `CourierRequestState.kt`; prueba «un pin fuera de la zona…», `CourierRequestViewModelTest.kt`). Falta el filtro de texto basura: solo valida el largo y no usa `isGarbageText` (sin coincidencias en `feature/courier/`); la API sí lo filtra (`packages/contracts/src/primitives.ts`). |
| CUS-ENT-005 | DIFIERE | «Soy yo» (`CourierRequestSections.kt`), «Mis direcciones» (`CourierRequestSheets.kt`) y «Sitios anteriores» (`CourierRequestSheets.kt`): HECHO. Faltan buscar un lugar por su nombre y recoger de un negocio del directorio: no hay código de `listCourierDirectory` en `apps/android`. |
| CUS-ENT-006 | HECHO | Categorías `CourierRequestSections.kt`; `isFragile = false` en `CourierRequestState.kt`. La categoría «Medicinas» depende de la decisión sobre medicamentos. |
| CUS-ENT-007 | HECHO | `CourierRequestSections.kt`; textos `res/values/strings.xml`; el cuerpo solo lleva `payer` (`CourierRequestState.kt`). |
| CUS-ENT-008 | DIFIERE | Una sola casilla («Ya está listo y pagado», `CourierRequestSections.kt`) y lo permitido como texto (`ReadyAndPaid` y el texto de `ItemSection`). El cuerpo envía `weightConfirmed = true` y `prepaidConfirmed = true` siempre (`CourierRequestState.kt`). |
| CUS-ENT-009 | HECHO | `CourierRequestScreen.kt`; `CourierRequestState.kt`; prueba `CourierRequestViewModelTest.kt`. |
| CUS-ENT-010 | DIFIERE | La app dice «Hasta 5 kg» y no menciona la mochila (`res/values/strings.xml`); el peso no se lee del servidor (ver CUS-ENT-003). |
| CUS-ENT-012 | HECHO | Lo hace el servidor (`supabase/migrations/0276_el_perfil_los_terminos_y_las_apelaciones_los_escribe_el_servidor.sql`); la app muestra el texto del servidor (prueba «un rechazo con explicacion muestra el texto del servidor», `CourierRequestViewModelTest.kt`). |
| CUS-ENT-013 | HECHO | `CourierHomeList.kt`, `CourierHomeScreen.kt`, `CourierHomeViewModel.kt`. |
| CUS-ENT-014 | HECHO | `CourierTracking.kt`. |
| CUS-ENT-015 | HECHO | `CourierTracking.kt`; manejo del 409 en `CourierDetailViewModel.kt`; prueba `CourierCancelUnreadableConflictTest.kt`. |
| CUS-ENT-016 | HECHO | `CourierTracking.kt`, `CourierDetailViewModel.kt`. |
| CUS-ENT-017 | HECHO | `CourierText.kt`, `CourierTracking.kt`. |
| CUS-ENT-018 | HECHO | `CourierTracking.kt`. |
| CUS-ENT-019 | HECHO | `CourierAttempts.kt`, `CourierRequestScreen.kt`; pruebas `CourierAttemptsTest.kt` y `CourierRequestViewModelTest.kt`. |
| CUS-ENT-020 | FALTA | Ningún texto de soporte de WhatsApp ni de responsabilidad en `res/values/strings.xml`. La redacción espera la revisión legal. |
| CUS-ENT-021 | DIFIERE | Fuera del lanzamiento (M2, por diseñar). Lo registra el motorizado, no el cliente; no hay código en ninguna app. |
| CUS-ENT-022 | FALTA | `res/values/strings.xml` (`courier_allowed_info`) conserva «Sin alcohol, sin nada que necesite receta especial ni refrigeración» y `strings.xml` (`courier_category_medicine`) la categoría «Medicinas». Android no muestra la lista del canon. |

Cuenta: 21 requisitos vigentes (`CUS-ENT-011` está retirado): **HECHO 12, FALTA 2, DIFIERE 7**.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-ENT-004 | Android valida solo el largo de la referencia, sin filtro de texto basura; la API sí lo filtra y devolvería 422. | `feature/courier/CourierRequestState.kt` |
| 2 | CUS-ENT-003, CUS-ENT-010 | «Hasta 5 kg» escrito en los textos; no se lee de `courier.maxWeightKg`. | `res/values/strings.xml` |
| 3 | CUS-ENT-008 | Las confirmaciones viajan siempre en `true` aunque solo haya una casilla. | `feature/courier/CourierRequestState.kt` |
