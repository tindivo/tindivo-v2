# Handoff — el logout que echaba a todos

> No continúa ninguna sesión anterior. Lo abrió un síntoma en producción:
> *"me pasó que en dos dispositivos abrí una cuenta de motorizado, cuando me
> logout se salieron ambas"*. El encargo fue auditar primero y arreglar después.

---

## Lo urgente (si solo lees una cosa)

**Nada de esta sesión está commiteado.** Todo vive en el working tree: 28
ficheros modificados y 9 nuevos. La única excepción es
`apps/negocios/components/dashboard/chrome.tsx`, que otro agente se llevó dentro
de su commit `48beb38` mientras yo trabajaba — el cambio está intacto, pero viajó
con un mensaje que no es suyo.

Lo segundo: **el cliente de navegador de `customer` y el de `admin` solo están
probados por build, no en runtime.** Se refactorizaron los cuatro
`lib/supabase/client.ts` para pasar por una fábrica común, y el e2e cubre
`motorizados` y `negocios`. Admin no tiene proyecto de Playwright, y customer
está bloqueado (ver más abajo). Si algo se rompió al refactorizar, se rompió el
login, y se notaría ahí.

---

## El hallazgo estructural

**El spec prohibía este bug por escrito desde el primer día, y nada lo
comprobaba.**

`Docs/05-api-rest.md` §2 decía literalmente *"NUNCA `supabase.auth.signOut()`
directo"*. `Docs/03-arquitectura.md` §5.4 prescribía el fichero
`packages/supabase/src/sign-out-local.ts` con el helper. Ese fichero **nunca se
escribió**. Sin helper, cada app resolvió el logout por su cuenta, y de seis
sitios cinco lo hicieron mal:

| Sitio | Scope |
|---|---|
| `motorizados/…/perfil/page.tsx` | ❌ global |
| `negocios/…/dashboard/chrome.tsx` | ❌ global |
| `negocios/…/use-item-editor.ts` | ❌ global |
| `admin/components/admin-shell.tsx` | ❌ global |
| `customer/…/auth-onboarding/host.tsx` | ❌ global |
| `customer/…/use-checkout-auth.ts` | ❌ global |
| `customer/…/use-account-page.ts` | ✅ local |

`supabase.auth.signOut()` sin argumentos usa `scope: 'global'`, que revoca TODOS
los refresh tokens del usuario contra el servidor de auth. Y el scope es por
USUARIO, no por app: en multi-rol se lleva de paso la sesión de cliente.

Los dos de `customer` eran peores de lo que parecían: no son logouts, son
limpiezas de sesión obsoleta. Un cliente que abría el checkout con una sesión
rancia cerraba la sesión de su otro teléfono sin haber tocado nada.

