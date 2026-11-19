# Producto — índice de capacidades

> Verificado: generado por pnpm spec:indice

> **Este archivo lo genera `pnpm spec:indice` y no se edita a mano.** La verdad de cada capacidad vive en
> `Docs/producto/<id>/capacidad.md` y en sus fichas de `pantallas/`; el CI falla si este índice no está al día.

## Capacidades

| Capacidad | Nombre | Actores | Líneas | Depende de | Dinero | Pantallas | Requisitos | Criterios |
|---|---|---|---|---|---|---|---|---|
| [acceso](acceso/capacidad.md) | Acceso, términos y celular | CUS | pedidos-restaurante, entregas | — | no | 3 | 24 | 25 |
| [bolsa](bolsa/capacidad.md) | Bolsa | CUS | pedidos-restaurante | — | sí | 1 | 15 | 13 |
| [cuenta](cuenta/capacidad.md) | Cuenta y borrado de cuenta | CUS | pedidos-restaurante, entregas | acceso, direcciones | no | 1 | 12 | 10 |
| [direcciones](direcciones/capacidad.md) | Direcciones y mapa | CUS | pedidos-restaurante, entregas | — | no | 2 | 14 | 7 |

## Capacidades por línea de negocio

| Línea | acceso | bolsa | cuenta | direcciones |
|---|---|---|---|---|
| entregas | ● |  | ● | ● |
| pedidos-restaurante | ● | ● | ● | ● |
