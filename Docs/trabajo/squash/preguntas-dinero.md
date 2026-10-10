# Preguntas para Jesús: área de dinero

> 2026-10-10 · Lo respondido está en `Docs/negocio/dinero.md` y en el ADR 0036. Queda esto. Se borra cuando esté
> respondido.

## 1. ¿Se le devuelven S/ 20.50 a La Florencia?

`GWYVM24F` (el pedido de Claudia) no tuvo devolución: se canceló para avanzar con el pedido, que se entregó como
`EFFF947D`. Pero el cargo automático le sumó S/ 20.50 de deuda y La Florencia los pagó el 2026-08-30 dentro de su Yape
de S/ 111.50. **Le pagó a Tindivo S/ 20.50 de más.**

Tu criterio (2026-10-10): la cancelación funcionó bien y el cargo solo debía aparecer si Claudia reclamaba; Claudia
recibió su pedido. Con ese criterio, el cargo no debió existir. **Recomendación:** descontarle los S/ 20.50 en su
próxima liquidación semanal, con una nota que lo explique. ¿Lo hacemos así? (Es un movimiento de dinero: lo registras
tú o me das el visto bueno para prepararlo.)

## 2. Faltantes de efectivo

Hasta hoy no ha habido ninguno (ni una disputa en 340 rendiciones). Si llega a pasar, **¿quién cubre la diferencia: el
motorizado, el negocio o Tindivo?** No es urgente: se puede decidir el día que ocurra.

## Respondido el 2026-10-10

- Comisión S/ 1.50; el envío S/ 2 lo paga el cliente al negocio y el negocio a Tindivo.
- Devoluciones: las adelanta Tindivo y las repone el negocio; en Entregas devuelve Tindivo (ADR 0036). También vale
  para las apelaciones.
- Cobertura de fraude: no se usa, todo se coordina por WhatsApp (al backlog para retirarla).
- Liquidación de comisiones: cada semana.
- Motorizado: S/ 30 por noche; equilibrio en ~8.5 pedidos por motorizado.
- Ventas de Store: las cobra Jesús por WhatsApp (`DECISIONS.md §32`).
- Rendiciones de Entregas sin confirmar: Jesús aún no ha enseñado ese flujo.
