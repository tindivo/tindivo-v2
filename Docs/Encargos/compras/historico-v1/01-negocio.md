# 01 · El negocio de los encargos

## 1. Por qué ahora

**La demanda ya existe y no la creamos nosotros.** Jesús recibe por WhatsApp
encargos del tipo «cómprame de este lugar», a S/ 3.50: **más de 5 en una
semana, sin publicidad**. Los atiende él a mano, y eso tiene un techo: su
tiempo.

**Producción lo confirma por otro lado.** De las 3 entregas que se han hecho en
`tindivo-prod` (consulta de hoy, 6-oct), **2 fueron compras de comida en
Pollería El Sabroso**, no traslados de algo ya pagado:

| Código | Qué | Aceptar → «recogido» | Total |
|---|---|---|---|
| FS6P8XQM | Ropa, casa a casa (275 m) | 0.3 min | 13.7 min |
| KWLS43WQ | «Comida» de Pollería El Sabroso | **37 min** | 37.3 min |
| 6VADT37T | «Comida» de Pollería El Sabroso | **47.7 min** | 52.4 min |

Lo que dicen estas tres filas:

- **La gente usa Entregas para comprar**, porque es lo que necesita. Cuando el
  servicio no existe, lo fuerza en el que hay.
- **Comprar comida hecha toma 40-50 min**, casi todo esperando a que la
  preparen. Ese es el caso más caro y hay que diseñarlo aparte (`02` §4).
- En las dos compras, **«recogido» y «entregado» se marcaron en el mismo
  minuto**. El motorizado toca los botones al final, no en el momento. Los
  tiempos por etapa no son fiables, y **la herramienta tiene que funcionar
  aunque se toque tarde** (`05` §1).

## 2. Qué cambió desde el 30-sep, cuando las compras quedaron fuera

El plan consolidado con Codex (`Docs/nuevo-modelo/plan-final.md` §2) descartó
los encargos por cuatro razones. Esta propuesta las toma una por una. No las
ignora:

| Objeción del 30-sep | Sigue siendo cierta | Qué la contesta aquí |
|---|---|---|
| **«Un rechazo de S/ 30 se come el ingreso de 9 encargos»** | Sí | Tope por **historial** del celular (300 celulares con pedidos entregados en 28 días: el antifraude ya está hecho), S/ 20 al nuevo, bloqueo al que falla, devolución a la tienda aliada esa noche (`04` §3, `07` §2) |
| **«Es lo que menos rinde por minuto»** (S/ 0.08-0.12) | Sí | Solo se toma con el motorizado **libre**, nunca a costa de la comida (`02` §3). Un minuto ocioso de un turno ya pagado vale S/ 0 |
| **«Exige coordinación de Jesús»** | Hoy sí | Es justo lo que quitan las herramientas: el cliente decide antes, el motorizado tiene un guion y Jesús solo mira (`05`, `06`). Criterio duro: **≤ 15 min por noche de Jesús** |
| **«Choca con "Tindivo no retiene fondos"»** | Sí | Se matiza a sabiendas: el fondo es **de Tindivo**, no del cliente. Se cuadra cada noche (`04`) |

Y hay un hecho nuevo que el debate no tenía: **la demanda de compras ya llega
sola y la de traslados no.** Entregas lleva dos semanas encendida en producción
con 1 traslado real.

## 3. Los números

**Capacidad** (del plan del 30-sep, `tindivo-prod`, L–V): mediana de **158 min
libres de 300** por noche con un motorizado. Los huecos están **antes de las 7 pm
y después de las 9:30 pm**.

**Pedidos de comida entregados por noche, últimos 28 días** (consulta de hoy):

| | Lun | Mar | Mié | Jue | Vie | Sáb | Dom |
|---|---|---|---|---|---|---|---|
| Pedidos/noche | 12.8 | 8.6 | 14.8 | 11.5 | 18.8 | **26.8** | **24.3** |
| 7 a 9 pm (los dos picos) | 36 | 20 | 37 | 25 | 44 | **72** | **57** |

