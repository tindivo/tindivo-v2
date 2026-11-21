# Producto — índice de capacidades

> Verificado: generado por pnpm spec:indice

> **Este archivo lo genera `pnpm spec:indice` y no se edita a mano.** La verdad de cada capacidad vive en
> `Docs/producto/<id>/capacidad.md` y en sus fichas de `pantallas/`; el CI falla si este índice no está al día.

## Capacidades

| Capacidad | Nombre | Actores | Líneas | Depende de | Dinero | Pantallas | Requisitos | Criterios |
|---|---|---|---|---|---|---|---|---|
| [bolsa](bolsa/capacidad.md) | Bolsa | CUS | pedidos-restaurante | — | sí | 1 | 15 | 13 |
| [catalogo](catalogo/capacidad.md) | Catálogo y negocio | CUS | pedidos-restaurante | bolsa, direcciones | sí | 3 | 31 | 7 |
| [direcciones](direcciones/capacidad.md) | Direcciones y mapa | CUS | pedidos-restaurante, entregas | — | no | 2 | 14 | 7 |
| [entregas](entregas/capacidad.md) | Tindivo Entregas | CUS | entregas | direcciones | sí | 3 | 21 | 11 |
| [libro-reclamaciones](libro-reclamaciones/capacidad.md) | Libro de Reclamaciones virtual | CUS, ADM | pedidos-restaurante, entregas, store | web-publica | no | 0 | 16 | 13 |
| [mis-pedidos](mis-pedidos/capacidad.md) | Mis pedidos | CUS | pedidos-restaurante, entregas | seguimiento | sí | 1 | 10 | 10 |
| [resenas](resenas/capacidad.md) | Reseñas | CUS | pedidos-restaurante | — | no | 1 | 4 | 7 |
| [seguimiento](seguimiento/capacidad.md) | Seguimiento del pedido | CUS | pedidos-restaurante | — | sí | 2 | 20 | 15 |
| [soporte](soporte/capacidad.md) | Soporte y legal | CUS | pedidos-restaurante, entregas, store | — | no | 2 | 6 | 9 |
| [web-publica](web-publica/capacidad.md) | Web pública de tindivo.com | CUS | pedidos-restaurante, entregas, store | — | no | 0 | 11 | 10 |

## Capacidades por línea de negocio

| Línea | bolsa | catalogo | direcciones | entregas | libro-reclamaciones | mis-pedidos | resenas | seguimiento | soporte | web-publica |
|---|---|---|---|---|---|---|---|---|---|---|
| entregas |  |  | ● | ● | ● | ● |  |  | ● | ● |
| pedidos-restaurante | ● | ● | ● |  | ● | ● | ● | ● | ● | ● |
| store |  |  |  |  | ● |  |  |  | ● | ● |
