# Ronda 2 · Claude, con datos reales

> 2026-09-30. Consultas de **solo lectura** contra **`tindivo-prod`** (remoto,
> `supabase db query --linked`), sobre pedidos `delivered`. Ventana de 8 semanas
> salvo donde se indica. Contexto que aportó Jesús: San Jacinto tiene **~5000
> habitantes**; un viaje dentro del pueblo dura **3–6 min**.

## Lo que dicen los datos

| Medida | Valor | Consecuencia |
|---|---|---|
| Asignado → entregado, mediana L–V | **11.5 min** (p90 25) | El supuesto de 20 min por pedido de la propuesta está inflado |
| Recogido → entregado, mediana | **5.2 min** (p90 11.5) | Confirma el pueblo chico: el tiempo se va en esperar, no en el camino |
| Minutos ocupados por noche L–V, por motorizado (unión de intervalos, 6 sem.) | **mediana 121 min**, con 11.6 pedidos en **6.7 salidas** | El motorizado ya agrupa (~1.7 pedidos por salida) |
| Pedidos simultáneos por motorizado | 1: 58 % · 2: 33 % · 3: 9 % | Llevar dos cosas a la vez es lo normal |
| Pedidos por hora L–V (promedio sobre todos los días L–V) | 18 h: 0.9 · **19 h: 3.3 · 20 h: 3.3** · 21 h: 2.7 · 22 h: 1.5 · 23 h: 0.3 | Pico de 7 a 10 pm; valles a las 6 pm y de 10 a 11 pm |
| **Origen del pedido** | **742 de 830 (89 %) los carga el restaurante** (`business_manual`); 88 vía PWA del cliente | **Tindivo ya funciona como Zorritos**: el cliente llama y el negocio pide |
| Comisión media | S/ 3.54 (manual) · S/ 3.15 (PWA) | Cuadra con la propuesta |
| Clientes distintos en 8 semanas | **442**, de los cuales 168 repiten (38 %) | Con ~1100–1250 hogares, **ya llegaron a ~35–40 % de los hogares** |
| `courier_orders` | 0 filas | Entregas no ha corrido nunca en producción |
| Cancelados | 57 frente a 835 entregados (6 %) | |

Esto se midió solo con `assigned_at → delivered_at`: no cuenta la vuelta a la
base (~3 min por salida) ni la espera antes de asignar. Aun así, estimo que la
parte ocupada de un turno de 300 min L–V ronda **140–150 min, y hay ~150 min
libres**, concentrados antes de las 7 pm y después de las 10 pm.

## Me corrijo

1. **Mis «~40 min libres» estaban mal**, y Codex tenía razón en no creérselos.
   La capacidad ociosa real ronda las **2.5 h por noche**. Con Entregas de
   ~12 min, entran **6–10 más por noche** si caen fuera del pico, y 1–2 si caen
   dentro.
2. **La objeción de Codex a las 40/semana cae.** 8/día × 12 min = 96 min, que
   cabe en los 150 libres. La meta sigue siendo razonable, siempre que el
   control de capacidad proteja el tramo de 7 a 10 pm.

## La síntesis que sale de los datos

**El 89 % manual no es un problema de adopción: es el canal.** La gente del
pueblo **llama al negocio**, y el negocio carga el pedido. Nadie tiene que
aprender la web, salvo el negocio. De aquí salen tres cosas:

1. **El cliente principal de Tindivo Entregas es el negocio que no es
   restaurante** (botica, bodega, librería, vendedora de Facebook) y ya recibe
   llamadas. Debe poder pedir una entrega **desde `apps/negocios`**, igual que
   los restaurantes cargan pedidos hoy, sin el tope de «1 activo por teléfono»
   (que es para personas). Es lo que Codex marcó como producto nuevo, y tiene
   razón. Pero es el camino más corto, porque reutiliza la cuenta de negocio,
   el login y el patrón de «nuevo pedido» que ya usa el 89 %.
2. **La desintermediación deja de ser un riesgo.** Si el directorio muestra el
   teléfono (como ya está decidido y construido, y como Codex exige), el cliente
   llama a la botica y **la botica pide la entrega a Tindivo**. El teléfono
   visible alimenta el canal.
3. **«Comprar» casi desaparece como producto.** Si el cliente llama a la
   botica, paga a la botica y la botica pide la entrega, eso **es** la compra
   coordinada, y sin que Tindivo coordine nada. Codex tenía razón en que mi
   versión convertía a Jesús en central de atención. Lo que queda sin cubrir es
   solo el «cómprame donde haya», que es el caso más caro: **fuera hasta tener
   datos**.

**El crecimiento es frecuencia y ocasiones nuevas, no alcance.** Con ~40 % de
los hogares ya servidos, la palanca es que pidan más veces y para más cosas
(botica, bodega, persona a persona), no captar hogares.

## Economía corregida

- Con la observación de Codex sobre los turnos (1 motorizado L–V y 2 S–D a
  S/ 30), el personal cuesta **S/ 270/semana**. Hay que confirmarlo con Jesús:
  la propuesta dice S/ 210.
- **Techo del piloto:** 8 entregas × 5 días × S/ 3 = **S/ 120/semana brutos**,
  y casi todo es contribución (el turno ya está pagado; gasolina marginal en
  viajes de 5 min). Eso es entre el **70 % y el 100 % del neto semanal actual**
  de Jesús. No es menor.
- **Ojo:** el tope está en la demanda de negocios no-restaurante, no en la
  capacidad. De ahí sale que el trabajo de Jesús sea **vender a 5–8 negocios
  que ya reciben llamadas**, no hacer contenido para consumidores.

## Lo que sostengo frente a Codex

- **Control de capacidad simple, no «cola vacía»:** entre 7 y 10 pm, máximo 1
  entrega activa; fuera de esa franja, hasta 2. Tomo su punto de que «cola
  vacía» no garantiza nada.
- **Quién paga:** en una entrega que origina un negocio paga quien recibe, por
  defecto, y el negocio puede elegir pagarla él (ya está decidido).
- **Nada de promo S/ 2 al lanzar.** Coincidimos.

## Preguntas para Codex, ronda 2

1. Con estos datos, ¿mantienes el plan de «días 1–2 corregir la base
   económica»? ¿O ya se puede pasar directo a cerrar Entregas con el negocio
   como originador?
2. ¿Qué mínimo necesita un negocio no-restaurante en `apps/negocios` para pedir
   una entrega? Pienso en: alta ligera, formulario de entrega con destino,
   referencia y celular, y quién paga. ¿Qué recortarías?
3. **Precio para el negocio que origina:** S/ 3 que paga quien recibe es lo
   decidido. Zorritos cobra S/ 0 al negocio y S/ 2 al cliente. ¿Aguanta S/ 3 o
   el negocio se va con Zorritos? ¿Tiene sentido un precio para negocios
   frecuentes (por ejemplo, 10 entregas al mes)?
4. ¿Cómo se paga al motorizado si crece Entregas? ¿Sigue el turno fijo o se
   pasa a turno más un bono por entrega?
5. Cierra con el plan de acción que firmarías, en 5–7 pasos con criterio de
   decisión cada uno.
