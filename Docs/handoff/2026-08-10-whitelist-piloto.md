# Handoff — whitelist para el lanzamiento del piloto

> Sesión de **diseño, no de implementación**. No se escribió ni una línea de
> código ni se tocó la base. Lo que hay aquí son hallazgos verificados sobre el
> flujo actual, las decisiones que se cerraron con Jesús y una pregunta abierta
> que bloquea una de las piezas.
>
> No cierra ningún punto de `2026-08-10-push-y-admin.md`: su "Lo urgente" (ver
> una push llegar a un celular) **sigue abierto** y sigue teniendo más
> prioridad que esto.

---

## Lo urgente (si solo lees una cosa)

**Hay fecha: 14 de agosto de 2026, 6:00pm (hora Perú, UTC−5).** Jesús quiere el
lanzamiento con whitelist listo para entonces. Al escribir esto quedan 4 días y
**cero líneas escritas**.

Y hay **una pregunta sin responder que bloquea el muro del frontend** — está
abajo en "Lo que quedó abierto". No empieces por el popup sin resolverla; empieza
por la migración, que no depende de ella.

---

## El objetivo

Abrir el piloto solo a un grupo de números conocidos, para recoger feedback sin
exponer la app a todo el pueblo. Dos cosas distintas que conviene no mezclar:

- **Quién puede mirar** el catálogo (antes del 14).
- **Quién puede pedir** (desde el 14 en adelante).

---

## Hallazgos sobre el flujo actual

Todo verificado leyendo el código en esta sesión.

**El catálogo es público de verdad.** `apps/customer/app/page.tsx` no tiene
ningún gate de sesión, y los datos salen de `/api/v1/public/businesses` servido
con `service_role` (la nota está en `0002_tables.sql:650-655`: se sirve por API
a propósito, no por vista expuesta a anon). **Consecuencia: un popup en el
frontend no puede ocultar el catálogo, solo taparlo visualmente.** El dato sigue
a un `curl` de distancia. Eso no lo hace inútil —comunica el piloto y el
countdown— pero no cuenta como capa de seguridad.

**El hueco que no es obvio: validar solo en `send-code` no sirve.**
`POST /customer/phone/send-code` (Twilio Verify, rate limit 3/24h por `user_id`)
es por donde pasa alguien que verifica su teléfono **por primera vez**. Las
cuentas que ya tienen `phone_verified_at` —seeds, cuentas de prueba, cualquiera
que se registró mientras se probaba— **no vuelven a pasar por ahí nunca**.
Entrarían a pedir sin tocar la whitelist.

**El chokepoint real es la creación del pedido.** `create_customer_order` exige
`phone_verified_at is not null` (`0056_require_verified_phone.sql:97`), y el RPC
se invoca con `service_role` desde
`apps/api/app/api/v1/customer/orders/route.ts:209` — el cliente **nunca** llama
al RPC directo. Ese route ya tiene un comentario de "defensa en profundidad" en
la línea 170; es el sitio natural.

**El teléfono se guarda en E.164.** `phone/verify/route.ts` escribe
`customer_profiles.phone` como `+51XXXXXXXXX`. Si la whitelist guarda 9 dígitos,
la comparación falla en silencio.

**Otros datos de contexto:** el paso de teléfono (`phone-step.tsx`) se reutiliza
en modo `onboarding` y en modo `gate` (`components/gates/phone-gate-modal.tsx`),
así que un check en `send-code` cubre los dos. `app_settings` es
`key text primary key, value jsonb` (`0002_tables.sql:643`). La última migración
en el repo es la `0134`: **la siguiente libre es la `0135`** (confirmar con
`supabase migration list` antes de crearla).

---

## Decisiones cerradas con Jesús

1. **Tabla `pilot_whitelist`**, teléfono en **E.164** como PK, con `label`,
   `notes`, `added_by`, `created_at` y **`revoked_at` (baja lógica, no borrado)**
   para conservar la traza de a quién se sacó. RLS admin-only.
2. **Sembrar la whitelist** con los `customer_profiles.phone` que ya tienen
   `phone_verified_at`, en la misma migración. Si no, se bloquean las propias
   cuentas de prueba.
