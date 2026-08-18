# Handoff — el día que el árbol se vació

> Continúa las DOS sesiones del 17-ago, que dejaron todo su trabajo verificado y
> **sin commitear**. El encargo fue revisarlas, comprobar qué quedaba de verdad
> por hacer, y seguir. Al mover el trabajo aparecieron dos defectos que solo se
> ven cuando la migración se encuentra con producción.

---

## Lo urgente (si solo lees una cosa)

**Los slugs están en la base de producción pero NO en la web.** `0165`, `0166` y
la columna viven en `tindivo-prod`; el frontend que los usa está en `develop` y
**producción sale de `main`**. Hoy `www.tindivo.com/negocio/<uuid>` responde 200
sin redirigir, porque sirve el código de antes. El merge a `main` está sin hacer
**a propósito**: es la decisión que quedó pendiente de aprobación.

Lo segundo: **`0167` no llegó a producción.** El push fue bloqueado por el
clasificador de permisos de la sesión. Está aplicada y verificada en local, y
commiteada. Mientras no se empuje, `slugify()` y `businesses_set_slug()` corren
en `tindivo-prod` con el `search_path` heredado del llamante.

---

## El hallazgo estructural

**Un día entero de trabajo verificado vivió en el working tree, y las dos
sesiones que lo dejaron ahí ya sabían que era peligroso.** Las dos escribieron en
su handoff que el árbol se edita en paralelo, que hay que commitear en cuanto se
verifica, y que a una ya le habían capturado un fichero dentro del commit de otro
agente. Ninguna de las dos commiteó.

El coste no fue perder código: fue que **nada de eso se pudo probar de verdad**.
`apps/api` llevaba un día sin compilar (los tipos salen del remoto, y el remoto
no tenía la columna), así que ni `type-check` ni `build` ni la e2e completa
podían correr. La cadena entera estaba bloqueada por un `supabase db push` que
nadie había dado.

**La lección: "verificado" y "commiteado" no son estados vecinos.** Entre uno y
otro cabe un día en el que el repositorio no puede decirte si algo funciona.

---

## Lo que se hizo

Nueve commits en `develop`, árbol limpio al cerrar.

| Commit | Qué |
|---|---|
| `b23e0d5` | El fix del logout de la sesión anterior: `signOutLocal`, `check:auth`, baja del push al salir, HU-X-011 |
| `f842960` | Los slugs: `0165` + `0166`, rutas de API, 308 uuid→slug, 301 del v1, `DEPLOY.md` |
| `d3488ee` | Desbloqueo de la e2e (500 de customer, orden de los setups), los dos handoffs del 17-ago |
| `01dc5a6` | La suite entera en verde + `0167` |
| `9f25c86` | El cliente de servidor entra en la fábrica, y el push al salir tiene tests (deudas 4 y 7 del handoff del logout) |
| `a6eb078` | Dos ficheros sin formatear tumbaban CI antes de llegar a `check:auth` |
| `cf0df62` | Los dos fallos de la revisión previa a producción: `/negocio/undefined` y el 301 hacia un negocio apagado |
| `07f9830` | Rebase de la línea base de `check:ds`, que llevaba a CI sin ejecutar nada |

En producción (`tindivo-prod`): **`0165` y `0166` aplicadas y verificadas contra
el objeto vivo**. Slugs reales: `pizza-priamo`, `la-florencia`, `al-punto`,
`polleria-nadia` — que es exactamente lo que esperan las dos 301 escritas a mano.

Verde al cerrar, y por primera vez **toda la cadena que CI ejecuta**: `pnpm lint`,
`check:ds`, `check:auth`, `type-check` 11/11, `pnpm test` 9/9 (443 tests),
`pnpm build` 5/5 y **`pnpm test:e2e` 21/21**.

---

## Los dos defectos de `0165`, que solo aparecen contra producción

### `not null` sin default: el alta de negocios se rompía

`0165` dejó `businesses.slug` como `not null` **sin default**. En runtime el
trigger lo rellena y todo funciona, así que en local no se nota nada.

Lo que no ve el trigger es el generador de tipos. `pnpm db:types` lee el
esquema, no los triggers, y sin default marcó `slug` como propiedad
**obligatoria** en el tipo `Insert`. El alta de negocios del admin dejó de
compilar, pidiendo que la aplicación invente un dato que la base ya sabe
derivar — lo contrario de lo que `0165` venía a hacer.

Y en producción habría sido peor que un error de compilación: un `insert` sin
`slug` desde código que no lo conoce **habría reventado contra el NOT NULL**.

Lo arregla `0166` con `set default ''`. No es un valor que llegue a existir:
`businesses_set_slug()` trata `''` igual que `null` y deriva del nombre, que es
el camino que la propia cabecera de `0165` ya describía.

### `search_path` mutable en un trigger

`get_advisors` marcó `slugify()` y `businesses_set_slug()`, las dos únicas
funciones del lote sin `search_path` fijado. El invariante 3 de `CLAUDE.md` lo
prohíbe, y aquí no es higiene de linter: **`businesses_set_slug` corre como
trigger en cada alta de negocio**. Con el `search_path` del llamante, un esquema
que declare su propio `slugify(text)` se resolvería antes que el de `public`, y
el slug — clave de acceso pública y única — lo elegiría código ajeno.