Lunes a jueves hay sitio. Viernes justo. Sábado y domingo no.

**Cuánto deja** (supuestos: 35 min por encargo, gasolina S/ 0.30 por encargo):

| Encargos por noche L–J | Ingreso semanal | Contra los ~S/ 178 netos semanales de hoy (`propuesta-claude.md` §2) |
|---|---|---|
| 3 | S/ 42 | +24 % |
| **5 (meta)** | **S/ 70** | **+39 %** |
| 7 | S/ 98 | +55 % |

5 encargos × 35 min = 175 min: cabe en los 158 min libres solo si parte de
la compra se hace **mientras** la comida se prepara. Por eso el tope es **1
encargo activo por motorizado** y se mide desde la primera noche.

**La cuenta que asusta:** una pérdida de S/ 20 (un cliente nuevo que no paga)
se come el margen de **6 encargos**. Por eso los topes y el bloqueo no son
opcionales.

## 4. El precio

**S/ 3.50 por encargo, una tienda.** **+S/ 1 por una segunda tienda.** Máximo
dos.

- Es lo que Jesús ya cobra y la gente ya paga. **No se baja para lanzar**: en un
  pueblo es fácil bajar un precio y casi imposible subirlo.
- **Mototaxis cobran ~S/ 2** por compras (informales, sin seguimiento ni
  garantía). Zorritos **no hace encargos**: es la ventaja, y no se regala.
- **Hay clientes que piden pagar S/ 1.50**, «lo que se cobra por las mañanas».
  *(D9: hay que saber qué servicio es ese.)* No se iguala. Si después de dos
  semanas el precio frena, se prueba una promo **acotada** (primer encargo a
  S/ 2.50 solo L–J) antes de tocar la tarifa.
- **Se guarda el tiempo real de cada encargo.** Si la mediana pasa de 40 min,
  el precio no alcanza y se sube a S/ 4 la comida con pedido anticipado (`02` §4).

## 5. Competencia y alianzas en una línea

**Zorritos lleva lo que el negocio ya vendió. Tindivo le trae compradores
nuevos.** Ese es el argumento de venta a las tiendas (`07` §2). Y el riesgo es
el de siempre: un directorio con teléfonos invita a saltarse a Tindivo. Por eso
el teléfono del aliado **no se publica** (D7).

## 6. Riesgos, de mayor a menor

| Riesgo | Qué pasa | Cómo se contiene |
|---|---|---|
| **Cliente que no paga o no está** | Tindivo pierde la compra | Topes por historial, bloqueo, devolución al aliado, pago al recibir solo con la bolsa en la puerta (`04` §3) |
| **Un encargo retrasa la comida** | Se daña lo que sí paga | 1 encargo activo por motorizado; no se acepta con 2 o más pedidos de comida activos; fin de semana fuera (`02` §3) |
| **El motorizado se enreda con el dinero** | El cuadre no cierra y nadie sabe por qué | La app calcula todo; el motorizado solo teclea el total y saca la foto (`05` §3.4 y §4) |
| **«No hay» en la tienda** | Viaje en vano, cliente molesto | El cliente decide **antes** qué hacer si falta algo (`03` §1) |
| **El Yape personal del motorizado** | Muchos cobros de terceros pueden activar límites o bloqueos | **No verificado.** Jesús lo comprueba antes del sábado. Plan B: el efectivo del fondo |
| **Los aliados de comida se molestan** | Pollería Nadia ve que Tindivo trae pollo de El Sabroso | Los aliados aparecen **primero** al buscar comida y nunca entran como encargo (`02` §4) |
| **Reclamos de consumo** | Producto vencido, roto o equivocado | Boleta o foto, reposición en la tienda aliada. El Libro de Reclamaciones sigue en espera (falta el RUC) |
