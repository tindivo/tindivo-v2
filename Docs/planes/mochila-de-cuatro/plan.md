# La mochila del motorizado pasa de 3 a 4

> Estado: **por ejecutar**: espera a que termine el servicio en curso y a las decisiones de la Fase 0 · Aprobado por
> Jesús el 2026-10-19 (conversación con Claude Code) · Commit de referencia: `develop@70eaa62d`, `main@0306918f` ·
> Alcance: el tope de la mochila del motorizado en pedidos de comida (Entregas tiene el suyo, `maxActivePerDriver`, y
> no se toca) · Decisiones abiertas: DA-16 en `Docs/trabajo/decisiones-abiertas.md`

## 1. Por qué

A Jesús le exigen que un motorizado pueda llevar 4 pedidos a la vez y no 3. Es urgente: va a producción como arreglo
desde `main`, sin esperar a lo que hay en `develop`.

## 2. Cómo está hoy (medido el 2026-10-19)

- La app del motorizado cuenta **espacios de mochila**: la suma de `occupancy_slots` de sus pedidos en
  `heading_to_restaurant`, `waiting_at_restaurant` y `picked_up`. Hoy cada recojo declara 1 espacio
  (`apps/motorizados/app/pedido/[id]/page.tsx:429`, `slots: 1`), así que 3 espacios = 3 pedidos.
- **El 3 está fijo en el código**, no sale de `app_settings` (incumple el invariante 10 de `AGENTS.md`):

  | Archivo | Qué hace |
  |---|---|
  | `apps/motorizados/components/capacity-indicator.tsx:6` | `const MAX_SLOTS = 3`: el chip «x/3» de la barra |
  | `apps/motorizados/components/home/available-tab.tsx:45` | `mySlots >= 3` desactiva «Tomar»; textos en :97 y :138 |
  | `apps/motorizados/app/pedido/[id]/page.tsx:285` | `board.mySlots >= 3` desactiva «Tomar pedido»; texto en :368 |
  | `apps/motorizados/components/home/team-tab.tsx:107` | `mySlots >= 3` bloquea pedir el pedido de un compañero; texto en :174 |

  Los cuatro archivos son idénticos en `main` y en `develop`.
- **La API no limita la toma**: `advance_order` no comprueba la mochila al tomar un pedido. Es la «TAREA-CAP» que dejó
  anotada `supabase/migrations/0130_silence_transfers_again.sql` (cabecera, «ASIMETRÍA CONOCIDA Y ACEPTADA»).
- **En la base hay dos ajustes** en `app_settings.assignment_rules`:
  - `maxOrdersPerDriver: 3` (sembrado en la 0006 y la 0086): **ninguna función lo lee**, aunque `Docs/negocio/apps.md`
    lo cita como el tope.
  - `maxOccupancySlotsPerDriver: 3` (0130): lo lee `apply_order_transfer`. Es el tope del **traspaso por silencio**: si
    el dueño no responde en 30 s, el pedido pasa al solicitante solo si le cabe.
- `orders.occupancy_slots` tiene `check (occupancy_slots between 1 and 3)`: es el tamaño de **un** pedido, no el total
  del motorizado. No cambia.
- Producción está en la migración 0247; de la 0248 a la 0266 esperan la firma de Codex.

## 3. Criterios de aceptación

- **C1**: con 3 espacios ocupados, «Tomar pedido» está activo en Disponibles y en el detalle del pedido; con 4, está
  desactivado y dice «Mochila llena 4/4».
- **C2**: el chip de la barra muestra «x/4».
- **C3** (solo con la opción a de la Fase 0): en producción,
  `select value->>'maxOccupancySlotsPerDriver' from public.app_settings where key = 'assignment_rules'` devuelve `4`.
- **C4**: `git merge-base --is-ancestor origin/main origin/develop` sale con código 0 tras la Fase 3.
- **C5** (Fase 4): `grep -rnE "(>=|>) ?3\b|/3\b|MAX_SLOTS = 3" apps/motorizados` no devuelve nada relacionado con la
  mochila, y la app muestra el tope que diga `app_settings`.

## 4. Fases

### Fase 0 · Decisiones de Jesús (DA-16)

1. ¿Vercel despliega `motorizados` a producción desde `main`? (El repo no lo registra.)
2. Traspaso por silencio: **(a)** un `UPDATE` en producción revisado por Codex, justo después de desplegar, o **(b)**
   esperar al lote 0248–0266 y que la Fase 4 lo cierre.
