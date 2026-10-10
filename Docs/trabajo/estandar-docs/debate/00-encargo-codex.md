# Encargo a Codex: revisión del estándar de documentación y trabajo con agentes

Eres el **revisor crítico**. Claude redactó `Docs/trabajo/estandar-docs/propuesta.md`. Jesús (dueño de Tindivo, equipo
de una persona que trabaja con Claude Code, Codex y pronto Gemini CLI) lo aprobará o no según este debate. Tú también
vas a vivir bajo este estándar: si algo te resulta ambiguo, es justo lo que hay que detectar.

## Lo que pidió Jesús

- La documentación está desordenada: reglas de negocio, arquitectura, tecnología, brainstorms y decisiones
  descartadas mezclados. Los agentes se confunden.
- Quiere un «squash» como el de las migraciones: el estado actual como punto de partida, lo histórico fuera del camino.
- Quiere estándares para trabajar con agentes. Gemini CLI entra como **ejecutor rápido**: veloz si el encargo está bien
  explicado, pero se equivoca y necesita auditoría.

## Qué hacer

Lee la propuesta y **contrástala con el repo por tu cuenta** (`Docs/`, `DECISIONS.md`, `CLAUDE.md`, `AGENTS.md`,
`.agents/AGENTS.md`, `.claude/settings.json`, `.github/`, `scripts/`). No tienes red ni acceso a la base.

1. **Verifica los hechos de §1.** ¿Son ciertos? ¿Falta alguno que agrave o cambie el diagnóstico?
2. **Busca dónde va a fallar en la práctica a tres meses vista.** Concretamente:
   - ¿Qué regla se va a incumplir primero, y por qué?
   - ¿Hay algo sobrediseñado para una persona con agentes? ¿Algo que falte?
   - ¿La frontera canon / trabajo / archivo deja casos sin dueño (por ejemplo, un plan aprobado pero en ejecución, un
     spec de una feature que se construye mañana)?
   - ¿El orden de autoridad (§4) y la regla «el agente no elige ganador» funcionan, o paralizan?
3. **Sobre tu propia herramienta**: ¿cómo carga Codex los `AGENTS.md` (raíz, anidados, al lanzarse con `-C`)?
   ¿Cambia eso la §6.1/§6.3? Si no lo sabes con certeza, dilo.
4. **Responde las preguntas abiertas de §10** con una recomendación cada una.
5. **El plan de transición (§9)**: ¿el orden es correcto? ¿Qué riesgo concreto ves en mover archivos (enlaces, la
   sesión autónoma de `Docs/plan-migraciones/`, las ~375 citas a `DECISIONS §N`)? Si puedes, mide cuántas citas hay
   y a qué secciones.

## Formato de la respuesta

En español, sin relleno. Cita archivo y línea cuando afirmes algo del repo. Estructura:

1. Hechos verificados (y corregidos, si alguno es falso).
2. Problemas, de más a menos grave, cada uno con su propuesta concreta de texto o de cambio.
3. Respuestas a §10.
4. **Veredicto**: «firmo», «firmo con cambios» (lista numerada de cambios exactos) o «no firmo» (motivos).
