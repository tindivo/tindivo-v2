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

Cinco commits en `develop`, árbol limpio al cerrar.

| Commit | Qué |
|---|---|
| `b23e0d5` | El fix del logout de la sesión anterior: `signOutLocal`, `check:auth`, baja del push al salir, HU-X-011 |
| `f842960` | Los slugs: `0165` + `0166`, rutas de API, 308 uuid→slug, 301 del v1, `DEPLOY.md` |
| `d3488ee` | Desbloqueo de la e2e (500 de customer, orden de los setups), los dos handoffs del 17-ago |
| `01dc5a6` | La suite entera en verde + `0167` |

En producción (`tindivo-prod`): **`0165` y `0166` aplicadas y verificadas contra
el objeto vivo**. Slugs reales: `pizza-priamo`, `la-florencia`, `al-punto`,
`polleria-nadia` — que es exactamente lo que esperan las dos 301 escritas a mano.

Verde al cerrar: `type-check` 11/11, `pnpm test` 7/7, `pnpm build` 5/5,
`check:auth`, y **`pnpm test:e2e` 21/21 — la primera corrida completa que existe**.

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
7. **`unsubscribeFromPush()` de `@tindivo/ui` sigue sin un solo test.** Lo usan
   las cuatro apps al cerrar sesión; el e2e del motorizado ejercita su propio
   hook, no el helper compartido.
8. **No existe cambio de contraseña.** Tras un robo se pueden cortar las sesiones
   (HU-X-011) pero no impedir que quien sepa la contraseña vuelva a entrar.
9. **El cliente de servidor sigue suelto** (`apps/customer/lib/supabase/server.ts`),
   y `check:auth` no lo alcanza: vigila `createBrowserClient`, no el de servidor.
10. **Verificar el logout con dos teléfonos de verdad contra producción**, que es
    como apareció el bug. El e2e prueba la revocación contra el auth local.

---

## Siguiente paso que yo daría

1. **Mergear a `main`** y verificar en producción:
   `curl -sI https://www.tindivo.com/negocio/be47c407-37c2-4ad0-b0bc-7ed24b162cf7`
   → 308 hacia `/negocio/pizza-priamo`.
2. **Empujar `0167`**, que es lo único de esta sesión que quedó a medio camino.
3. **Search Console y la prueba de WhatsApp**, que cierran el trabajo del 17-ago
   sin escribir una línea de código.
4. **Google Business Profile.** Sigue siendo lo que más mueve la aguja: el
   problema del piloto no es posicionamiento, es descubrimiento.
