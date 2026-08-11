# Handoff — índice

Puerta de entrada para una sesión que empieza en frío. **Lee el handoff más
reciente primero**; esta página solo dice cuál es y qué no conviene volver a
intentar.

Cada handoff es una **foto fechada**, no un documento vivo: no se reescriben.
Una sesión nueva añade su archivo y actualiza la tabla de abajo.

---

## Sesiones, de la más reciente a la más antigua

| Archivo | De qué va | Estado al cerrar |
|---|---|---|
| [`2026-08-10-push-y-admin.md`](./2026-08-10-push-y-admin.md) | Por qué no llegaba ninguna notificación (tres causas simultáneas) · admin de motorizados: asignación de locales y placa · auto-vínculo `0133` | Push arreglado en producción pero **sin verificar en un celular**. `0132`/`0133` sin pushear. |
| [`2026-08-10-sprint-motorizados.md`](./2026-08-10-sprint-motorizados.md) | `0129` (la cajera teclea el total) · `0130` (el silencio transfiere) · sprint T1–T8 del panel de motorizados | Su "Lo urgente" **quedó resuelto** por la sesión siguiente: el despliegue de `negocios` sí tiene el código nuevo. |

---

## Lo que NO hay que volver a intentar

Extracto de los callejones ya recorridos. El detalle y el porqué están en cada
handoff; esto es solo para reconocerlos antes de perder una hora.

**Sobre la base de datos**

- Los rollbacks **no** van en `supabase/migrations/`: el CLI los lee como
  migraciones y ve versiones duplicadas. Van en `supabase/rollbacks/`.
- `psql -c "a; b; c"` es **una sola transacción**: si falla la última, se
  revierte todo lo anterior.
- `pg_get_functiondef` **no termina en `;`**. Si generas una migración desde su
  salida, el CLI lee el fichero entero como una sentencia.
- `TG_OP` y `OLD` **no se pueden usar en la cláusula `WHEN`** de un trigger que
  cubre `INSERT`.
- `SELECT sum(...) ... FOR UPDATE` no existe en Postgres. Bloquear con
  `PERFORM ... FOR UPDATE` y sumar después.
- El alfabeto de `short_id` **no tiene `I`, `O`, `0` ni `1`**. Usa el helper.

**Sobre verificar**

- `supabase migration list` dice lo que hay en el repo, **no** lo que hay en la
  base. Verifica contra el objeto vivo: `pg_get_functiondef(...) LIKE '%...%'`.
- Que algo esté commiteado **no** significa que esté desplegado, ni que esté en
  la rama que despliega (producción sale de `main`).
- Para saber qué código hay realmente en producción, descarga los chunks del
  bundle y busca la cadena. Funcionó dos veces.
- El digest de `supabase secrets list` es **`sha256` plano del valor**: permite
  verificar un secreto sin verlo ni necesitar un proyecto de staging.

**Sobre probar**

- **Sembrar estado por SQL puede validar un diseño imposible.** Si el dato lo
  genera una acción del usuario, la prueba tiene que pasar por esa acción.
- Un test que solo puede pasar no prueba nada: siembra el caso contrario.
- Una medición compatible con dos causas no cierra ninguna.
- Los pedidos de prueba en local **se borran solos**: `db:seed:e2e:clean` corre
  en el `afterAll` de Playwright.
- `form_input` del navegador no dispara los eventos de React: hay que teclear.
- `pnpm test --force` no existe; es `pnpm turbo run test --force`.

**Sobre el repositorio**

- **El árbol se edita en paralelo.** Antes de commitear, `git status` y atribuir
  cada fichero. Nunca captures trabajo ajeno a medias.
- Las rutas de las apps están **en español** (`app/motorizados/`), el código en
  inglés. Buscar `*driver*` no encuentra la pantalla de motorizados.
