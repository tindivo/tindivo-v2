# Cómo ganar más con lo que ya hay · Conclusión (Claude + Codex)

> **2026-10-07.** Sale de tres rondas de debate (`debate/01` a `03`) y de una
> auditoría de Codex sobre el borrador (`debate/04-codex-auditoria.md`, firmada
> con cambios, todos aplicados aquí). Parte de datos de **solo lectura** de
> `tindivo-prod` (`00-contexto.md`) y de un dato que dio Jesús a mitad del
> debate: los restaurantes que no son aliados ya dijeron que no a S/ 1.50
> porque no creen que Tindivo les traiga ventas.
> **Pendiente de aprobación de Jesús.** Lo que decide él está en §8 y §9.

> **Actualización de Jesús, 7-oct (después del debate):** los encargos se
> dejan del todo, también por WhatsApp (§4 queda sin efecto). La apuesta es
> sumar pedidos de comida creando hábito en la app: repetir rápido,
> autocompletados y promociones, y después empaquetarla como app móvil. El
> primer paso ya hecho es la entrada única a Entregas
> (`Docs/Entregas/ux-entrada/`).

## 1. En una frase

**Durante 30 días no se construye nada nuevo: se prueba subir el delivery
S/ 0.50, se trabaja con los cuatro aliados (sobre todo con Priamo) para que
vendan más y cancelen menos, y los encargos se siguen atendiendo como hoy,
pero anotando de qué restaurante es cada uno, para tener con qué volver a
los que dijeron que no.**

## 2. El diagnóstico

| Dato (`tindivo-prod`) | Qué significa |
|---|---|
| **~S/ 400 por semana** de ingreso, plano desde fines de agosto; la última semana completa, S/ 360 | El negocio no crece solo |
| **Pizza Priamo = 67 % de los pedidos** | Si Priamo se va, el ingreso cae a ~S/ 130 por semana. Es el riesgo más grande |
| Después del personal quedan **S/ 130–190 por semana** (personal supuesto), **antes** de gasolina, mantenimiento e infraestructura | El margen real todavía no se conoce, y es menor que eso |
| **86 %** de los pedidos los carga el restaurante | Lo que Tindivo puede demostrar hoy es **«un motorizado sin planilla»**. Que además capte clientes nuevos es posible, pero no está probado |
| Los aliados pagan: lo cobrado cuadra al céntimo | No hay plata perdida en la cobranza |
| El fin de semana **no** está saturado (mediana 23.5 min, igual que entre semana) | No hace falta una tercera moto |
| En una semana se construyeron Entregas (3 pedidos) y Store (no publicado), y se escribió la v2 de Encargos (propuesta, sin construir) | **No faltan productos: falta foco** |

## 3. Qué hacer, semana por semana

**Límite de tiempo de Jesús:** todo esto suma, como mucho, **4 horas por
semana** más de las que ya pone. Si una tarea lo pasa, se recorta la última
de la lista.

### Semana 1 · Saber cuánto se gana y hablar con los aliados

1. **Escribir el costo real de una semana:** motorizados, gasolina,
   mantenimiento, infraestructura y horas de Jesús. Sin este número, todo lo
   demás es estimado.
2. **Conversación con Priamo**, con esta agenda:
   - qué le molesta del servicio y qué lo haría irse;
   - la prueba de precio (punto 3);
   - **producto agotado**: que la cajera lo marque al abrir y cuando se acabe.
     Es una tarea del negocio, no de Jesús. Fue el motivo de **10 de los 16**
     cancelados por el negocio en 6 semanas, sumando todos los aliados.
     Priamo tuvo 11 de esos 16;
   - **los pedidos que nadie acepta a tiempo** (5 de Priamo en 6 semanas):
     quién vigila las solicitudes pendientes en el local;
   - **permiso para mostrar sus números** a otros restaurantes;
   - una **promo entre semana pagada por él** («martes de Priamo»).
3. **Prueba de precio: +S/ 0.50 al delivery, todos los días, por 2 semanas.**
   Se mantienen las dos bandas: **cerca S/ 2 → 2.50, lejos S/ 2.50 → 3.**
   - **Antes:** se habla con los cuatro aliados, porque la cajera es la que le
     dice el precio al cliente. Se les da el mismo aviso escrito para que
     todas digan lo mismo.
   - **Quién y cuándo:** Jesús cambia `app_settings` un lunes, avisado con
     días de anticipación, y anota el precio anterior y la fecha.
   - **Por qué todos los días y no solo el fin de semana:** el argumento del
     fin de semana era la capacidad, y el dato de §2 lo tumbó. Además recauda
     más (~S/ 55 contra ~S/ 35).
