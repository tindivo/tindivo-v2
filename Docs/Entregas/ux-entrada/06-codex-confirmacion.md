- **RESUELTO — Precarga desde negocio:** usa dirección e identidad de la misma promesa, completando nombre y celular sin depender del render anterior. [use-courier-request.ts:62](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/hooks/use-courier-request.ts:62).
- **RESUELTO — Errores de carga:** perfil, usuario, historial y dirección propagan sus errores. `submit` captura el fallo de `loadIdentity` y muestra un mensaje para reintentar. [flow-context.ts:41](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/lib/flow-context.ts:41), [use-courier-request.ts:83](/Users/jesuscastillo/Developer/tindivo-v2/apps/customer/features/courier/hooks/use-courier-request.ts:83).

No encontré errores nuevos en estas correcciones.

**Veredicto: LISTO PARA COMMIT.** Los bloqueos de esta revisión quedaron corregidos. Verificación por lectura del diff; las 275 unitarias y 15 e2e son resultados reportados, no reejecutados por mí.