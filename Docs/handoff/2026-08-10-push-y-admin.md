# Handoff — push que no llegaba + admin de motorizados

> Sesión posterior a `2026-08-10-sprint-motorizados.md`. **Cierra su punto #4 de
> deuda** (push en producción) y **resuelve su "Lo urgente"**: el despliegue de
> `negocios` SÍ tiene el código nuevo — el bundle de `/nuevo` contiene
> `totalAmount` y no `orderAmount`. Esa duda está cerrada.

---

## Lo urgente (si solo lees una cosa)

**Las notificaciones push funcionan en producción, pero NADIE ha visto una
llegar a un celular.**

Se arreglaron tres causas independientes —cada una bastaba para que no llegara
nada— y se verificó que el servidor arranca y resuelve destinatarios. Lo que no
se ha hecho ni una vez es el tramo final: `FCM → celular`.

**Primer paso de la próxima sesión:**

1. Un pedido real de Pizza Priamo, marcado **listo** por la cajera.
2. Leer en producción:

```sql
SELECT status, error_code, left(error_message,120), at
  FROM public.push_delivery_log ORDER BY at DESC LIMIT 5;
```

- Fila con `status='ok'` → **el piloto tiene notificaciones**. Cerrado.
- Fila con `error_code=403` → la suscripción se creó con otra pareja VAPID; hay
  que revocar y resuscribir en el dispositivo.
- **Cero filas** → mirar `net._http_response` y `domain_events`: o no hubo
  evento, o el despacho no salió.

No hace falta que el motorizado active disponibilidad: desde el despliegue de
esta sesión, `send-push` ya no filtra por `is_available`.

---

## El objetivo

Un solo síntoma reportado —*"no me llegan las notificaciones"*— que resultó tener
**tres causas simultáneas e independientes**. Y, en paralelo, paridad de UX con
el legacy (`Code/tindivo-delivery`) en las pantallas del motorizado.

---

## Estado del código

### Producción (`tindivo-prod`, ref `zpnipajgwfthxhdtzhly`)

| Cambio | Estado |
|---|---|
| `VAPID_PUBLIC_KEY` corregida (la vieja estaba malformada) | ✅ vivo |
| `send-push` redesplegado: sin filtro de disponibilidad, deeplink real, error de consulta que ya no se traga | ✅ vivo |
| Ernesto Cruz asignado a Pizza Priamo en `driver_restaurants` | ✅ vivo (fila insertada a mano) |
| `0129` · `0130` · `0131` | ✅ aplicadas |

Digest de `VAPID_PUBLIC_KEY` en prod, para comparar en el futuro:
`98629bd885abc5531412b93a10a1a144c851a1cb95a7c0f707be731f27016028`
(verificado estable a las 24 h — no hay ningún proceso mutando secretos).

### Repo (`develop`)

```
b91d437 chore(db): 0132 — turno por defecto toda la semana
75ae913 fix(db): 0133 — motorizados y negocios se vinculan solos
6ff7f80 feat(admin): el panel asigna locales y registra la placa
e85b02c fix(tooling): check:ds ancla por hash, no por línea
41dd7e4 fix(db): 0131 restores change_to_give on manual orders
```

**Sin pushear a producción: `0132`, `0133`** (y la `0134` de Jesús).
⚠️ Mientras la `0133` no llegue, **el próximo motorizado que se dé de alta
vuelve a caer en el mismo hueco de Ernesto**.

---

## Las tres causas del push, por si vuelve a pasar

Importa el orden en que se encontraron, porque arreglar las dos primeras **no
cambió nada observable** — y eso es lo que hizo el diagnóstico tan largo.

1. **`VAPID_PUBLIC_KEY` malformada.** `setVapidDetails` lanza en el *module
   scope* de la Edge Function → el worker muere → todas las invocaciones
   responden `WORKER_ERROR` genérico. Desde el 2026-08-01. Se cerró por
   eliminación: un POST con `event_type` inerte —que debería devolver
   `200 {"recipients":0}`— también daba 500, o sea que moría antes del handler.

2. **`send-push` filtraba por `driver_availability.is_available`.** El cron
   `close-driver-shifts` apaga la disponibilidad de todos al cerrar el horario.
   Al día siguiente entra un pedido, nadie está disponible, nadie recibe aviso,
   nadie sabe que hay trabajo, nadie abre la app para activarse. **Bloqueo
   circular.** El v1 ya lo había resuelto y lo dejó escrito en su `send-push`:
   *"dejándolos en un limbo donde no podían volver a participar sin entrar
   primero a la PWA por azar"*. v2 reintrodujo el filtro al reescribir.

