# Plan diario · cómo se trabaja el plan de migraciones todos los días

> 2026-10-08/09. Claude propuso (`debate/04-claude-plan-diario.md`), Codex revisó con el repo delante
> (`debate/04-codex-plan-diario.md`: «no lo aprobaría tal como está», doce cambios), Claude replicó
> (`debate/05-claude-replica.md`) y Codex **firmó con cuatro cambios** (`debate/05-codex-firma.md`), ya incorporados.
> El *qué* es `conclusion.md` (F0-F5); esto es el **cómo**. **Toda sesión, humana o autónoma, sigue esta versión.**

## 1. Tres niveles de autonomía

| Nivel | Qué | Quién |
|---|---|---|
| **A · Solo** | Trabajo en una rama, en local o en CI, que no toca nada compartido: tests, código, OpenAPI, humo, Docker, docs, migraciones **escritas y probadas en local**, PR a `develop` | Claude, de día o de noche |
| **B · Preparo, Jesús aprueba** | Lo que llega a producción o cuesta dinero: `supabase db push`, merge a `main` (despliega Vercel), comprar el VPS, DNS, Inngest de prod, un push real | Claude prepara el manifiesto; Jesús aprueba y está presente |
| **C · Solo Jesús** | Su cuenta, su panel, su teléfono o su criterio: Auth y Google OAuth en el panel, M-01…M-04, D-40, E-01, probar en Android/iPhone | Jesús |

**Nada de nivel B sin Jesús, nunca. De 18:00 a 23:00 Lima, nada de nivel B.**

## 2. Reglas de seguridad de la sesión autónoma

1. **Sin credenciales de producción en su entorno:** ni contraseña de la base, ni token de Supabase, ni
   `SUPABASE_SERVICE_ROLE_KEY` de prod (la API la consume y Turbo la transmite: `apps/api/lib/env.ts:10`,
   `turbo.json:9`), ni ficheros `.env` que la contengan.
2. **Bloqueo duro de comandos de producción** en `.claude/settings` de la sesión autónoma: `supabase db push`,
   `supabase link`, `supabase functions deploy`, `git push` a `main`, `vercel`. Motivo: el CLI de este repo está
   **enlazado a `tindivo-prod`** (`supabase/.temp/linked-project.json`); sin el bloqueo, un `db push` es un comando
   de distancia.
3. **Una sola sesión autónoma a la vez**, y un **candado atómico** de la base local que toman los *wrappers* de
   `db reset` → `db:seed:e2e` → tests y que se mantiene durante toda la secuencia. No se libera por antigüedad: antes
   de declararlo huérfano se comprueban el proceso y sus hijos. (La suite comparte una base y borra fixtures:
   `apps/api/vitest.config.ts:29`, `apps/api/vitest.global-setup.ts:173`.) Un worktree aísla el código, **no** la
   base, los puertos ni los procesos.
4. **Parada inmediata** ante: un destino ambiguo (URL o ref que no es local ni staging), una escritura inesperada, un
   rojo que no se explica tras dos intentos, o el árbol cambiado por otro agente.
5. **Límite de trabajo abierto:** como mucho **3 PRs sin revisar por Jesús**. Al llegar, la sesión solo revisa,
   documenta o prueba lo ya abierto; si no queda nada de eso, **para** y lo dice. No se salta bloqueos acumulando
   ramas.
6. **«Hecho» de un lote** = pruebas del lote verdes **sin caché** (`--force`; Turbo cachea `test`: `turbo.json:36`)
   + `type-check` + `lint` comparado con el rojo heredado inventariado + revisión de Codex (`revisor`) **sobre el
   commit exacto** + evidencia (comandos y salida) en el PR. Esa es la segunda etapa de CLAUDE.md.
7. **Bitácora diaria** (`bitacora/AAAA-MM-DD.md`): commit de partida y de llegada, qué se cerró, qué verificó y con
   qué salida, qué espera a Jesús (con la acción exacta) y qué falló.

## 3. Reglas de cada despliegue (nivel B)

