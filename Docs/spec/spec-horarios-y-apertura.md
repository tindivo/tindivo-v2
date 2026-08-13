# Spec · Horarios y apertura diaria

Estado: **acordado, sin implementar.** Fecha: 2026-08-13.

Define cuándo un negocio está abierto en Tindivo, quién lo decide y qué pasa
con los pedidos que quedan a caballo del cierre.

---

## 1 · Estado actual (medido, no recordado)

Antes de proponer nada se auditó qué existe. Lo que hay difiere bastante de lo
que se creía:

| Pieza | Dónde | Estado real |
|---|---|---|
| Horario semanal del negocio | tabla `business_schedule` | **Funciona.** 2 turnos por día, soporta cruzar medianoche |
| Bloqueo de pedido fuera de horario | `apps/api/app/api/v1/customer/orders/route.ts:208` | **Funciona.** 409 con la hora de apertura |
| Cálculo de abierto/cerrado | `packages/contracts/src/schedule.ts:104` (`getOpenStatus`) | **Funciona.** Puro, con spillover de madrugada |
| Pausa corta | `businesses.accepting_orders_until` | **Funciona.** 403 "pausado temporalmente" |
| Ventana global de plataforma | `is_within_order_intake_window` | **Neutralizada** (ver abajo) |
| Confirmación diaria de apertura | — | **No existe** |
| Excepción por fecha ("hoy no abro") | — | **No existe** |

### 1.1 · La ventana global se quitó a propósito

`supabase/migrations/0092_remove_platform_schedule_guard.sql` la eliminó de
`create_customer_order` y `create_business_manual_order`, con este texto:

> La plataforma no restringe horarios globales. La fuente de verdad es el
> horario de cada negocio (business_schedule).

La función `is_within_order_intake_window` sobrevive pero solo alimenta
`/api/v1/public/schedule`, que es informativo. Además está neutralizada por
partida doble: `app_settings.platform_schedule` vale
`{"days": [mon..sun], "startHHMM": "00:00", "endHHMM": "23:59"}` y
`order_intake_cutoff` vale `"23:59"`. Los *defaults* del código (18:00 y 22:30)
nunca se aplican porque los settings existen y los pisan.

**Consecuencia:** hoy no hay ninguna restricción horaria de plataforma. Un
negocio podría configurarse 12:00–15:00, cuando no hay motorizado.

### 1.2 · Los datos de horario están todos abiertos

Las filas de `business_schedule` en local están a `00:00`–`23:59` los 7 días.
El bloqueo por horario funciona, pero con estos datos nunca se dispara.

---

## 2 · Goals

Lo que tiene que ser verdad cuando esto esté hecho:

- **G1** · Que "abierto" signifique que hay alguien atendiendo de verdad, no que
  alguien configuró un horario hace tres semanas.
- **G2** · Que un negocio pueda decir "hoy no atendemos" sin llamar a nadie, y
  que el cliente lo vea al instante.
- **G3** · Que ningún pedido entre a una hora en la que no hay motorizado que
  lo reparta.
- **G4** · Que un pedido ya iniciado nunca se quede a medias por el reloj.
- **G5** · Que cuando el cliente vea "cerrado", sepa **por qué** y **cuándo**
  abre.
- **G6** · Que el admin se entere de que un negocio no ha abierto **antes** de
  que se lo diga un cliente.

---

## 3 · Las cuatro capas

El error de partida era tratar esto como una sola regla. Son cuatro, con dueño
y duración distintos, y se evalúan **en este orden**:

| # | Capa | Responde a | Dueño | Dura |
|---|---|---|---|---|
| 1 | Ventana de plataforma | ¿hay motorizado repartiendo? | Tindivo | permanente |
| 2 | Horario semanal | ¿qué días y a qué hora abre? | negocio | permanente |
| 3 | Apertura del día | ¿hoy sí atienden? | negocio | un turno |
| 4 | Pausa corta | ¿pueden ahora mismo? | negocio | minutos |

```
¿la plataforma opera a esta hora?      → no: cerrado (fuera de servicio)
¿el horario semanal dice abierto hoy?  → no: cerrado (con próxima apertura)
¿confirmaron la apertura de hoy?       → no: cerrado (sin confirmar)
¿está en pausa corta?                  → sí: pausado (con hora de vuelta)
                                       → ABIERTO
```

Cada "cerrado" lleva su motivo. Eso es lo que hoy no se puede hacer y lo que
permite cumplir **G5**.

