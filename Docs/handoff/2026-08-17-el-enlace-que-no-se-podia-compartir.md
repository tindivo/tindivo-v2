# Handoff — el enlace que no se podía compartir

> Sesión de SEO y compartición del `customer`. Empezó con *"quiero más negro en
> el fondo del restaurante, no hay contraste"* y terminó destapando que la app
> **no tenía una sola etiqueta Open Graph**. Deja el trabajo de slugs a medias y
> el Supabase local caído. Lee la sección siguiente antes de tocar nada.

---

## Lo urgente (si solo lees una cosa)

**El Supabase local está caído y lo tumbé yo.** El contenedor
`supabase_db_zpnipajgwfthxhdtzhly` llevaba **5 días `unhealthy`**; al lanzar
`supabase db reset` Docker no pudo matarlo, y mi `docker restart` lo dejó peor:
ahora ni `docker exec` entra.

```
OCI runtime exec failed: unable to start container process: error executing setns process
```

**Se arregla reiniciando Docker Desktop.** La base remota NO está afectada.

**Y lo que de verdad importa:** la migración `0165` está escrita pero **su
sección 6 no se ha ejecutado ni una sola vez**. Esa sección reemplaza
`search_catalog`, que es la búsqueda viva de producción. **No la subas sin
haberla corrido antes en local.**

---

## El hallazgo estructural

**Compartir un enlace de Tindivo por WhatsApp no mostraba nada**: ni imagen, ni
título propio, ni descripción. Y WhatsApp es EL canal del piloto.

La causa de fondo era `metadataBase`. Open Graph exige URLs **absolutas**; sin
`metadataBase`, una ruta relativa en `openGraph.images` no se resuelve y Next
**directamente no emite la etiqueta**. Falla en silencio, sin error, sin aviso.

No había tampoco `robots.txt`, ni `sitemap.xml`, ni canónicas. Search Console lo
venía diciendo con un mensaje que nadie había leído:

> *Duplicada: el usuario no ha indicado ninguna versión canónica*

Eso era el apex y el `www` peleándose sin que el sitio dijera cuál mandaba.

---

## Lo desplegado (verificado en producción)

Seis commits, todos en `main` vía merge desde `develop`:

| Commit | Qué |
|---|---|
| `06acfd1` | Velo de la portada del negocio: paradas del degradado en orden inválido |
| `409acc6` | Open Graph, JSON-LD, `robots.ts`, `sitemap.ts`, `noindex` en rutas privadas |
| `0c19776` | El dominio canónico es `www`, no el apex |
| `0e95179` | Tarjeta propia al compartir un restaurante |
| `c7b2e64` | El velo de esa tarjeta no se pintaba, y pesaba 1.74 MB |
| `8bc3ce1` | `q=60` devolvía 400 y la tarjeta salía sin foto |

Comprobado contra `https://www.tindivo.com`: etiquetas `og:*` y `twitter:*` en
portada y en negocio, imagen 1200×630 servida como PNG con la foto real,
JSON-LD `Organization` y `Restaurant`, `robots.txt`, `sitemap.xml` con el
negocio publicado, canónica en `www`, y `noindex` confirmado en `/cuenta` y
`/pedido/<shortId>`.

**`/pedido/<shortId>` era indexable hasta esta sesión.** Es el seguimiento de UNA
persona con su dirección dentro. `site:tindivo.com/pedido` no devuelve nada, así
que no llegó a indexarse ninguno — pero la puerta estaba abierta.

---

## Lo que queda a medias: los slugs (migración `0165`)

`/negocio/be47c407-37c2-4ad0-b0bc-7ed24b162cf7` no se puede dictar por teléfono
ni imprimir en un volante, y en un pueblo parece un enlace de estafa. El v1 sí
tenía slugs y Google los conserva indexados: hoy salen como **16 páginas 404**
en Search Console.

### Verificado en local (secciones 1–5, antes de que muriera Docker)

Con inserciones dentro de una transacción revertida:

| Caso | Resultado |
|---|---|
| `Pollería Nadia` | `polleria-nadia` |
| `Ñandú Café & Más` | `nandu-cafe-mas` |
| Dos negocios con el mismo nombre | `...-2`, `...-3` |
| Nombre que se queda en nada (`###`) | `negocio-e1e1ef60` |
| Slug escrito a mano (`Mi SLUG Elegido!`) | `mi-slug-elegido` |
| **Renombrar el negocio** | la URL **no se mueve** |

Esa última fila es la decisión de diseño que importa: **el slug NO sigue al
nombre**. Un slug que se regenera al renombrar rompe todos los enlaces
repartidos y deja el anterior en 404 — justo el problema que veníamos a
arreglar. Por eso el trigger es `before insert or update **of slug**`, no
`update` a secas.

### NO verificado (sección 6)

`create or replace function public.search_catalog(...)` para que la búsqueda
devuelva `slug` y `business_slug`. Escrita, revisada contra la definición viva de
producción, **jamás ejecutada**.

### Código ya hecho, con el front compilando

| Archivo | Cambio |
|---|---|
| `apps/api/.../public/businesses/route.ts` | `slug` en `PUBLIC_COLUMNS` |
| `apps/api/.../public/businesses/[id]/route.ts` | acepta slug **o** uuid (`UUID_RE`) |
| `apps/customer/app/negocio/[id]/page.tsx` | `permanentRedirect` 308 uuid → slug; canónica y JSON-LD por slug |
| `apps/customer/app/sitemap.ts` | URLs por slug |
| `business-card.tsx` · `dish-result-card.tsx` · `home-carousel.tsx` | enlaces por slug |
| `features/catalog/types.ts` · `lib/use-search.ts` | tipos |
| `apps/customer/next.config.ts` | 301 de `/restaurantes/priamo` y `/restaurantes/la-florencia` |

**`apps/api` NO compila todavía**, y es esperado: `database.types.ts` se genera
del **remoto**, que aún no tiene la columna.

---

## El orden exacto de lo que falta

No es opcional el orden: los tipos salen del remoto, así que `db:types` va
DESPUÉS del push.

1. **Reiniciar Docker Desktop.**
2. `supabase db reset` → aplica `0165` entera desde cero. **Es la primera vez que
   se ejecuta la sección 6.**
3. `pnpm db:seed:e2e` — `db reset` borra el mundo e2e y no lo repone.
4. Verificar la búsqueda de verdad, que es lo único sin probar:
   ```sql
   select jsonb_pretty(public.search_catalog('pollo'));
   -- 'slug' en businesses, 'business_slug' en items
   ```
   Y que el escape de `LIKE` sigue vivo: `search_catalog('100%')` no debe
   reventar ni devolver el catálogo entero.
5. `supabase db push` al remoto.
6. `pnpm db:types` → con eso `apps/api` compila.
7. `pnpm type-check`, `pnpm test`, y las e2e que navegan a `/negocio/<uuid>`
   (siguen valiendo: el 308 las lleva al slug).
8. Confirmar los slugs reales en producción antes de fiarte de las 301 de
   `next.config.ts`, que están escritas a mano:
   ```sql
   select name, slug from public.businesses order by name;
   -- se espera pizza-priamo y la-florencia
   ```
9. Merge a `main` y verificar en producción:
   `curl -sI https://www.tindivo.com/negocio/be47c407-37c2-4ad0-b0bc-7ed24b162cf7`
   → 308 hacia `/negocio/pizza-priamo`.
10. En Search Console: **VALIDAR CORRECCIÓN** en "Duplicada: el usuario no ha
    indicado ninguna versión canónica".

---

## Lo que intenté y NO funcionó

### El backslash que se comió el heredoc

Al añadir la sección 6 con `cat >> ... <<'SQL'`, esto:

```sql
replace(replace(replace(v_norm, '\', '\\'), '%', '\%'), '_', '\_')
```

llegó al fichero como `replace(v_norm, '\', '\')` — **un no-op silencioso** que
desactiva el escapado de comodines de `LIKE` sin que nada falle a la vista. Lo
cacé comparando contra `pg_get_functiondef` del remoto.