4. **Empezar la hoja de encargos** (§4).

### Semana 2 · Llenar los días flojos

- Martes y jueves tienen 11–12 pedidos por noche; el sábado, 27.
- **Una promo por semana, pagada por el aliado** que quiera y difundida por
  **sus** canales (estados, su WhatsApp).
- Jesús solo manda promos a quien **aceptó recibirlas**. Tener guardado su
  número o haber pedido antes no cuenta como permiso. Desde ya, cuando un
  cliente le escriba, le pregunta si quiere recibir las promos de la semana.
- Tindivo no financia descuentos.

### Semanas 3–4 · Entregas: decide Jesús (§9)

### Semana 5 · Revisar y volver a los que dijeron que no

Con la hoja de encargos y, si Priamo lo permite, su caso: visitar **solo a los
1–2 restaurantes no aliados con más encargos** (§4).

## 4. Encargos: se siguen haciendo, no se construyen y cambian de propósito

**Se atienden como hoy**, por el WhatsApp de Jesús, con las reglas mínimas que
salieron de la revisión de hoy:

- la moto no sale sin que el cliente confirme;
- el motorizado paga a la tienda con Yape cuando pueda, y toma foto;
- no se fía: sin el pago completo, la bolsa no se entrega;
- **no se hacen encargos de un aliado**: se manda a su carta. Si no, el aliado
  se pregunta para qué paga S/ 1.50;
- si el cliente no paga, Jesús lo llama antes de devolverle la plata al
  motorizado. **Esto pone una traba al impago fingido, pero no lo elimina**:
  un motorizado y un cliente de acuerdo pueden mentir los dos.

**Lo que cambia es para qué sirven.** Su valor no son los S/ 12–17 por
semana: es **la prueba de que la gente compra, y paga S/ 3.50 de servicio, en
restaurantes que no son aliados**. Un encargo prueba eso. **No prueba que sea
una venta que el restaurante no habría hecho de todos modos**, y así hay que
presentarlo.

**La hoja**, una fila por encargo:

| Fecha y hora | **Restaurante** | Celular del cliente | Monto de la compra | ¿Lo pidió el cliente o lo recomendó Jesús? | Cobrado | Bono pagado | Pérdida | Minutos de Jesús |
|---|---|---|---|---|---|---|---|---|

Con el celular se cuentan **clientes distintos**, no pedidos repetidos. A las
4 semanas, al restaurante con más encargos se le enseña su número:

> «Este mes, N vecinos distintos te compraron N veces por Tindivo: S/ X. No te
> costó nada. Pagaron S/ 3.50 de servicio. Si te unes, pagan S/ 2.50, piden
> directo a tu caja y apareces en la web.»

**Límite:** con 5–7 encargos por semana repartidos entre varios negocios, puede
que ninguno junte más de 4–6 en un mes. Si la muestra es chica, se espera otro
mes. **No se promueven encargos ni se pierde plata para fabricar la muestra.**

**La app de Encargos v2 (`Docs/Encargos/compras/`) no se construye** este mes.
Cuándo reabrirla es decisión de Jesús (§9).

## 5. Lo que se deja de hacer

- **Construir productos nuevos.** Durante 30 días el código solo se toca por
  errores o para cambiar `app_settings`.
- **Store:** congelado. Si hace falta caja, se venden cosas propias por los
  canales de siempre, sin comprar mercadería.
- **Visitas para conseguir aliados con la misma oferta.** Jesús ya lo hizo.
- **Comisión gratis el primer mes**, ni **comisión solo por clientes nuevos**:
  lo primero no prueba que después vayan a pagar; lo segundo no se puede
  medir con el 86 % de los pedidos cargados por la cajera.
- **Alquilar una moto de día o abrir turnos de día**, salvo que ya exista una
  persona de confianza interesada o un comprador del servicio. No se sale a
  buscarlos.

## 6. Cuánto se puede esperar

**Son escenarios que dependen de cumplir cada meta, no un mínimo garantizado.**

Supuesto: **S/ 0.50 de gasolina y desgaste por salida** (por confirmar en la
semana 1). Con ese supuesto, los ~110 pedidos que ya se hacen cuestan unos
S/ 55 por semana que hasta ahora no se habían descontado. **El punto de
partida pasa de S/ 130–190 a ~S/ 75–135 por semana**, todavía antes de
mantenimiento, infraestructura y el tiempo de Jesús.

