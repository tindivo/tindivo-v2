# 02 · Dinero y cuadre de Encargos

> ⚠️ **En revisión** (`07-integracion-recojo.md` C, C2, D, F): el selector «pagar al recoger / al entregar» podría simplificarse, y las reglas de espera y cancelación se sustituyen por las de Jesús. **El precio ya está cerrado: S/ 3 fijo** (§2).
>
> v0.4 · 2026-09-19 · **decisiones de Jesús incorporadas**: **S/ 3 fijo** (por distancia, más adelante), el cliente elige si paga al recoger o al entregar, y **todo el dinero pasa por el motorizado**, que queda debiendo a Tindivo.

---

## 1. La idea en una frase

> **El cliente le paga al motorizado (efectivo exacto o Yape). El motorizado le debe a Tindivo el precio de cada encargo que entrega, y lo rinde al final del día.**

Es el mismo mecanismo de deuda que ya existe para el efectivo de los restaurantes, con una diferencia: aquí la contraparte es Tindivo, no un negocio.

Es también, casi literalmente, el modelo de InDrive Courier: *«el pago por la entrega se hace directamente al repartidor, ya sea por el remitente o el destinatario»* ([inDrive.Entregas Perú](https://couriers.indrive.com/es-pe)).

### Qué cambia respecto a `DECISIONS.md`

`DECISIONS §4` y §7 dicen que Tindivo no retiene fondos. En Encargos el dinero **sí termina siendo de Tindivo** (el motorizado se lo debe), pero **nunca pasa por una cuenta de Tindivo antes de pasar por el motorizado**. Y lo que se cobra es **solo el servicio**, jamás el valor del artículo. Se anotará en `DECISIONS §4` cuando se apruebe.

---

## 2. Precio

**S/ 3 fijo al lanzar. Por distancia, más adelante** (decisión de Jesús, 2026-09-19: *«por distancia, pero partimos de tres soles fijos»*). Sustituye a las dos tarifas de S/ 3.00 / S/ 3.50 que se habían planteado.

- **Precio único: `app_settings.errands.pricing.basePrice = 3.00`**, editable desde el admin sin tocar código (regla del repo). La estructura admite **escalones por distancia** (`tiers`, hoy vacío) para activarlos cuando haya datos.
- **La distancia se calcula y se guarda desde el primer encargo** (`distance_m`, Haversine en línea recta, **en el servidor**), aunque no se cobre por ella. Con dos semanas de datos se decide si hace falta un escalón y dónde poner el corte. Leaflet no traza rutas y no hace falta.
- **Sobre el corte:** Jesús estima que del grifo al centro hay **5–10 km, «tendría que medirlo»**. No hay hoy un corte defendible: el polígono de cobertura sembrado en `0045` **no es fiable** (está centrado ~25 km al oeste del San Jacinto real, ver `07` §2), así que **los cálculos de corte que se hicieron con él se retiran**. Cuando Jesús mida, se decide con los `distance_m` reales.
- **Antecedente:** el `05` de los documentos de Jesús ya razonaba así: S/ 3 es el precio que los clientes **ya pagan por encargos**, y S/ 0.50 de diferencia con 20 viajes son S/ 10 al día. S/ 3.50 «se evaluará con datos tras 2 semanas».
- Los dos puntos tienen que caer **dentro del polígono de cobertura** (`app_settings.coverage_polygon`). **No hay caseríos: solo el polígono** (confirmado por Jesús).
- **El servidor decide el precio** (`create_errand`), no el cliente. La pantalla lo **muestra antes de pedir** (`customer/errands/quote`).
- El precio se **congela en la fila** al crear el encargo (`price`, más la `distance_m`), igual que `tindivo_commission` en los pedidos: cambiar el precio después no toca lo ya pedido.

**Sin bono de distancia ni propina.** El motorizado sigue con sueldo fijo (`DECISIONS §4`) [D-09].

---

## 3. Cuándo se cobra

Como en InDrive, **el cliente elige quién paga y en qué punto**:

| Opción | Cuándo | Quién le paga al motorizado | Cuándo suelta el artículo |
|---|---|---|---|
| **Pago al recoger** | En A, antes de irse | Quien entrega en A (normalmente el remitente) | Se lo lleva **ya cobrado** |
| **Pago al entregar** *(por defecto)* | En B, al llegar | Quien recibe en B (normalmente quien pidió) | **Solo tras cobrar** |

La regla común es una sola: **el artículo no cambia de manos hasta que el motorizado haya cobrado.** En «pago al recoger», no sale de A sin cobrar. En «pago al entregar», no lo entrega en B sin cobrar. Así nunca hay comida ni paquete fiado.

Por qué **al entregar** como opción por defecto: el caso típico que describiste es *«que me traigan un documento de la casa de un amigo»*. Ahí quien pide está en B, no en A, y no puede pagar en A. Al entregar paga el que tiene el paquete en la mano.

El riesgo de «pago al entregar» es que el motorizado ya hizo el viaje. Se acota con la regla anterior: si quien recibe en B no paga, **el artículo se queda con el motorizado**, no se entrega, y el caso pasa a incidencias del admin (`01` §6). No se pierde el artículo; se pierde el tiempo.

---

## 4. Métodos de pago

| Método | Cómo funciona |
|---|---|
| **Efectivo exacto** | Quien paga le da al motorizado el monto exacto. **El motorizado no lleva vuelto.** Si solo tiene un billete grande, paga por Yape. |
| **Yape / Plin al motorizado** | Quien paga escanea el **QR del propio motorizado** (o teclea su número) y el motorizado **ve el ingreso en su celular**. |

### Por qué esto mejora el diseño anterior

En la versión anterior el Yape iba a una cuenta de Tindivo, y el motorizado solo veía la pantalla del cliente, que se puede falsear. Con el dinero en la cuenta del motorizado, **quien confirma es quien lo ve entrar**. Desaparece el problema de conciliar «Yape declarado contra Yape visto» y se elimina una tabla entera del plan.

### Lo que hay que construir para esto

Hoy el motorizado **no tiene método de cobro propio**: `apps/motorizados/components/order/yape-qr.tsx` muestra el QR **del restaurante** y la tabla `drivers` no tiene columnas de Yape (comprobado en `0002`). Encargos necesita que cada motorizado cargue **su** billetera, número, titular e imagen, con el mismo patrón que `business_payment_qrs` (`0184`) y el mismo contrato `PaymentQrInput` de `packages/contracts`. Regla propuesta: **un motorizado sin método de cobro cargado no puede aceptar encargos.**

### El Yape es el personal del motorizado (decidido)

Jesús decidió que el motorizado usa **su Yape personal**: al terminar el viaje le pagan a él y se le carga la deuda. Es lo más simple y verificable, y no exige que nadie abra otra cuenta.

Lo que hay que tener presente, sin cambiar la decisión:

- El dinero de Tindivo queda **mezclado con el suyo**. Por eso la deuda se deriva de los encargos entregados, no de su saldo (§5.1): no hace falta separar nada para saber cuánto debe.
- **No lo he verificado, y conviene comprobarlo antes del piloto:** si Yape pone límites o condiciones a una cuenta personal que recibe muchos cobros pequeños de terceros. Un bloqueo de la cuenta del motorizado detendría el servicio de golpe.

---

## 5. La deuda del motorizado

### 5.1 Regla

> **Deuda = suma del precio de todos los encargos que el motorizado marcó como entregados y que todavía no ha rendido.**

Se calcula desde los encargos `delivered`, **no** desde lo que el motorizado dice haber cobrado. Eso lo hace robusto: si entrega y «no cobró», la deuda existe igual, y lo que se discute es la incidencia, no el saldo.

| Situación | Deuda del motorizado |
|---|---|
| Entregó y cobró en efectivo | Su precio, S/ 3 (tiene los billetes) |
| Entregó y cobró por Yape | Su precio (el dinero está en su Yape) |
| Entregó pero **no cobró** | Su precio y se abre una incidencia; el admin puede **condonarla** con una nota |
| No entregó (cancelado, expirado, artículo retenido por falta de pago) | S/ 0 |

No hay adelanto, ni vuelto, ni fórmula de `spec-efectivo-todo-vuelve.md`. Ese spec existe porque el sencillo de los restaurantes sale de la caja del negocio; en Encargos el efectivo es exacto y no hay caja.

### 5.2 Cómo se paga la deuda (rendición)

1. Al cerrar el turno, el motorizado ve **encargo por encargo** lo que debe (hora, código, monto) y el total. Se aprende de `spec-efectivo-todo-vuelve.md §1.1`: rendir a ciegas convierte una diferencia de S/ 5 en veinte minutos de discusión.
2. Elige cómo paga: **efectivo en mano** o **Yape a la cuenta de Tindivo**, y declara el monto.
3. El admin **confirma** o **reporta diferencia** (pasa a incidencias). Sin respuesta en **24 h**, se auto-confirma con marca de auditoría (`auto_assumed_confirmed`, `DECISIONS §10`).
4. La deuda baja por el monto confirmado. Puede pagarse **parcialmente**: la deuda es un saldo, no una fecha.

### 5.3 ¿Se reutiliza `cash_settlements`?

**No.** Esa tabla es `(business_id, driver_id, settlement_date)` y todo su circuito asume un negocio y una cajera. Encargos lleva su propia tabla de rendiciones (`03` §3), casi idéntica en forma, con el admin como contraparte y un campo `method` (`cash` | `yape`).

### 5.4 Quién es «Tindivo» al rendir

El admin. **Pendiente [D-12]:** que confirmes que siempre eres tú quien recibe, y si el Yape de Tindivo al que transfieren es tu cuenta de negocio o una personal.

---

## 6. Reportes mínimos (admin)

- Encargos del día y de la semana: creados, entregados, cancelados, expirados.
- Ingreso bruto (suma del `price` de los encargos entregados), con su `distance_m` para ver dónde conviene un escalón.
- **Deuda viva por motorizado** y antigüedad.
- Rendiciones: confirmadas, en disputa, auto-confirmadas.
- Encargos entregados sin cobro (incidencias abiertas).
- Tiempo medio hasta que un motorizado acepta.
