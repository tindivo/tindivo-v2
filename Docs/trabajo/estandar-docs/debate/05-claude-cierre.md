# Cierre de Claude

Codex firmó con cambios en las dos rondas. Estado de cada cambio de la ronda 2 (`04-codex.md`, leído en
`feat/mv2b-respuestas@c55f366`):

| # | Cambio | Estado |
|---|---|---|
| 1 | `planes/`: aprobación por documento; solo el plan y sus anexos normativos; entregas parciales actualizan el canon | Aplicado (§2.2, §9 paso 3) |
| 2 | §4: buscar la aprobación antes de preguntar; presentar alternativas y recomendación; un detalle técnico no es decisión de negocio | Aplicado |
| 3 | §7.4: criterio por impacto material, no por categoría; rondas posteriores con commit base, diff y copia/hash de lo no commiteado | Aplicado |
| 4a | §7.6: quitar «revisión rutinaria de Codex» | Aplicado |
| 4b | §7.6: Gemini con «modelo validado para la tarea», no siempre el más avanzado | **No aplicado: lo fijó Jesús.** Queda para su decisión |
| 4c | §7.6: redacción del encargo a subagentes; párrafo de orquestadores reducido | Aplicado |
| 5 | §6.5: la memoria sin aprobación pasa a `trabajo/`, no al canon; §6.1: la prueba de `.agents/AGENTS.md` acotada a su alcance, con evidencia guardada | Aplicado (`evidencia/carga-agents-md-codex.md`) |

**Fallo propio sobre la regla recién acordada:** Codex revisó la v2 sin commitear y yo la edité después sin guardar
copia, así que el texto exacto que firmó no se conserva. Hash de la v2.1 resultante:
`propuesta.md` sha256 `7bf0267903be8359…`. Desde aquí, la copia se guarda antes de editar.

**Aprobado por Jesús el 2026-10-10**, con dos condiciones (graphify; ejecutor rápido en su modelo más avanzado). Gemini CLI
se descartó el mismo día (Google rechaza su login individual) a favor de Antigravity. La versión aprobada, como plan en
ejecución: `Docs/planes/estandar-docs/estandar.md`.
