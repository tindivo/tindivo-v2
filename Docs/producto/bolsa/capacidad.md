---
id: bolsa
nombre: Bolsa
actores: [CUS]
lineas: [pedidos-restaurante]
depende_de: []
dinero: true
codigo:
  web: [apps/customer/lib/cart.ts, apps/customer/lib/cart-refresh.ts, apps/customer/lib/cart-validation.ts]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/cart/Cart.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/cart/CartStore.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/cart/CartSnapshot.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/cart/CartSerializer.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/cart/ModifierSelection.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/cart/Money.kt]
  ios: []
  backend: [packages/contracts/src/cart.ts, packages/contracts/src/requests.ts, packages/contracts/src/client-requests.ts]
operaciones: []
reglas: [CART_MAX_LINES, CART_MAX_QUANTITY, CART_MAX_MODIFIERS, checkModifierSelection, DELIVERY_METHODS]
---

# Bolsa

> Verificado: 2026-11-18 · entorno: develop@77670173 (código) · Aprobado por Jesús el 2026-11-18 (conversación con Claude Code: «apruebo la bolsa»)

## Antes de tocar

- Es la bolsa del cliente: los platos de **un solo negocio** que va a pedir, con cantidades, opciones y nota. Vive en el
  dispositivo; el servidor no la conoce hasta el pedido (`createOrder`, capacidad checkout).
- `dinero: true`: muestra montos (precio de línea, subtotal, total de «Continuar»). Son **solo para mostrar**: el
  servidor recalcula y cobra. Aun así, todo cambio aquí pasa por Codex.
- El subtotal se calcula **exacto** (decimal, nunca `float`) y **ningún precio se redondea**: un precio con más de dos
  decimales es un dato roto y se rechaza (decisión de Jesús, 2026-11-18). La web suma con `float` y redondea para
  mostrar; la web del cliente se apaga y no se corrige.
- El método de entrega (delivery o recojo) **se elige en el checkout**; la bolsa solo lo recuerda y lo muestra como
  etiqueta (decisión de Jesús, 2026-11-18).
- Los topes viven en `packages/contracts` (`CART_MAX_*`); Android los copia; el vector compartido que lo comprobará
  (`packages/contracts/fixtures/vectores/bolsa.json`) llega con el PR de Android (CA-CRT-06, CA-CRT-09).
- Lo que comprueba el checkout antes de pagar (sesión, celular, dirección, pago pendiente: antes CUS-CRT-008) es de la
  capacidad checkout y migra con ella.
