# 04 · Claude · Cómo trabajar el plan todos los días (propuesta para Codex)

> 2026-10-08. Jesús pide: «a nivel de buenas prácticas, ¿qué recomiendas? Divídelo por fases para entenderte. La idea
> es que puedas trabajar todos los días en esto, 24/7, para tenerlo listo». El *qué* ya está firmado
> (`../conclusion.md`, F0-F5, y `../../customer_app_migration/debate-rest/conclusion.md`, pasos 0-7). Esto es el
> **cómo**: en qué lotes diarios se parte, qué puedo hacer solo y qué no, y con qué disciplina.

## Hechos que condicionan la propuesta

- `tindivo-prod` es operación real (~17 pedidos/noche, 18:00-23:00 Lima). **Sin copias de seguridad** (Supabase Free).
- Trabajo en el Windows de Jesús: Supabase local en Docker, Playwright, Codex con perfil `revisor` (solo lectura).
  Fuera de ese PC no hay base local. `gh` lo bloquea el clasificador de permisos.
- Otro agente puede escribir en el mismo árbol (ya pasó). Hay 5 ramas `feat/*` vivas sin mergear.
- CLAUDE.md: aprobación de Jesús en cada hito; revisión en dos etapas antes de «hecho»; TDD en `packages/core`;
  nunca `--no-verify` ni `push --force` a `main`.
- La CI **no** corre la suite de la API (no levanta Supabase: `.github/workflows/ci.yml`, paso «Test»), y `lint` y
  `check:ds` estaban rojos de base en `main` al 23-ago.
- Yo no corro solo entre sesiones. «24/7» exige una sesión abierta con `/loop` (PC encendido, Docker arriba) o rutinas
  en la nube (sin Docker ni base local: solo sirven para trabajo de código puro).

## La regla de oro: tres niveles de autonomía

| Nivel | Qué | Ejemplos |
|---|---|---|
| **A · Solo** (de día o de noche) | Todo lo que vive en una rama, en local o en CI, y no toca nada compartido | Tests, código en rama, OpenAPI, suite de humo, docs, migraciones **escritas y probadas en local** (`db reset` + `db:seed:e2e`), PR a `develop` |
| **B · Preparo, Jesús aprueba** | Lo que llega a producción o cuesta dinero | `supabase db push`, merge a `main` (despliega Vercel), compra del VPS, cambiar DNS, Inngest de prod, enviar un push real |
| **C · Solo Jesús** | Lo que necesita su cuenta, su panel, su teléfono o su criterio | Leer Site URL/Redirects de Auth en el panel, Google OAuth, decisiones M-01…M-04, D-40, E-01; probar en su Android/iPhone |

Corolario: **de noche (18:00-23:00) jamás nivel B**, y de madrugada solo A. Nada de nivel A escribe en prod: ni
lecturas con efectos (abrir una app con sesión registra push).

## La disciplina diaria (buenas prácticas)

1. **Una cola** (`Docs/plan-migraciones/cola.md`): lotes con ID estable, dependencias, nivel A/B/C y «hecho cuando».
   Cada sesión toma el primer lote A desbloqueado. Si lo siguiente es B o C, lo deja preparado y pasa al siguiente A:
   **nunca me quedo parado esperando**, y Jesús encuentra una lista corta de lo que le toca.
2. **Un lote = una rama = un worktree = un PR a `develop`**, de ≤ 1 día. Nombre `mig/<ID>-<slug>`. El worktree evita
   pisarme con otro agente.
3. **Test primero** donde aplica; «hecho» = las pruebas del lote verdes + `type-check` + `lint` comparado contra el
   rojo de base + revisión de Codex del diff (perfil `revisor`) + auto-revisión.
4. **Bitácora diaria** (`Docs/plan-migraciones/bitacora/AAAA-MM-DD.md`): qué se cerró, qué espera a Jesús (con la
   acción exacta), qué falló y por qué. Es lo que Jesús lee por la mañana.
5. **Producción, solo en ventana**: lunes a sábado 09:00-17:00 Lima, con Jesús presente, `db push` antes que las apps,
   `check:deploy` verde, y un plan de vuelta atrás escrito en el PR.
6. **Corte de pérdidas**: si un lote falla dos veces por la misma causa o se sale de su tamaño, se para, se escribe en
   la bitácora y se pasa al siguiente.
7. **Antes de cualquier migración aplicada a prod**: copia lógica (`pg_dump` del esquema y datos) guardada fuera de
   Supabase. No hay copias automáticas.

## Las fases, en lotes diarios

Numeradas por día de trabajo, no por fecha. Lo que está en la misma fila puede ir en paralelo.

### Fase 0 · Base de trabajo (días 1-2)

| ID | Lote | Nivel | Hecho cuando |
|---|---|---|---|
| P0.1 | Commit de `Docs/arquitectura/` y `Docs/plan-migraciones/`; crear `cola.md` y `bitacora/` | A | En `develop` |
| P0.2 | Línea base: `lint`, `check:ds`, `type-check`, `test` en `develop` limpio; anotar los rojos heredados | A | Lista de rojos de base en la bitácora |
| P0.3 | **CI con la suite de la API**: job que levanta Supabase (CLI) en el runner, `db reset` + `db:seed:e2e` + `turbo test --filter=@tindivo/api --force` | A | Un PR muestra la suite de la API corriendo en CI |
| P0.4 | Copia lógica de prod (esquema + datos) a disco de Jesús, y el procedimiento escrito | B | Archivo restaurable probado en local |

