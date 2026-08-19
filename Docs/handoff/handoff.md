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
| [`2026-08-18-el-dia-que-el-arbol-se-vacio.md`](./2026-08-18-el-dia-que-el-arbol-se-vacio.md) | Las dos sesiones del 17-ago dejaron **todo sin commitear** y con ello `apps/api` sin compilar un día entero · `0165` tenía dos defectos que solo aparecen contra producción (`0166`, `0167`) · primera corrida completa de la e2e | **Desplegado y verificado en producción**: 12 commits en `main`, `0165`/`0166`/`0167` en `tindivo-prod`, y el 308 uuid→slug vivo. Verde toda la cadena de CI por primera vez. Falta comprobar el login con Google a mano. Los slugs están en la base de producción pero **no en la web**: falta el merge a `main`. **`0167` sin desplegar.** |
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
- **Una columna `not null` SIN default sale como OBLIGATORIA en el tipo `Insert`
  que genera `pnpm db:types`**, aunque un trigger la rellene: el generador lee el
  esquema, no los triggers. Si el valor lo deriva la base, dale un default.
- **Una función de trigger sin `search_path` fijado la elige el llamante.** No es
  higiene del linter: el trigger corre con el `search_path` de quien inserta.
- `unaccent` vive en el esquema `extensions` y es **STABLE, no IMMUTABLE**:
  llamarla desde una función con `SET search_path = ''` obliga a cualificar
  también el diccionario. Para quitar acentos en algo simple, `translate()`.

**Sobre el frontend**

- **Los iconos de Material Symbols meten su NOMBRE en el texto de la página.** La
  ligadura los dibuja, pero «schedule» está de verdad en el DOM y Google lo
  publica dentro de las frases. El nombre va en `--icon-glyph` + `::before`.
- **`Disallow` + `noindex` juntos se ANULAN.** El bloqueo impide rastrear, así
  que Google nunca lee el `noindex` y la URL ya indexada no sale nunca. Para
  desindexar: solo `noindex`, sin `Disallow`.
- **Antes de copiar un icono, ÁBRELO.** `public/icon.svg` era una T, no el logo;
  generar desde ahí publicó una T en la pestaña. El fichero vectorial no es
  automáticamente la fuente de verdad.
- **Google rechaza el favicon si no es múltiplo de 48px** y cae al del hosting.
  Tener el icono declarado y servido no basta: 256×256 no le vale.
- **Un tipo obligatorio no hace aparecer un campo que llega por HTTP.** Entre dos
  servicios que despliegan por separado (aquí `api` y `customer`, proyectos de
  Vercel distintos), el contrato es lo que el otro manda HOY. `slug: string` no
  impidió que todas las tarjetas apuntaran a `/negocio/undefined`.
- **Un 404 es reversible; un 301 `permanent` cacheado, no.** Retirar el redirect
  después no deshace lo que los navegadores ya guardaron.
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
- **Un gate que no llega a ejecutarse no protege nada.** CI aborta en el primer
  paso rojo: `lint` y `check:ds` fallaban de base, así que `check:auth`,
  `type-check`, `test` y `build` no corrieron en CI ni una vez. Antes de fiarte
  de un chequeo en CI, comprueba que el pipeline LLEGA hasta él.
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
- **Vitest no lee los `paths` del tsconfig.** Sin `vitest.config.ts` con el alias
  `@/`, no se puede probar ningún módulo que lo use ni en sus imports internos, y
  TypeScript no lo detecta. Si un test falla con «Cannot find package '@/...'»,
  falta el config, no el módulo.
- **Un umbral configurable escrito a mano en el front es una bomba de relojería**:
  no falla hasta que alguien toca el panel admin, y entonces falla en el sitio
  equivocado. Peor si HABILITA algo en vez de solo mostrarlo.
- **Antes de culparte de un fallo visual, córrelo sin tu cambio.** Los 7 de la
  suite visual dan diferencias idénticas al píxel con y sin: son preexistentes.
- **`pnpm biome check .` falla de base** (2 errores, ~92 warnings preexistentes).
  Filtra por tus ficheros o no distingues lo que rompiste tú.
- **`.maybeSingle()` de PostgREST devuelve `null` cuando hay MÁS de una fila**, no
  un error a la vista. Un test que lo usa sobre datos que se acumulan falla
  diciendo «no apareció» justo cuando hay de sobra.
- **Un `beforeAll` que falla arrastra a TODO su fichero.** Un solo seed roto
  aparece en el reporte como «N did not run», sin decir por qué.
- **`reuseExistingServer: true` no reutiliza un servidor que responde 500**: la
  sonda exige < 400, así que Playwright arranca el suyo y muere con `EADDRINUSE`.
  El mensaje habla del puerto y el problema es el 500.
- Los pedidos de prueba en local **se borran solos**: `db:seed:e2e:clean` corre
  en el `afterAll` de Playwright.
- `form_input` del navegador no dispara los eventos de React: hay que teclear.
- `pnpm test --force` no existe; es `pnpm turbo run test --force`.

**Sobre el repositorio**

- **`git add <directorio-ignorado>` falla, pero `git add <fichero-tracked>` de
  dentro funciona** y deja todo preparado aunque el comando devuelva error. Se
  cuelan en el commit siguiente sin que su mensaje los mencione.
- **Un fichero que pertenece a varios commits se reparte escribiendo su estado
  intermedio** antes de cada uno, no troceando hunks: así ningún commit
  intermedio queda sin compilar.
- **Un merge a `main` arrastra los commits ajenos que ya estaban en `develop`.**
  El 18-ago uno traía una migración sin aplicar (`0168`) y su código habría
  prometido 15 minutos de pago mientras la base cortaba a los 10. Revisar el
  commit ajeno cuesta dos minutos; `git log main..develop` antes de mergear.
- **El árbol se edita en paralelo.** Antes de commitear, `git status` y atribuir
  cada fichero. Nunca captures trabajo ajeno a medias.
- Las rutas de las apps están **en español** (`app/motorizados/`), el código en
  inglés. Buscar `*driver*` no encuentra la pantalla de motorizados.