- **Manifiesto** en el PR: commit, migraciones exactas, apps, Edge Functions, configuración de Inngest,
  verificaciones, y un retorno **compatible y ensayado**.
- **Ensayo de actualización**, no solo `db reset`: foto del esquema de prod + fixtures → migraciones nuevas → la API
  vieja y la nueva contra el resultado. `check:deploy` compara historiales, no compatibilidad ni contenido (solo
  avisa de migraciones remotas: `scripts/check-deploy-order.mjs:183`).
- **Sin retorno probado, no se empieza.** Hora límite de inicio = 18:00 − (duración del retorno ensayado + 1 h de
  observación).
- `db push` antes que las apps; Jesús presente; tras desplegar, humo y observación.
- Un despliegue funcional que toque una ruta corregida **reinicia** la semana de estabilización.

## 4. Las fases, en lotes

Un **lote** es una sesión con un entregable verificable, no un día del calendario. Las fases se cierran por
**puertas** (evidencia, umbral, responsable), no por fechas. ⛔ = puerta.

### Fase 0 · Cimientos

| ID | Lote | Nivel | Hecho cuando |
|---|---|---|---|
| P0.1 | Commit de `Docs/arquitectura/` y `Docs/plan-migraciones/`; `cola.md` y `bitacora/` | A (Jesús aprueba el commit) | En `develop` |
| P0.2 | Inventario de rojos heredados (`lint`, `check:ds`, `type-check`, `test` en `develop` limpio) | A | Lista exacta en la bitácora; no es licencia para ignorar errores nuevos |
| P0.3 | **CI de integración**: job independiente y obligatorio, CLI de Supabase fijada, base sana, `db reset` + `db:seed:e2e` + suite de la API con `--force`, credenciales del entorno levantado, resultados guardados | A | Un PR lo muestra corriendo, y falla si la suite falla |
| P0.4 | Entorno autónomo: bloqueos de §2.2, candado de §2.3, `.env` sin secretos de prod | A | Probado: el `db push` lo rechaza el bloqueo; dos sesiones no pueden resetear a la vez |
| P0.5 | **Copia de prod con alcance**: datos, `auth`, permisos, Storage, configuración externa; fuera del PC | B + C | Archivo y procedimiento escritos |
| P0.6 | **Restauración aislada** (proyecto Docker aparte, cron, `pg_net` y Vault neutralizados antes de arrancar), conciliación de pedidos, cargos y saldos, duración medida | A | ⛔ Puerta de C2-C5 |
| P0.7 | Recorrido e2e **real** del comprobante: subida, confirmación, repetición, vencimiento y validación por las interfaces reales (hoy se simula con `UPDATE`: `e2e/viaje-pedido-online.spec.ts:346-362`) | A | Rojo o verde con significado antes de C2 |

### Fase 1 · Paso 0, la corrección (en Vercel, como hoy)

| ID | Lote | Nivel | Hecho cuando |
|---|---|---|---|
| C1 | Revocar `expire_courier_orders()` a `PUBLIC`/`anon`/`authenticated`, conservando el cron. Manifiesto **solo** con eso; se capturan antes los permisos efectivos; el retorno restaura esos exactos, sin conceder más | A → B | Rechazo desde clientes y cron vivo, probados; requiere copia verificada (P0.5), no el ensayo completo |
| C2 | Comprobante (a): `UPDATE` condicionado, 409 y sin avisos si no cambia nada | A | Pruebas de concurrencia con el vencimiento y de repetición |
| C3a-d | Comprobante (b), partido: pruebas rojas → RPC transaccional → ruta → pruebas de fallo e inmutabilidad | A | Las pruebas del paso 0(b) |
| C4a-d | Idempotencia (c), partida: pruebas rojas → clave por usuario con el pedido en la RPC → *replay* y *wrapper* → fallo tras *commit*, purga y retención | A | Las pruebas del paso 0(c), restaurantes y Entregas |
| C5 | Límites del bucket (d) | C (D-40) → A | Formatos acordados y archivos reales probados |
| C6 | Despliegue de C2-C5 (aprobación conjunta de las piezas dependientes) | B | ⛔ «Parches desplegados» |
| C7 | Una semana sin errores nuevos ni incidentes en esas rutas | Observación | ⛔ **F0 cerrado**. Sin C5, F0 no se cierra |

