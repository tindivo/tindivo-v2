# Preguntas para Jesús: área de antifraude

> 2026-10-10 · Se borra cuando esté respondida.

## Tu resumen de las reglas, frente a lo que hace el código

**Jesús, 2026-10-10:** «Para todos, prepago. Contraentrega para quien cumpla: está en San Jacinto con la ubicación, o
su número está en el directorio. Al menos ha hecho un pedido por la plataforma.»

Coincide en lo esencial con `DECISIONS.md §8` y con producción. Tres diferencias para confirmar, sin prisa (nadie ha
puesto a prueba el antifraude: no hay ni un no-show):

1. **Ubicación en San Jacinto sin historial:** hoy da contraentrega **con llamada** de la cajera (`validando`), porque
   el GPS del navegador se falsifica fácil. ¿Se queda así, o debe ser contraentrega directa?
2. **«Al menos un pedido por la plataforma»:** hoy cuenta cualquier pedido **entregado** a ese teléfono, también los que
   tecleó la cajera. ¿Así está bien?
3. **Lo que tu resumen no menciona y el código aplica:** prepago obligatorio por encima de **S/ 80** aunque el cliente
   sea conocido, y los strikes (con 2, solo prepago; con 3, bloqueo de 30 días). ¿Siguen?

## Respondido el 2026-10-10

- El no-show no se ha usado: si el cliente no sale, el motorizado sigue con otros pedidos. La foto de no-show, al
  backlog.