3. ¿4 espacios o 4 pedidos? Recomendación: espacios, que es lo que la app ya cuenta.

### Fase 1 · Arreglo urgente desde `main`, sin migración

1. Worktree propio, rama `hotfix/mochila-de-cuatro` desde `origin/main`.
2. Cambiar el 3 por 4 en los archivos de §2, juntando el valor en una sola constante, marcada como parche provisional
   (la causa de fondo se resuelve en la Fase 4).
3. `pnpm lint`, `pnpm type-check` y las pruebas de `motorizados` con `--force`. El cambio no activa ningún disparador
   de Codex (comprobarlo y anotarlo en la clasificación).
4. Probar C1 y C2 a mano en la vista previa de Vercel.
5. PR a `main` marcado «listo para merge»; lo integra Jesús.

**Por qué sin migración**: una migración nueva aplicada en producción antes que la 0248–0266 rompe el orden del lote,
y `db push` ya no las aplicaría sin `--include-all`.

**Lo que queda abierto hasta la Fase 2**: un traspaso por silencio no pasa a un motorizado que ya lleva 3. Los
traspasos aceptados de forma explícita sí funcionan, porque `apply_order_transfer` no comprueba la mochila al aceptar.

### Fase 2 · Ajuste en producción (solo con la opción a)

1. Sentencia, que cambia solo esa clave:
   `update public.app_settings set value = jsonb_set(value, '{maxOccupancySlotsPerDriver}', '4') where key = 'assignment_rules';`
   No hay otro camino: `assignment_rules` no está en la lista de ajustes editables de `PATCH /admin/settings`
   (`apps/api/app/api/v1/admin/settings/route.ts`, `EDITABLE`), ni el panel de admin la muestra.
2. Encargo a Codex (disparador D01, mutación en producción), esfuerzo `medium`.
3. La ejecuta un operador autorizado, con la autorización expresa de Jesús. Comprobar C3.

### Fase 3 · Traer `main` a `develop`

PR de `main` a `develop`; sin conflictos, porque los archivos son idénticos. Comprobar C4. **Sin este paso, la
siguiente publicación de `develop` vuelve a 3.**

### Fase 4 · Arreglo de fondo en `develop`

1. Migración con el siguiente número libre, idempotente, que fije `maxOccupancySlotsPerDriver` y `maxOrdersPerDriver` en
   4. Con la opción a no cambia nada en producción; con la b cierra el hueco de la Fase 1.
2. Que la app lea el tope desde `app_settings`, a través de un **campo nuevo** en una respuesta de la API (aditivo, sin
   romper el contrato REST v1), y quitar el valor fijo. Antes, comprobar qué respuesta lo lleva mejor.
3. Pruebas que se rompen al subir el ajuste: T8 de `e2e/driver/transfers.spec.ts` («expirar SIN capacidad») y T1b de
   `apps/api/lib/__tests__/release-and-transfer.integration.test.ts` llenan la mochila con **un** pedido de 3 espacios.
   Como un pedido no puede ocupar más de 3 (CHECK de §2), necesitan dos pedidos (3 + 1). Actualizar también el
   comentario de `e2e/driver/modal.spec.ts` que cita el tope 3.
4. Corregir `Docs/negocio/apps.md` para que diga 4 y nombre el ajuste que manda (`maxOccupancySlotsPerDriver`).
5. Verificar con `pnpm db:cycle` y `pnpm test:e2e`. Comprobar C5.

### Fase 5 · Opcional, en un PR aparte: la API pone el tope

Que `advance_order` rechace la toma si no cabe (cerrar la TAREA-CAP de la 0130). Es un cambio de comportamiento en una
función `SECURITY DEFINER`: antes lo decide Jesús y después lo revisa Codex.

## 5. Reparto

| Quién | Qué |
|---|---|
| Antigravity (Gemini) | Su lectura ya está hecha. En la Fase 4, barrer las pruebas y los documentos que citen el tope 3 |
| Sonnet | Implementa las fases 4 y 5 |
| Claude (sesión principal) | La Fase 1 y el control de calidad de todas |
| Codex | La Fase 2, la migración de la Fase 4 antes de su `db push` y la Fase 5 |
| Jesús | Fase 0, integrar los PR y autorizar la Fase 2 |

## 6. Al cerrar

Lo que cambió el comportamiento pasa al canon (`Docs/negocio/apps.md`) y este plan se borra; queda en git.
