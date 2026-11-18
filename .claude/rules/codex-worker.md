# Codex audita: resumen (el protocolo completo manda)

Texto completo y normativo: `Docs/operacion/codex-auditor.md`. **Léelo entero antes de clasificar un cambio o de
preparar un encargo**; este resumen solo sirve para saber cuándo hace falta.

- **Qué revisa:** solo DINERO, SEGURIDAD e IRREVERSIBILIDAD_DATOS. Veredictos: `firmo`, `firmo con cambios`, `no firmo`.
- **Cuándo entra (§2):** clasifica el cambio completo contra la rama destino, no el último commit. Cualquier coincidencia de
  ruta o de contenido (líneas añadidas y eliminadas) de D01–D02, S01–S04, M01–M02, N01–N02, P01–P02 o G01 activa Codex.
  Ninguna coincidencia se descarta por parecer cosmética. Todo `db push` o migración contra producción también la activa (§3).
- **Cómo:** expediente fuera del repo (`tindivo-auditorias/<tema>/`), copia saneada con `git archive`, debate ciego
  (`01-claude.md` sellado antes de lanzar), contrato fijo de entrada y de salida (§5–§6).
- **Esta máquina:** modo `PROVISIONAL_RIESGO_ACEPTADO` (§13.1 bis, con vigencia): después de cada ronda corre
  `scripts/codex-audit-scope-check.mjs`; solo un 0 valida la ronda.
- **Rondas:** máximo tres por entrega (§9), en el mismo hilo. Todo commit posterior, incluido un merge de la rama
  destino, invalida la firma (§8).
- **Prohibido** descartar por tu cuenta un hallazgo de dinero, seguridad o datos: se corrige o se escala a Jesús.
- **Sin cuota (§10):** subagente Opus limpio, con los mismos bytes del encargo, y aprobación explícita de Jesús.
