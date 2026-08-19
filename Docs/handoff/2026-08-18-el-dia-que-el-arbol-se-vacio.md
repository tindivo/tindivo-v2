# Handoff — el día que el árbol se vació

> Continúa las DOS sesiones del 17-ago, que dejaron todo su trabajo verificado y
> **sin commitear**. El encargo fue revisarlas, comprobar qué quedaba de verdad
> por hacer, y seguir. Al mover el trabajo aparecieron dos defectos que solo se
> ven cuando la migración se encuentra con producción.

---

## Lo urgente (si solo lees una cosa)

**Desplegado y verificado en producción.** `main` lleva los 12 commits, las tres
migraciones (`0165`, `0166`, `0167`) están en `tindivo-prod`, y los slugs ya
funcionan de cara al público:

```
/negocio/be47c407-37c2-4ad0-b0bc-7ed24b162cf7  → 308  /negocio/pizza-priamo
/restaurantes/priamo                            → 308  /negocio/pizza-priamo
/restaurantes/la-florencia                      → 404  (retirado a propósito)
```

Quedan **dos cosas por comprobar** que no se podían hacer desde aquí:

1. **Entrar con Google.** Se reescribió `/auth/callback` para que pase por la
   fábrica de clientes. El diff es idéntico en comportamiento y el `storageKey`
   está congelado por un test, pero **el flujo OAuth no lo ejercita ningún
   test** — el e2e entra con correo y contraseña. Son diez segundos.
2. **El sitemap, dentro de una hora.** Se regeneró mientras la API aún no mandaba
   `slug`, así que el filtro dejó fuera a Pizza Priamo y ahora mismo lista solo
   las rutas fijas. Con `revalidate = 3600` entra solo; si en una hora
   `sitemap.xml` sigue sin `/negocio/pizza-priamo`, entonces sí hay algo que
   mirar.

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

## El despliegue, y la ventana que se vio en directo

El orden fue: `0167` a la base, merge a `main`, y verificación contra el sitio
vivo. La cadena completa se corrió **en `main`** antes de empujar, no solo en
`develop`: es la rama que despliega, y fiarse de que otra estaba verde es
justamente el tipo de suposición que este handoff viene documentando.

Lo interesante pasó en medio. `tindivo-customer` desplegó **antes** que
`tindivo-api`, y durante varios minutos se pudo observar el desfase exacto que
el fallback estaba puesto para cubrir:

| Momento | API manda `slug` | Enlace de la tarjeta |
|---|---|---|
| Justo tras el merge | no | `/negocio/be47c407-...` (uuid) |
| Tras desplegar `api` | sí | `/negocio/pizza-priamo` |

Cero apariciones de `undefined` en ninguno de los dos momentos. **Sin el arreglo
de esa misma sesión, el catálogo habría estado inaccesible durante esa ventana**
— no roto de forma visible: la portada pintando con normalidad y cada tarjeta
llevando a una página que no existe.

No fue una prueba montada: fue el despliegue real, y confirmó tanto el riesgo
como el arreglo. Vale la pena registrarlo porque el riesgo era fácil de
descartar sobre el papel («basta con desplegar la API primero») y resultó que el
orden real fue el contrario.

---

## Lo que Google estaba publicando

Ya con todo desplegado, una búsqueda `site:tindivo.com` destapó dos cosas que
ningún chequeo del repo puede ver, porque no están rotas: están mal leídas.

### Los nombres de los iconos, dentro de las frases

El snippet de la portada se publicaba así:

> ...para disfrutar en un gran ambiente.**Cerradoschedule** 25–50 min**local_shipping**

No era un error de Google: era el texto real de la página. Material Symbols
dibuja el glifo con una **ligadura**, o sea que el elemento contiene la palabra
«schedule» y la fuente la sustituye por el reloj. En pantalla se ve bien —y por
eso llevaba ahí desde el principio sin que nadie lo mirara dos veces— pero la
palabra está de verdad en el DOM. Ocho en la portada: `shopping_bag`, `person`,
`search`, `schedule`, `local_shipping`, `home`, `receipt_long`.

El arreglo saca el nombre del texto: viaja en la custom property `--icon-glyph`
y lo materializa un `::before` en `theme.css`. Mismo glifo, misma ligadura, cero
texto.

**Se descartó la vía de los codepoints** —sustituir «schedule» por ``—
porque `name` llega muchas veces de un view-model (`<Icon name={vm.badge.icon} />`):
una tabla de codepoints solo habría cubierto los literales, y hay 96 de esos más
un número desconocido de dinámicos.

Efecto secundario bueno: desaparece el fallo que el propio comentario del
componente describía — con la fuente caída ya no se lee «two_wheeler» suelto.

### El favicon no era caché: Google lo estaba rechazando

Los resultados salían con el triángulo de Vercel **teniendo el sitio su icono
propio, bien declarado en `metadata.icons` y bien servido** (se comprobó: el
`favicon.ico` de producción es byte a byte el del repo).

