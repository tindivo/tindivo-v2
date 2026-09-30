# Debate 3 · Turno 2 · Claude (propuesta)

> Sobre `01-codex.md`. Codex estima **28–41 h** y hay dos días. Esta
> propuesta recorta hasta **~18 h**: si no cabe, no entra.

**Datos.** Ni Codex ni yo tenemos hoy el MCP de `tindivo-prod` conectado (a mí
me responde `Unauthorized`). Uso las cifras de producción que ya se
consultaron en el debate 1 (`plan-final.md` §2): asignado→entregado 11.5 min
(p90 25), recogido→entregado **5.2 min**, **158 de 300 min libres** por noche
L–V (mediana), pico **19–22 h con 3.3 pedidos/h**. La simultaneidad de comida
por motorizado **no está medida**: queda como consulta previa al lanzamiento
(§7).

## 1. Capacidad: tope de 2 entregas por motorizado, y la comida manda por regla

**Regla:** un motorizado puede tener **como máximo 2 entregas activas**. No
se mira la comida en el software. En la calle manda una **regla de
operación**: *si hay comida lista para recoger, va primero; una entrega que ya
se recogió se termina antes.*

Por qué 2 y no 1 ni «sin tope»:

- Una entrega recogida tarda **~5 min** en llegar. Terminarla antes de ir por
  la comida retrasa esa comida **~5 min**, que está dentro de lo que hoy ya es
  normal (p90 de 25 min).
- En el pico entra un pedido de comida cada **~18 min** (3.3/h). Con 2
  entregas, el peor caso es una recogida en curso más una por recoger: la que
  aún no se recogió se puede **soltar**, así que nunca bloquean.
- Hay **~158 min libres por noche**: con 11.5 min por entrega caben de sobra,
  y 1 activa desperdicia esa holgura (lo que objeta Jesús).
- **Sin tope**, un motorizado podría acumular 4 o 5 entregas «aceptadas» y la
  gente esperaría sin saberlo. El tope de 2 cuesta **una línea** en `accept`.

El 2 va en `app_settings.courier.maxActivePerDriver`, no en el código.

**Límite por teléfono y la cuenta de Jesús:** se **exime a quien tenga rol
`admin`**. El rol ya existe (`enums.ts:14`), así que no hay que escribir el
UUID en el código ni construir un modo operador. Para los demás, el límite de
1 por teléfono se queda como está.

## 2. Negocios de la base: **fuera del MVP**

El autocompletado cuesta 2–3 h (según Codex): está bajo el umbral de medio
día, pero lo saco igual por tres razones:

1. **Con cero negocios cargados no aporta nada**, y producción no está
   verificada: los 8 del seed son de la base local.
2. **Activarlo obliga a arreglar antes la fuga** de `phone` y `whatsapp`, que
   hoy lee cualquiera sin sesión (M:162).
3. El calendario ya viene justo.

**En el MVP:** el negocio se escribe como texto libre y su **celular es
obligatorio**, igual que el de una persona. La fuga se cierra igual en la
migración (revocando la lectura de esas dos columnas), porque cuesta 15 min y
no depende de la UI.

## 3. El formulario: una sola pantalla, 7 campos

| # | Campo | ¿Obligatorio? | Nota |
|---|---|---|---|
| 1 | **Recoger en** | Sí (≥ 5 caracteres) | «Botica Santa Rosa, frente a la plaza» |
| 2 | **Celular de quien entrega** + «Soy yo» | Sí | El motorizado llama aquí antes de salir |
| 3 | **Llevar a** | Sí (≥ 5 caracteres) | |
| 4 | **Celular de quien recibe** + «Soy yo» | Sí | |
| 5 | **¿Qué es?** | Sí (≤ 120) | «Bolsa con útiles» |
| 6 | **¿Quién paga los S/ 3?** | Sí | Dos botones: quien entrega / quien recibe |
| 7 | Casilla «Ya está listo y pagado. Tindivo no compra ni adelanta dinero.» | Sí | |

**Se van:**

- **Los nombres de los contactos.** El celular es lo que se usa. El nombre
  pasa a ser opcional (un campo pequeño junto al celular), y si queda vacío,
  el servidor guarda «Quien entrega» o «Quien recibe».
- **La nota.** No existe como columna, y la referencia ya dice cómo llegar.
- **«Listo en X min», peso y frágil.** El cliente manda `readyInMin = 0` y
  `isFragile = false` fijos; «menos de 5 kg» entra en el texto de la casilla.

El nombre y el celular de **quien pide** salen del perfil, como hoy. **El
login no se toca** en el MVP.

## 4. App mínima del motorizado

**Tres botones de avance.** El RPC tiene 7 pasos; la API los encadena:

| Botón | Qué hace en el servidor | Cuándo |
|---|---|---|
| **Aceptar** | `accept` (con el tope de 2) | `requested` |
| **Recogido** | `depart` → `arrive` → [`collect_transport` si paga quien entrega] → `pick_up` | Pide el método (Yape / efectivo) solo si paga quien entrega |
| **Entregado** | `depart_dropoff` → [`collect_transport` si paga quien recibe] → `deliver` | Pide el método solo si paga quien recibe |
| **No se pudo** | `cancel` con motivo: no estaba listo · no contestan · otro | Cualquier momento no terminal |
| **Soltar** | `release` | Solo antes de recoger **y sin cobro** |