Después de la subida, cada pedido de comida **adicional** deja ~S/ 3.45 (unos
S/ 3.95 de ingreso menos S/ 0.50 de salida).

| Palanca | S/ por semana, si se cumple la meta |
|---|---:|
| +S/ 0.50 de delivery sobre ~110 pedidos | **+38 a +55** (38 si se pierden 5 pedidos) |
| 8–15 pedidos más en días flojos | **+28 a +52** |
| Recuperar agotados y pedidos sin aceptar (~2.5 por semana) | **hasta +9** |
| Entregas, si se prueba y funciona (10 por semana × S/ 2.50) | **+0 a +25** |
| **Total** | **~+70 a +140** |

**Resultado: ~S/ 145–275 por semana**, antes de mantenimiento,
infraestructura y el tiempo de Jesús. Es una mejora real; **no es un sueldo**.

## 7. Qué se mide cada semana

| Métrica | Base de hoy | Qué hacer si se cumple la alarma |
|---|---|---|
| Pedidos de comida por semana | **~119** (media de las 4 últimas semanas completas) | Si en las 2 semanas de prueba cae más de 10 % y no hay otra causa, se vuelve al precio anterior o se prueba solo en fin de semana |
| Ingreso Tindivo por semana | ~S/ 400 | — |
| **Margen real** (ingreso − costo de la semana 1) | Por medir | Negativo: se para todo y se revisan costos |
| Pedidos de martes + jueves | ~24 | Si no cambia tras 2 promos, se deja de insistir |
| Cancelados por el negocio | ~2.7 por semana | Si no baja tras la conversación, se vuelve a hablar con ese aliado |
| Encargos, **por restaurante y por cliente distinto** | Sin dato | — |
| **Horas extra de Jesús** | Sin dato | Más de 4 por semana: se recorta |

## 8. Lo que tiene que responder Jesús

1. ¿Aprueba la prueba de +S/ 0.50 todos los días por 2 semanas? (Si prefiere
   solo el fin de semana, se puede, pero recauda ~S/ 35 en vez de ~S/ 55.)
2. ¿Cuánto cuesta de verdad una semana?
3. ¿Cuánto necesita que Tindivo le deje limpio por semana, y cuántas horas le
   puede dar?
4. ¿Qué restaurantes dijeron que no, y cuáles hacen delivery por su cuenta?
5. ¿Conoce a alguien de confianza para una moto de día, o alguien en otro
   pueblo que quisiera operar Tindivo?

## 9. Desacuerdos que decide Jesús

| Tema | Claude | Codex |
|---|---|---|
| **Entregas en las semanas 3–4** | No se promueve este mes: cada hora de Jesús va a precio, Priamo y la hoja de encargos. Se revisa en el mes 2 | Prueba corta: 3 tiendas que compartan su enlace, 10 días hábiles, de lunes a viernes, la comida primero. Se evalúa por exposición suficiente, demanda pagada, autonomía (≤ 15 min diarios de Jesús), dinero cuadrado y **cero demoras de comida**. Con 3 entregas no se puede concluir nada |
| **Tarifa «solo transporte» para un no aliado que no acepta comisión** (el restaurante paga S/ 0 y el cliente paga todo: **S/ 4 cerca, S/ 4.50 lejos** después de la subida, para que a Tindivo le deje lo mismo que un pedido de aliado) | En la práctica ya es un encargo, y abre la puerta a que un aliado pida pasarse a ese esquema. Se mira en la semana 5 solo si un restaurante concreto lo pide | Vale la pena probarlo a mano con un solo interesado, con condiciones claras, resolviendo antes la convivencia con los aliados. No puso fecha ni condición de que lo pidan |
| **Cuándo reabrir la app de Encargos** | Si los encargos pasan de 15 por semana durante un mes | No propuso umbral. Congelar construcción y expansión, sin más |
| **¿San Jacinto tiene techo?** | Sí: 5 000 habitantes y 478 clientes en toda la historia. Lo que más puede cambiar el ingreso es otro pueblo con un operador local, cuando aparezca la persona | Los datos muestran el resultado de hoy, no un techo demostrado. Otro pueblo, solo con un operador concreto, dispuesto a pagar y capaz de operar; sin fecha ni búsqueda |
