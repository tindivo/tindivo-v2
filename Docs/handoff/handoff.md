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
| [`2026-08-17-el-logout-que-echaba-a-todos.md`](./2026-08-17-el-logout-que-echaba-a-todos.md) | Cerrar sesión en un dispositivo echaba al usuario de **todos**: 5 de 6 sitios llamaban a `auth.signOut()` a secas, o sea `scope: 'global'` · helper `signOutLocal`/`signOutEverywhere`, `pnpm check:auth`, baja del push al salir, HU-X-011 | Todo verde (build 5/5, tests 7/7, e2e 9/9) y **nada commiteado**. El 500 de `apps/customer` bloquea el `test:e2e` completo. |
| [`2026-08-17-el-enlace-que-no-se-podia-compartir.md`](./2026-08-17-el-enlace-que-no-se-podia-compartir.md) | La app no tenía **ni una etiqueta Open Graph**: compartir por WhatsApp daba texto pelado · Open Graph, JSON-LD, `robots`, `sitemap`, canónicas y `noindex` en rutas privadas · slugs (`0165`) a medias | SEO desplegado y verificado en producción. **Los slugs quedan sin terminar y el Supabase local caído**: la sección 6 de `0165` reemplaza `search_catalog` y no se ha ejecutado nunca. |
| [`2026-08-11-los-momentos-sin-aviso.md`](./2026-08-11-los-momentos-sin-aviso.md) | Seis momentos que resolvían a cero destinatarios · había **dos caminos de push en paralelo** y el aviso de la cajera colgaba del muerto · `0136`/`0137`/`0138` | Todo desplegado en producción. **Sigue sin verificarse en un celular**, y la suscripción de la cajera no tiene ninguna evidencia. |
| [`2026-08-10-whitelist-piloto.md`](./2026-08-10-whitelist-piloto.md) | Diseño del lanzamiento con whitelist para el **14-ago 18:00 (UTC−5)**: tabla de números permitidos, muro con countdown, pantalla en admin | Solo diseño, **cero código**. Una pregunta abierta bloquea el muro del frontend. |
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
- **No metas SQL con backslashes por un heredoc.** `'\\'` llega al fichero como
  `'\'` y un `replace(x, '\', '\')` es un no-op silencioso que desactiva el
  escapado de `LIKE`. Usa la herramienta de escritura de ficheros, o `chr(92)`.
- `unaccent` vive en el esquema `extensions` y es **STABLE, no IMMUTABLE**:
  llamarla desde una función con `SET search_path = ''` obliga a cualificar
  también el diccionario. Para quitar acentos en algo simple, `translate()`.

**Sobre el frontend**

- **Satori (`next/og`) no decodifica WebP** — lanza `TypeError: u2 is not
  iterable` y la ruta entera responde "failed to pipe response". Los banners de
  Storage son WebP: hay que pasarlos por el optimizador de Next.
- **Satori no soporta `inset: 0`.** El div se colapsa a 0×0 y no pinta nada,
  sin error. Usa `top/left/width/height`.
- El optimizador de Next 16 valida `q` contra `images.qualities`, **por defecto
  solo `[75]`**: cualquier otra calidad devuelve **400**.
- En Tailwind, un degradado con las paradas en orden inválido (`via-35%` después
  de `from-55%`) **no falla**: CSS recorta la posición y el degradado sale mal.

**Sobre verificar**

- `supabase migration list` dice lo que hay en el repo, **no** lo que hay en la
  base. Verifica contra el objeto vivo: `pg_get_functiondef(...) LIKE '%...%'`.
- Que algo esté commiteado **no** significa que esté desplegado, ni que esté en
  la rama que despliega (producción sale de `main`).
- Para saber qué código hay realmente en producción, descarga los chunks del
  bundle y busca la cadena. Funcionó dos veces.
- **La API de producción es `apiv2.tindivo.com`, NO `api.tindivo.com`.** Este
  índice ya avisaba de sacar el host del bundle, pero `DEPLOY.md` seguía
  diciendo `api.` y la trampa volvió a funcionar el 17-ago. Ya está corregido:
  **una lección que no se escribe en el sitio que engaña se vuelve a pagar.**
- El digest de `supabase secrets list` es **`sha256` plano del valor**: permite
  verificar un secreto sin verlo ni necesitar un proyecto de staging.
- **`pnpm type-check` NO ve un import de runtime desde un paquete del workspace
  que la app no declara en `transpilePackages`.** Los tipos se borran al
  compilar; el import no. Pasa 11/11 con el fallo dentro y **solo `pnpm build` lo
  detecta**. Si conviertes un `import type` en un import normal, compila.
- **Un spec no es un guardarraíl.** `Docs/05-api-rest.md` prohibía
  `auth.signOut()` directo desde el día uno y 5 de 6 sitios lo usaban. Si la
  regla importa, que la compruebe un script en CI.

**Sobre probar**

- **Sembrar estado por SQL puede validar un diseño imposible.** Si el dato lo
  genera una acción del usuario, la prueba tiene que pasar por esa acción.
- Un test que solo puede pasar no prueba nada: siembra el caso contrario.
- Una medición compatible con dos causas no cierra ninguna.
- **`browser.newContext()` NO nace limpio: hereda las opciones del proyecto**,
  `storageState` incluido. En `driver` eso significa nacer logueado con la cuenta
  del setup. Pásale `storageState: { cookies: [], origins: [] }` explícito —
  `undefined` no pisa el valor heredado.
- **Una sesión revocada sigue pintando la app hasta una hora.** El access token
  vive en memoria y no se entera. Comprobar el logout por pantalla pasa en verde
  con el bug puesto: hay que canjear el refresh token del otro dispositivo contra
  `/auth/v1/token` (200 = vivo, 400 = revocado).
- **PostgREST rechaza un `DELETE` sin ningún filtro.** Al mutar un endpoint para
  comprobar que su test lo atrapa, el fallo llega por ahí y no por donde esperas.
- **`pnpm biome check .` falla de base** (2 errores, ~92 warnings preexistentes).
  Filtra por tus ficheros o no distingues lo que rompiste tú.
- Los pedidos de prueba en local **se borran solos**: `db:seed:e2e:clean` corre
  en el `afterAll` de Playwright.
- `form_input` del navegador no dispara los eventos de React: hay que teclear.
- `pnpm test --force` no existe; es `pnpm turbo run test --force`.

**Sobre el repositorio**

- **El árbol se edita en paralelo.** Antes de commitear, `git status` y atribuir
  cada fichero. Nunca captures trabajo ajeno a medias.
- Las rutas de las apps están **en español** (`app/motorizados/`), el código en
  inglés. Buscar `*driver*` no encuentra la pantalla de motorizados.
