# Revisión de decisiones de UX

Da a los revisores el mismo commit, el mismo build, las mismas capturas y la misma pregunta. Pide una primera respuesta independiente. Después reúne los hallazgos y resuelve los desacuerdos con evidencia. Si hay varias opciones viables, prueba el paso de mayor incertidumbre antes de elegir.

## Instrucciones para cada revisor

**Claude.** Ejecuta `/auditar-ui-mobile exploración como invitado y primer pedido en Android`. Propón el orden de pasos, el punto de identificación y las pantallas del piloto. Anota qué comportamiento debe validarse.

**Codex.** «Con el mismo material, localiza el primer requisito de identidad, cobertura y pago en cliente y servidor. Comprueba persistencia de bolsa, edición, reintentos y riesgo de duplicado. Para cada punto cita código y di qué flujo puede implementarse con el contrato actual».

**Argon.** «Revisa las capturas como si instalaras Tindivo por primera vez. Indica dónde dudas sobre qué tocar, cuánto pagarás, por qué te piden datos o cómo volver. Devuelve los tres puntos más importantes con el paso afectado y una prueba que permita decidir».

## Registro de una decisión

| Campo | Contenido |
| --- | --- |
| Pregunta | ¿En qué momento pedimos cuenta o verificamos el teléfono? |
| Opciones | Mostrar resumen y pedir acceso al continuar. Permitir pedido como invitado con teléfono y ofrecer una cuenta al final, si el contrato lo permite. |
| Evidencia | Rutas de la API, captura del punto actual, sesiones medidas o pruebas observadas. |
| Restricciones | Cobertura, contacto operativo, contrato de sesión y requisitos de seguimiento que estén confirmados. |
| Decisión y criterio | Completar tras la revisión. Verificar que el usuario entienda el total y que la bolsa sobreviva a identificación y retroceso. |
| Validación pendiente | Plataforma, build, escenarios y fecha de revisión. |

Para una prueba exploratoria, pide a una persona que elija un plato, cambie su dirección y simule el pedido. Observa dónde se detiene, qué cree que pagará y si entiende para qué se solicita el teléfono. Registra conducta y comentarios junto al build. Si mides conversión, usa los datos agregados del embudo.
