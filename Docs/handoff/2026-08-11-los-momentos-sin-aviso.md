# Handoff — los momentos que no avisaban

> Continúa `2026-08-10-push-y-admin.md`. **Cierra su deuda #2** (el hueco del
> temporizador) y encuentra otros cinco huecos del mismo tipo. El síntoma que
> abrió la sesión fue: *"sigue mal la parte de notificaciones — falta cuando creo
> los pedidos y cuando llega a los 10 minutos"*.

---

## Lo urgente (si solo lees una cosa)

**Todo lo de esta sesión está desplegado en producción, y sigue sin haber una
sola prueba de que una notificación llegue a un celular.**

Es la MISMA frase con la que cerró la sesión anterior. Lo que cambió es que
ahora la parte del motorizado sí tiene evidencia indirecta —Jesús confirmó que
el aviso de "pedido listo" le llega—, así que el tramo `FCM → celular` funciona
al menos para ese destinatario y esa pareja VAPID.

**El eslabón sin ninguna evidencia es la cajera.** Todas las notificaciones que
alguien ha visto llegar son del motorizado. Nadie ha comprobado que el
dispositivo del negocio tenga suscripción.

**Primer paso de la próxima sesión, y son treinta segundos:** abrir `negocios`
en el celular del local y mirar si aparece el botón flotante **"🔔 Activar
avisos"**. Si aparece, es que nunca se suscribió, y ninguno de los arreglos de
esta sesión le va a llegar. Eso es más urgente que cualquier código.

Después, tras el primer pedido real:

```sql
SELECT event_type, status, error_code, left(error_message,80), at
  FROM public.push_delivery_log ORDER BY at DESC LIMIT 10;
```

---

## El hallazgo estructural

**Había DOS caminos de push en paralelo, y el aviso de la cajera colgaba del que
estaba muerto.**

| Camino | Por dónde | Quién lo usaba |
|---|---|---|
| Outbox | `domain_events` → trigger `dispatch_event` → pg_net → Edge Function `send-push` | Los doce avisos del ciclo del pedido |
| Inngest | `apps/api` → `inngest.send()` → `sendPushToUser` (`apps/api/lib/push/send.ts`) | **Solo** el "nuevo pedido" a la cajera |

El segundo tenía su propia pareja VAPID (variables de Vercel, distintas de los
secretos de Supabase), sus errores tragados por un `catch {}` sin registro, y un
`tag: 'new-order'` constante — así que dos pedidos seguidos colapsaban en una
sola notificación, contra el invariante #5 de CLAUDE.md.

Su punto de llamada ya llevaba escrito el diagnóstico: `// TODO: dispatch vía
outbox`. Eso se hizo. El camino de Inngest está eliminado.

---

## Los seis momentos que resolvían a cero destinatarios

Dos eran los reportados. Los otros cuatro salieron de cruzar **todos** los
eventos que emite alguna función viva contra las ramas que `send-push` atiende:

```sql
select p.proname, m[1] from pg_proc p
join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public',
lateral regexp_matches(pg_get_functiondef(p.oid),
  '''(Order[A-Za-z]+|Transfer[A-Za-z]+|Cash[A-Za-z]+)''\s*,\s*jsonb_build_object', 'g') m;
```

| Momento | Quién no se enteraba | Por qué |
|---|---|---|
| Se cumple `appears_in_queue_at` | Motorizado | **No existía el evento.** Único camino de entrada a la bandeja sin aviso |
| Pedido nuevo del cliente | Cajera | `OrderCreated` sí viajaba, pero su única rama exigía `status = 'preparing'` y el pedido del cliente nace en `pending_acceptance`/`validando` |
| `arrived_customer` | Cliente | Se despacha, no había rama |
| `no_show` | Cliente y negocio | Idem |
| `validate_fail_retry` | Cliente | Idem |
| `validate_fail` | Cliente | Idem |