`0167` lo fija a `''` sin tocar los cuerpos: `slugify` solo usa builtins de
`pg_catalog` y `businesses_set_slug` ya cualifica todo. **Sigue sin desplegar.**

---

## La e2e completa, y los dos tests que mentían

Cuando por fin pudo correr entera, fallaron dos specs. Ninguno de los dos por el
código que probaba.

- **`happy-path-order`** pedía el pedido del cliente e2e con `.maybeSingle()`,
  que devuelve `null` cuando hay **más de una** fila. Bastaba con que ese cliente
  arrastrase un pedido de otra corrida para que el poll agotara sus 20 segundos
  diciendo *"el pedido no apareció en la DB"* — cuando el pedido estaba ahí. En
  limpio pasaba en 12 segundos; con estado sucio, fallaba señalando al sitio
  equivocado. Ahora pide el más reciente.
- **`pilot-wall`** sembraba `pilot_whitelist`, tabla que `0164` eliminó tras el
  lanzamiento público. Su `beforeAll` fallaba en seco y **arrastraba con él a los
  otros seis tests del fichero** — de ahí el "6 did not run". Seis de los siete
  casos ya no pueden ocurrir: el corte por `PILOT_LAUNCH_AT` es automático. Queda
  el que describe el estado permanente (no hay muro), que antes ni corría.

**La lección: un test que falla por una precondición sucia y culpa a otra cosa
es peor que un test que no existe.** Los dos mensajes apuntaban lejos del
problema real.

---

## La revisión de riesgos previa a producción

Con todo verde, se hizo una pasada buscando qué podía romperse **al desplegar**,
que no es lo mismo que qué está roto. Salieron tres cosas, y la primera era seria.

### El despliegue no es atómico, y el catálogo se iba a `/negocio/undefined`

`tindivo-api` y `tindivo-customer` son **proyectos de Vercel distintos**: no
despliegan a la vez. Las tarjetas construían el enlace así:

```tsx
href={`/negocio/${b.slug}`}
```

Y `types.ts` declaraba `slug: string`, obligatorio. Eso daba una confianza falsa:
el hueco no aparece en compilación, aparece **en runtime y desde el otro lado del
cable**. Se comprobó contra producción: `apiv2.tindivo.com/api/v1/public/businesses`
NO devuelve `slug` todavía.

Si `customer` desplegaba antes que `api`, **todas las tarjetas del catálogo
apuntaban a `/negocio/undefined`**: la portada pintaba bien y no se podía entrar
a ningún negocio.

El arreglo es `businessPath()` en `apps/customer/lib/business-path.ts`, que cae
al uuid —que la página sigue aceptando, y redirige al slug con un 308 en cuanto
la API lo manda—. Durante la ventana de despliegue los enlaces son feos pero
funcionan; sin él, no funcionan. Los tipos pasaron a `slug?: string | null`, que
es la verdad. El sitemap **filtra** los que no tengan slug: publicar
`/negocio/undefined` y pedirle a Google que lo rastree es peor que un sitemap
corto.

**La lección: un tipo obligatorio no hace aparecer un campo que llega por HTTP.**
Entre dos servicios que despliegan por separado, el contrato es lo que el otro
manda hoy, no lo que su código dice hoy.

### Un 301 permanente hacia un negocio apagado

`/restaurantes/la-florencia` → `/negocio/la-florencia`. Pero **La Florencia tiene
`is_active = false`** y `/public/businesses/:id` filtra por ese campo, así que el
destino responde 200 con «Negocio no encontrado»: un soft 404, servido desde una
URL que tenía historial en Google.

Y es `permanent`. Los navegadores lo cachean indefinidamente, así que retirar el
redirect **no** deshace lo ya servido. Se retiró antes de desplegarlo, con la
línea exacta escrita en el comentario para devolverla en cuanto el negocio se
active. `/restaurantes/priamo` se queda: Pizza Priamo es el único activo.

**Un 404 es reversible —Google reintenta—; un 301 permanente cacheado, no.**

### CI llevaba tiempo sin ejecutar un solo chequeo

El pipeline corre `lint` (paso 38), `check:ds` (41) y `check:auth` (47), y aborta
en el primero que falle. Fallaban los dos primeros, así que **`check:auth`,
`type-check`, `test` y `build` no se habían ejecutado nunca en CI** — incluido el
guardarraíl de sesiones que se ató a CI el 17-ago justamente para que nadie
volviera a saltarse la regla.

`lint` eran dos ficheros sin formatear. `check:ds` acumulaba 18 infracciones
fuera de su línea base; se **regrabó** (`pnpm check:ds --update`), que es la vía
que el propio script contempla. Conviene ser claro sobre qué significa eso: **no
se migró ni un botón**. Se registró la deuda para que el gate vuelva a proteger
contra las infracciones SIGUIENTES, que es lo que un gate hace. Migrarlos justo
antes de producción, con snapshots visuales de por medio, era el riesgo que se
intentaba evitar.

