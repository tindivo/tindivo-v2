# 01 · El servicio

## 1. De dónde sale

**La demanda ya existe.** Jesús recibe por WhatsApp encargos del tipo
«cómprame de este lugar»: **más de 5 en una semana, sin publicidad**, a
S/ 3.50. Y en `tindivo-prod`, 2 de las 3 primeras entregas fueron en realidad
compras en Pollería El Sabroso: la gente fuerza Entregas para comprar porque
es lo que necesita.

**El último encargo, contado por Jesús (6-oct):**

> 10:19 pm. Un cliente quiere medio pollo de cierta pollería. No tenían su
> número, así que el motorizado fue a preguntar: no había. El cliente pidió de
> otra, que estaba cerrada (Jesús lo sabía). Al final se compró en la de un
> amigo que Jesús recomendó. Entregado a las 10:54. S/ 39 de pollo, S/ 3.50
> de servicio. El cliente, sobre el precio: «normal».

Lo que enseña:

- **El tiempo se fue en buscar**, no en preparar ni en manejar. Con el teléfono
  de cada pollería, la primera vuelta era una llamada de 30 segundos.
- **Lo que salvó el encargo fue lo que sabe Jesús**: qué está abierto y quién
  tiene. Mientras eso viva en su cabeza, el motorizado depende de él (§6).
- **S/ 3.50 no frenó al cliente**, aunque fueron 35 minutos de trabajo.

## 2. Precio

- **S/ 3.50 por encargo.** Es el único precio que se anuncia.
- **+S/ 1 solo si hace falta ir a una segunda tienda**, y solo si el cliente
  lo acepta en ese momento: *«En la Pollería X no hay. ¿Buscamos en la Y? Son
  S/ 1 más.»* Si dice que no, se cancela sin cobro. **Nunca más de dos tiendas.**
- **No se baja para lanzar.** La costumbre de pagar S/ 1.50 es la de los
  mototaxis **de día**, por una compra en una sola tienda. De noche, con
  seguimiento y con alguien que responde, es otro servicio. En un pueblo es
  fácil bajar un precio y casi imposible subirlo.

## 3. Cuándo y cuánto

- **Todos los días, de 6 a 11 pm**, el horario de Tindivo. Los pedidos se
  reciben hasta las **10:30 pm**: las tiendas cierran de 10 a 11 y aceptar más
  tarde es mandar al motorizado a una puerta cerrada. Todo va en
  `app_settings`.
- **Tope de compra: S/ 50** por encargo (el más grande hasta hoy fue de S/ 39).
  Configurable.
- **1 encargo activo por motorizado.** El siguiente se puede aceptar con
  tiempo («te atiendo en 30 min»), pero no se hacen dos compras a la vez.
- **1 encargo activo por celular de cliente.** Puede tener a la vez un pedido
  de comida.
- **La comida de Tindivo va primero.** No se bloquea el encargo: el motorizado
  ocupado propone un tiempo más largo y el cliente decide si espera (§5).

## 4. Qué se compra y qué no

| Sí | No |
|---|---|
| Comida de restaurantes **que no son aliados** de Tindivo | Comida de un **aliado** (Pizza Priamo, Pollería Nadia, Al Punto, La Florencia): se manda a su carta, que llega antes y paga su comisión |
| Botica: lo de venta libre, pañales, higiene | Medicamentos **con receta** |
| Bodega y minimarket: abarrotes, bebidas, limpieza | **Alcohol y cigarros** *(decidido por defecto: ver `06`)* |
| Librería, pastelería, panadería | Lo que no entra en la mochila o pasa los **5 kg** (balón de gas, bidones) |
| | Recargas, pagos, giros: **no se lleva dinero** |
| | Más de **S/ 50** en productos |

El motorizado **puede negarse** a algo que no sabe cómo llevar (una torta sin
caja, por ejemplo). Lo dice antes de comprar.

## 5. El flujo, de punta a punta

### 5.1 El cliente pide

Dos entradas, con el mismo resultado: **una ficha en el sistema con su código**.

- **Por la web** (tindivo.com/encargos): **qué** quiere (texto libre, y una
  foto opcional), **de dónde** (una tienda de la lista, «donde haya» o una que
  escribe a mano), **a dónde** (el mismo mapa con referencia que Entregas) y
  **cómo paga** (Yape, o efectivo y con cuánto). Cuatro cosas, una pantalla.
- **Por WhatsApp** (hoy, la mayoría): Jesús responde con el enlace o llena la
  ficha él mismo **en menos de un minuto** y le pasa al cliente su enlace de
  seguimiento. El encargo queda a nombre del **celular del cliente**, no de
  Jesús.

**Regla de oro: la moto no se mueve hasta que la ficha existe y el cliente
aceptó el tiempo.** El 6-oct el motorizado salió a preguntar por un pollo
antes de que nadie confirmara nada.

### 5.2 «Te atiendo en X min» (la idea de Jesús)

Al motorizado le llega el encargo con cinco botones:

> **Ahora · 10 min · 20 min · 30 min · No puedo**

- **Ahora** → el encargo es suyo y arranca.
- **10, 20 o 30 min** → el cliente ve *«Te atendemos en 20 min. ¿Te sirve?»*
  y responde **Sí, espero** o **No, gracias**. Si no responde en **5 min**, se
  cancela sin cobro.
