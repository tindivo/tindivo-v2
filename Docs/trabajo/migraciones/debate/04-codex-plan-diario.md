**No aprobaría este plan tal como está.** La dirección es buena, pero llama «aislado» a trabajo que comparte base y servicios, deja incompleto el cierre del paso 0 y confunde una copia SQL con capacidad de recuperación.

Revisé el código en `develop`, en modo solo lectura. No ejecuté tests, consulté producción ni comprobé paneles: los datos operativos del documento son antecedentes, no mediciones verificadas por mí.

1. **Buenas prácticas y peligros: «Con cambios».**

   Mantendría cola, worktrees, bitácora, ventanas y aprobaciones. Pero **un worktree no aísla Supabase, puertos ni procesos**. Vitest serializa archivos precisamente porque comparten una base y provocaban falsas alarmas contables (`apps/api/vitest.config.ts:29`, `:57`). El setup borra pedidos, eventos y cargos de fixtures (`apps/api/vitest.global-setup.ts:164`, `:173`, `:235`). Dos sesiones independientes pueden barrerse mutuamente; `fileParallelism: false` no coordina procesos distintos.

   La categoría A debe exigir **recursos exclusivos o un bloqueo de uso**, no solamente una rama. Un `db reset` sobre la base que otra sesión usa sigue siendo destructivo.

   También falta compatibilidad demostrada entre **DB nueva y apps antiguas**. «DB primero» evita columnas ausentes, pero no prueba que una nueva RPC o policy conserve el comportamiento del código todavía desplegado. `check:deploy` compara versiones del historial (`scripts/check-deploy-order.mjs:82`, `:107`); no certifica compatibilidad ni igualdad del esquema.

2. **P0.3 y P0.4: «De acuerdo», con condiciones obligatorias.**

   Integración en CI antes de las correcciones es acertado: hoy se excluye expresamente `@tindivo/api` (`.github/workflows/ci.yml:52`, `:60`). El seed es necesario y modifica parámetros operativos para abrir horarios en local (`apps/api/scripts/seed-e2e.ts:60`, `:79`). No basta con demostrar que «corrió»: debe quedar como **check obligatorio**, con CLI fijada, base saludable, reconstrucción completa y resultados conservados.

   Conviene un job independiente: en el job actual, un fallo de lint o `check:ds` impide llegar a los tests (`.github/workflows/ci.yml:37`, `:40`). El rojo heredado debe tener un inventario preciso; no una autorización abierta para ignorar errores.

   **La copia debe preceder a cualquier cambio de producción**, no solo a la primera migración. P0.4 acierta al exigir restauración, pero «esquema + datos» necesita alcance explícito: identidad, permisos, objetos de Storage y configuración externa. El acuerdo firmado ya exige restaurar datos, archivos y permisos (`Docs/plan-migraciones/conclusion.md:137`). Restaurar SQL en la base habitual de desarrollo tampoco es un ensayo seguro.

3. **Solapamiento: «Con cambios».**

   Preparar inventarios, humo, contenedores y staging durante la estabilización es razonable **si no altera producción ni roba su capacidad de observación**.

   Preparar OpenAPI y rutas en ramas desde el día 3 también puede hacerse. **Desplegar el desacoplamiento durante la estabilización o entre cortes no**: el acuerdo sitúa ese trabajo después de mudar el hosting (`Docs/plan-migraciones/conclusion.md:13`, `:98`) y exige convivir con el mismo commit durante la propagación (`:88`). El plan diario mezcla preparación y despliegue al marcar compatibilidad, rutas y Negocios como A→B dentro del frente paralelo (`Docs/plan-migraciones/debate/04-claude-plan-diario.md:100`).

   Debe existir un commit de mudanza congelado y una cola separada de cambios funcionales. Si cambia una ruta corregida durante la semana, su evidencia de estabilización debe volver a contarse.

4. **Lotes y dependencias: «En desacuerdo».**

   Un día puede ser un límite para una sesión de trabajo; **no es una estimación defendible para C3, C4, H7 o H10 completos**. C4 incluye recuperación tras commit, aislamiento, payload distinto, purga, unicidad y retención en dos tipos de pedido (`Docs/customer_app_migration/debate-rest/conclusion.md:59`). Es demasiado para tratarlo como una unidad diaria cerrada.

   Hay dos huecos concretos:

   - **C5 queda fuera de C6**, aunque el paso 0 firmado incluye límites de archivos. C6 despliega C1–C4 y arranca la estabilización (`Docs/plan-migraciones/debate/04-claude-plan-diario.md:73`). Eso no acredita el cierre de F0.
   - **H7 no es solo parametrizar URLs.** El seed y los helpers están fijados a localhost (`apps/api/lib/__tests__/helpers/local-db.ts:12`, `:31`); el recorrido usa DB y dominios locales propios (`e2e/viaje-pedido-online.spec.ts:23`, `:44`). Hace falta preparar fixtures y autorización de staging por separado, conservando la protección de los helpers locales.

   Además, el recorrido actual **simula el comprobante con un UPDATE directo**, sin subir el archivo ni llamar a su endpoint (`e2e/viaje-pedido-online.spec.ts:346`, `:358`). Verde ahí no demuestra C2/C3.

