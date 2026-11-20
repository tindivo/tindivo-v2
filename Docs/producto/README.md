# Producto — índice de capacidades

> Verificado: generado por pnpm spec:indice

> **Este archivo lo genera `pnpm spec:indice` y no se edita a mano.** La verdad de cada capacidad vive en
> `Docs/producto/<id>/capacidad.md` y en sus fichas de `pantallas/`; el CI falla si este índice no está al día.

## Capacidades

| Capacidad | Nombre | Actores | Líneas | Depende de | Dinero | Pantallas | Requisitos | Criterios |
|---|---|---|---|---|---|---|---|---|
| [bolsa](bolsa/capacidad.md) | Bolsa | CUS | pedidos-restaurante | — | sí | 1 | 15 | 13 |
| [checkout](checkout/capacidad.md) | Confirmar pedido | CUS | pedidos-restaurante | bolsa, direcciones, pagos | sí | 1 | 31 | 11 |
| [direcciones](direcciones/capacidad.md) | Direcciones y mapa | CUS | pedidos-restaurante, entregas | — | no | 2 | 14 | 7 |
| [pagos](pagos/capacidad.md) | Pago y comprobante | CUS, ADM | pedidos-restaurante | — | sí | 2 | 19 | 10 |

## Capacidades por línea de negocio

| Línea | bolsa | checkout | direcciones | pagos |
|---|---|---|---|---|
| entregas |  |  | ● |  |
| pedidos-restaurante | ● | ● | ● | ● |
