# Matriz de escenarios de punta a punta (app del cliente)

> Trabajo, no norma. Qué escenarios hay que poder correr antes de lanzar, con qué capa se prueba cada uno y en qué
> estado está. Medido el 2026-11-19 sobre `develop@25a6d537`; las filas con ★ remiten a CA de las capacidades de
> `Docs/producto/` (las que aún no están en `develop` viven en los PR en borrador #198 a #201 y #190).

Capas:

- **API**: `scripts/e2e/flujo-completo.ts`, solo por `/api/v1` (los tres actores con su JWT), contra la base local bajo
  candado. Comando: `pnpm e2e:todo`. Runbook: `Docs/operacion/e2e-flujo-completo.md`.
- **Playwright**: la web de negocios y de motorizados (`e2e/`); la web del cliente está congelada.
- **Maestro**: la app Android del cliente, `apps/android/maestro/flows/`. Solo corre en CI o en un dispositivo.

Estados: **existe** (corre y pasa), **escrito** (existe y no se pudo correr aquí), **falta** (no hay prueba),
**bloqueado** (hay un motivo que impide probarlo con esa capa).

## Matriz

| # | Escenario | Actores | CA que cubre | API | Playwright | Maestro |
|---|---|---|---|---|---|---|
| 1 | Pedido de restaurante con delivery, **pago al recibir** (efectivo, billete 50, vuelto) hasta entregado | cliente, negocio, motorizado | CUS-TRK-002, CUS-CAT-018 | **existe** (`contraentrega`) | existe (`happy-path-order`, `viaje-pedido-online`; UI) | escrito (`pedido-contraentrega`, hasta «Pedido recibido») |
| 2 | Delivery con **comprobante** (prepago) hasta entregado | cliente, negocio, motorizado | CUS-TRK-020 | **existe** (`prepago`) | existe (`comprobante-real`) | escrito (`pedido-prepago-hasta-comprobante`; subir la captura es manual) |
| 3 | Comprobante en **HEIC** (foto de iPhone) | cliente, negocio | ver nota 3 | **existe** (`prepago-heic`) | falta | bloqueado: el selector de galería del sistema no se automatiza |
| 4 | **Recojo en el local**: «más tarde» en efectivo se rechaza; «ya» prepago hasta entregado en el mostrador | cliente, negocio | CUS-TRK-002 (en recojo el 3.º paso es «Listo») | **existe** (`recojo`) | existe (`recojo-en-el-local`; UI) | escrito (`recojo-hasta-pago`, sin confirmar) |
| 5 | El restaurante **rechaza** el pedido (sin stock) | cliente, negocio | CUS-TRK-002 (cancelado aparte) | **existe** (`rechazo`) | falta | falta: lo hace el negocio, no la app del cliente; la app solo ve el estado |
| 6 | El restaurante **acepta** (con y sin pasar por la llamada de la cajera) | cliente, negocio | CUS-TRK-019/020 | **existe** (dentro de 1, 2, 5, 6) | existe | escrito (`pedido-contraentrega`) |
| 7 | **El cliente cancela** dentro de la ventana; tras aceptar ya no puede; un segundo pedido activo se bloquea | cliente, negocio | CUS-TRK-006 ★, CUS-CAT-018 ★ | **existe** (`cancela-cliente`) | falta | escrito (`cancelar-pedido`) |
| 8 | **Cancelación automática** por falta de pago (15 min) | cliente, sistema | CUS-TRK-005 | **existe**, solo local (`prepago-vencido`: envejece la marca y corre `cancel_expired_prepay_orders`) | falta | bloqueado: la espera real de 15 min y los temporizadores de Inngest no corren en staging |
| 9 | Motorizado: asignado → en camino → llegó → **entregado** | negocio, motorizado, cliente | CUS-TRK-002 | **existe** (dentro de 1 y 2) | existe (`driver/`) | falta: la app del motorizado aún no existe en Android |
| 10 | Motorizado: **«no se presentó»** | motorizado, cliente | CUS-TRK-022 | **existe** (`no-show`) | falta | falta |
| 11 | **Tindivo Entregas** de A a B hasta entregado | cliente verificado, motorizado | CUS-ENT-002 ★, CUS-ENT-008 ★, CUS-ENT-019 ★ | **existe**, solo local (`entregas`) | existe (`courier-pedir-desde-negocio`, `courier-directorio-y-badge`) | escrito (`entregas-portada-y-solicitud`, sin crear) |
| 12 | **Mis pedidos** y **repetir pedido** | cliente | mis-pedidos (#198 a #201) | **existe** (`mis-pedidos`) | falta (web del cliente congelada) | escrito (`mis-pedidos`; no repite) |
| 13 | **Reseña** de un pedido entregado (y la segunda se rechaza) | cliente | seguimiento (#198 a #201) | **existe** (`mis-pedidos`) | falta | falta |
| 14 | Acceso con **celular por SMS** (OTP simulado en local, código malo rechazado) | cliente nuevo | CUS-AUT-007 ★ | **existe**, solo local (`celular-sms`) | existe (`onboarding-celular`) | bloqueado: el SMS real no se automatiza |
| 15 | Acceso con **Google** | cliente nuevo | CUS-AUT-020 ★, CUS-AUT-021 ★ | bloqueado: hace falta un token de Google real | falta | escrito (`subflows/identificarse-google`; usa una sesión ya hecha) |
| 16 | **Borrar la cuenta**: 409 con un pedido en curso, 204 tras cancelar, 401 después | cliente | CUS-AUT-017 ★ | **existe**, solo local (`borrar-cuenta`) | falta | escrito (`borrar-cuenta-hasta-confirmar`, se detiene antes de borrar) |
| 17 | **La app vieja contra el servidor nuevo** (invariante 11) | app instalada, API | API-3 | **parcial** (`compat-v1`: forma de la lista y de los errores; no hay peticiones congeladas de la versión publicada) | n/a | n/a |
| 18 | Catálogo: negocio cerrado, plato fuera de franja, bolsa de otro negocio | cliente | CUS-CAT-011/012, CUS-CRT-001 | falta | existe en parte (`store`, `recojo-en-el-local`) | escrito (`invitado-hasta-identificacion` cubre carta y bolsa) |
| 19 | **Push** al cliente (estado del pedido) | cliente, sistema | CUS-NOT-001, CUS-NOT-004 | bloqueado: FCM real | n/a | bloqueado: prueba manual |
| 20 | **Comprobante rechazado dos veces**: el primer rechazo vuelve a `awaiting_payment` y deja 1 intento; el segundo cancela por `proof_rejected_final`; un pedido nuevo debe quedar bloqueado | cliente, negocio | CA-PAY-01 ★, CA-PAY-P7 ★ (CUS-PAY-005, CUS-PAY-008) | **existe** (`comprobante-rechazado`); el último paso es un rojo esperado (nota 20) | falta | falta |
| 21 | El negocio **cancela** un pedido de contraentrega ya aceptado (en `preparing`) con motivo; es terminal | cliente, negocio, motorizado | CUS-TRK-002 (cancelado aparte) | **existe** (`negocio-cancela`) | falta | falta |
| 22 | **Traspaso** de un pedido entre motorizados: motorizado2 lo pide, el dueño acepta, cambia el `driver_id` y el original ya no lo ve | motorizado, motorizado2, negocio, cliente | sin norma (nota 22) | **existe**, solo local (`traspaso`) | falta | n/a |
| 23 | El admin da de **alta, bloquea y desbloquea** un negocio | admin, negocio | sin norma en `Docs/producto/` (nota 23); se afirma el estado del bloqueo (columna y resumen del negocio), no su efecto sobre los pedidos | **existe**, solo local (`admin-negocio`) | falta | n/a |
| 24 | El admin **revisa** el caso de una apelación (bandeja y «en revisión»); `resolve` y `refund` no se ejecutan | cliente, admin | CA-PAY-01 ★ (la apelación), invariante 9 | **existe**, solo local (`admin-caso`); solo lectura de dinero (nota 24) | falta | falta |
| 25 | **Tindivo Store** público: lista, detalle de un artículo listado y slug inexistente → 404 | invitado | sin CA en `Docs/producto/` (nota 25) | **parcial** (`store`): lista, forma y 404; sin artículos en el mundo e2e no se prueba el detalle ni el filtro (nota 25) | falta | falta |
| 26 | **Invitado**: el catálogo público responde 200; cotizar y pedir sin Bearer dan 401 con el cuerpo de error del contrato | invitado | API-3 (contrato REST v1) | **existe** (`invitado`) | existe en parte (`store`) | escrito (`invitado-hasta-identificacion`) |

Notas:

3. El criterio de aceptación que fija el formato HEIC no está en el canon actual; el escenario comprueba que el servidor
   acepta `image/heic`, que lo guarda y que el pedido pasa a «validando».
17. La invariante 11 pide congelar las peticiones de cada versión publicada y correrlas en `db:cycle`
    (`Docs/README.md` §7.7, «Pruebas entre apps», punto 2). Eso no existe todavía: sin una app publicada no hay nada
    que congelar. Mientras tanto `compat-v1` comprueba que las claves que las apps leen no se pierden.
20. **Defecto conocido** (`KNOWN_DEFECTS`, paso «tras el rechazo en firme, un pedido nuevo está bloqueado»). CA-PAY-01, CA-PAY-P7 y
    CUS-PAY-008 piden impedir pedidos nuevos tras el rechazo en firme y dicen que la regla la decide el servidor; el servidor no la tiene
    (`create_customer_order` solo bloquea por pedido activo, strikes o bloqueo manual) y el bloqueo hoy vive en el cliente web
    (`apps/customer/lib/payment-block.ts`, ventana de 24 h y apelación). El paso espera el bloqueo del canon y falla hoy porque el
    servidor crea el pedido; si lo crea, el escenario lo cancela para no dejarlo activo. Decide Jesús: regla en el servidor o se corrige el CA.
    El «Te queda 1 intento» no lo manda la API: se deriva de `proofAttempt` (2 intentos, `validate_order`).
22. Sin norma: ningún `Docs/producto/` cubre al motorizado. El escenario afirma lo que hace el código (0043, 0130, 0134): lo pide el
    receptor (motorizado2), responde el dueño, y quien no es el dueño recibe 422 `validation_error`.
23. Sin norma: ningún `Docs/producto/` cubre la administración de negocios. Crea una cuenta de Auth y un negocio que la API no sabe
    borrar (por eso es solo local); el negocio nuevo no publica catálogo ni acepta pedidos web.
24. `resolve` y `refund` mueven dinero (`business_charges`, devoluciones): no se llaman sin la revisión de Jesús (invariante 9). El
    escenario crea la apelación, la lee como cliente y como admin y la pasa a `in_review` (`mark_appeal_in_review` no escribe en tablas de dinero).
    Queda un caso `in_review` sin resolver por corrida.
25. El mundo e2e no trae artículos de Store y publicar uno exige fotos en Storage. Con la lista vacía el escenario prueba la forma de la
    lista y el 404, y se registra como PARCIAL (sin artículos: no se probó el detalle ni el filtro `q`); no pone la suite en rojo.
    Con artículos, busca por un fragmento del nombre, abre el detalle por slug y comprueba que una búsqueda sin coincidencias da vacío.

## Conteo

Corrida del 2026-11-19 (`pnpm e2e:todo --reset`): 13 escenarios por la API, 82/82 pasos, 0 rojos esperados. Corrida del 2026-11-27, `pnpm e2e:todo --reset` sobre 3e761317 más estos cambios: 20 escenarios por la API, 19 ok y 1 rojo esperado (fila 20), 128/129 pasos; `store` contó como ok porque aún no había «parcial» y desde la corrección sale PARCIAL (nota 25). La corrida final, después de las correcciones de la revisión, la confirmará el commit. Filas de la matriz: 26; con la API "existe" o "parcial": 21; Maestro "escrito" (sin correr): 12; "bloqueado": 5; "falta": el resto.

## Qué falta para el «punta a punta» completo

1. **Maestro con sesión en CI**: un emulador de CI no tiene una cuenta de Google ni SMS. Hace falta una vía de entrada
   de prueba en la variante `dev` (decisión de producto) o correr los flujos con sesión en un dispositivo propio.
2. **Un modo del script para continuar un pedido hecho por la app** (`--order-id`): hoy el script crea su propio pedido;
   así el negocio y el motorizado no pueden cerrar el ciclo de un pedido que nació en Maestro.
3. **Peticiones congeladas de la app publicada** (fila 17) cuando haya una versión en las tiendas.
4. **Staging**: los escenarios que usan la service role (8, 11, 14, 16) corren solo en local. En staging faltaría una cuenta
   de cliente verificada que el seed deje preparada.
5. **Los CA de las capacidades en borrador** (#190, #198 a #201): cuando se integren, se vuelven a cruzar con esta matriz.

## Discrepancias entre el CA y el código (no se eligió ganador)

- **CUS-CAT-018 ★** dice que el segundo pedido activo en un negocio da `409 active_order_block`; el servidor responde
  `422 validation_error` con «Ya tienes un pedido activo en este restaurante». El escenario `cancela-cliente` afirma el
  bloqueo y su texto, no el código. Decide Jesús: se corrige el CA o la API (y entonces el contrato REST v1).
- Un recojo lo cierra el mostrador con `handover`, no con `deliver` (`deliver` da 409 «No autorizado» para el negocio).
- `no-show` exige 5 minutos desde la llegada: el escenario lo comprueba (409 `invalid_state_transition` antes) y envejece la marca en local; lo corre un cliente nuevo propio para que el strike no contamine a los fijos.