3. **Ernesto no tenía ningún local en `driver_restaurants`.** La policy
   `ord_driver_read` filtra los pedidos sin dueño por
   `business_id IN (SELECT business_id FROM driver_restaurants ...)`. Sin fila,
   **no VE los pedidos** (no es que no pueda tomarlos). El formulario de alta
   nunca escribió esa tabla.

**Lección transversal: cuando un síntoma tiene varias causas suficientes,
arreglar una no produce ninguna señal.** Hay que enumerar todas las condiciones
necesarias antes de celebrar la primera.

---

## Lo que intenté y NO funcionó

### Errores de diagnóstico míos

**Atribuí mal los usuarios durante horas.** Llamé "Ernesto" al usuario
`22f27975-…`, que es **Jesús**. Todo el razonamiento sobre "Ernesto ya tiene
suscripción push" se refería a la del propio Jesús. Las conclusiones técnicas
aguantaron, pero perseguí la disponibilidad de la persona equivocada.
**Lección: resolver `auth.users.email` ANTES de razonar sobre un `user_id`.**

**Afirmé que no existía UI para dar de alta motorizados.** Sí existe, en
`apps/admin/app/motorizados/`. Busqué `*driver*` en `apps/admin` y no encontré
nada porque **v2 nombra las rutas en español y el código en inglés**. Lo que sí
era cierto —y es otra afirmación— es que no había UI para *asignar locales*.

**Validé un diseño equivocado sembrando estado por SQL.** Puse
`occupancy_slots = 2` a mano para "probar" un chip en la tarjeta, lo vi
aparecer, y di el diseño por bueno. Pero esa columna **solo la escribe la acción
`pickup`**, cuando el motorizado declara cuántas bolsas lleva: en la bandeja "En
espera" siempre vale 1 y el chip no se habría mostrado nunca.
**Lección: escribir estado a mano puede validar un diseño imposible. La prueba
válida fue recorrer `take → arrived → pickup{slots:2}`.**

**Sobrescribí `Docs/spec/rollback-0130.sql` sin mirar si existía.** Existía: era
el rollback de la migración de traspasos. Se restauró. **Comprobar el destino
antes de escribir un fichero que no creaste.**

### Callejones técnicos

- **`psql -c "a; b; c"` es UNA transacción.** Si `c` falla, se revierte también
  el `UPDATE` de `a`. Costó un `take` que decía "aún no disponible" con la fecha
  supuestamente ya cambiada. Usa `-c` separados.
- **`pg_get_functiondef` no termina en `;`**. Si generas una migración desde su
  salida, el CLI lee el fichero entero como **una sola sentencia** y falla.
- **`TG_OP` y `OLD` no se pueden usar en la cláusula `WHEN`** de un trigger que
  cubre `INSERT` — `OLD` no existe ahí y Postgres rechaza la creación. La
  discriminación del flanco va en el cuerpo de la función.
- **Un round-trip de texto en Python sobre Windows convierte LF en CRLF.**
  `git diff` lo normaliza y no lo ve; `git status` y Biome sí. Deja el gate en
  rojo por un cambio invisible.
- **`supabase functions serve --env-file` quita las comillas** al parsear, así
  que NO reproduce el bug de una llave entrecomillada.
- **Los pedidos de prueba en local se borran solos.** `db:seed:e2e:clean` corre
  en el `afterAll` de Playwright; se perdieron tres veces mientras trabajaba.
- **`supabase migration list` no basta para saber qué hay en prod.** Verificar
  contra la definición viva:
  `pg_get_functiondef(...) LIKE '%columna%'`.

### Cosas que parecían defectos y no lo eran

- **`recipients: 0` en local no era un bug del push**: los e2e borraban el
  pedido antes de que el despacho asíncrono lo resolviera.
- **El digest de `supabase secrets list` es `sha256` plano del valor.** Se
  comprobó con dos coincidencias exactas (`VAPID_SUBJECT` y
  `VAPID_PRIVATE_KEY`). Eso permite **verificar un secreto sin verlo** y sin
  proyecto de staging: se computa el hash del candidato en local y se compara.
  Se barrieron 596 variantes de la llave así.
- **El `check:ds` en rojo no eran infracciones nuevas**: el baseline anclaba por
  `fichero:línea`, así que cualquier edición encima de una infracción conocida
  la reportaba como "resuelta" en su línea vieja y "nueva" en la nueva.

