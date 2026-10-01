# Ronda 1 · Claude

> 2026-09-30. Crítica a `../propuesta-claude.md`, leída contra lo ya decidido
> (`Docs/Encargos/04-decisiones-abiertas.md`) y lo ya construido en la rama
> `tindivo-courier` (Tindivo Entregas: backend + flujo cliente, a medio pulir).

## Tesis en una línea

La propuesta acierta en el diagnóstico (el hueco es L–V y el turno ya está
pagado) pero **sobreestima la capacidad ociosa, subestima el riesgo de
canibalizar a los partners y mete demasiado producto para una persona**. Lo que
propongo: terminar Entregas, añadir «compras» **sin que Tindivo adelante dinero**
y convertir a los negocios en **quienes originan** pedidos, no solo en proveedores.

## 1. La cuenta de capacidad no cierra con 1 motorizado

- 13 pedidos × 20 min = 4.3 h de un turno de 5 h → **al motorizado pagado le
  sobran ~40 min por noche**, es decir, 1–2 servicios extra, no 6–8.
- Las «10 horas-motorizado» salen de que Jesús maneje toda la noche. Eso es
  justo el tiempo que necesita para la app móvil. No es capacidad ociosa: es el
  fundador subsidiando la flota.
- La demanda de comida no es plana: se concentra (supongo 7–9 pm; **hay que
  medirlo**). Lo ocioso está en los bordes (6–7 pm, 10–11 pm) y en los martes.
  Un encargo de 40 min que cae a las 8 pm retrasa dos pedidos de comida, y ya
  está decidido que la meta es **0 pedidos de restaurante demorados por una
  entrega**.

**Consecuencia:** los productos nuevos deben ser **de relleno por diseño**:
solo se aceptan si la cola de comida está vacía, con un tope de 1 activo
cuando hay un solo motorizado. La meta de +4–6/día hay que validarla contra
horas reales, no contra promedios.

## 2. La métrica correcta es soles por minuto, no soles por pedido

| Servicio | Ingreso | Minutos | S/ por minuto |
|---|---|---|---|
| Comida | S/ 3.40 | ~20 | **0.17** |
| Envío a S/ 2 | S/ 2.00 | ~20 | 0.10 |
| Envío a S/ 3 | S/ 3.00 | ~20 | 0.15 |
| Encargo a S/ 3.50 | S/ 3.50 | 30–45 | 0.08–0.12 |

Los dos productos nuevos rinden menos por minuto que la comida. Solo tienen
sentido **en minutos que de otro modo se pierden**. Por eso, S/ 2 en el envío
solo se justifica como precio de relleno, y un encargo a S/ 3.50 es el peor
negocio de la tabla si se come minutos de pico.

## 3. S/ 2 al negocio con S/ 0 abre un arbitraje contra los partners

La propuesta ve el riesgo de que el partner **se queje**, pero no el de que
**se escape**. Si «Enviar» cuesta S/ 2 al cliente y S/ 0 al negocio, un
restaurante partner puede atender por teléfono y pedir un «envío»: ahorra su
S/ 1.50, y Tindivo pasa de cobrar S/ 3.50–4 a S/ 2 por el mismo viaje. Es
exactamente el modelo de Zorritos, construido por Tindivo contra sí mismo.

**Propuesta:**
- **La comida preparada no va por Enviar**, ni desde un partner ni desde un
  restaurante sin alianza. Un restaurante que quiere envíos es un partner por
  conseguir, y así lo dice la misma propuesta en el §5.5.
- **Precio de lista S/ 3** (lo ya decidido y construido). El S/ 2 se usa como
  **promo de valle** (L–V, o «primer envío») y no como precio base: en un pueblo
  es fácil bajar un precio y casi imposible subirlo.
- Hay que medir el precio real que aguanta el mercado con 2 semanas de S/ 3
  más la promo. La regla ya escrita en `04` (≥ 40/semana → mantener) sirve.

## 4. «Comprar» sin que Tindivo adelante un sol: la compra coordinada

El fondo rotativo de S/ 100 contradice un principio fundacional
(`DECISIONS`: *Tindivo no retiene fondos*). Además pone a Jesús a financiar a
desconocidos, depende de los límites de un Yape personal y abre el caso
«rechazado en puerta» con la bolsa ya comprada.

**Alternativa:** que **el cliente le pague a la tienda**, no al motorizado.
1. El cliente pide «Cómprame X en la Botica Y» (o «donde haya»).
2. El motorizado (o la tienda, si es Punto) confirma stock y precio con una
   plantilla.
3. El cliente **yapea a la tienda** (su QR sale en la ficha del pedido) y sube
   la captura, igual que el comprobante que ya existe en comida.
4. Desde ahí el pedido es **una Entrega normal**: ya está pagado y listo, así
   que se recoge y se lleva. Solo se cobra el transporte, con el flujo de dinero
   que ya está construido.

Lo que se gana: cero riesgo de crédito, sin fondo, sin cuadre nuevo, y la
tabla y la máquina de estados de `courier_requests` casi sirven tal cual (un
paso previo, «esperando pago a la tienda»). Lo que se pierde: un paso más y
unos minutos de coordinación antes de salir. **Pero esos minutos son del
cliente y de la tienda, no del motorizado**, que es el recurso escaso.
El fondo rotativo queda como V2 si los datos muestran que el paso de pago mata
la conversión.

## 5. El canal que falta: el negocio como origen del pedido

Zorritos gana porque **el negocio origina** el pedido: el cliente llama a la
tienda y la tienda pide el delivery. La propuesta trata a los Puntos como
proveedores de encargos, pero el volumen realista entre semana está en las
**farmacias, bodegas y vendedoras de Facebook que ya reciben llamadas y no
tienen quién entregue**. Para ellos, Tindivo Entregas a S/ 3 que paga quien
recibe **es el producto**, y lo tienen que poder pedir en 20 segundos desde el
celular, sin cuenta de cliente. Eso ataca de raíz el problema de «la gente no
sabe entrar a la web»: quien entra es el negocio, que sí aprende.

## 6. Qué cortaría de la V1

- **Fuera:** la autocorrección por palabras clave (un solo selector «¿Hay que
  pagar algo?» basta), la comunidad de WhatsApp «¿Quién lo tiene?», la
  gamificación con puntos, los pedidos programados, la agrupación por zona, el
  ranking, los sellos y los referidos.
- **Dentro:** Entregas terminada y activada L–V; compra coordinada como
  variante de Entregas; el alta de negocio que pide envíos; y la medición de
  tiempos por estado (ya existe en el esquema).
- **Antes de programar compras:** Jesús hace **10 compras coordinadas a mano**
  (por WhatsApp y con cronómetro), tal como plantea la Fase 0. Si el paso
  «yapea a la tienda» no funciona en la vida real, se sabrá sin haber escrito
  código.

## 7. Nombres

«Tindivo Recojos» choca con el **recojo en tienda** que ya está en producción
(126 apariciones en `apps/customer`). Ya está decidido **«Tindivo Entregas»**
hacia el usuario y `courier` en el código. Para comprar: el verbo «Comprar» en
el botón, y en el código un `kind` dentro de `courier_requests`, no un producto
aparte.

## Preguntas para Codex

1. ¿Los datos reales (pedidos por hora L–V, minutos por pedido) confirman o
   tumban mi estimación de ~40 min libres por noche?
2. ¿La compra coordinada (cliente → Yape de la tienda) te parece viable en un
   pueblo, o es fricción que mata la conversión?
3. ¿Dónde está el ingreso de verdad: en los productos nuevos o en el costo fijo
   de la flota (S/ 30/noche) y en subir la comida L–V?
