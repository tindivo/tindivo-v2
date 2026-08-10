# Handoff — sesión del 2026-08-09/10

> Escrito a las **17:14 del 10/08**. La plataforma abre a las **18:00**.
> Lee primero "Lo urgente".

---

## Lo urgente (si solo lees una cosa)

**Nadie ha confirmado que se pueda crear un pedido manual en producción.**

Esta mañana se aplicaron tres migraciones a producción (`0129`, `0130`, `0131`).
La `0129` **renombra el argumento** del RPC de creación de pedidos:
`p_order_amount` → `p_total_amount`. `supabase-js` invoca los RPC **por nombre**,
así que un frontend que mande el nombre viejo falla con *"function does not
exist"*.

El código con el nombre nuevo se empujó a `main` a las 11:31 y el sprint de
motorizados a las 13:08. **Pero la sonda de despliegue no encontró el código
nuevo en `negocios.tindivo.com`**:

```
MOTORIZADOS: código NUEVO detectado en /_next/static/chunks/17hazfydppydy.js
NEGOCIOS:    "delivery + comida" NO aparece en ninguno de sus 11 chunks
```

No es concluyente —la cadena podría vivir en un chunk que solo carga tras el
login—, pero con motorizados la misma sonda **sí** dio positivo, así que el
método funciona.

**Primer paso de la próxima sesión, antes que nada:**

1. Abrir Vercel → proyecto `negocios` → ¿el último despliegue es `bfdb2a1` o al
   menos `fc00722`? Si es anterior, forzar redespliegue.
2. Crear un pedido manual de prueba en `negocios.tindivo.com`. **No hace falta
   tocar el horario**: la `0092` quitó el guard de horario de
   `create_business_manual_order` y el formulario no bloquea por hora
   (verificado: `tiene_guard_horario = f`).
3. Verificar en la base de producción que el desglose sale bien:

```sql
SELECT short_id, order_amount, delivery_fee, change_to_give, client_pays_with
  FROM public.orders WHERE source='business_manual'
 ORDER BY created_at DESC LIMIT 1;
```

Con un total de 27 pagando con 30, debe dar `comida=25 · envío=2 · vuelto=3`.
Si `change_to_give` sale `NULL`, la `0131` no está haciendo su trabajo.

---

## El objetivo

Dos hilos que acabaron entrelazados:

1. **UX del pedido manual (negocios).** La cajera ya dictaba al cliente el total
   con envío incluido, pero el campo —rotulado "Total del pedido"— se enviaba
   como *solo comida* y el backend sumaba el envío otra vez. Escribía 27 y el
   pedido salía a 29.
2. **Paridad del panel de motorizados con el legacy** (`Code/tindivo-delivery`),
   que funcionaba mejor: bandejas, tarjetas, traspasos entre motorizados.

---

## Estado del código

**Producción (`tindivo-prod`, ref `zpnipajgwfthxhdtzhly`):**

| | Base | Repo `main` | Desplegado |
|---|---|---|---|
| 0129 total→comida | aplicada | ✓ | negocios: **SIN CONFIRMAR** |
| 0130 silencio transfiere | aplicada | ✓ | motorizados: ✓ |
| 0131 vuelto en manual | aplicada | ✓ | — |

`main` y `develop` en `bfdb2a1`. Rollbacks versionados en `supabase/rollbacks/`.

**Ajustes vivos en producción:** `transferTtlSeconds=30`,
`maxOccupancySlotsPerDriver=3`, `platform_schedule` los siete días 18:00–23:00,
corte de admisión 22:30.

**Trabajo entregado**, todo con evidencia cruda en el historial de la sesión:

- `0129` — entra el total, la comida se deduce en el RPC. Arregla de rebote dos
  defectos vivos: el pago mixto era **imposible de enviar** (la pantalla exigía
  `billetera+efectivo = comida`, el servidor `= comida+envío`) y el vuelto se
  mostraba inflado por el importe del envío.
