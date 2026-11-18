# Codex audita: resumen (el protocolo completo manda)

Texto completo y normativo: `Docs/operacion/codex-auditor.md`. **Léelo entero antes de clasificar un cambio, preparar
un encargo, retomar una auditoría o cerrar, marcar o integrar una entrega que pasó por Codex.** Este resumen no lo
reemplaza; lo que sigue son bloqueos que no se pueden olvidar aunque no lo abras.

- **Qué revisa:** solo DINERO, SEGURIDAD e IRREVERSIBILIDAD_DATOS. Veredictos: `firmo`, `firmo con cambios`, `no firmo`.
- **Cuándo entra (§2):** clasifica el cambio completo contra la rama destino, no el último commit. Cualquier coincidencia de
  ruta o de contenido (líneas añadidas y eliminadas) de D01–D02, S01–S04, M01–M02, N01–N02, P01–P02 o G01 activa Codex.
  Ninguna coincidencia se descarta por parecer cosmética. Todo `db push` o migración contra producción también la activa (§3).
- **Cómo:** expediente fuera del repo (`tindivo-auditorias/<tema>/`), copia saneada con `git archive`, debate ciego
  (`01-claude.md` sellado antes de lanzar), contrato fijo de entrada y de salida (§5–§6).
- **Esta máquina:** modo `PROVISIONAL_RIESGO_ACEPTADO` (§13.1 bis, con vigencia): después de cada ronda corre
  `scripts/codex-audit-scope-check.mjs`; solo un 0 valida la ronda.
- **Veto (§7):** una entrega solo queda lista para merge con `firmo` sobre el candidato actual, o con `firmo con cambios`
  cuyas condiciones Codex marcó `CERRADO_VERIFICADO` sobre ese mismo candidato: cero condiciones abiertas. Tus
  correcciones no las cierras tú, y `firmo con cambios` nunca autoriza el merge.
- **Mutación (§8):** cualquier commit posterior al veredicto (también vacío, un rebase o un merge de la rama destino) y
  cualquier cambio en lo auditado, haya o no commit (formato, dependencias, tests, configuración, instrucciones,
  evidencia), invalidan la firma. Se revalida en el mismo hilo con el delta.
- **Rondas (§9):** máximo tres por entrega, contando la contingencia. No hay Ronda 4: al agotarlas con algo abierto, la
  entrega queda bloqueada y se escala a Jesús (`escalacion.md`). Prohibido descartar por tu cuenta un hallazgo de dinero,
  seguridad o datos: se corrige o se escala.
- **Sin cuota (§10):** subagente Opus limpio, con los mismos bytes del encargo, y aprobación explícita de Jesús para esa
  entrega exacta. El estado es `EXCEPCION_HUMANA_SIN_CODEX`, nunca firma ni «listo para merge» ordinario; lleva la
  etiqueta `[PENDIENTE_AUDITORIA_CODEX_POST_CUOTA]` y no se cierra hasta que Codex firme después.
