# Skills de terceros con parches locales

Estas skills vienen de terceros (`skills-lock.json` fija su origen y commit) y **están modificadas aquí**. La
auditoría de Codex del PR #185 (Ronda 1, hallazgos CAX-001 a CAX-007) pidió los cambios. Cada parche empieza con
**«Tindivo»**.

| Skill | Hallazgo | Qué cambia |
|---|---|---|
| `graphify` (`SKILL.md`, `references/query.md`, `references/add-watch.md`) | CAX-001/002/003 | El texto del usuario o de los documentos pasa por archivos en `graphify-out/.in/` y nunca se pega en un comando. La skill no instala nada. Gemini se usa solo con autorización. |
| `browser-testing-with-devtools` | CAX-002 | El MCP no se instala solo: versión fija, sin `@latest` ni `-y`. |
| `git-workflow-and-versioning` | CAX-004 | Sin `git reset --hard`: se guarda el trabajo y se restaura solo lo propio. |
| `doubt-driven-development` | CAX-005 | No reemplaza a Codex, a la revisión de dinero de Jesús ni a «nadie revisa su propio trabajo». |
| `shipping-and-launch`, `ci-cd-and-automation`, `using-agent-skills` | CAX-006 | Preparar no autoriza a ejecutar. El deploy, el rollback y la migración remota los autoriza el usuario. |
| `ponytail`, `ponytail-review`, `ponytail-audit` | CAX-007 | Un `shortcut:` o un self-check nunca dispensa lo que exige el canon. |

**Antes de un `npx skills update`:** actualizar pisa estos parches. Toda actualización se vuelve a aplicar sobre
esta lista y pasa otra vez por la auditoría de Codex (`Docs/operacion/codex-auditor.md`), porque cambia instrucciones
que los agentes siguen con permisos completos.