- Trampa conocida: la validación contra la carta **no** se guarda; se repite al abrir la bolsa.
- iOS aún no empieza: `codigo.ios` vacío.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-CRT-001 | La bolsa debe pertenecer a un solo negocio; al agregar un plato de otro, la app debe pedir confirmación y, si se acepta, reemplazarla entera. | `Docs/trabajo/app-cliente/requisitos/CRT.md` · `apps/customer/lib/cart.ts` | ★ |
| CUS-CRT-002 | Cuando se agrega una línea idéntica (mismo plato, mismas opciones en cualquier orden, misma nota recortada), la app debe fusionarla sumando la cantidad. | `apps/customer/lib/cart.ts` · `feature/cart/Cart.kt` | |
| CUS-CRT-003 | La app debe permitir cambiar la cantidad o quitar una línea; con cantidad 1, «−» quita la línea. Al quedar vacía, la bolsa se reinicia (negocio, validación y método). | Canvas v3.1, tablero «4 · Bolsa» · Decisión de Jesús, 2026-11-18 | |
| CUS-CRT-004 | La app debe guardar la bolsa en el dispositivo entre sesiones, sin guardar la validación. | `apps/customer/lib/cart.ts` · `feature/cart/CartStore.kt` | |
| CUS-CRT-005 | Al abrir la bolsa, la app debe validarla contra la carta vigente (plato eliminado, agotado, fuera de franja, precio cambiado, opción retirada) y no dejar continuar hasta que se quiten las líneas inválidas. Si la carta no responde, «Continuar» no avanza y se ofrece «Reintentar» (decisión de Jesús, 2026-11-26). Si un importe del servidor no se puede mostrar, la línea muestra «—», y mientras haya una línea así el «Subtotal» y la píldora de «Continuar» también muestran «—», nunca un total parcial (decisión de Jesús, 2026-11-27); la línea se puede quitar, la bolsa avisa y no se continúa hasta resolverlo. En la ficha de un plato con un importe así, «Agregar» y «Guardar» se bloquean (decisión de Jesús, 2026-11-26). | `apps/customer/lib/cart-validation.ts` · `getBusiness` | ★ |
| CUS-CRT-006 | La app debe calcular el subtotal de forma exacta, sin redondear ningún precio; un precio con más de dos decimales se rechaza. | Decisión de Jesús, 2026-11-18 · `feature/cart/Money.kt` | |
| CUS-CRT-007 | La app debe recordar el método de entrega por bolsa (por defecto delivery) y mostrarlo como etiqueta; se elige en el checkout. | Decisión de Jesús, 2026-11-18 | |
| CUS-CRT-009 | Cuando «Continuar» no se pueda tocar, la app debe decir por qué. | Incidente del 2026-09-09 · `apps/customer/features/cart/components/cart-ctas.tsx` | |
| CUS-CRT-010 | En una bolsa de recojo, la etiqueta debe decir «Recojo» y no mostrar el envío. | Canvas v3.1, tablero «4 · Bolsa» | |
| CUS-CRT-011 | La app debe respetar los topes `CART_MAX_LINES`, `CART_MAX_QUANTITY` y `CART_MAX_MODIFIERS`, los mismos que valida el servidor. | Decisión de Jesús, 2026-11-18 (fuente única en `packages/contracts`) | |
| CUS-CRT-012 | «Volver a pedir» debe reponer la bolsa con los platos de un pedido anterior, revalidados contra la carta vigente. | `getCustomerReorder` · `CRT.md` (defecto 6) | |
| CUS-CRT-013 | Al quitar una línea, la app debe ofrecer «Deshacer» durante 5 s, que la devuelve a su sitio con su cantidad. | Canvas v3.1, tablero «4 · Bolsa» | |
| CUS-CRT-014 | La app debe permitir «Editar» una línea con opciones: abre el plato con lo elegido y, al guardar, reemplaza la línea. | Canvas v3.1, tablero «4 · Bolsa» | |
| CUS-CRT-015 | El botón «Continuar» debe mostrar el mismo monto que el subtotal. | Canvas v3.1, tablero «4 · Bolsa» | |
| CUS-CRT-016 | La app debe permitir vaciar la bolsa, con confirmación. | Canvas v3.1, tablero «4 · Bolsa» | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-CRT-01 | Dado una bolsa con dos platos del negocio A, cuando se agrega un plato del negocio B y se acepta el reemplazo, entonces la bolsa queda solo con el plato de B y el método vuelve a delivery; si se cancela, la bolsa no cambia. | CUS-CRT-001, CUS-CRT-007 |
| CA-CRT-02 | Dado una línea con opciones [a, b] y nota « sin ají », cuando se agrega el mismo plato con opciones [b, a] y nota «sin ají», entonces queda una sola línea con la cantidad sumada. | CUS-CRT-002 |
| CA-CRT-03 | Dado una línea con cantidad 1, cuando se toca «−», entonces la línea se quita; si era la última, la bolsa queda vacía sin negocio ni método. | CUS-CRT-003 |
| CA-CRT-04 | Dado una bolsa guardada, cuando la app se cierra y se vuelve a abrir, entonces las líneas y el método siguen y la validación no. | CUS-CRT-004 |
| CA-CRT-05 | Dado una bolsa con un plato que la carta vigente marca agotado o con otro precio, cuando se abre la bolsa, entonces se avisa en esa línea y «Continuar» no avanza hasta quitarla. | CUS-CRT-005 |
| CA-CRT-06 | Dado el vector compartido de montos, entonces en Android (y en iOS cuando empiece) el subtotal de cada caso es exactamente el del vector y un precio con tres decimales se rechaza. La web del cliente queda fuera: suma con `float`, redondea y no se corrige porque se apaga. Lo prueba el PR de Android, que trae el vector. | CUS-CRT-006 |
| CA-CRT-07 | Dado un negocio cerrado, cuando se abre su bolsa, entonces «Continuar» no avanza y dice «El restaurante está cerrado ahora». | CUS-CRT-009 |
| CA-CRT-08 | Dado una bolsa con el método recojo, entonces la etiqueta dice «Recojo» y no aparece la fila del envío. | CUS-CRT-010 |
| CA-CRT-09 | Dado el vector compartido de topes, entonces la bolsa no deja pasar de `CART_MAX_LINES` líneas, `CART_MAX_QUANTITY` unidades ni `CART_MAX_MODIFIERS` opciones, y el servidor rechaza con 422 el mismo exceso. | CUS-CRT-011 |
| CA-CRT-10 | Dado tres líneas, cuando se quita la segunda y se toca «Deshacer» antes de 5 s, entonces vuelve en la segunda posición con su cantidad y el subtotal regresa; pasados 5 s ya no se puede. | CUS-CRT-013 |
| CA-CRT-11 | Dado una línea con opciones, cuando se edita y se guardan otras opciones, entonces la línea cambia en su sitio; si queda idéntica a otra, se fusionan. | CUS-CRT-014, CUS-CRT-002 |
| CA-CRT-12 | Dado cualquier cambio de cantidad, quitar o deshacer, entonces el monto de «Continuar» es igual al subtotal. | CUS-CRT-015 |
| CA-CRT-13 | Dado una bolsa con líneas, cuando se toca «Vaciar» y se confirma, entonces queda vacía; si se cancela, no cambia. | CUS-CRT-016 |
| CA-CRT-14 | Dado que la carta no responde al abrir la bolsa, cuando se toca «Continuar», entonces no avanza y se ofrece «Reintentar»; al responder la carta, la validación se repite. | CUS-CRT-005 |
| CA-CRT-15 | Dado una bolsa con una línea cuyo importe del servidor no se puede mostrar, cuando se abre la bolsa, entonces esa línea muestra «—» con la etiqueta «Precio no disponible», el «Subtotal» y la píldora de «Continuar» muestran «—», la línea se puede quitar y «Continuar» no avanza mientras siga en la bolsa. | CUS-CRT-005, CUS-CRT-015 |
| CA-CRT-16 | Dado un plato cuyo importe del servidor no se puede mostrar, cuando se abre su ficha (desde la carta, o con «Editar» desde la bolsa), entonces «Agregar» o «Guardar · —» está bloqueado. | CUS-CRT-005, CUS-CRT-014 |

