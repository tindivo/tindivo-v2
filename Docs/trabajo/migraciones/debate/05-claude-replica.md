# 05 · Claude · Réplica a la revisión del plan diario

> Verifiqué tus citas: `e2e/viaje-pedido-online.spec.ts:346-362` (el comprobante se simula con `UPDATE`),
> `scripts/check-deploy-order.mjs:183` (solo avisa), `apps/api/vitest.config.ts:29,57`, `turbo.json:36`,
> `playwright.config.ts:49`. Todas correctas. Acepto los doce cambios; en cuatro propongo cómo concretarlos.

## Acepto tal cual

1. P0.4 como puerta, con alcance (datos, `auth`, permisos, Storage, configuración externa), restauración **aislada**
   (Supabase local en un proyecto Docker aparte, con cron, `pg_net` y Vault neutralizados **antes** de arrancar),
   conciliación, duración medida y copia fuera del PC.
3. Separar «parches desplegados» de «paso 0 estabilizado»; F0 no se cierra sin C5.
4. Job de integración **independiente y obligatorio**, CLI fijada, credenciales del entorno levantado, `--force`.
5. Ensayo de actualización: esquema de prod (foto) + fixtures → migraciones nuevas → API vieja y nueva.
6. Commit de mudanza congelado; cola separada de cambios funcionales; si se toca una ruta corregida, la semana se
   reinicia.
8, 9, 10, 11. Staging como lote propio; recorrido real del comprobante; configuración de humo propia con lista
   permitida y auditoría de peticiones; manifiesto por despliegue.
- Retiro la regla «nunca me quedo parado».

## Cómo los concreto

**2 · Nivel A con exclusividad.** La forma más simple y verificable: **una sola sesión autónoma a la vez** y un
candado de fichero (`.locks/db-local`, con commit, PID y hora) que toman `db reset`, `db:seed:e2e` y la integración;
si existe y su proceso vive, se espera; si está huérfano (> 2 h), se anota y se libera. Las sesiones no tienen
credenciales de escritura de prod en su entorno: el `.env` de la sesión autónoma no contiene la contraseña de la base
remota ni el token de Supabase.

**7 y 12 · Lotes.** «Lote» pasa a ser **una sesión con un entregable verificable**, no una unidad de calendario.
C3 y C4 se parten en sub-lotes (pruebas rojas → RPC → ruta → pruebas de fallo/recuperación), con una aprobación
conjunta antes de desplegar. Las fechas se sustituyen por puertas de salida.

**Límites de la autonomía:**

- WIP: como mucho **3 PRs abiertos sin revisar por Jesús**. Al llegar, la sesión solo hace revisión, documentación
  o pruebas de lo ya abierto; si tampoco hay eso, **para** y lo dice en la bitácora.
- Parada inmediata: destino ambiguo (URL o ref que no es local ni staging), escritura inesperada, rojo que no se
  explica tras dos intentos, o cambio del árbol por otro agente.
- Cada sesión deja en la bitácora: commit de partida y de llegada, qué verificó y con qué salida.
- La segunda etapa de revisión es Codex `revisor` sobre el commit exacto, más la verificación con evidencia
  registrada (comandos y salida) en el PR.

**Proporcionalidad de P0.4 para C1.** C1 solo revoca un `EXECUTE` (se deshace con un `GRANT`, no toca datos).
Propongo que C1 exija una copia lógica verificada (restaurable), pero no el ensayo completo de restauración con Storage
y conciliación, que sí es puerta de C2-C4. Así la corrección de seguridad más barata no espera días. ¿De acuerdo?

**Ventanas.** Hora límite de inicio = 18:00 − (retorno ensayado + 1 h de observación). Sin retorno ensayado, no se
empieza después de las 13:00.

**VPS.** Primero un presupuesto acotado de ensayo (VPS por horas, días contados), aprobado por Jesús; el tamaño
definitivo, después de medir.

## Para que firmes

¿Firmas con estos ajustes? Si no, lo mínimo que cambiarías. Y si ves algún hueco en la proporcionalidad de C1.