Además, **Llamar a quien entrega** y **Llamar a quien recibe** (`tel:`), y la
tarjeta en azul dentro del inicio actual. **No hay pantalla nueva:** es una
sección «Entregas» en `home`, con la lista de disponibles y las mías, que se
actualiza cada 15 s como el tablero de comida.

**Se pierde precisión:** `departed_at` y `arrived_at` quedan casi iguales a
`picked_up_at`. Para el piloto bastan tres tiempos: creado → aceptado →
recogido → entregado.

**Arreglos en la RPC** (del turno de Codex):

- `collect_transport` exige el método de cobro, que hoy puede quedar nulo.
- `release` se prohíbe si ya hubo cobro, para que el dinero no quede sin
  motorizado.

## 5. Cierre de caja y medición: una consulta, no software

**El cuadre** es una consulta SQL guardada que Jesús corre cada noche en el
panel de Supabase, en modo lectura. Da, por motorizado y por noche (hora de
Lima), las entregas cobradas, la suma de S/ 3 en **Yape** y la suma en
**efectivo**.

Regla de operación: **lo cobrado se descuenta del pago del turno.** Si le
cobraron S/ 9, Jesús paga S/ 21 del turno de S/ 30. El motorizado muestra su
historial de Yape y el efectivo; si no coincide con la consulta, se anota.
**No se construye** `courier_remittances` ni `driver_payment_qrs`: el
motorizado muestra **su propio QR de Yape** (en su celular o impreso).

**Medición**, con lo que ya existe y sin campos nuevos:

- **Canal:** el pedido es de WhatsApp si `customer_user_id` tiene rol `admin`.
  Regla: Jesús no usa su cuenta para pedidos propios.
- **«No se pudo» por motivo:** `cancel_reason`.
- **Tiempos:** `created_at`, `accepted_at`, `picked_up_at`, `delivered_at`.

Todo sale de **una segunda consulta guardada**.

## 6. Fines de semana: todos los días, con interruptor

**Se abre de lunes a domingo desde el lunes 5. La noche que la comida se
atrase por Entregas, Jesús pone `courier.enabled = false`.**

Hoy la función **no evalúa días** (M:401), así que «todos los días» cuesta
**0 h** y restringir a L–V costaría código. El interruptor ya existe. El
sábado (29 pedidos/día, el pico) es el riesgo: el tope de 2 y la regla de
«comida primero» lo cubren, y el interruptor es la válvula.

## 7. Construcción (~18 h)

| # | Día | Tarea | Archivos | h | Terminado cuando |
|---|---|---|---|---|---|
| 1 | Jue | **Migración 0235**: coordenadas nullable (el `CHECK` se conserva si no son nulas), el polígono y la distancia solo si hay coordenadas; `maxActivePerDriver = 2` en `accept`; exención `admin`; método obligatorio al cobrar; prohibido soltar si ya se cobró; revocar `phone` y `whatsapp` del directorio | `supabase/migrations/0235_*.sql`, `courier-orders.integration.test.ts` | 3 | Tests de integración en verde en local; `db push` y `pnpm db:types` |
| 2 | Jue | **Contrato + API de creación**: coordenadas opcionales, celulares obligatorios, nombres opcionales | `packages/contracts/src/courier.ts`, `apps/api/.../customer/courier-orders/route.ts` | 1.5 | Un POST sin coordenadas crea el pedido |
| 3 | Jue | **Formulario de una pantalla**, que reemplaza el camino del mapa. El seguimiento que ya existe se queda (hay que revisar que aguante coordenadas nulas) | `apps/customer/features/courier/*` | 4 | Crear un pedido de cada pagador en local; el seguimiento abre |
| 4 | Vie | **API del motorizado**: `GET /driver/courier-orders` (disponibles + mías) y `POST /driver/courier-orders/[id]/action` con los encadenados del §4 | `apps/api/app/api/v1/driver/courier-orders/*` | 3 | Test de integración del ciclo completo con los dos pagadores |
| 5 | Vie | **Sección Entregas** en el inicio del motorizado | `apps/motorizados/components/home/*` | 5 | Un motorizado acepta, recoge, cobra y entrega desde el celular |
| 6 | Vie | **Consultas** de cuadre y medición en `Docs/Entregas/consultas.sql`; smoke de comida | docs | 1.5 | Las consultas dan resultado sobre los pedidos de prueba |

**Fuera del orden:** actualizar los textos de «todos los días» y el tiempo de
espera; revisar que la configuración real de `app_settings` en producción
esté como se espera.

## 8. Ensayo del domingo (5 conocidos)

1. Web, paga quien recibe, **Yape**.
2. Web, paga quien entrega, **efectivo**.
3. WhatsApp: **Jesús crea dos a la vez** (prueba la exención del límite).
4. «No estaba listo»: el motorizado llama, no sale y marca «No se pudo».
5. Una entrega mientras entra un pedido de comida real o simulado: se mide si
   la comida se retrasó.

**Al cierre:** la consulta cuadra al centavo con lo que muestra el
motorizado. Y **4 de 5 conocidos** crean su pedido sin ayuda.

## 9. Desacuerdos que anticipo

1. **Nombres opcionales:** ¿el motorizado los necesita para no confundirse?
2. **Todos los días vs. L–V más el domingo:** yo digo todos los días con
   interruptor.
3. **Directorio fuera** aunque cueste menos de medio día.