P0.3 va primero porque **es la red sobre la que se apoya todo el paso 0**, y coincide con el paso 1 del contrato REST.

### Fase 1 · Paso 0, la corrección (días 3-9)

| ID | Lote | Nivel | Hecho cuando |
|---|---|---|---|
| C1 | Revocar `expire_courier_orders()` a `PUBLIC`/`anon`/`authenticated`, conservando el cron | A → B | Test de `proacl` y rechazo desde cliente; cron sigue venciendo en local |
| C2 | Comprobante (a): `UPDATE` condicionado + 409 sin avisos | A → B | Pruebas de concurrencia con el vencimiento y de repetición |
| C3 | Comprobante (b): RPC transaccional, archivo inmutable | A → B | Las pruebas del paso 0(b) |
| C4 | Idempotencia (c): por usuario, recuperable, clave con el pedido | A → B | Pruebas de restaurantes y Entregas, fallo tras commit, purga |
| C5 | Bucket (d): límites | **C (D-40)** → A → B | Formatos acordados y archivos reales probados |
| C6 | Despliegue de C1-C4 en ventana; arranca la semana de estabilización | B | Prod con los cambios, sin errores nuevos |

Mientras corre la semana de estabilización (C6 + 7 días), **todo lo de la Fase 2 que no toca prod sigue en paralelo**.

### Fase 2 · Preparar el corte sin tocar producción (días 6-20, solapada)

| ID | Lote | Nivel |
|---|---|---|
| H1 | Inventario C desde el código (variables por app, build vs. runtime, cookies, `sw.js`, caché, versiones) | A |
| H2 | Inventario C desde los paneles (Auth Site URL/Redirects, Google OAuth, Inngest, DNS/TTL) | C (Jesús me dicta o me pasa capturas) |
| H3 | Suite de humo `e2e/smoke/` de solo lectura, parametrizada por URL, con guarda que impide escribir | A |
| H4 | Motor del PDF seleccionable por variable, default igual que hoy | A → B |
| H5 | Retiro de `orderPaymentTimeout` con sus pruebas, despliegue aparte | A → B |
| H6 | `Dockerfile` por app + `compose` + Caddy; arranca en local con las cinco apps | A |
| H7 | Staging: base de pruebas + apps; recorrido completo parametrizado con guardas | B (crea el proyecto) → A |
| H8 | VPS candidato: medir memoria, CPU, PDF concurrentes, latencia a Oregón y desde Perú | C (M-01, M-02, compra) → A |
| H9 | Monitoreo de errores y latencia con una alerta | A → B |
| H10 | Ensayo completo sin DNS público + ensayo de vuelta atrás; condiciones de corte escritas | A con B al final |

### Fase 3 · La mudanza (≈ 1 semana, una app cada 1-2 días)

Un lote por dominio, **API → admin → customer → negocios → motorizados**, todos nivel B y en ventana, con el
checklist de `conclusion.md` F2. Entre cortes: observar al menos una noche de operación antes del siguiente.

### Fase 4 · Desacoplamiento y nativo (semanas, en paralelo desde la Fase 2)

Los pasos 1-7 del contrato REST en lotes de una ruta o un módulo por día: OpenAPI (A), compatibilidad (A → B), rutas
que faltan (A → B, una por lote), Negocios por partes (A → B), recorrido nativo temprano (A + C en dispositivo), módulo
`notifications` con el consumidor fuera de la base (A → B).

**Esto no espera a la mudanza**: el OpenAPI y las rutas nuevas se pueden escribir desde el día 3, en ramas, mientras
el resto espera ventanas y decisiones.

### Fase 5 · Mudar la base

No se planifica en lotes todavía: tiene precondiciones (`conclusion.md` F4) que salen de la Fase 4.

## «24/7»: cómo y con qué límites

- **Sesión con `/loop` en el PC de Jesús**: toma lotes A de la cola, uno tras otro, y escribe la bitácora. Requiere el
  PC encendido y Docker arriba. Topa con los límites de uso del plan: hay que contarlo.
- **No hay nivel B desatendido.** Nunca.
- Rutinas en la nube: solo para lotes de código puro sin base (OpenAPI, contratos Zod, docs); opcional.

## Lo que pido a Codex

1. ¿Falta alguna buena práctica o sobra alguna? ¿Algo de esto es peligroso para una operación real sin copias?
2. ¿Está bien P0.3 (CI con Supabase) delante del paso 0? ¿Y la copia lógica P0.4 antes de la primera migración?
3. ¿Es correcto solapar la Fase 2 con la semana de estabilización, y la Fase 4 desde el día 3?
4. ¿Los lotes son de ≤ 1 día realista? ¿Falta alguno o hay dependencias mal puestas?
5. ¿El trabajo autónomo «24/7» es sensato tal como lo planteo? ¿Qué límites añadirías?
