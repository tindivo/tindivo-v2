# Tindivo Entregas: llevar de A a B lo que ya está pagado

> Verificado: 2026-10-10 · entorno: `tindivo-prod` (solo lectura: `app_settings.courier`, `create_courier_order`,
> conteos) + `develop@7d00aa4` · Horario: ADR 0035 · Dinero: `Docs/negocio/dinero.md` · Nombres: `Docs/glosario.md`

## Qué es

Un motorizado recoge en un punto A algo **ya coordinado, pagado y listo** y lo lleva a un punto B dentro de San
Jacinto. Puede ser de persona a persona o de un negocio a una persona. **No compra nada**: comprar y llevar era
Encargos, y se descartó (ADR 0034).

**Por qué existe:** el motorizado ya está pagado por noche y tiene tiempo libre entre pedidos de comida; Entregas lo
usa sin competir con los restaurantes aliados.

## La referencia está en el código

Los estados y transiciones los define `COURIER_TRANSITIONS` en `packages/contracts/src/courier-status.ts`: `requested`
→ `accepted` → `heading_to_pickup` → `at_pickup` → `picked_up` → `heading_to_dropoff` → `delivered`, con `cancelled`
desde cualquier estado no terminal y `release` (el motorizado la suelta) de vuelta a `requested`. `delivered` es
terminal, igual que en los pedidos de restaurante.

## Reglas al pedir (`create_courier_order`)

- El cliente **confirma que lo que envía está permitido** y **que ya está pagado**: sin las dos casillas, no hay pedido.
- El servicio tiene que estar **encendido** (`app_settings.courier.enabled`) y **en horario**: de lunes a domingo, de
  18:00 a 23:00 (ADR 0035). El texto para el cliente vive en `courier.pausedMessage` («Atendemos de 6 a 11 pm,
  todos los días»).
- **Origen y destino dentro de la zona de cobertura** (`coverage_polygon`).
- **Un pedido activo por teléfono** (`maxActivePerPhone = 1`), salvo las cuentas exentas (`unlimitedRequesterUserIds`,
  pensada para que Jesús cargue pedidos que le llegan por WhatsApp; hoy vacía).
- El A y el B se marcan **en el mapa**, con una referencia escrita obligatoria. El origen puede ser un negocio del
  directorio (`directory_businesses`).
- **La comida preparada no va por Entregas**: el formulario no ofrece «Comida». **Por qué:** un restaurante que quiere
  entregas es un aliado por conseguir, y Entregas no debe hacerle la competencia a la comisión.

## Qué se lleva y qué no

Regla central: **solo lo que ya está coordinado, pagado y listo, hasta 5 kg**. Se llevan productos de bodega ya
pagados, medicinas comunes ya compradas **en su bolsa sellada** (decisión de Jesús), objetos pequeños que quepan en la
mochila (45 × 45 × 45 cm) y sobres sencillos. La comida preparada no (ver arriba): la lista del 19-sep la permitía y
el MVP del 30-sep la quitó del formulario. **No** se lleva dinero ni
valores, documentos de identidad, medicinas con receta retenida, **alcohol**, animales ni nada peligroso, ni nada que
el motorizado tenga que comprar. Lo frágil no se prohíbe: el cliente lo marca y el motorizado decide si puede llevarlo.
(Versión 1.0 del 2026-09-19; los términos de responsabilidad, con tope de S/ 200, son un **borrador sin revisión
legal**.)

## Cómo se pide

Aprobado por Jesús el 2026-10-07: **una sola entrada** (la tarjeta del inicio y `tindivo.com/entregas` abren lo mismo),
el **mapa del punto A primero**, y los atajos dentro del mapa: **repetir una entrega** (hasta 3 anteriores), **buscar un
lugar** por su nombre (negocios primero, luego referencias públicas) y, en el punto B, **«Usar mi dirección»**. «Listo
y pagado» se vuelve a marcar en cada envío. Recoger de un negocio del directorio llega cuando haya negocios cargados con
su contacto.

## El motorizado

- Ve las entregas en su propia sección de la app y lleva **como máximo 2 activas** (`maxActivePerDriver`).
- Si nadie la acepta en **15 minutos** (`timers.courierAcceptMinutes`), se cancela sola y sin cobro. En el punto A
  espera **5 minutos** (`timers.courierWaitMinutes`).
- Los pasos de recoger y entregar son atómicos en la base (`driver_courier_step`), para que un corte de conexión no
  deje la entrega a medio avanzar. **El cobro es obligatorio** y no puede soltar una entrega después de cobrar.

## El dinero

S/ 3 (`courier.pricing.basePrice`) que paga el cliente al motorizado: quien entrega, al recoger, o quien recibe, al
entregar. El motorizado lo rinde a Tindivo y Jesús confirma. Detalle y preguntas abiertas en `Docs/negocio/dinero.md`.

## Lo que pasa de verdad (al 2026-10-10)

**Tres entregas en total**, las tres completadas, con S/ 9.00 declarados como rendidos y sin confirmar por Jesús.
El servicio está encendido, pero casi no se usa: la apuesta actual es el hábito de pedir comida en la app (ADR 0034).