La versión final usa **`chr(92)`** y la clase POSIX **`'[[:space:]]+'`** en vez
de literales con backslash. Mismo comportamiento, imposible de malinterpretar
por un heredoc, un editor o un `sed`.

**Lección: no metas SQL con backslashes por un heredoc. Usa la herramienta de
escritura de ficheros, o `chr(92)`.**

### `q=60` devolvía 400

Bajé la calidad del optimizador de imágenes buscando un PNG más liviano. Next 16
valida `q` contra `images.qualities`, que **por defecto es solo `[75]`**:

```
w=828  q=60 -> 400
w=1200 q=60 -> 400
w=828  q=75 -> 200 image/jpeg 53 KB
```

El fetch fallaba, se tragaba el error y la tarjeta salía sin foto. Si alguna vez
hace falta otra calidad, hay que declararla en `next.config.ts` primero.

### Satori no decodifica WebP

Los banners de Storage son WebP. Pasarle uno a `next/og` lanza
`TypeError: u2 is not iterable` y la ruta responde *"failed to pipe response"* —
el scraper se queda sin ninguna imagen. Por eso el banner pasa antes por el
optimizador de Next, que transcodifica a JPEG.

### `inset: 0` no existe para Satori

El velo de la tarjeta iba con `inset: 0`; Satori no soporta la abreviatura, el
div se colapsaba a 0×0 y **no se pintaba nada**. Parecía correcto porque la foto
de prueba (Pizza Priamo) es oscura. Hay que usar `top/left/width/height`.

Es el mismo error de fondo que el degradado roto de la portada: **confiar en que
el motor interpreta CSS que no interpreta.**

### La lección de `apiv2` que ya estaba escrita

Perseguí un fantasma durante varias consultas porque
`https://api.tindivo.com/api/v1/public/businesses` devolvía 404 mientras
`/health` respondía 200. La API real es **`apiv2.tindivo.com`**.

`2026-08-11-los-momentos-sin-aviso.md` ya documentaba exactamente esto, con su
lección: *"el host de producción se saca del bundle desplegado, no de la
documentación"*. **Pero nadie corrigió `DEPLOY.md`, así que la trampa seguía
armada y volvió a funcionar.**

Esta vez sí se corrigió: `DEPLOY.md` ya dice `apiv2.tindivo.com` (**no** `api.`).
**Una lección aprendida que no se escribe en el sitio que engaña, se vuelve a
pagar.**

---

## Sobre Search Console (contexto para la próxima sesión)

Está verificado y con datos desde mayo. **3 meses: 134 clics, 477 impresiones,
CTR 28,1%, posición media 5,1.**

Ese CTR es altísimo, y no significa buen posicionamiento: significa que casi
todas esas búsquedas son de gente que **ya escribe "tindivo"**. No hay un
problema de SEO, hay un problema de **descubrimiento**.

Hay **tres propiedades**. Trabajar siempre sobre `tindivo.com` (la de tipo
*Dominio*, sin `https://`), que cubre apex, `www` y subdominios. **No borrar las
otras dos: eliminar una propiedad destruye su histórico para siempre.**

Los 16 errores 404 son URLs del v1 (`/restaurantes/<slug>`). Solo dos
corresponden a negocios vivos y se recuperan con las 301 ya escritas. Los otros
seis (`veneburguer`, `sumaq-restaurante`, `almuerzos-don-chipi`,
`el-nidito-restobar`, `club-de-bienestar-nutret`, `polleria-la-nonna`) no
migraron: para esos **el 404 es la respuesta honesta**, y mandarlos a la portada
con un comodín Google lo trata como soft 404.

---

## Deuda registrada, sin implementar

1. **`NEXT_PUBLIC_APP_URL` no está puesta en Vercel.** Producción cayó en el
   valor por defecto del código. Funciona, pero es frágil: un preview que la
   defina distinto manda las canónicas a otro sitio. Ponerla a
   `https://www.tindivo.com`.
