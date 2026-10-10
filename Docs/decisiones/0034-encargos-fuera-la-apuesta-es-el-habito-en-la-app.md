# 0034. Encargos queda fuera; la apuesta es el hábito de pedir comida en la app

Estado: Vigente · 2026-10-07 · Aprobada por Jesús (actualización escrita en `Docs/ingresos/conclusion.md` el
2026-10-07; confirmada en conversación con Claude Code el 2026-10-10: «sí, encargos fuera»)

## Contexto

El ingreso estaba plano (~S/ 400 por semana desde fines de agosto) y una sola pizzería hacía el 67 % de los pedidos.
En una semana se habían construido Entregas y Store y escrito la v2 de Encargos («te lo compramos y te lo llevamos»),
sin que ninguno moviera el ingreso. Claude y Codex debatieron cómo ganar más con lo que ya había.

## Decisión

- **Encargos no se hace**, ni en la app ni por WhatsApp. Motivo de Jesús: «paga lo mismo, más trabajo y encima más
  riesgo».
- **La apuesta es que el pueblo se acostumbre a pedir comida en la app**: repetir rápido, autocompletados y
  promociones. Después, empaquetarla como app móvil.
- El primer paso de esa apuesta, ya hecho, fue la entrada única a Entregas.

## Alternativas descartadas

- **Encargos como servicio aparte** (comprar y llevar, S/ 3.50, fondo de Tindivo por motorizado): el que menos rinde
  por minuto y el que más coordinación exige a Jesús; choca con «Tindivo no retiene fondos».
- **Seguir atendiendo encargos por WhatsApp** anotando de qué restaurante es cada uno (propuesta de la conclusión del
  debate): descartado en la misma actualización.

## Consecuencias

- `courier_orders` no tendrá compras (`kind = 'purchase'`); Entregas sigue siendo solo trasladar de A a B lo que ya
  está pagado.
- **No quedó decidido** el resto de la conclusión del debate: la prueba de subir el delivery S/ 0.50, el plan de 30
  días sin construir nada nuevo, ni las preguntas de su §8 (costo real de una semana, cuánto debe dejar Tindivo,
  restaurantes que dijeron que no, operador para otro pueblo). Si alguna vuelve, se abre como tema nuevo en
  `Docs/trabajo/`.

## Verificación

Ninguna automática: es una decisión de producto.

Discusión: `8f26aed:Docs/ingresos/` y `8f26aed:Docs/Encargos/compras/`