- **No puedo**, o nadie responde en 15 min → se cancela sin cobro, con un
  mensaje honesto.

Una vez aceptado, **el cliente y el motorizado ven la misma cuenta
regresiva**. Si llega a cero y el motorizado no ha salido a comprar:

- el cliente ve *«Se está demorando»* y un botón **Cancelar sin costo**;
- el motorizado puede pedir **una sola prórroga** de +10 min, y el cliente la
  ve.

Para Jesús es el control más barato que existe: **lo prometido contra lo
real**, encargo por encargo y motorizado por motorizado (`05` §3).

### 5.3 Restaurantes: «listo en X min»

1. El motorizado **llama** al restaurante (el teléfono está en la lista de la
   noche, §6) y hace el pedido.
2. El restaurante dice «20 minutos». El motorizado toca **+20** y aparece una
   cuenta regresiva en su tarjeta. **Mientras tanto hace otros pedidos.**
3. Faltando 3 minutos, la app le avisa que vuelva.
4. El cliente ve *«Tu pedido se está preparando en la Pollería X. Listo aprox.
   8:20.»*

**Desde que el restaurante empieza a cocinar, el cliente ya no puede cancelar
gratis**: la comida existe y alguien la tiene que pagar. Se le avisa antes de
que el motorizado haga la llamada.

### 5.4 En la tienda

- Si algo **no hay**, el motorizado pregunta **desde la app**: foto de la
  alternativa, precio y una línea de texto (*«Solo hay de caja de 6, S/ 7»*).
  El cliente ve la pregunta en su seguimiento, con push, y toca **Sí** o
  **No**.
- **5 min sin respuesta → se cancela sin cobro** (regla de Jesús). Por eso
  **las preguntas se hacen antes de pagar en caja**: si se cancela, no queda
  nada comprado.
- Si la tienda no tiene nada, se ofrece la segunda tienda (+S/ 1, §2) como
  pregunta.
- **No hay chat.** Si hace falta hablar, el cliente tiene a Jesús en WhatsApp
  (mientras sea la entrada). El motorizado no da su número (`03`).

### 5.5 «Compré»

El motorizado registra tres cosas: **cuánto pagó**, **con qué** (Yape o
efectivo) y **una foto** (la constancia de Yape o lo comprado sobre el
mostrador). Al cliente le llega *«Compra lista: S/ 27.30 + S/ 3.50 = S/ 30.80»*
con la foto, **antes** de que el motorizado llegue. En la puerta no hay
sorpresas.

### 5.6 En la puerta

- Toca **«Llegué»** y al cliente le llega un aviso. Espera **5 min**.
- **Cobra el total.** Si es Yape, entrega solo cuando ve el ingreso **en su
  propio celular**, nunca por una captura que le enseñen (el fraude más común,
  según la investigación de Rappi). Si es efectivo, la app le dice el vuelto.
- **No se fía.** Sin el pago completo, la bolsa no se entrega.

## 6. Lo que sabe Jesús, escrito una vez

Lo que salvó el último encargo fue saber **qué restaurantes atienden de
noche**. Se escribe una sola vez y vive en la app del motorizado:

| Lugar | Rubro | Atiende hasta | Teléfono | Yape | Nota |
|---|---|---|---|---|---|
| *(lo llena Jesús)* | Pollería | 10:30 pm | 9xx… | Sí | «Los martes no abre» |

Es la **lista de la noche**. Va en `directory_businesses` (`04` §2.4), con el
teléfono **visible solo para el motorizado**. Con 15 o 20 lugares cubre la
mayoría de los encargos, y le toma a Jesús una hora como mucho.

## 7. Los casos difíciles

| Caso | Respuesta | ¿Se cobra? |
|---|---|---|
| No hay en la tienda y el cliente acepta otra | Segunda tienda, +S/ 1 para el motorizado | Sí, S/ 4.50 |
| No hay y el cliente no acepta otra, o no contesta en 5 min | Se cancela antes de comprar nada | No |
| Hay, pero más caro de lo que el cliente esperaba | Si pasa de S/ 5 de diferencia, se pregunta | Sí |
| Lo comprado pasaría del tope de S/ 50 | Se pregunta qué dejar; 5 min sin respuesta = se cancela | Según lo que quede |
| El cliente cancela cuando el restaurante ya cocinó | Lo compra el motorizado, lo paga el cliente. Si no paga, pérdida y bloqueo (`02` §5) | Sí |
| El cliente no está en la puerta | «Llegué» + 5 min. Si no aparece, el motorizado vuelve con la bolsa | Pérdida de Tindivo, celular bloqueado |
| No quiere pagar («no era eso») | Si se compró lo que pidió o aprobó, la foto lo muestra. Si no paga, vuelve con la bolsa | Ídem |
| El motorizado compró otra cosa sin preguntar | El cliente paga solo lo correcto | Lo pierde el motorizado si se repite (`02` §5) |
| Paga con captura de Yape «ya te mandé» | No se entrega hasta verlo en el celular del motorizado | — |
| El motorizado no encuentra la tienda que escribió el cliente | Pregunta en la app; si no hay respuesta, se cancela | No |
