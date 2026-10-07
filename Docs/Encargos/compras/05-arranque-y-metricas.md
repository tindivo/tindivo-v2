# 05 · Arranque, métricas y cuándo se decide

## 1. Dos fases: primero las reglas, después la app

Casi todo lo que cambia la v2 son **reglas y acuerdos**, no software. Esas
cosas se pueden empezar **mañana**, mientras se construye la app, y así la
app se construye sobre lo que de verdad pasó y no sobre supuestos.

### Fase 0 · Sin código (desde el jueves 8-oct)

| Qué | Quién | Tiempo |
|---|---|---|
| Leer las reglas con el motorizado (`03`) | Jesús + motorizado | 10 min |
| Escribir la **lista de la noche**: 15-20 lugares con hora de cierre, teléfono y si aceptan Yape (`01` §6). Se le pasa al motorizado por foto o nota | Jesús | 1 h |
| Respuestas rápidas en el WhatsApp de Jesús (`03`) | Jesús | 15 min |
| El motorizado compra **con su plata**, paga a la tienda **con Yape**, cobra en la puerta y rinde S/ 2.50 cada noche. Bono de S/ 1 | Motorizado | — |
| Regla de 5 min sin respuesta y +S/ 1 solo con permiso | Los dos | — |
| **Anotar cada encargo** en una nota o en una hoja: hora del pedido, tienda, lo prometido («en 20»), hora de entrega, monto, si hubo segunda tienda, si hubo problema | Jesús | 1 min por encargo |

**En la fase 0, Jesús sigue de intermediario.** No se resuelve todavía la
dependencia, pero se gana plata con las reglas nuevas y se mide lo que
la app va a necesitar. Lo que se anota es la base de la fase 1.

### Fase 1 · La app (una a dos semanas de construcción, estimado)

En este orden. Si algo se atrasa, se corta desde abajo:

1. **Motorizado:** tarjeta con «te atiendo en X min», «Compré» con foto,
   «Llegué», cobro, cierre con S/ 2.50. **No se corta nunca.**
2. **Cliente:** la ficha de 4 cosas, «¿te sirve?», el seguimiento y las
   preguntas.
3. **Admin:** crear desde WhatsApp en menos de 1 minuto.
4. **Admin:** tablero del día y alta de la lista de la noche.
5. Arreglo del teléfono público del directorio (`04` §2.3). **Va antes de
   cargar la lista de la noche**, no después.

**Ensayo antes de encender:** 6 encargos de verdad, con plata de verdad, que
fuercen los casos: camino feliz con Yape, «en 20 min» con sí del cliente,
oferta sin respuesta, pregunta sin respuesta (cancela), segunda tienda
aceptada y restaurante con «listo en X min». Al final, **la rendición tiene
que cuadrar al céntimo** o no se enciende.

**Lanzamiento suave:** primero a los clientes que ya piden por WhatsApp, con
el enlace. Afiches y difusión solo después de dos semanas sanas.

## 2. Los números

Tindivo gana **S/ 2.50 por encargo**. La gasolina no está descontada: está
pendiente saber quién la paga (`06`).

| Encargos por semana | Tindivo | Bono del motorizado |
|---|---|---|
| **5-7 (lo de hoy, sin publicidad)** | S/ 12.50-17.50 | S/ 5-7 |
| 14 (2 por noche) | S/ 35 | S/ 14 |
| **21 (3 por noche, meta del primer mes)** | **S/ 52.50** | S/ 21 |
| 35 (5 por noche) | S/ 87.50 | S/ 35 |

Con lo de hoy es poca plata. **La apuesta es que crezca**, y crece si el
servicio es confiable: que lo que se promete se cumpla. Por eso la métrica
que más importa no es el volumen, sino **el tiempo prometido contra el real**.

## 3. Qué se mide

En la fase 0, de la hoja de Jesús. En la fase 1, de las tablas, sin preguntar
nada a nadie.

| Métrica | Meta | Alarma |
|---|---|---|
| **Encargos por semana** | Crecer cada semana | Dos semanas iguales o menos |
| **Cumplidos a tiempo** (salió antes de `start_by`) | ≥ 8 de 10 | < 7 de 10 |
| Ofertas que el cliente rechaza por el tiempo | Se registra | > 1 de 3: el motorizado promete demasiado largo o está demasiado lleno |
| Cancelados por «no contestó» | ≤ 1 de 5 | > 1 de 5: el aviso no llega o el cliente no mira |
| Con segunda tienda | Se registra | > 1 de 3: falta información en la lista de la noche |
| Tiempo de aceptado a entregado (mediana) | ≤ 35 min | > 45 min |
| **Rendición** | Al céntimo **todas** las noches | Una noche que no cuadra |
| **Pérdidas** | ≤ S/ 15 por semana | > S/ 15 |
| **Comida demorada por un encargo** | 0 | 1 |
| Encargos que entran por WhatsApp de Jesús | **Bajando** cada semana | Más de la mitad después de un mes |
| **Minutos de Jesús por noche** | ≤ 15 | > 15 tres noches |
| Clientes que repiten | Se registra | — |

## 4. Cuándo se decide

**A las dos semanas de la fase 1 encendida:**

| Resultado | Qué se hace |
|---|---|
| Crece, ≥ 8 de 10 a tiempo, rendición limpia, 0 comida demorada | **Seguir.** Difusión, afiche y QR en las tiendas de la lista |
| Operación sana pero no crece | **Cambiar una sola cosa:** más difusión si la gente no llega, o la ficha si llega y no termina |
| La operación duele (rendición que no cuadra, comida demorada, Jesús > 15 min) | **Pausar sin vergüenza**, arreglar y volver a ensayar. La demanda no se va |
| Muchas ofertas rechazadas por el tiempo | Un solo motorizado no alcanza a esa hora. Es la señal para pensar en un segundo turno o en los encargos del fin de semana |

**Lo que no se hace antes de dos semanas sanas:** catálogo de productos,
aliados de encargos con acuerdo, panel para tiendas ni app nativa.