---

## 4 · Reglas

### Capa 1 · Ventana de plataforma

- **R1** · La ventana es **18:00–23:00**, los siete días, y vive en
  `app_settings.platform_schedule`. No se hardcodea.
- **R1-bis** · **Corte único.** No se separa la hora de dejar de recibir de la
  de dejar de operar: a las 23:00 se cierra la recepción, y lo que ya entró se
  termina por R16. En consecuencia `app_settings.order_intake_cutoff` sobra y
  se elimina — hoy vale `"23:59"` y solo lo lee
  `is_within_order_intake_window`. Dejarlo sería una segunda hora de cierre
  compitiendo con la primera.
- **R2** · Actúa como **techo de configuración**: al guardar su horario semanal,
  un negocio no puede salirse de la ventana. Si intenta `12:00–15:00`, se
  rechaza indicando la ventana vigente.
- **R3** · **No** actúa como portero de pedidos. Quien decide si se puede pedir
  es la cadena completa (capas 2–4).
  *Motivo:* si la ventana bloquease pedidos por su cuenta, un horario mal
  guardado produciría el peor bug posible — el negocio se ve abierto en su
  panel y el cliente no puede pedirle. Una sola fuente de verdad.
- **R4** · Cambiar la ventana **no** reescribe horarios ya guardados. Los deja
  fuera de rango y los marca como inválidos para que el negocio los corrija.

### Capa 2 · Horario semanal

- **R5** · Sigue siendo `business_schedule` tal cual está. No se toca el modelo.
- **R6** · Sin horario configurado = abierto (comportamiento actual de
  `getOpenStatus`, que devuelve `no_schedule`). Se mantiene.

### Capa 3 · Apertura del día

- **R7** · Un negocio aparece **cerrado** hasta que confirma la apertura del
  día, aunque su horario semanal diga que abre.
- **R8** · La confirmación **se puede hacer antes** de la hora de apertura. A
  las 17:40 se deja confirmado y a las 18:00 abre solo.
- **R9** · La confirmación **caduca al terminar el turno**. Al día siguiente
  vuelve a pedirse. Ese es el hábito que se busca crear.
