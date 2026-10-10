**Firmo con cambios**, cuatro concretos:

1. **Credenciales:** quitar contraseña y token no basta. Excluir también `SUPABASE_SERVICE_ROLE_KEY` de producción y cualquier archivo de entorno que la contenga. La API la consume y Turbo la transmite (`apps/api/lib/env.ts:10`; `turbo.json:9`). La prohibición propuesta queda corta (`Docs/plan-migraciones/debate/05-claude-replica.md:26`).

2. **Candado:** adquisición atómica y obligatoria mediante wrappers; mantenerlo durante **reset → seed → tests**, no soltarlo entre comandos. No liberar por antigüedad: comprobar también procesos hijos antes de declararlo huérfano. La suite comparte DB y borra fixtures (`apps/api/vitest.config.ts:29`; `apps/api/vitest.global-setup.ts:173`).

3. **Ventanas:** eliminar «sin retorno ensayado, antes de las 13:00». La hora no sustituye el ensayo: **sin retorno probado, no se empieza** (`Docs/plan-migraciones/debate/05-claude-replica.md:47`).

4. **C1:** acepto la proporcionalidad, siempre que el manifiesto contenga **solo esa revocación**, capture los permisos efectivos anteriores y pruebe rechazo de clientes y continuidad del cron. El retorno debe restaurar esos permisos exactos, sin conceder más. La migración concede ejecución a `anon`, `authenticated` y `service_role` (`supabase/migrations/0238_entregas_abre_de_noche_y_avisa_sin_descuentos.sql:237`); el criterio firmado exige conservar el cron (`Docs/plan-migraciones/conclusion.md:45`).

Con eso, firmo el procedimiento. La aceptación debe incorporarse al plan operativo, para que ninguna sesión siga ejecutando la versión anterior.