5. **Autonomía 24/7: «Con cambios».**

   Es sensata como ejecución limitada de una cola; **«nunca me quedo parado» es una mala regla operacional**. Cuando no hay un lote independiente seguro, debe detenerse. Saltar bloqueos sin límite acumula ramas, contratos incompatibles y trabajo pendiente de integrar.

   Añadiría: límite de trabajo abierto, exclusión mutua de DB, presupuesto de ejecución, caducidad de pruebas tras cambios, identificación del commit por sesión y parada inmediata ante destino ambiguo o escritura inesperada.

   El humo necesita configuración Playwright propia: la actual concede notificaciones globalmente y arrastra setups de sesión (`playwright.config.ts:49`, `:75`). Abrir admin autenticado puede registrar push automáticamente (`apps/admin/components/push-manager.tsx:23`). **Bloquear verbos HTTP no basta**: hay RPC por POST que leen y operaciones con efectos fuera del navegador.

   Finalmente, «diff revisado + auto-revisión» no define la segunda etapa exigida: debe registrar qué verificó `verification-before-completion`, sobre qué commit y con qué evidencia (`CLAUDE.md:140`).

Cambios concretos al plan, por prioridad:

1. **Convertir P0.4 en puerta de producción:** copia con alcance documentado, restauración aislada, conciliación de pedidos/cargos/saldos, duración medida y copia fuera del PC.
2. **Redefinir nivel A:** sin credenciales productivas de escritura y con exclusividad de DB, puertos y procesos; bloqueo obligatorio para reset, seed e integración.
3. **Completar C6:** incluir C5 o declarar F0 incompleto; separar «parches desplegados» de «paso 0 estabilizado».
4. **Fijar CLI y entorno de CI**, obtener credenciales locales del entorno levantado y ejecutar API sin caché en un job obligatorio independiente.
5. **Añadir ensayo de actualización**, además del reset: base con esquema anterior y fixtures → nuevas migraciones → apps antiguas y nuevas.
6. **Congelar el commit de mudanza:** permitir preparación paralela, pero posponer despliegues funcionales hasta cerrar los cortes.
7. **Dividir C3/C4 por entregables verificables**, manteniendo una aprobación conjunta antes del despliegue cuando las piezas dependan entre sí.
8. **Crear un lote específico de staging:** seed autorizado, destinos permitidos, servicios externos separados y prohibición comprobada de apuntar a prod.
9. **Añadir recorrido real de comprobante:** upload, confirmación, repetición, vencimiento y validación mediante las interfaces reales.
10. **Crear configuración exclusiva de humo**, sin setups heredados, con lista permitida de operaciones y auditoría de peticiones y efectos.
11. **Definir el manifiesto de cada despliegue:** commit, migraciones exactas, apps, Edge Functions, configuración Inngest, verificaciones y retorno compatible.
12. **Sustituir fechas rígidas por puertas de salida:** responsable, evidencia, umbrales, tiempo máximo de ejecución y límite de lotes abiertos.

Riesgos poco visibles en el plan:

- **Restaurar producción puede activar efectos reales.** El acuerdo identifica cron, Vault y llamadas HTTP desde la base (`Docs/plan-migraciones/conclusion.md:116`, `:135`). El entorno de restauración debe aislar salidas antes de arrancar trabajos.
- **Un backup previo envejece en cuanto vuelve la operación.** No permite deshacer una migración restaurándolo sin perder pedidos posteriores; el acuerdo lo prohíbe explícitamente para el corte (`Docs/plan-migraciones/conclusion.md:88`).
- **`check:deploy` puede quedar verde con divergencias:** las migraciones solo remotas generan un aviso, no un fallo (`scripts/check-deploy-order.mjs:183`). Tampoco comprueba el contenido de una versión aplicada.
- **La caché puede disfrazar una verificación inexistente:** `test` es cacheable en Turbo (`turbo.json:36`). El `--force` de P0.3 debe mantenerse también en las verificaciones de integración previas al despliegue.
- **El seed oculta condiciones reales de horario:** abre restaurantes y Entregas permanentemente (`apps/api/scripts/seed-e2e.ts:60`). Hace falta una verificación adicional con parámetros productivos.
- **09:00–17:00 no garantiza margen de recuperación.** Un cambio iniciado cerca de las 17:00 puede dejar al piloto roto a las 18:00. Cada operación necesita hora límite de inicio basada en su retorno ensayado.
- **El presupuesto del VPS tiene una dependencia circular:** H8 pide compra para medir, pero M-01 exige decidir tamaño después de medir capacidad (`Docs/plan-migraciones/conclusion.md:162`). Debe aprobarse primero un presupuesto acotado de ensayo, separado de la contratación definitiva.