**El peor era `arrived_customer`**, y conviene entender por qué: marcar la
llegada arranca el reloj de `noShowWaitMinutes`; al vencer, el motorizado puede
declarar `no_show`, y esa rama de `advance_order` cancela el pedido **e inserta
una fila en `customer_strikes`** en la misma transacción. `create_customer_order`
lee esa tabla y exige validación en todos los pedidos futuros de ese teléfono.
O sea: un cliente podía perder su pedido y quedar penalizado de forma permanente
sin que jamás se le avisara de que el motorizado estaba en su puerta.

---

## Lo desplegado

Producción `tindivo-prod` (`zpnipajgwfthxhdtzhly`):

| | |
|---|---|
| `0136_the_queue_clock_rings` | `OrderQueued` + sello `queue_notified_at` + cron por minuto + lista blanca |
| `0137_two_indexes_that_indexed_everything` | Dos índices parciales cuyo predicado nunca dejaba de cumplirse |
| `0138_the_prunes_that_never_pruned` | `prune-domain-events` corregida + purga nueva de `outbox_events` |
| `send-push` | v8 → **v9**, seis ramas nuevas |

Commits en `develop`, **sin pushear**: `0f7279c`, `233ae2e`, `7360eeb`.

⚠️ **Mientras no se pushee `develop`, el API de Vercel sigue con el camino de
Inngest desplegado.** Si estuviera vivo, el aviso de pedido nuevo llegaría dos
veces (tags distintos). Se sospecha que no lo está — es la razón de que no
llegara nada.

---

## Lo que intenté y NO funcionó

### El error que más tiempo costó

**Diagnostiqué el API equivocado durante un buen rato.** `DEPLOY.md` dice que el
API vive en `api.tindivo.com`, así que sondeé ahí: `/api/inngest` daba 404,
`/api/v1/public/pilot-access` daba 404, y todas las rutas nuevas daban 404. La
conclusión aparente —"el API en producción está un mes atrasado"— era falsa.

`api.tindivo.com` es el **API del v1 legacy**. El de v2 está en
**`apiv2.tindivo.com`**, y ahí `/api/inngest` responde `401 Unauthorized`, que es
justo lo que responde `serve()` de Inngest cuando SÍ hay signing key configurada.

Lo cerró bajar el bundle de `negocios.tindivo.com` y buscar la URL dentro:

```bash
curl -s https://negocios.tindivo.com | grep -o '/_next/static/chunks/[^"]*\.js'
# ...descargar los chunks y buscar 'tindivo' → https://apiv2.tindivo.com/api/v1
```

**Lección: el host de producción se saca del bundle desplegado, no de la
documentación.** Es la misma lección que la sesión anterior aprendió con
`pg_get_functiondef` frente a `supabase migration list` — verificar contra el
objeto vivo, no contra el fichero que lo describe.

### Un defecto que introduje y arreglé una hora después

La `0136` creó `orders_queue_pending_idx` filtrando solo por
`queue_notified_at is null`. Hay un camino normal por el que un pedido nunca se
sella: si la cajera marca "listo" **antes** de su momento de cola (`ready_early`,
0109), pasa a `waiting_driver`, deja de cumplir el filtro del cron y **se queda
en el índice para siempre** con una fecha vencida. La `0137` mete `status` en el
predicado, y entonces las filas salen solas.

Salió de que el usuario preguntara *"¿voy a depender siempre del cron?"*.
La pregunta era sobre el costo del sondeo; la respuesta honesta obligó a mirar
el índice de verdad, y ahí estaba el defecto. **Vale la pena responder las
preguntas de rendimiento midiendo en vez de tranquilizando.**

### Callejones menores, por si ahorran tiempo

- **El alfabeto de `short_id` no tiene I, O, 0 ni 1.** Tres intentos perdidos
  sembrando pedidos de prueba (`QTEST001`, `QTESTDOR`, `QTESTIDX` — todos
  rechazados por `orders_short_id_format`). Sirven `QTESTCLA`, `QTESTDRA`,
  `QTESTNDX`.
- **`pg_get_functiondef` revienta con agregados** (`"array_agg" is an aggregate
  function`). Hay que filtrar `p.prokind = 'f'`.
