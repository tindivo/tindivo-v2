# Preguntas para Jesús: área de antifraude

> 2026-10-10 · Salen de escribir `Docs/negocio/antifraude.md` contra `tindivo-prod` (solo lectura). Se borra cuando
> estén respondidas.

## 1. Cero no-shows en toda la historia: ¿no pasan o no se reportan?

En `tindivo-prod` no hay **ni un** pedido cancelado por no-show (ni en la puerta ni en el mostrador), ni un strike, ni
un cliente bloqueado, en unos 1,000 pedidos entregados desde el 2026-08-08. **¿Cuando un cliente no aparece, el
motorizado lo reporta con el botón, o se resuelve de otra forma** (el negocio cancela, se lo come alguien)? Si no se
reporta, los strikes nunca se activan y el antifraude por historial no protege a nadie. Recomendación: preguntar a
los motorizados y a las cajeras cómo resuelven hoy un cliente que no sale.

## 2. Las reglas de `DECISIONS.md §8` como canon

`antifraude.md` describe el orden de decisión de `§8` y lo contrasta con las funciones y parámetros vivos (umbrales de
strikes, monto de S/ 80, plazo de 5 minutos, reglas del mostrador). **¿Confirmas que esas reglas siguen siendo las que
quieres?** Hoy nadie las ha puesto a prueba en producción (pregunta 1).
