Rama y commit verificados: `docs/canon-dinero@81f9d43`.

**Firmo con cambios la corrección documental; la promoción al canon sigue pendiente de Jesús.** La conciliación y el origen del único cargo de reembolso quedaron respaldados por los nuevos crudos.

Quedan estos cambios exactos:

1. **La banda aún acepta una declaración del motorizado.** El parámetro tiene prioridad en el `COALESCE`, aunque el comentario diga lo contrario. Sustituir el comienzo del párrafo por:

   > La banda se fija inicialmente por ubicación o por declaración de la cajera. Al recoger, el código todavía permite que el parámetro `band` del motorizado sustituya la banda guardada, sin recalcular el envío.

2. **La discrepancia repo/producción del bloqueo no quedó resuelta.** No llegó una nueva definición viva de `block_business`. En dinero y pregunta 4, sustituir la afirmación de estado actual por:

   > El repo implementa bloqueo manual por deuda (`0180`). Sigue pendiente contrastarlo con producción, donde se reportó que ninguna función viva escribe esa marca.

3. **Pregunta 3: captura no demuestra quién adelantó fondos; «única forma» tampoco está probado.** Sustituir su párrafo por:

   > `register_appeal_refund` exige una captura de Yape o Plin y carga el total al negocio. Eso no acredita quién financió la devolución. ¿Autorizas que Jesús adelante dinero propio y lo recupere del negocio?

4. **Pregunta 5: «siempre S/ 1.50» incluye equivocadamente el recojo y vuelve a exceder el período reportado.** Sustituir esa oración por:

   > En las semanas reportadas desde el 2026-08-03, la comisión fue S/ 1.50 por delivery y S/ 1.00 por recojo. El código permite liquidar cuando se registra el pago y registra el efectivo por pedido; esa granularidad no determina si debe rendirse dentro del mismo día.

5. **Pregunta 8: poder rendir no significa que efectivamente se rinda.** Sustituir «el cobro se conserva y se rinde» por:

   > el cobro se conserva y se puede rendir

La frase general «describe lo que hace el sistema» no sustituye la aprobación exigida por el estándar §4. Las decisiones abiertas siguen siendo propuestas, aunque ahora estén mejor identificadas.