- **La salida de `psql -t -A` arrastra el salto de línea**, y metida en un JSON
  para `curl` da `Bad control character in string literal`. `tr -d '\r\n'`.

---

## Cosas que parecían pendientes y ya estaban hechas

Revisar el backlog contra el código vivo devolvió dos entradas mintiendo:

- **ALE-03** estaba marcada **🔴 P0 bloqueante** ("subir `acceptanceMinutes` de 5
  a 15"). La `0113` ya lo hizo; el valor vivo es 15.
- **NOSHOW-01** decía "hoy el motorizado puede marcar no-show en el segundo cero"
  y "falta un timestamp de llegada al cliente". La `0114` resolvió las dos cosas.

**Una entrada de backlog que describe un problema ya resuelto es una trampa.**
Ambas quedaron marcadas ✅ DONE con la evidencia.

---

## Deuda registrada, sin implementar

1. **DEUDA-08 · `send-push` la invoca cualquiera con la anon key.** Confirmado:
   el smoke test contra producción se hizo con esa llave pública. El arreglo está
   diseñado y verificado como viable (secreto en `app_settings.push_dispatch`,
   que NO es de lectura pública). **El orden de despliegue no es opcional** y
   está escrito en la entrada del backlog: al revés mata todas las
   notificaciones en silencio.
2. **NOSHOW-08 · Insistir con el cliente antes del no-show.** Hoy recibe un solo
   aviso en la puerta antes de llevarse un strike permanente.
3. **El outbox sigue sin reintentar.** `published_at`, `retry_count` y
   `last_error` son columnas muertas. La `0138` quitó la condición de purga que
   dependía de la primera; si algún día se construye el reintento, la purga tiene
   que volver a excluir lo pendiente.
4. **`advance_order`, acción `preparing`: código inalcanzable.** Su guarda exige
   `status = 'confirmed'` y ninguna función escribe ese estado. No se tocó:
   borrarlo obliga a reemitir una función de 400 líneas para quitar código que
   hoy no puede ejecutarse. Mismo criterio que la rama muerta de
   `generate_delivery_charges` en CLAUDE.md.

---

## Sobre trabajar con el árbol compartido

**Volvió a pasar lo de la sesión anterior**, y esta vez con consecuencia técnica:
mientras trabajaba aparecieron cambios ajenos en `DECISIONS.md` y en seis
ficheros de `apps/motorizados/`. Esa persona añadió `vitest` a
`apps/motorizados/package.json`, y **mi `pnpm install` lo resolvió dentro del
lockfile**, mezclando su alta con mi baja de `web-push` en un solo fichero.

Eso quita la salida fácil: commitear solo lo mío incluyendo el lock dejaba el
lock declarando algo que el `package.json` commiteado no pedía, y
`--frozen-lockfile` se cae en CI. Se resolvió solo cuando la otra persona
commiteó (`1311ccd`) — aunque commiteó el `package.json` **sin** el lock, así que
HEAD quedó inconsistente igual y el commit `0f7279c` lo repara de paso, dicho en
su mensaje.

**Si el árbol se mueve mientras trabajas: `git status` antes de cada `git add`,
atribuir cada fichero, y `pnpm install` es una operación que captura trabajo
ajeno sin avisar.**

---

## Siguiente paso que yo daría

1. **El botón "🔔 Activar avisos" en el celular del local.** Treinta segundos, y
   decide si algo de esta sesión sirve para la cajera.
2. **Un pedido real** y la consulta a `push_delivery_log`. Cierra la única
   pregunta abierta desde hace dos sesiones.
3. **Pushear `develop`**, que retira el camino de Inngest del API.
4. Con eso sano, **DEUDA-08**, con ventana de verificación.
5. Y lo que de verdad bloquea el lanzamiento no es nada de esto: son las seis
   🔴 P0 del backlog, empezando por **ALE-01** (alarma sonora en negocios), que
   ataca el mismo problema que esta sesión por la vía que no depende de que el
   push llegue.