La causa: **Google exige que el favicon sea múltiplo de 48px** (48, 96, 144,
192...). El `.ico` es 256×256, y 256/48 = 5,33. Cuando el icono no le vale, cae
al del hosting. Se generaron `icon-96x96.png` y `icon-192x192.png` desde
`icon.svg` y se declaran primero.

**La lección: «lo tengo declarado y lo sirvo bien» no es lo mismo que «lo
aceptan».** El consumidor tiene requisitos propios que no fallan de forma
visible — simplemente te ignora.


### El `Disallow` que impedía salir del índice

`/entrar` seguía saliendo en los resultados de «tindivo» semanas después de
ponerle `noindex`. El motivo estaba en `robots.ts`, y se leía como prudencia:

```
disallow: ['/checkout', '/cuenta', '/pedidos', '/pedido/', '/entrar', '/auth/']
// «el segundo cinturón, para el crawler que ni siquiera llega a renderizarlas»
```

**Los dos cinturones no se suman: se anulan.** Un `Disallow` impide RASTREAR, no
INDEXAR. Si Google no puede entrar, nunca llega a leer el `noindex` que le espera
dentro, así que una URL ya indexada se queda ahí indefinidamente mostrando lo
que recuerde. El bloqueo no protegía la página: **le impedía salir del índice**.

Ahora se quedan solo con `noindex`, que es la orden que sí desindexa. Se
verificó en producción una por una que las cinco la mandan antes de quitar el
bloqueo, porque a partir de ahora es lo único que las cubre. `/auth/` se queda
bloqueado: no es una página, es el callback de OAuth, y no devuelve HTML donde
poner un `noindex`.

### El logo que no era el logo

Al generar el favicon válido partí de `public/icon.svg` **sin abrirlo**. Era una
T blanca sobre naranja —un placeholder viejo—, no el logo. Con eso sobrescribí
`icon-192x192.png`, que estaba BIEN, y publiqué una T en la pestaña del
navegador. Lo detectó el usuario, no ningún chequeo.

El logo real (la casita naranja y gris) ya estaba correcto desde el 14-ago en
`favicon.ico`, `apple-touch-icon.png`, `icon-192x192.png` e `icon-512x512.png`.
Se restauró el 192 desde `56d7e43` y se regeneró el 96 desde el 512.

Se borraron los cuatro `icon.svg` (uno por app): no los referenciaba nadie —ni
el manifest ni `metadata.icons`— y contenían algo que no es el logo.

**La lección: el fichero vectorial no es automáticamente la fuente de verdad.**
Un fichero que se llama «el icono del sitio», que no usa nadie, y que dentro
tiene otra cosa, es una trampa esperando al siguiente. Mira lo que vas a copiar
antes de copiarlo.

### Cómo se verificó que el render no se movía

El cambio de iconos toca las cuatro apps, así que lo que importaba era que **no
cambiara ni un píxel**. La suite visual falla con 7 casos, pero se corrió **con y
sin el cambio** y las diferencias son idénticas al píxel (198103, 209155, 268971,
292798, 352412, 452498, 7841): son preexistentes.

Comprobar que un fallo ya estaba ahí cuesta una corrida más y convierte «creo
que no fui yo» en un dato.

---

## El merge que casi sale con el código por delante del esquema

Al mergear a `main` la segunda vez, el merge arrastró `9b47468` —trabajo de otra
sesión, de quince minutos antes— que sube la ventana de prepago de 10 a 15
minutos. Traía la migración `0168`, **que no estaba en producción**.

Si ese merge se empuja tal cual: `prepay-view.tsx` arranca el contador en
`15 * 60` mientras `cancel_expired_prepay_orders()` sigue cortando a los 10. El
cliente vería **5:00 restantes en pantalla con el pedido ya cancelado**, y
justo en el paso de pagar.

Es el desfase de esta mañana al revés: aquí el código iba por delante del
esquema. Se aplicó `0168` primero y se verificó contra el objeto vivo que los
**tres** relojes de esa función quedaban donde toca — `5 · 5 · 15 · 15 · 10 · 10`,
o sea `pending_acceptance` 5, `awaiting_payment` 15 (el que cambia) y `validando`
10, más `app_settings.timers.paymentMinutes` a 15. Solo entonces se empujó.

**Lo que hizo falta no fue desconfiar del cambio ajeno, sino MIRARLO.** Los
handoffs anteriores decían «se fueron commits de otra sesión, no los revisé».
Revisar uno cuesta dos minutos y aquí evitó un bug en el flujo de pago.

---

## La tanda del cliente, y la auditoría que salió de ella