- **R10** · El mismo control sirve para lo contrario: marcar el día como
  **cerrado** ("hoy no atendemos") o **adelantar el cierre** ("hoy cerramos a
  las 21:00"). Eso cubre el corte de luz sin una tabla de excepciones aparte.
- **R11** · La unidad no es el día de calendario sino la **fecha de servicio**:
  para un turno que cruza medianoche (18:00–01:00), la madrugada pertenece al
  día anterior. Coincide con el *spillover* que `getOpenStatus` ya implementa.

### Capa 4 · Pausa corta

- **R12** · Sin cambios. `accepting_orders_until` sigue funcionando igual.
- **R13** · La pausa **no** sustituye a R10: es para minutos, no para una noche.

### Avisos

- **R14** · Si a la hora de apertura nadie ha confirmado, push al negocio:
  *"¿Abren hoy? Confirma para empezar a recibir pedidos."*
- **R15** · Si **30 minutos** después de su hora de apertura sigue sin
  confirmar, alerta al admin (`admin_alerts`). El valor sale de
  `app_settings`, no se hardcodea. **(G6)**
  *Es un desfase desde la apertura de cada negocio, no una hora fija del reloj:
  con La Florencia abriendo a las 18:00 salta a las 18:30, y un negocio que
  abra a las 19:00 avisará a las 19:30.*

### Cierre suave — lo que NO cambia

- **R16** · El horario se comprueba **solo al crear** el pedido. Aceptar,
  preparar, recoger y entregar **no** miran el reloj.
  *Consecuencia buscada:* un pedido creado a las 22:55 se acepta, se prepara y
  se entrega a las 23:40 sin que nada lo corte. **(G4)**
- **R17** · Esto ya funciona así hoy, pero por omisión. Queda escrito para que
  nadie "lo arregle" añadiendo comprobaciones de horario a las transiciones.
- **R18** · Lo que corta un pedido sin aceptar no es el horario sino el timer
  de aceptación (`app_settings.timers.acceptanceMinutes`, hoy 15 min).
- **R19** · **Cerrar antes (R10) no toca los pedidos ya aceptados.** Si a las
  20:40 el negocio adelanta el cierre a las 21:00, todo lo que ya aceptó sigue
  su curso normal: se prepara, se recoge y se entrega. Cerrar significa dejar
  de recibir, nunca abandonar lo aceptado.
- **R20** · Los pedidos que en ese momento estuvieran **sin aceptar** no
  necesitan trato especial: los expira el timer de R18 con el mensaje que ya
  existe. No se inventa un aviso nuevo para un caso que dura 15 minutos.

---

## 5 · Modelo de datos propuesto

Una tabla nueva. Una fila por negocio y fecha de servicio:

```sql
create table public.business_service_days (
  business_id      uuid not null references public.businesses(id) on delete cascade,
  service_date     date not null,
  status           text not null check (status in ('open', 'closed')),
  closes_early_at  text,          -- 'HH:MM' opcional; adelanta el cierre del turno
  note             text,          -- "corte de luz", visible solo en el panel
  confirmed_at     timestamptz not null default now(),
  confirmed_by     uuid references public.users(id),
  primary key (business_id, service_date)
);
```

- **Ausencia de fila = sin confirmar = cerrado.** No hace falta un tercer estado.
- `status = 'closed'` es la declaración explícita de "hoy no". Se distingue de
  la ausencia porque permite mostrar el motivo y porque cuenta distinto en las
  métricas de hábito.
- El historial de filas es, de regalo, la señal de qué negocios abren a diario.

### Dónde vive la decisión

`getOpenStatus` (`packages/contracts/src/schedule.ts`) se extiende para recibir
la fila del día y la ventana de plataforma, y pasa a devolver el motivo del
cierre. Sigue siendo una función pura, que es lo que la hace testeable y lo que
permite que API y customer coincidan siempre.

**No** se duplica la lógica en SQL: la validación de pedidos se queda donde ya
está (`customer/orders/route.ts`), que es la capa que hoy funciona.

---

## 6 · Plan de verificación

Cada regla, con cómo se comprueba:

| Caso | Esperado |
|---|---|
| Guardar horario 12:00–15:00 | rechazado, mensaje con la ventana (R2) |
| Horario válido, sin confirmar, dentro de hora | cerrado, motivo "sin confirmar" (R7) |
| Confirmar a las 17:40, consultar a las 18:05 | abierto (R8) |
| Confirmado ayer, consultar hoy a las 18:05 | cerrado (R9) |
| Marcar "hoy no atendemos" | cerrado, motivo visible al cliente (R10) |
| Turno 18:00–01:00, consultar a las 00:30 | abierto con la confirmación de ayer (R11) |
| Pedido creado 22:55, cierre 23:00 | se acepta, prepara y entrega sin cortes (R16) |
| Pedido creado 22:59, aceptado 23:10 | permitido; solo lo corta el timer de 15 min (R18) |
| Aceptado 20:30, se adelanta el cierre a 21:00 | el pedido llega a entregado sin cambios (R19) |
| Guardar horario 18:00–23:30 | rechazado: la ventana termina a las 23:00 (R1, R2) |
| Nadie confirma a las 18:00 | push al negocio (R14) |
| Nadie confirma a las 18:00 + N | alerta en admin (R15) |

Los casos de horario son deterministas si se inyecta el instante: `getOpenStatus`
ya recibe `now: Date` como parámetro, así que se prueban sin esperar a las 11
de la noche.

---

## 7 · Decisiones tomadas

- Apertura **opt-in** diaria, no opt-out. Se asume el riesgo de que un olvido
  cueste ventas, a cambio de que "abierto" sea siempre cierto y de crear el
  hábito. R8, R14 y R15 existen para que el olvido sea difícil.
- Ventana **18:00–23:00**, corte único, y `order_intake_cutoff` se elimina
  (R1, R1-bis).
- Ventana de plataforma como **techo de configuración**, no como portero (R3).
- Push al negocio **y** alerta al admin a los 30 min de su apertura (R14, R15).
- Cerrar antes no abandona lo ya aceptado (R19).

## 8 · Abierto

- Qué ve exactamente el cliente en cada motivo de cierre (copy).

## 9 · Trampa para quien implemente esto

Hoy `platform_schedule` vale `00:00`–`23:59` y **todas** las filas de
`business_schedule` están a `00:00`–`23:59`. Con esos datos ninguna de estas
reglas llega a evaluarse nunca: todo parece funcionar porque nada se dispara.

Antes de dar por buena una sola prueba, poner datos reales — ventana
`18:00`–`23:00` y un horario de negocio dentro de ella. Si no, la suite pasará
en verde sin haber ejercitado nada.