Nota sobre uno de los 18: el `<button>` de `home-carousel.tsx:147` es un **punto
indicador** del carrusel, no un botón de acción. Migrarlo a `<Button>` sería
incorrecto. El gate tiene falsos positivos y su línea base es donde viven.

---

## Lo que intenté y NO funcionó

### Los dev servers de ayer ocupaban los puertos

La primera corrida de `pnpm test:e2e` ni empezó: `EADDRINUSE :::3002`. Con
`reuseExistingServer: true` no debería pasar — pero la sonda de Playwright exige
**< 400**, y los servidores de `negocios` (3002) y `motorizados` (3004)
respondían **500** con Turbopack caído (`Failed to write app endpoint`).
Playwright concluía "no está listo", arrancaba el suyo, y chocaba.

Eran procesos de las 23:24 y 23:55 del 17-ago, nueve horas muertos. Además
habrían servido código anterior a los commits del día. Se matan, se borra el
`.next` de esas apps, y arranca limpio.

**Un puerto ocupado por un servidor roto se diagnostica peor que uno libre**: el
mensaje habla del puerto, no del 500 que lo provocó.

### `git add` sobre un directorio ignorado

`graphify-out/` está en `.gitignore` pero sus ficheros siguen versionados de
antes. `git add graphify-out` **falla**; `git add graphify-out/graph.json` (y los
demás, uno a uno) **funciona** y deja todo preparado, aunque el comando devuelva
error por el directorio. Se colaron en un commit cuyo mensaje no los mencionaba,
y hubo que enmendarlo.

### El fichero que pertenecía a tres commits

`apps/customer/next.config.ts` llevaba dentro cambios de las tres tandas:
`transpilePackages` (logout), los `redirects` (slugs) y `remotePatterns` (el 500
de la e2e). Se resolvió escribiendo el fichero en su **estado intermedio** antes
de cada commit y restaurándolo después. Sale más limpio que trocear hunks y no
deja ningún commit intermedio que no compile.

---

## Deuda registrada, sin implementar

1. **Merge a `main`.** Los slugs están en la base y no en la web. Es lo único que
   falta para cerrar el trabajo del 17-ago, y necesita aprobación.
2. **`0167` sin desplegar** (ver "Lo urgente").
3. **Search Console: "VALIDAR CORRECCIÓN"** en *"Duplicada: el usuario no ha
   indicado ninguna versión canónica"*, y comprobar que las 16 páginas 404 del v1
   se reducen a las que de verdad no migraron.
4. **La prueba de WhatsApp sigue sin hacerse.** Diez segundos, y es la única duda
   abierta sobre el SEO ya desplegado: si la tarjeta de ~1,4 MB se descarta por
   tamaño, hay que bajar el ancho de origen a `w=640`.
5. **`NEXT_PUBLIC_APP_URL` no está en Vercel.** Producción cae en el valor por
   defecto del código.
6. **El muro del piloto sigue montado en el cliente** (`PilotWall`,
   `features/pilot/`, `packages/contracts/src/pilot.ts`). No hace daño — se
   autodesmonta por fecha y ya no consulta ninguna tabla — pero es código de una
   feature retirada cuya tabla borró `0164`.
7. **No existe cambio de contraseña.** Tras un robo se pueden cortar las sesiones
   (HU-X-011) pero no impedir que quien sepa la contraseña vuelva a entrar. Es la
   mitad que le falta a «perdí mi teléfono».
8. **Verificar el logout con dos teléfonos de verdad contra producción**, que es
   como apareció el bug. El e2e prueba la revocación contra el auth local.

---

### Cerrado después de escribir este handoff

Las deudas 4 y 7 del handoff del logout (el test de `unsubscribeFromPush` y el
cliente de servidor suelto) se cerraron en `9f25c86`, ya dentro de esta misma
sesión. Con ellas se fue un tercer hallazgo: `apps/api/lib/supabase/server.ts`
era código muerto que se construía **sin `storageKey`**, así que buscaba la
cookie por defecto mientras el navegador escribe en `tindivo-<app>-auth`. No
fallaba: decía «no hay usuario». Un cliente de sesión muerto es peor que
ninguno, porque el día que alguien lo use va a depurar RLS buscando un fallo que
está en el nombre de una cookie. Borrado.

## Siguiente paso que yo daría

1. **Mergear a `main`** y verificar en producción:
   `curl -sI https://www.tindivo.com/negocio/be47c407-37c2-4ad0-b0bc-7ed24b162cf7`
   → 308 hacia `/negocio/pizza-priamo`.
2. **Empujar `0167`**, que es lo único de esta sesión que quedó a medio camino.
3. **Search Console y la prueba de WhatsApp**, que cierran el trabajo del 17-ago
   sin escribir una línea de código.
4. **Google Business Profile.** Sigue siendo lo que más mueve la aguja: el
   problema del piloto no es posicionamiento, es descubrimiento.