2. **`apiv2.tindivo.com` sirve un 404 en la raíz** — es la API, no tiene página.
   Inofensivo, pero Search Console lo reporta porque el dominio está en la
   propiedad.
3. **La tarjeta de compartir pesa ~1,4 MB.** Advertí que WhatsApp podía
   descartarla por tamaño, pero **no pude verificar ese límite** — no puedo
   mandar un WhatsApp. Hay un intercambio real: velo oscuro comprime mejor pero
   apaga la foto. La prueba es de diez segundos: mandarse el enlace a uno mismo.
   Si no sale la vista previa, bajar el ancho de origen a `w=640`.
4. **`/negocio/<id>` inexistente devuelve 200**, no 404, con el mensaje "Negocio
   no encontrado". Google puede marcarlo como *soft 404*. Lleva `noindex`, así
   que está cubierto, pero si aparecen muchos conviene un 404 real.
5. **El Libro de Reclamaciones sigue en stand by.** Diseñado y acordado (público
   sin login, copia por Resend detrás de `RESEND_API_KEY`, datos del proveedor en
   `app_settings`). Lo bloquea que Tindivo **no tiene RUC**. Basta uno de
   **persona natural con negocio** — gratis, online en SUNAT, sin notaría. La
   imagen del aviso ya está en `apps/customer/public/Libro_de_Reclamaciones.webp`
   (sin commitear).

---

## Sobre trabajar con el árbol compartido

**Volvió a pasar, y esta vez llegó a producción.** Al mergear `develop` en `main`
se fueron con lo mío commits de otra sesión que ya estaban ahí: `48beb38`
(menú móvil "Más" y contraste de portada) y `f4618e3` (UI de Mi cuenta en
negocios). **No los revisé.**

Y `48beb38` toca **el mismo archivo que yo había arreglado**
(`business-hero.tsx`): mantuvo mi estructura de dos velos pero añadió encima un
`bg-black/35` sobre la imagen entera y subió los degradados a `from-black/95`.
La portada quedó bastante más oscura de lo que la dejé. Puede ser deliberado —
conviene confirmarlo con quien lo hizo antes de recalibrar.

Al cierre de esta sesión el árbol tiene además trabajo ajeno a medias sobre
`sign-out`, `push/subscriptions`, `check-auth-boundaries.mjs` y **`pnpm-lock.yaml`**.

**Antes de commitear: `git status`, atribuir cada fichero, y `git add` por ruta
explícita. Nunca `git add -A`.** Los ficheros de esta sesión sin commitear son
exactamente estos:

```
supabase/migrations/0165_the_business_stops_being_shared_as_a_uuid.sql   (nuevo)
apps/api/app/api/v1/public/businesses/route.ts
apps/api/app/api/v1/public/businesses/[id]/route.ts
apps/customer/app/negocio/[id]/page.tsx
apps/customer/app/sitemap.ts
apps/customer/features/catalog/types.ts
apps/customer/features/catalog/components/business-card.tsx
apps/customer/features/catalog/components/dish-result-card.tsx
apps/customer/features/catalog/components/home-carousel.tsx
apps/customer/lib/use-search.ts
apps/customer/next.config.ts
DEPLOY.md
```

---

## Siguiente paso que yo daría

1. **Reiniciar Docker Desktop** y correr los pasos 2–4 de arriba. Sin eso no hay
   nada que empujar.
2. **La prueba de WhatsApp**, que son diez segundos y cierra la única duda
   abierta sobre el trabajo ya desplegado.
3. Terminar los slugs y desplegarlos. **Hoy es lo más barato que va a ser
   nunca**: 1 negocio activo, 4 en total, y casi ningún enlace con uuid
   repartido. Cada semana que pasa se reparten más.
4. **Google Business Profile.** Nada de este handoff mueve la aguja tanto como
   esto: es la ficha en Maps, y para un delivery de pueblo es donde aparecen los
   clientes que todavía no saben que Tindivo existe.
5. El Libro de Reclamaciones, en cuanto haya RUC.