- `0130` — revierte la `0119` y restaura la regla de la `0043`: expirar sin
  responder **cede el pedido**, con salvaguarda de capacidad (no se mueve comida
  a una mochila llena) y TTL de vuelta a 30s.
- **Sprint motorizados T1–T8 + C1.1**, en `bfdb2a1` (18 archivos).

---

## Archivos en edición ahora mismo

**Ninguno mío.** El sprint está commiteado y empujado.

Hay **20 archivos sin commitear que son de Jesús**, de un hilo nuevo sobre
administración de motorizados que arrancó mientras yo cerraba:

```
apps/admin/app/motorizados/page.tsx · nuevo/page.tsx
apps/api/app/api/v1/admin/drivers/route.ts · [id]/route.ts
DECISIONS.md   (+ otros)
```

No los toqué y no los conozco.

---

## Lo que intenté y NO funcionó

Esto es lo que más vale del handoff: los callejones sin salida ya recorridos.

### Errores de diagnóstico míos

**Afirmé que el silencio transfería el pedido sin haber leído la función.**
Leí la cabecera de la `0043` ("timeout-as-accept") y vi que
`expire_order_transfers` llamaba a `apply_order_transfer(req,'expired')`.
Nunca abrí `apply_order_transfer`, que desde la `0119` decía literalmente
*"SOLO cambiar motorizado si la solicitud fue ACEPTADA"*. Escribí en la UI
"Pasando el pedido a X" cuando el pedido **se quedaba**. La `0121` había
anticipado el fallo: *"se corrige antes de que el primero que lo lea se lo
crea"*. El primero fui yo.
**Lección: la cabecera de una migración de hace 80 versiones no es la verdad
vigente. Lee la función viva (`pg_get_functiondef`).**

**Culpé al login del E2E de customer sin medirlo.** El login funcionaba
(`/auth/v1/token` 200, cookie creada). La causa real era una **aserción vacua**:
`expect(page.getByLabel('Ingresar')).toBeHidden()` sobre un elemento que **no
existe en `/entrar`** — en Playwright eso pasa al instante, así que el test
navegaba con el login en vuelo y perdía la carrera.

**Dije que "el acoplamiento API↔migración ya viajó al repo".** Comprobé que
estaba *commiteado*, no que estuviera **en la rama que despliega**. Estaba solo
en `develop`; producción despliega desde `main`. Eso dejó producción sin poder
crear pedidos desde el `db push` hasta el cherry-pick.

### Callejones técnicos

- **Rollbacks dentro de `supabase/migrations/`**: el CLI parsea cualquier
  `NNNN_*.sql` de esa carpeta como migración y empezó a ver **versiones
  duplicadas**. Viven en `supabase/rollbacks/` por eso. *No los muevas de vuelta.*
- **Forzar `expires_at` al pasado por SQL para probar la expiración**: dispara
  realtime, el endpoint filtra por `expires_at > now()` y la solicitud
  **desaparece del payload** antes de que la UI pinte el aviso. Hay que dejarla
  caducar sola con un TTL corto.
- **`select sum(...) ... for update`**: Postgres no admite `FOR UPDATE` junto a
  un agregado. Se bloquean las filas con `perform ... for update` y se suma
  después.
- **Tres veces choqué con el alfabeto de `short_id`** (sin `I/O/0/1`). Usa el
  helper, no inventes cadenas.
- **`pnpm test --force` no existe**: `pnpm` se come el flag. Es
  `pnpm turbo run test --force`.
- **`form_input` del navegador no dispara los eventos de React**: el formulario
  se envía vacío. Hay que teclear. Y en `/entrar` los paneles están **inertes**
  hasta llegar a su paso.

### Cosas que parecían defectos y no lo eran

- Visuales de negocios en rojo → era el reordenamiento de métodos de pago sin
  regrabar la captura base.
- Tests del ledger fallando → **no eran frágiles**: son de integración contra
  **una única base compartida** corriendo en paralelo. `fileParallelism: false`
  en `apps/api/vitest.config.ts` cerró dos síntomas a la vez, incluido un falso
  *"el ledger está desalineado"* que es la peor alarma posible para mentir.

