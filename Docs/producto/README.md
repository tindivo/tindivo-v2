# Producto — índice de capacidades

> Verificado: generado por pnpm spec:indice

> **Este archivo lo genera `pnpm spec:indice` y no se edita a mano.** La verdad de cada capacidad vive en
> `Docs/producto/<id>/capacidad.md` y en sus fichas de `pantallas/`; el CI falla si este índice no está al día.

## Capacidades

| Capacidad | Nombre | Actores | Líneas | Depende de | Dinero | Pantallas | Requisitos | Criterios |
|---|---|---|---|---|---|---|---|---|
| [acceso](acceso/capacidad.md) | Acceso, términos y celular | CUS | pedidos-restaurante, entregas | — | no | 3 | 24 | 25 |
| [bolsa](bolsa/capacidad.md) | Bolsa | CUS | pedidos-restaurante | — | sí | 1 | 15 | 13 |
| [catalogo](catalogo/capacidad.md) | Catálogo y negocio | CUS | pedidos-restaurante | bolsa, direcciones | sí | 3 | 31 | 7 |
| [checkout](checkout/capacidad.md) | Confirmar pedido | CUS | pedidos-restaurante | bolsa, direcciones, pagos | sí | 1 | 31 | 12 |
| [cuenta](cuenta/capacidad.md) | Cuenta y borrado de cuenta | CUS | pedidos-restaurante, entregas | acceso, direcciones | no | 1 | 12 | 10 |
| [direcciones](direcciones/capacidad.md) | Direcciones y mapa | CUS | pedidos-restaurante, entregas | — | no | 2 | 14 | 7 |
| [entregas](entregas/capacidad.md) | Tindivo Entregas | CUS | entregas | direcciones | sí | 3 | 21 | 11 |
| [libro-reclamaciones](libro-reclamaciones/capacidad.md) | Libro de Reclamaciones virtual | CUS, ADM | pedidos-restaurante, entregas, store | web-publica | no | 0 | 16 | 13 |
| [mis-pedidos](mis-pedidos/capacidad.md) | Mis pedidos | CUS | pedidos-restaurante, entregas | seguimiento | sí | 1 | 10 | 10 |
| [notificaciones](notificaciones/capacidad.md) | Notificaciones | CUS | pedidos-restaurante, entregas | — | no | 1 | 6 | 9 |
| [pagos](pagos/capacidad.md) | Pago y comprobante | CUS, ADM | pedidos-restaurante | — | sí | 2 | 19 | 11 |
| [resenas](resenas/capacidad.md) | Reseñas | CUS | pedidos-restaurante | — | no | 1 | 4 | 7 |
| [seguimiento](seguimiento/capacidad.md) | Seguimiento del pedido | CUS | pedidos-restaurante | — | sí | 2 | 20 | 15 |
| [soporte](soporte/capacidad.md) | Soporte y legal | CUS | pedidos-restaurante, entregas, store | — | no | 2 | 6 | 9 |
| [web-publica](web-publica/capacidad.md) | Web pública de tindivo.com | CUS | pedidos-restaurante, entregas, store | — | no | 0 | 11 | 10 |

## Capacidades por línea de negocio

| Línea | acceso | bolsa | catalogo | checkout | cuenta | direcciones | entregas | libro-reclamaciones | mis-pedidos | notificaciones | pagos | resenas | seguimiento | soporte | web-publica |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| entregas | ● |  |  |  | ● | ● | ● | ● | ● | ● |  |  |  | ● | ● |
| pedidos-restaurante | ● | ● | ● | ● | ● | ● |  | ● | ● | ● | ● | ● | ● | ● | ● |
| store |  |  |  |  |  |  |  | ● |  |  |  |  |  | ● | ● |
