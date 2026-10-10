# 0036. Las devoluciones al cliente las adelanta Tindivo y las repone el negocio

Estado: Vigente · 2026-10-10 · Aprobada por Jesús (conversación con Claude Code, 2026-10-10)

## Contexto

El cliente le paga directo al negocio y Tindivo no retiene fondos, así que un reembolso no tiene de dónde salir dentro
de la plataforma. El código ya tenía tres caminos que cargan una devolución a la deuda del negocio, sin una regla
escrita de quién le devuelve al cliente. El único cargo de la historia fue falso: una cancelación para volver a crear
el pedido (`GWYVM24F`), sin devolución, que La Florencia terminó pagando.

## Decisión

- Hasta hoy no ha hecho falta: **el restaurante siempre entrega la comida**, y Jesús se cerciora de ello.
- Si hay que devolverle al cliente un pedido de restaurante, **Tindivo le devuelve** —cuando se llega a un acuerdo con
  el restaurante— y **el restaurante se lo repone a Tindivo** por su deuda (`refund_charge`).
- En **Tindivo Entregas**, si una entrega se cancela después de cobrar, **devuelve Tindivo**: el cobro es suyo.

En palabras de Jesús: «nosotros, Tindivo, en caso se llegue a un acuerdo con el restaurante, y obvio el restaurante
tiene que devolvernos la devolución que se hizo al cliente».

## Alternativas

- **Que el negocio le devuelva directo al cliente** (el Yape fue a su cuenta): no elegida.
- **Cargar la devolución automáticamente al cancelar** (lo que hace hoy `handle_prepaid_refund_on_cancel`): genera deuda
  aunque no haya devolución, como pasó con `GWYVM24F`.

## Consecuencias

- Es la única forma en que Tindivo pone dinero en el medio: adelanta y recupera. No retiene fondos del cliente.
- **El cargo a la deuda nace del reclamo del cliente, no de la cancelación** (Jesús, 2026-10-10: «solo si [el cliente]
  reclamaba, recién se le cargaba»). Cancelar un pedido es una operación normal —por ejemplo, para volver a crearlo—
  y no debe generar deuda. Cambiar `handle_prepaid_refund_on_cancel` está en el backlog (punto 3) y toca dinero.

## Verificación

Ninguna automática todavía.

Discusión: `Docs/trabajo/squash/preguntas-dinero.md` (preguntas 1, 3 y 8)
