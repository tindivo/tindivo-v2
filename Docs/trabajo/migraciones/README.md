# Plan de migraciones: hosting → base → apps nativas

> 2026-10-08/09. Debate Claude + Codex, con Codex leyendo el repo por su cuenta (perfil `revisor` de Codex CLI, solo
> lectura). **Empieza por [`conclusion.md`](../../planes/migraciones/conclusion.md)**: es el plan que se sigue, firmado por Codex tras aplicar los
> seis cambios de su auditoría.

| Archivo | Qué es |
|---|---|
| [`conclusion.md`](../../planes/migraciones/conclusion.md) | **El plan**: fases F0-F5, condiciones de corte, red de seguridad y lo que decide Jesús |
| [`plan-diario.md`](../../planes/migraciones/plan-diario.md) | **Cómo se trabaja cada día**: niveles de autonomía, reglas de la sesión autónoma, lotes y puertas por fase. Firmado por Codex con cuatro cambios |
| [`cola.md`](../../planes/migraciones/cola.md) · [`bitacora/`](bitacora/) | **El día a día**: qué lote va ahora, qué espera a Jesús, y lo hecho cada día con su evidencia |
| [`00-contexto.md`](00-contexto.md) | Lo que pidió Jesús y los hechos medidos (qué hace cada app en el servidor, push, dependencias de la mudanza) |
| [`debate/01-claude.md`](debate/01-claude.md) · [`debate/01-codex.md`](debate/01-codex.md) | Aperturas, escritas sin leer la otra |
| [`debate/02-claude.md`](debate/02-claude.md) · [`debate/02-codex.md`](debate/02-codex.md) | Réplicas. Codex corrigió a Claude sobre `orderPaymentTimeout`: su evento sí se usa en el `cancelOn` de otras dos funciones |
| [`debate/04-claude-plan-diario.md`](debate/04-claude-plan-diario.md) · [`debate/04-codex-plan-diario.md`](debate/04-codex-plan-diario.md) · [`debate/05-claude-replica.md`](debate/05-claude-replica.md) · [`debate/05-codex-firma.md`](debate/05-codex-firma.md) | El plan diario: propuesta, revisión («no lo aprobaría tal como está»), réplica y firma |
| [`debate/03-codex-auditoria.md`](debate/03-codex-auditoria.md) | Auditoría de la conclusión: «firmo con cambios». Los seis cambios están aplicados |

Relacionado: [`../movil/debate-rest/conclusion.md`](../movil/debate-rest/conclusion.md)
(contrato REST y paso 0) y [`../arquitectura/`](../arquitectura/) (desacoplamiento y estándares).
