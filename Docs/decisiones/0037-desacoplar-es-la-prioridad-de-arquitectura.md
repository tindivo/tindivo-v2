# 0037. Desacoplar es la prioridad de arquitectura

Estado: Vigente · 2026-10-08 · Aprobada por Jesús (conversación con Claude Code, 2026-10-08: «desacoplamiento… considero
que sea la prioridad para poder trabajar»)

## Contexto

Antes de migrar a apps nativas, Jesús pidió buenos cimientos y preparar el sistema para crecer (promociones, quizá
mototaxi, quizá servidor propio) sin una gran refactorización después. El diagnóstico midió cuatro acoplamientos: las
apps con la base (180 llamadas directas a Supabase, 99 en Negocios), las rutas con las tablas (216 consultas dentro de
los controladores), el código con el proveedor (unas 300 llamadas a Supabase en la API) y las reglas con la interfaz (el
checkout calcula dinero en React).

## Decisión

**La prioridad de arquitectura es desacoplar**, sin una gran refactorización:

1. **Lo nuevo nace desacoplado.**
2. **Lo que se toca, se deja mejor.**
3. **Lo que no se toca, no se toca.**

La dirección es un **monolito modular**: los módulos nacen donde hay trabajo real, empezando por los pedidos.

## Alternativas

- **Microservicios:** no todavía. Para una persona cuestan más de lo que resuelven.
- **Una gran refactorización antes de seguir:** descartada; frena el producto y el riesgo se concentra.

## Consecuencias

- Las apps nativas hablan solo con la API REST (`Docs/planes/movil/contrato-rest.md`): es la primera frontera nueva.
- **Los estándares concretos que desarrollan esta prioridad** se aprobaron el 2026-10-12
  (`Docs/decisiones/0038-estandares-de-codigo-v2.md`); la arquitectura objetivo detallada sigue siendo una propuesta
  sin aprobar.

## Verificación

Ninguna automática todavía: las reglas verificables entrarán con los estándares, si se aprueban.

Discusión: `Docs/trabajo/arquitectura/`