### Fase 2 · Preparar el corte sin tocar producción (en paralelo con C7)

Sin alterar producción ni restarle capacidad de observación.

| ID | Lote | Nivel |
|---|---|---|
| H1 | Inventario C desde el código: variables por app (construcción vs. ejecución), cookies, `sw.js`, caché, versiones | A |
| H2 | Inventario C desde los paneles: Auth Site URL y Redirects, Google OAuth, Inngest, DNS y TTL | C |
| H3 | Humo: **configuración Playwright propia**, sin los *setups* ni el permiso de notificaciones globales (`playwright.config.ts:49`), lista permitida de operaciones y auditoría de peticiones; bloquear verbos no basta | A |
| H4 | Motor del PDF seleccionable, por defecto igual que hoy | A → B |
| H5 | Retiro de `orderPaymentTimeout`, despliegue aparte | A → B |
| H6 | `Dockerfile` por app + `compose` + Caddy, en local | A |
| H7 | **Staging**: proyecto aparte, seed autorizado, destinos permitidos, servicios externos separados y prohibición **probada** de apuntar a prod (los helpers están fijados a localhost: `apps/api/lib/__tests__/helpers/local-db.ts:12`) | B (crear) → A |
| H8 | VPS de ensayo con **presupuesto acotado** (por horas, días contados); medir memoria, CPU, PDF concurrentes y latencia | C (presupuesto) → A |
| H9 | Monitoreo de errores y latencia con una alerta | A → B |
| H10 | Ensayo completo sin DNS público + ensayo de la vuelta atrás + condiciones de corte escritas | A, cierre B |

⛔ Puerta de la Fase 3: F0 cerrado, H1-H10 hechos, M-01…M-03 decididos.

### Fase 3 · La mudanza

**Commit de mudanza congelado**: nada funcional se despliega entre cortes. API → admin → customer → negocios →
motorizados, un dominio por lote, con el checklist de `conclusion.md` F2 y al menos una noche de operación observada
entre cortes. Vercel vivo dos semanas como mínimo.

### Fase 4 · Desacoplamiento y nativo

**Preparación en ramas desde la Fase 1** (OpenAPI, rutas que faltan, módulo `notifications`, Negocios por partes);
**despliegue solo tras cerrar la Fase 3**, en su propia cola. Orden: el de `../customer_app_migration/debate-rest/
conclusion.md` §3.

### Fase 5 · Mudar la base

Sin lotes todavía: sus precondiciones (`conclusion.md` F4) salen de la Fase 4.

## 5. «24/7»: cómo funciona de verdad

- Claude no corre solo entre sesiones. El trabajo continuo es **una sesión de Claude Code con `/loop` abierta en el PC
  de Jesús** (encendido, Docker arriba), que toma de `cola.md` el primer lote A desbloqueado y escribe la bitácora.
- Se para sola por las reglas de §2 (WIP, parada inmediata) y por los límites de uso del plan.
- Rutinas en la nube: solo para lotes sin base local (OpenAPI, contratos, docs). Opcional.
- **El ritmo real lo marca Jesús**: cada lote B o C espera su aprobación. Un repaso diario de 15 minutos (bitácora +
  PRs abiertos + lo que le toca) es lo que mantiene la cola fluyendo.

## 6. Lo que le toca a Jesús, en orden

1. Aprobar este plan y el commit de P0.1.
2. P0.5: dónde guardar la copia fuera del PC y presencia para sacarla.
3. D-40 (formatos y tamaño del comprobante) — desbloquea C5 y el cierre de F0.
4. Aprobar cada despliegue (C1, C6, H4, H5, H9).
5. H2: leer los paneles conmigo.
6. Presupuesto del VPS de ensayo (H8), y después M-01…M-04.
