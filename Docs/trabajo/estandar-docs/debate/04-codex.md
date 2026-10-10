Leí los dos archivos **sin commitear**, en `feat/mv2b-respuestas@c55f366`. Rama y commit coinciden antes y después de la lectura.

**Acepto ambas contrapropuestas:** `planes/` distingue mejor los encargos aprobados; archivar pronto documentos sin consumidores es razonable después del inventario y chequeo. Quedan estos ajustes:

1. **Planes: aprobación por documento, no por carpeta entera.** §9 propone trasladar carpetas que también contienen debates, auditorías y decisiones abiertas ([propuesta.md:313](Docs/trabajo/estandar-docs/propuesta.md#L313)). Añadir:

   > A `planes/` pasan únicamente el plan/spec aprobado y sus anexos normativos. Análisis, debates, bitácoras y propuestas permanecen en `trabajo/` o pasan a `archivo/`. Cambiar alcance o criterios requiere nueva aprobación; actualizar avance, no. Una entrega parcial actualiza el canon en su PR, sin esperar al cierre del plan.

   Esto evita dejar sin dueño planes pausados, modificaciones propuestas y entregas parciales.

2. **§4: acepto la regla de duda.** Exigir una decisión aprobada antes de declarar obsoleta una regla es correcto; continuar trabajo independiente evita la paralización. Añadir:

   > Antes de preguntar, el agente busca la aprobación en el canon y el encargo vigente. Si no la encuentra, presenta la discrepancia, las alternativas y su recomendación. La ausencia de una instrucción sobre un detalle técnico no constituye por sí sola una decisión abierta de negocio.

3. **§7.4: riesgo antes que categoría.** «Toca arquitectura» es demasiado amplio; excluir tareas mecánicas es demasiado absoluto ([propuesta.md:251](Docs/trabajo/estandar-docs/propuesta.md#L251)). Sustituir el criterio por:

   > Codex entra en decisiones con impacto material sobre dinero, producción, seguridad, fronteras arquitectónicas o reglas de negocio, y en cambios difíciles de revertir. Lo rutinario lo verifica Claude. Una tarea mecánica o un refactor acotado no queda exento si tiene ese impacto.

   Sustituir «solo el diff» por:

   > En rondas posteriores, revisar únicamente los puntos pendientes y cambios, con el contexto mínimo necesario. La revisión identifica commit base y diff; si incluye archivos sin commitear, conserva una copia o hash de su contenido.

   Esta ronda demuestra por qué el commit solo no identifica todo lo revisado.

4. **§7.6: eliminar contradicciones y absolutos técnicos.**

   - Quitar «revisión rutinaria de Codex»: contradice la reserva de cuota.
   - Sustituir «Gemini, siempre en su modelo más avanzado» por:

     > Gemini realiza el volumen con un modelo validado para la tarea; se aumenta capacidad cuando la dificultad o los fallos lo justifican.

   - Sustituir «un subagente arranca sin contexto» por:

     > El encargo debe aportar entradas, restricciones y salida esperada sin depender de que el subagente herede toda la conversación.

   - Reducir el párrafo de orquestadores a:

     > Sin orquestador adicional por ahora: no hay una necesidad demostrada. Se reevalúa si la coordinación manual limita el trabajo.

   No hace falta afirmar que todos aportan lo mismo o requieren un servidor externo.

5. **Dos cambios de ronda 1 siguen mal aplicados.**

   - §6.5 permite subir memoria directamente al canon ([propuesta.md:212](Docs/trabajo/estandar-docs/propuesta.md#L212)). Cambiar por:

     > Las reglas encontradas en memoria se contrastan con evidencia y aprobación existente; si falta aprobación, pasan a propuesta en `trabajo/`.

   - «Codex nunca carga `.agents/AGENTS.md`» excede lo que demuestra una prueba ([propuesta.md:172](Docs/trabajo/estandar-docs/propuesta.md#L172)). Cambiar por:

     > En la prueba citada, lanzado desde raíz, no lo cargó automáticamente. Conservar comando, configuración y salida como evidencia.

**Veredicto: firmo con cambios**, los cinco enumerados.