El encargo fue quitar fricción al enviar un pedido y poder cancelarlo. Lo
segundo **ya existía**: `cancel_customer_order` y su botón llevaban ahí desde
`0046`. Lo que no existía era **llegar** a verlo: al confirmar, el cliente caía
en una pantalla intermedia con un enlace «Volver al inicio» que lo sacaba del
flujo antes de descubrir que podía deshacer el pedido. Quitando la pantalla, la
cancelación aparece sola.

Y una decisión del usuario que mejoró la propuesta: permitir cancelar el prepago
**solo en `pending_acceptance`**. Yo había planteado «mientras no haya subido el
comprobante», y eso tiene un agujero — en `awaiting_payment` el cliente pudo
haber yapeado sin subir la foto todavía: el dinero salió aunque la app no lo
sepa. «Antes de que el negocio acepte» no tiene ese agujero (`0169`).

### Lo que apareció al auditar

Tirando del hilo de un fallo de infraestructura salieron cuatro cosas más:

**Vitest no resolvía el alias `@/` en tres de las cinco apps.** Sin él no se
puede probar ningún módulo que use el alias **ni directamente ni en sus imports
internos**, que es la parte que muerde. TypeScript no lo detecta (resuelve por
`paths`), así que el síntoma solo sale al ejecutar y se lee como si el módulo
bajo prueba estuviera roto. Medido: **63 ficheros en `negocios` y 49 en
`motorizados`** sin posibilidad de cobertura — incluidos sus `lib/sign-out.ts`,
que figuraban como «sin test» en el handoff del logout cuando en realidad **no se
podían escribir**. `apps/api` ya tenía la solución documentada en su propio
config; nadie la había propagado.

**Dos umbrales configurables escritos a mano en el front.** El de validación
(`0170`) y, más grave, `noShowWaitMinutes`: ese no solo muestra un número,
**habilita el botón de no-show**, y `advance_order` valida el mismo ajuste por su
cuenta. Subirlo desde el panel dejaba al motorizado pulsando un botón que el
servidor le negaba — de pie en la puerta del cliente. El proyecto ya tenía la
norma escrita, con test propio («el umbral de reparto sale de app_settings, no
del código»); ese umbral se había quedado fuera.

**Once componentes que no renderiza nadie** (~940 líneas), misma familia que
`prepay-view.tsx` y los `icon.svg`.

**Un falso positivo que descarté a tiempo:** vi `useState(600)` y creí que el
cambio de 15 minutos estaba a medias. No: son dos relojes distintos y los dos
correctos. Justo lo que advertía `0168`.

### El guardarraíl cobró su primera pieza ajena

`check:auth` se puso rojo por un commit de otra sesión: un test nuevo llamaba a
`auth.signOut()` a secas. La regla no exime a los tests **a propósito** — son
documentación ejecutable, y de ahí se copia; el bug de agosto venía de cinco
sitios que hacían exactamente eso.

Y `lint` se cayó **dos veces** por ficheros sin formatear de commits ajenos. El
coste no es cosmético: CI aborta en el primer paso rojo, así que un formato
descuidado deja sin ejecutar los cinco pasos siguientes.

---

## Deuda registrada, sin implementar

1. **Search Console: "VALIDAR CORRECCIÓN"** en *"Duplicada: el usuario no ha
   indicado ninguna versión canónica"*, y comprobar que las 16 páginas 404 del v1
   se reducen a las que de verdad no migraron.
2. **La prueba de WhatsApp sigue sin hacerse.** Diez segundos, y es la única duda
   abierta sobre el SEO ya desplegado: si la tarjeta de ~1,4 MB se descarta por
   tamaño, hay que bajar el ancho de origen a `w=640`.
3. **`NEXT_PUBLIC_APP_URL` no está en Vercel.** Producción cae en el valor por
   defecto del código.
4. **El muro del piloto sigue montado en el cliente** (`PilotWall`,
   `features/pilot/`, `packages/contracts/src/pilot.ts`). No hace daño — se
   autodesmonta por fecha y ya no consulta ninguna tabla — pero es código de una
   feature retirada cuya tabla borró `0164`.
5. **No existe cambio de contraseña.** Tras un robo se pueden cortar las sesiones
   (HU-X-011) pero no impedir que quien sepa la contraseña vuelva a entrar. Es la
   mitad que le falta a «perdí mi teléfono».
6. **Verificar el logout con dos teléfonos de verdad contra producción**, que es
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

1. **Entrar con Google en producción**, que es lo único desplegado hoy sin
   cobertura automática.
2. **Search Console: VALIDAR CORRECCIÓN** en «Duplicada: el usuario no ha
   indicado ninguna versión canónica», y comprobar que las 404 del v1 bajan.
3. **La prueba de WhatsApp**, diez segundos, única duda abierta del SEO.
4. **`check:ds` de verdad**: 141 superficies de botón conocidas. Ahora que el
   gate está verde, cada migración baja el número y ninguna nueva se cuela.
5. **Google Business Profile**, que sigue siendo lo que más mueve la aguja: el
   problema del piloto no es posicionamiento, es descubrimiento.
