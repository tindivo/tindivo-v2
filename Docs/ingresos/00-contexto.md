# 00 · Contexto común del debate

> **2026-10-07.** Es lo que leen Claude y Codex antes de debatir, para que los
> dos partan de los mismos hechos. Los números salen de consultas de **solo
> lectura** a `tindivo-prod` (`zpnipajgwfthxhdtzhly`) hechas hoy con
> `supabase db query --linked`. Lo que no es dato está marcado como
> **supuesto**.

## La pregunta de Jesús

> «Mejorar mis ingresos del negocio. No quiero que se cierren solo en
> encargos. Está bien si concluyen que no debemos seguir con encargos y hay
> otra opción que aproveche los recursos que tengo.»

Es decir: **¿qué hace Jesús, desde esta semana, para ganar más con lo que ya
tiene?** Encargos es una opción entre varias, no el tema.

## 1. El negocio hoy, en números (`tindivo-prod`)

**Pedidos de comida entregados por semana** (semana que empieza el lunes):

| Semana | Pedidos | Noches | Comisión | Delivery | **Ingreso Tindivo** | Clientes distintos |
|---|---:|---:|---:|---:|---:|---:|
| 10-ago | 72 | 6 | 108.00 | 147.00 | 255.00 | 61 |
| 17-ago | 115 | 7 | 172.50 | 234.50 | 407.00 | 97 |
| 24-ago | 117 | 7 | 175.50 | 224.00 | 399.50 | 96 |
| 31-ago | 137 | 7 | 205.50 | 267.50 | 473.00 | 123 |
| 07-sep | 137 | 7 | 204.00 | 271.00 | 475.00 | 116 |
| 14-sep | 114 | 7 | 171.00 | 227.50 | 398.50 | 97 |
| 21-sep | 123 | 7 | 183.50 | 245.00 | 428.50 | 108 |
| **28-sep** | **102** | 7 | 152.50 | 207.50 | **360.00** | 92 |
| 05-oct (2 noches) | 29 | 2 | 43.00 | 58.00 | 101.00 | 28 |

- **Ingreso por pedido: ~S/ 3.45** (comisión real **S/ 1.50**, no la S/ 1.00
  de `DECISIONS §4`; delivery medio ~S/ 1.95).
- **Ingreso bruto: ~S/ 400 a la semana, ~S/ 1 700 al mes.** **Estancado desde
  fines de agosto**, y la última semana completa fue la más baja desde
  entonces.

**Concentración por restaurante** (pedidos entregados, últimos 28 días):

| Aliado | 28 días | % | Histórico |
|---|---:|---:|---:|
| Pizza Priamo | 322 | **67 %** | 623 |
| Pollería Nadia | 86 | 18 % | 160 |
| La Florencia | 60 | 12 % | 143 |
| Al Punto | 11 | 2 % | 21 |

**Por día de la semana** (últimas 6 semanas, pedidos por noche):

| Lun | Mar | Mié | Jue | Vie | Sáb | Dom |
|---:|---:|---:|---:|---:|---:|---:|
| 14.5 | 11.5 | 15.3 | 12.5 | 19.3 | **27.0** | **22.7** |

**Por hora** (últimas 6 semanas, entregados): 18 h: 20 · 19 h: 149 · **20 h:
230** · 21 h: 187 · 22 h: 108 · 23 h: 31. Hubo **12 pedidos de mediodía**
(12–14 h) en todo el período: existen, pero son casi nada.

**Clientes:** 478 celulares distintos en la historia, **199 repiten** (2+
pedidos), **24 frecuentes** (5+).
**Ticket medio de comida:** S/ 27 (mediana S/ 24.50).
**Canal:** **86 %** de los pedidos los carga el restaurante a mano
(`business_manual`); el **14 %** entra por la web de cliente. El hábito del
pueblo es llamar o escribir al negocio.
**Cancelados (6 semanas):** 34, sobre todo cancelados por el negocio (16) y por
el cliente (11).

**Tindivo Entregas** (lanzado ~1-oct): **3 entregas** en producción.
**Tindivo Store** (segunda mano, vende Jesús): construido el 2–5 de octubre,
**no está en producción** (migraciones `0242`–`0245` solo en local).
**Tindivo Encargos:** propuesta v2 en `Docs/Encargos/compras/`, sin construir.
Fuera del sistema, Jesús atiende **más de 5 encargos por semana** por su
WhatsApp a S/ 3.50.

## 2. Los costos (sin datos en la base: supuestos a confirmar)

- **Motorizado:** sueldo fijo ~**S/ 30 por noche** (`DECISIONS §4`). Uno de
  lunes a viernes; los fines de semana salen dos (Jesús es el segundo o hay un
  segundo motorizado). **Supuesto: S/ 210–270 por semana.**
- **Motos:** dos, **propias**. Gasolina y mantenimiento: **sin dato**.
- **Infraestructura** (Supabase, Vercel, dominio): sin dato, probablemente
  bajo.
- **Supuesto de resultado:** S/ 400 de ingreso − S/ 210–270 de personal =
  **S/ 130–190 por semana antes de gasolina, mantenimiento y el tiempo de
  Jesús.** El `plan-final` de septiembre ya fijaba el equilibrio en ~10
  pedidos por noche; hoy la media es ~17.