Y `Docs/CHECKLIST-VERIFICACION.md:130` daba esto por **verificado** (*"`signOut`
por dispositivo ✅"*). No lo estaba.

**La lección: un spec no es un guardarraíl.** De ahí `pnpm check:auth`.

---

## Lo que se hizo

Nada de esto está desplegado ni commiteado; es lo que hay en el árbol.

| | |
|---|---|
| `packages/supabase/src/sign-out-local.ts` | `signOutLocal()` + `signOutEverywhere()`. Único módulo autorizado a fijar scope |
| `packages/supabase/src/client-helpers.ts` | `createTindivoBrowserClient()`, con la convención del `storageKey` |
| `scripts/check-auth-boundaries.mjs` | `pnpm check:auth`, 3 reglas, atado a CI |
| `apps/*/lib/sign-out.ts` | `signOutDevice()` por app: baja del push **antes** del signOut |
| `packages/ui/src/push.ts` | `unsubscribeFromPush()` + `dropLocalPushSubscription()` |
| `DELETE /push/subscriptions` | Acepta `{ all: true }`, acotado por `user_id` |
| `e2e/driver/logout-local.spec.ts` | Los dos caminos: local no echa al otro, «perdí mi teléfono» sí |
| HU-X-011 | Cerrar sesión en todos los dispositivos, en motorizados y cliente |

Verificado: `pnpm build` (5 apps), `type-check` 11/11, `pnpm test` 7/7 (api 126,
motorizados 85, contracts 97, negocios 58, core 18, customer 16), e2e `driver`
9/9, `check:auth` verde con las 3 reglas probadas por mutación.

---

## Lo que intenté y NO funcionó

### El e2e que no probaba nada

La primera versión del test creaba dos contextos con `browser.newContext()` y
daba por hecho que nacían limpios. **No nacen limpios: heredan las opciones del
proyecto**, y el proyecto `driver` trae el `storageState` del primer motorizado
que deja en disco `motorizados.setup.ts`. Los dos "dispositivos nuevos"
arrancaban ya logueados con otra cuenta.

El arreglo es `storageState: { cookies: [], origins: [] }` **explícito**. Un
`storageState: undefined` no sirve: en el merge de opciones de Playwright,
`undefined` no pisa el valor heredado.

### Comprobar la sesión por pantalla es una aserción vacua

La versión intermedia del test recargaba el segundo dispositivo y comprobaba que
seguía dentro. **Eso pasa en verde con el bug puesto**: el access token dura una
hora en memoria, así que tras un logout global el otro equipo sigue pintando la
app tan tranquilo.

Se ve en los logs de la corrida contra el código viejo — `[X5] B sigue dentro
tras recargar` aparece igual, y lo que falla es la línea siguiente. La única
aserción que sostiene la HU es **canjear el refresh token del segundo
dispositivo contra el servidor de auth**: 200 = vivo, 400 = revocado.

Mismo criterio para el guard y para el endpoint: los tres se verificaron por
mutación, rompiéndolos a propósito para ver el rojo.

### Un defecto que introduje y tardé en ver

Al meter `signOutLocal` en `admin` y `customer` convertí un import de **tipos**
en un import de **runtime** desde `@tindivo/supabase`. Esas dos apps **no
declaraban ese paquete en `transpilePackages`** (negocios y motorizados sí).

Lo grave es qué no lo detectó: `pnpm type-check` pasó 11/11 con el fallo dentro,
y el lint también. **Solo `pnpm build` lo veía**, y solo porque fui a compilar
por otro motivo. Los tipos se borran al compilar; un import de runtime no.

### Un diagnóstico mío que estaba mal

Le dije al usuario que **solo `motorizados` tenía push**, y por tanto que la baja
del push al cerrar sesión solo hacía falta ahí. Falso: mi `grep` buscaba
`PushManager|usePushSubscription` y las otras tres apps usan `pushManager` en
minúscula desde `components/push-manager.tsx`, con el helper `subscribeToPush` de
`@tindivo/ui`. Las cuatro apps tienen push, y ninguna daba de baja al salir.

### El diseño del cliente compartido, en dos intentos

La primera versión de `client-helpers.ts` leía `process.env.NEXT_PUBLIC_*` dentro
del paquete. Eso arrastra `@types/node` a `packages/supabase` (que hereda
`base.json`, sin tipos de Node) y ata el paquete a que las cinco apps lo declaren
en `transpilePackages` para que Next sustituya las referencias.

Se cambió a recibir la configuración: la app pasa sus propias variables, el
paquete pone validación, tipado y la convención del `storageKey`. **Una librería
que lee variables de entorno globales hereda el problema de quien la compila.**

### Callejones menores, por si ahorran tiempo

- **PostgREST rechaza un `DELETE` sin ningún filtro.** Al mutar el endpoint para
  probar T21, esperaba ver la tabla vaciada y lo que hubo fue un error. El test
  se pone rojo igual, pero por otro motivo del que suponía; el comentario del
  test lo dice ahora.
- **`pnpm biome check .` falla de base** (2 errores preexistentes, ~92 warnings).
  Hay que filtrar por los ficheros propios o no se distingue lo que rompiste tú.
- **Matar el dev server a mitad deja `.next/dev/types/routes.d.ts` corrupto**, y
  el `type-check` falla con `TS1160: Unterminated template literal` en un fichero
  generado. Se borra el `.next` de esa app y ya.

---

## Deuda registrada, sin implementar

1. **Commitear.** 28 modificados + 9 nuevos, sin commitear. Es lo primero.
2. **`apps/customer` (:3000) devuelve 500.** `next/image` con `Invalid src prop`
   sobre `http://127.0.0.1:54321/storage/...` — el host `127.0.0.1` no está en
   `images.remotePatterns` (solo `**.supabase.co`). Es trabajo en vuelo de otro
   agente y no se tocó, pero **bloquea `pnpm test:e2e` entero**: la sonda de
   arranque de Playwright exige que esa app responda < 400 aunque los tests que
   corras no la usen. Hubo que correr con una config temporal sin `webServer`.
3. **Los clientes de `customer` y `admin`, sin probar en runtime.** Ver "Lo
   urgente".
4. **`unsubscribeFromPush()` de `@tindivo/ui` no tiene ni un test.** Lo usan las
   cuatro apps al cerrar sesión. El e2e del motorizado ejercita el logout, pero
   por el hook propio de esa app (`use-push-subscription`), no por el helper
   compartido. El camino de negocios/admin/customer está sin cubrir.
5. **No existe cambio de contraseña.** La contraseña solo se fija al crear la
   cuenta desde administración. Tras un robo, ahora se pueden cortar las sesiones
   vivas (HU-X-011), pero **no se puede impedir que alguien que sepa la
   contraseña vuelva a entrar**. La mitad que falta de la función.
6. **«Cerrar sesión en todos» no está en negocios ni admin.** Decisión, no
   olvido: son equipos fijos del local, no teléfonos personales. El helper y el
   endpoint ya existen; falta solo la UI si algún día se pierde una tablet.
7. **El cliente de servidor sigue suelto.** `apps/customer/lib/supabase/server.ts`
   construye su propio `createServerClient` con el `storageKey` repetido a mano.
   La regla `cliente-browser-suelto` de `check:auth` no lo alcanza — vigila
   `createBrowserClient`, no el de servidor. `Docs/03-arquitectura.md` §5.4
   prescribía wrappers para los dos.
8. **La rama de reversión de `generate_delivery_charges` sigue ahí.** No se tocó;
   la nota de CLAUDE.md sobre el invariante 8 sigue vigente tal cual.

---

## Sobre trabajar con el árbol compartido

**Volvió a pasar, y esta vez me capturó un fichero.** Otro agente commiteó
`48beb38` mientras yo trabajaba y se llevó dentro mi edición de `chrome.tsx`. No
se perdió nada, pero el cambio quedó atribuido a otro trabajo.

También apareció trabajo ajeno en `apps/customer/next.config.ts` (redirects del
v1) y en `opengraph-image.tsx` mientras editaba ficheros vecinos.

**Confirma lo que ya decía el handoff anterior: `git status` antes de cada
`git add`, y commitea en cuanto verifiques.** El intervalo entre "esto funciona"
y "esto está commiteado" es exactamente la ventana en la que te lo llevan.

---

## Siguiente paso que yo daría

1. **Commitear**, atribuyendo fichero por fichero. Yo separaría en dos: el fix
   del logout (el bug reportado) y las mejoras que salieron de él (guard, push,
   HU-X-011, cliente compartido).
2. **Arreglar el 500 de customer** —una entrada en `images.remotePatterns` para
   el storage local— y con eso correr `pnpm test:e2e` completo por primera vez en
   esta sesión. Cierra de paso la deuda #3.
3. **Un test del `unsubscribeFromPush` compartido** (deuda #4). Es el único
   camino nuevo que hoy no tiene nada que lo sostenga.
4. **Verificar en producción con dos teléfonos de verdad**, que es como apareció
   el bug. El e2e prueba la revocación contra el servidor de auth local; nadie ha
   repetido el gesto original contra `tindivo-prod`.
5. **Cambio de contraseña** (deuda #5), que es lo que convierte «perdí mi
   teléfono» en una respuesta completa y no en media.