3. **Dos puntos de enforcement**: `send-code` (falla rápido, no quema créditos de
   Twilio) **y** el route de `/customer/orders` (el que nadie puede saltar).
4. **Parámetros en `app_settings`, no hardcodeados** (regla del CLAUDE.md). Key
   `pilot_launch` con `starts_at`, `whitelist_enabled` y `waitlist_form_url`.
   Lo que compra: el día 14 a las 6pm se apaga con un toggle en admin, **sin
   deploy**.
5. **Pantalla en admin** (`apps/admin/app/whitelist/`): alta, listado, revocar.
   Patrón de `apps/admin/app/motorizados/`.
6. **El muro del frontend es duro**: sin botón de cerrar, catálogo en blur
   detrás, countdown al 14. Se levanta solo al llegar `starts_at`.
7. **Rechazo al pedir** = mensaje + **link a un Google Form** que Jesús revisa
   para medir acogida. **Descartada** la tabla de solicitudes dentro de admin.

Sobre el punto 6 hay una corrección que conviene no perder: se propuso pedir el
número en el popup y se descartó, porque convierte el muro en un **oráculo de
enumeración** ("¿este número está en el piloto?") y mete fricción a la gente que
justamente quieres que mire el catálogo.

---

## Lo que quedó abierto

**1. El escape hatch del muro — bloquea el popup.** Jesús pidió el muro *sin
botón de cerrar*, pero en su primer mensaje también pidió que *"en localhost se
guarda y ya no le vuelve a aparecer"*. **Las dos cosas juntas no se sostienen**:
sin input y sin cerrar no hay nada que guardar ni forma de pasar, y nadie puede
probar antes del 14 — él incluido.

La reconciliación propuesta, **sin respuesta todavía**: un link discreto
("Ya tengo acceso al piloto") que abre el input de número; si está en la
whitelist → `localStorage` → el muro no vuelve a salir en ese dispositivo. La
alternativa que se le ofreció es no tener escape y saltarse el muro con una
variable de entorno solo en el build local.

**2. Falta la URL del Google Form.** Se puede arrancar con el campo vacío en
`app_settings` y que la pegue después desde admin.

---

## Deuda registrada, sin implementar

Todo el trabajo, en el orden en que lo haría:

1. **Migración `0135_pilot_whitelist.sql`**: tabla + RLS + seed de los ya
   verificados + key `pilot_launch` en `app_settings`. **No depende de la
   pregunta abierta** — se puede empezar ya.
2. **Check en `send-code/route.ts`**, antes de llamar a Twilio.
3. **Check en `customer/orders/route.ts`**, con el mensaje y el link al Form.
   Este es el que de verdad enforcea; si solo se hace uno, es este.
4. **Pantalla `apps/admin/app/whitelist/`**.
5. **Muro en customer**: countdown contra `starts_at`, blur, y el endpoint
   público para validar el número **si** se confirma el escape hatch.
6. **Entrada en `DECISIONS.md`** — es la fuente de verdad y esto cambia el
   modelo de acceso.

Cuidado con el countdown: Perú es UTC−5 **sin horario de verano**, pero hay que
calcular contra un instante absoluto, no contra la interpretación local del
dispositivo.

---

## Siguiente paso que yo daría

1. **Antes que nada, "Lo urgente" del handoff anterior**: el push end-to-end.
   Un piloto con whitelist y sin notificaciones no es un piloto.
2. **La `0135`**, que no depende de nada abierto.
3. **El check del route de pedidos** (deuda #3). Con eso solo, el piloto ya está
   cerrado de verdad aunque no exista ni popup ni pantalla de admin.
4. Resolver el escape hatch con Jesús y recién ahí el muro.

El orden importa: los puntos 2 y 3 dan el control real; el 4 es presentación.

---

## Cómo se trabajó

Se leyó el código antes de opinar sobre el diseño, y eso cambió la propuesta dos
veces: el popup dejó de contarse como capa de seguridad al ver que
`/api/v1/public/businesses` es público, y apareció el segundo punto de
enforcement al ver que `send-code` no lo tocan las cuentas ya verificadas.
**Una propuesta de arquitectura discutida sin abrir los ficheros habría dejado
las dos cosas mal.**