---

## Deuda registrada, sin implementar

Por prioridad:

1. **`TAREA-CAP`** — `advance_order` **no valida capacidad** al tomar un pedido.
   El "Mochila llena 3/3" vive solo en el cliente; la API acepta más. La `0130`
   introdujo la primera regla de capacidad en la base, solo para la expiración.
   *Trigger: antes de Moro.*
2. **Compuertas de sesión incompletas** (una sola tarea, tres agujeros):
   `apps/admin/components/auth-gate.tsx` comprueba sesión **pero no rol**
   (entré al panel con un usuario `driver`); `apps/motorizados/app/(driver)/layout.tsx`
   no se suscribe a `onAuthStateChange`, así que tras `signOut` la UI persiste y
   sigue llamando a la API con token muerto. El patrón correcto está en
   `auth-gate.tsx:19-20` de admin. *Trigger: antes de Moro.*
3. **Horarios** — la `0092` quitó el guard de horario de la base justificando que
   *"la fuente de verdad es el horario de cada negocio"*, lo que **contradice** la
   decisión de Jesús (lo fija la plataforma). Verificar si un negocio puede
   configurarse un horario propio hoy.
4. **Push en producción** — el secret `VAPID_PUBLIC_KEY` se corrigió el 09/08 a
   las 03:14 UTC y coincide con la pareja local, pero **la entrega nunca se
   verificó**. Falta el paso 1.6 (pedido real + motorizado disponible) y leer
   `push_delivery_log` en prod.
5. **`R1`** — ciclo `SUBSCRIBED→CLOSED→SUBSCRIBED→CLOSED` al cerrar sesión.
   Cosmético, causa sin establecer.
6. **`R2`** — `TOKEN_REFRESHED` nunca se probó. Síntoma que lo delataría: canal
   muerto tras ~1h de sesión (la pila de traspasos deja de llegar por realtime y
   solo la rescata el poll).
7. **Modal con múltiples solicitudes** — hoy se apilan. *Trigger: más de dos
   motorizados.* **Riesgo si alguien implementa una cola**: una solicitud que
   caduque esperando turno transferiría el pedido sin que el dueño la haya visto.
8. **`ready` vs `normal` en las tarjetas** son visualmente casi idénticos desde
   que `URGENCY_CARD` perdió los rellenos. El caso real lo cubre el badge
   "Comida lista". Decisión pendiente de Jesús.

---

## Siguiente paso que yo daría

1. **Cerrar la duda de producción** (los tres puntos de "Lo urgente"). Todo lo
   demás espera a eso.
2. Si el pedido manual falla → forzar el redespliegue de `negocios` en Vercel.
   Si sigue fallando, la vuelta atrás es `0131 → 0130 → 0129` con el CLI y
   **después** revertir el despliegue. Nunca al revés. Aviso: revertir la `0130`
   **no devuelve los pedidos ya transferidos**; los eventos
   `order.transfer_expired` con `transferred: true` son la lista para
   reconstruirlos.
3. Con producción sana, probar el **ciclo completo** con el motorizado. Eso sí
   necesita la ventana horaria abierta (`admin/configuracion`), porque ponerse
   disponible pasa por `is_within_platform_schedule`. Devolver el horario a
   18:00–23:00 al terminar.
4. Después, `TAREA-CAP` y las compuertas de sesión, que son los dos que tienen
   trigger "antes de Moro".

---

## Cómo se trabajó (conviene mantenerlo)

Cada tarea cerró con un *gate* de **evidencia cruda** —salida real de SQL, de
Playwright o del CLI—, nunca con un resumen. Dos criterios que valieron la pena:

- **Un test que solo puede pasar no prueba nada.** Sembrar el caso contrario
  (datos prohibidos presentes, orden inverso al esperado, credencial saboteada)
  es lo que convierte un test en prueba.
- **Una medición compatible con dos causas no cierra ninguna.** Afirmé que un
  dato llegaba "por realtime" con una latencia que también explicaba el poll;
  hubo que anular el poll para demostrarlo.
