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

Notas:

3. El criterio de aceptación que fija el formato HEIC no está en el canon actual; el escenario comprueba que el servidor
   acepta `image/heic`, que lo guarda y que el pedido pasa a «validando».
17. La invariante 11 pide congelar las peticiones de cada versión publicada y correrlas en `db:cycle`
    (`Docs/README.md` §7.7, «Pruebas entre apps», punto 2). Eso no existe todavía: sin una app publicada no hay nada
    que congelar. Mientras tanto `compat-v1` comprueba que las claves que las apps leen no se pierden.

## Conteo

Corrida del 2026-11-19 (`pnpm e2e:todo --reset`): 13 escenarios por la API, 80/80 pasos, 0 rojos esperados. Filas de la matriz: 19; con la API "existe" o "parcial": 14; Maestro "escrito" (sin correr): 11; "bloqueado": 5; "falta": el resto.

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
- `no-show` exige 5 minutos desde la llegada: el escenario lo comprueba (409 antes) y envejece la marca en local.