---

## Deuda registrada, sin implementar

Por prioridad:

1. **Verificación end-to-end del push.** Ver "Lo urgente".
2. **Hueco del temporizador.** Un pedido entra a la bandeja por dos caminos: la
   cajera lo marca listo (`OrderStatusChanged/ready`, **sí** notifica) o se
   cumple `appears_in_queue_at` (**ningún evento, no notifica**). El segundo
   ocurrió en producción: `3FUV9HVN` entró a la cola por reloj y lo tomaron sin
   que sonara nada. Arreglarlo requiere emitir un evento cuando se cumple la
   marca — probablemente un cron.
3. **`0132` y `0133` sin pushear.** La `0133` es la que evita que se repita el
   caso Ernesto.
4. **`urgent_since` es una columna fantasma.** Se lee en `lib/urgency.ts`, la
   tarjeta, la preview y Equipo, y **`available-tab` ordena la bandeja por
   ella** — pero ninguna migración la escribe (0 filas en prod). Toda esa
   priorización está muerta. Cablearla o quitarla.
5. **`operating_days` / `shift_start` / `shift_end`**: mismo caso. Solo las lee
   el seed de e2e. La `0132` corrigió el valor, no el hecho de que nadie las use.
6. **`cards.tsx:303` (negocios)**: el bloque "Motorizado llegó · Entregar
   pedido" es **inalcanzable** — la guarda de la línea 292 ya descartó
   `waiting`. Rompe `type-check`. No se tocó por no adivinar la intención.
7. **`check:ds` marca falso positivo con `hover:bg-*`.** El regex `SURFACE` no
   excluye variantes de estado, así que un botón sin superficie en reposo pero
   con tinte al hover cuenta como infracción
   (`transfer-watcher.tsx:177`). Rompe el gate.
8. **`send-push` es invocable por cualquiera con la anon key**, que es pública
   (va en el bundle de las 4 apps). Un POST con un `aggregate_id` válido dispara
   avisos. Necesita un secreto propio en un header.
9. **El outbox no reintenta.** `domain_events` tiene `published_at`,
   `retry_count` y `last_error`, y **nadie los escribe nunca**. Un despacho que
   falle se pierde en silencio. De paso, el purgado de `0007_cron.sql:85` borra
   `WHERE published_at IS NOT NULL` → nunca borra nada.
10. **`e2e/visual/iter3_*` y `capture_*` deberían estar en `scratch/`**
    (AGENTS.md §6): son scripts de exploración y hoy rompen el gate de lint.

---

## Siguiente paso que yo daría

1. **El pedido real** de "Lo urgente". Todo lo demás espera a eso: es la única
   pregunta abierta que afecta al piloto esta noche.
2. **Pushear `0132` + `0133`** (y la `0134`). No hay acoplamiento con frontend:
   la `0133` son triggers y un backfill idempotente.
3. Con producción sana, **el hueco del temporizador** (deuda #2), que es el
   único camino por el que un pedido sigue llegando en silencio.
4. Después, `urgent_since` (#4): decidir si se cablea o se quita, porque hoy la
   bandeja ordena por un dato que nadie escribe.

---

## Cómo se trabajó (conviene mantenerlo)

Se mantuvo el criterio de la sesión anterior —evidencia cruda por gate— y se
añadieron dos que valieron la pena en esta:

- **Verificar contra el objeto vivo, no contra el fichero.** `supabase migration
  list` decía una cosa y `pg_get_functiondef` sobre la base de producción decía
  la verdad. Lo mismo con el bundle desplegado: la duda sobre si `negocios`
  tenía el código nuevo se cerró descargando sus chunks y buscando `totalAmount`,
  no mirando el repo.
- **Recorrer el flujo, no sembrar el estado.** Un dato escrito a mano puede
  poner la aplicación en una situación que ella misma nunca produce, y entonces
  la prueba valida algo imposible. Cuando el estado lo genera una acción del
  usuario (`pickup` declara los slots), la prueba tiene que pasar por esa acción.

Y uno que se aprendió por la vía cara: **el repositorio estuvo editándose en
paralelo durante toda la sesión.** Aparecieron migraciones (`0134`), ficheros de
e2e y cambios en `send-push` que no eran míos. Antes de commitear, `git status`
y atribuir cada fichero; y si el árbol se mueve mientras trabajas, decirlo en
vez de capturar cambios ajenos a medias.