## 3. Los recursos que Jesús tiene

| Recurso | Uso actual |
|---|---|
| **Dos motos propias** | Solo de 6 a 11 pm. **De día están paradas** |
| **Un motorizado contratado** (rotan; lo normal es una semana, el actual lleva tres) | 5 h por noche; según `plan-final`, ~158 de 300 minutos libres por noche entre semana |
| **Jesús** | Opera, sale de apoyo con la moto, programa. Un solo celular |
| **478 clientes con celular** (199 repiten) | Solo como historial de pedidos |
| **4 restaurantes aliados**, uno dominante | Pagan S/ 1.50 por pedido |
| **La plataforma** (monorepo con apps de cliente, negocio, motorizado y admin; Entregas; Store; push; realtime) | Un pueblo |
| **La marca y la confianza** en un pueblo de ~5 000 habitantes donde todos se conocen | — |
| **El conocimiento de qué abre de noche y quién tiene qué** | En la cabeza de Jesús |

## 4. Lo ya decidido o descartado (no se reabre sin dato nuevo)

- **`Docs/nuevo-modelo/plan-final.md` (30-sep, debate Claude + Codex):**
  lanzar solo Entregas a S/ 3; **encargos fuera** («es el servicio que menos
  rinde por minuto, S/ 0.08–0.12 frente a S/ 0.17 de la comida, y el que más
  coordinación le exige a Jesús»); no al fondo rotativo; no a cobrar S/ 0 al
  negocio. **Una semana después se construyó Store y se reescribió Encargos.**
- **Los restaurantes no aliados rechazan pagar S/ 1.50** (dato de Jesús,
  septiembre).
- **Tindivo no retiene fondos** (`DECISIONS`).
- **Revisión de Encargos v2 de hoy** (Claude + Codex): S/ 2.50 por encargo
  antes de gasolina y pérdidas; el reembolso de impagos abre un fraude fácil;
  el cliente de WhatsApp no recibe push; varias piezas técnicas no existen
  como dice `04`.

## 5. Lo que no se sabe y cambia la respuesta

1. El costo real semanal (personal, gasolina, mantenimiento).
2. Cuántos restaurantes y negocios abiertos de noche hay en San Jacinto que
   **no** son aliados.
3. Cuántas horas a la semana tiene Jesús, y si tiene otro trabajo o ingreso.
4. Si Pizza Priamo tiene contrato, exclusividad o alguna razón para irse.
5. Si los 478 celulares se pueden contactar (consentimiento).
6. Qué pueblos cercanos (distrito de Nepeña, provincia del Santa) se parecen
   a San Jacinto y no tienen delivery.

## 6. Datos agregados durante el debate (ronda 2, `tindivo-prod`)

Para comprobar hipótesis de `02-claude.md` §3:

- **Lo cobrado cuadra con lo registrado.** `business_charges`: S/ 3 165.00
  liquidados y S/ 156.50 pendientes (89 cargos, ~1 semana).
  `restaurant_payments` suma exactamente S/ 3 165.00. Los aliados pagan; no
  hay ingreso fantasma. Ninguno está bloqueado por deuda.
- **El fin de semana no está saturado.** Pedidos creados entre 19 y 22 h,
  últimas 6 semanas, de creado a entregado: lun–jue mediana **23.6 min** (p90
  40.8); viernes 23.3 (p90 44.4); sáb–dom **23.5** (p90 47.2). El sábado
  tiene la cola un poco más larga, pero la mediana es la misma: **no hay
  señal fuerte de pedidos perdidos por falta de motos.**
- **Cancelados en 6 semanas: 34 (~6 por semana, ~S/ 20 por semana sin
  cobrar).** Pizza Priamo concentra 21: 11 cancelados por el negocio (la
  mayoría **«Producto agotado»**, 10 en total entre todos), 5 por no aceptar
  a tiempo y 4 del cliente.

## 7. Dato de Jesús durante el debate (7-oct)

> «Salí a vender hace mucho tiempo atrás y solo 4 (mis locales actuales) me
> aceptaron. Los demás **no quieren pagar S/ 1.50** de comisión: lo ven
> difícil. Creo que **no ven el valor aún**, supongo que porque es algo nuevo:
> piensan que no les va a traer ventas.»

Consecuencia para el debate: **«salir a vender aliados» ya se hizo y no
funcionó con la oferta de entonces.** La traba no es la visita: es que el
negocio no cree que Tindivo le traiga ventas. Cualquier propuesta para sumar
restaurantes tiene que responder **cómo se le demuestra el valor antes de
pedirle que pague**, no repetir la visita con el mismo argumento.

Lo que Tindivo puede mostrar hoy (de `tindivo-prod`): **Pizza Priamo vendió
322 pedidos por Tindivo en 28 días**, a un ticket medio de ~S/ 27: del orden
de **S/ 8 000 al mes en ventas** que pasaron por Tindivo, por S/ 1.50 cada
uno (S/ 483 en comisiones). Mostrarlo a otros requiere permiso de Priamo.