## Reglas

- Topes de la bolsa: `CART_MAX_LINES`, `CART_MAX_QUANTITY` y `CART_MAX_MODIFIERS`.
- Selección de opciones válida: `checkModifierSelection`.
- Métodos de entrega: `DELIVERY_METHODS`.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 1 | CUS-CRT-003 | En Android «−» queda deshabilitado con cantidad 1. | `feature/cart/CartViewModel.kt` · `feature/cart/CartScreen.kt` |
| 2 | CUS-CRT-005 | Android no valida la bolsa contra la carta; solo recibe avisos del servidor al cotizar. | `feature/cart/` |
| 3 | CUS-CRT-007 | Android no guarda el método de entrega en la bolsa. | `feature/cart/Cart.kt` · `feature/cart/CartSnapshot.kt` |
| 4 | CUS-CRT-009 | En Android «Continuar» nunca se deshabilita ni dice por qué. | `feature/cart/CartScreen.kt` |
| 5 | CUS-CRT-010 | Android no muestra la etiqueta de recojo en la bolsa. | `feature/cart/CartScreen.kt` |
| 6 | CUS-CRT-011 | Los topes son números sueltos en Kotlin y en el contrato, sin fuente común. | `feature/cart/Cart.kt` · `packages/contracts/src/client-requests.ts` |
| 7 | CUS-CRT-012 | «Volver a pedir» solo abre el negocio en la web. **Resuelto en Android** (repone la bolsa con `getCustomerReorder`, avisa de lo que cambió y pregunta antes de vaciar la bolsa de otro negocio); pendiente en la web, que se apaga (D-27). | `feature/orders/ReorderViewModel.kt` · `apps/customer` |
| 8 | CUS-CRT-013, CUS-CRT-014, CUS-CRT-015 | «Deshacer», «Editar» y el monto en «Continuar» no existen en ninguna app. | `feature/cart/CartScreen.kt` |
