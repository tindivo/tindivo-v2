# 02 · Dinero y cuadre de Tindivo Entregas

> **v1.0 · 2026-09-19.** Sustituye a la versión anterior (`historico-pre-v2/` (borrado; en git: `8f26aed`)). Base: `origen-jesus-v2/` (quién paga, sin recargos) más el modelo de deuda del motorizado que solo existía en nuestros documentos.

---

## 1. La idea en una frase

> **El cliente le paga los S/ 3 al motorizado (efectivo exacto o Yape). El motorizado le debe a Tindivo el precio de cada entrega que completa, y lo rinde cada día.**

- El **producto** llega **siempre pagado**; el motorizado **nunca** lo paga ni lo cobra. Cobra **solo el transporte**.
- El dinero pasa por el motorizado y queda en **deuda con Tindivo**, igual que ya ocurre con el efectivo de los restaurantes, pero con Tindivo como contraparte (no un negocio).
- **Los documentos de Jesús no decían cómo se lleva esa cuenta**: eso es lo que define este archivo.

**Diferencia con `DECISIONS §4` y §7** («Tindivo no retiene fondos»): aquí el dinero **sí es de Tindivo** (el motorizado se lo debe). Se anotará en `DECISIONS.md` cuando se apruebe. Lo que se cobra es **solo el servicio**, nunca el valor del artículo.

Es, casi literalmente, el modelo de InDrive: *«el pago por la entrega se hace directamente al repartidor, ya sea por el remitente o el destinatario»* ([inDrive.Entregas Perú](https://couriers.indrive.com/es-pe)).

## 2. Precio

**S/ 3 fijo** (impreso **«desde S/ 3»**, porque más adelante puede haber escalones por distancia).

- Vive en `app_settings.courier.pricing.basePrice = 3.00`, editable sin desplegar código. La estructura admite `tiers` por distancia (hoy vacío).
- **Se guarda `distance_m`** (Haversine, en línea recta, **calculada en el servidor**) en cada pedido, aunque no se cobre por ella. Con dos semanas de datos se decide si hace falta un escalón. Jesús ya adelantó que **S/ 3.50 sería el tope**.
- **No hay corte en km defendible hoy:** el polígono sembrado en `0045` no es fiable (centrado ~25 km al oeste del San Jacinto real) y Jesús estima grifo → centro en 5–10 km, «tendría que medirlo».
- El servidor decide el precio; el cliente lo ve **antes** de pedir y antes de iniciar sesión.
- El precio se **congela** en el pedido (`price`), como `tindivo_commission` en los pedidos.
- **Sin recargos, nunca** (`01` §10). **Sin promoción al lanzar:** el «primer delivery gratis» del afiche es **solo de restaurantes**. La promo de primer uso (S/ 1.50, 30 usuarios, lunes a jueves) queda como configuración **apagada** hasta que el flujo esté estable.
- **Sin bono al motorizado** (sueldo fijo, `DECISIONS §4`); se cuentan las entregas por motorizado desde el día 1.

## 3. Quién paga y cuándo

| Punto A | Quién paga | Dónde se cobra |
|---|---|---|
| **Un negocio** | **Quien recibe.** El negocio nunca paga | En B, **antes de entregar** |
| **Una persona** | **El cliente elige al pedir**, sin opción marcada: quien entrega o quien recibe | En A antes de llevarse el artículo, o en B antes de entregar |

**Regla común:** el artículo **no cambia de manos hasta que el motorizado cobre.** Nunca viaja nada fiado.

**Métodos:** **efectivo exacto** (el motorizado no lleva vuelto) o **Yape / Plin a la cuenta del propio motorizado**, que **ve el ingreso en su celular**. Hoy el motorizado **no tiene método de cobro propio** (la tabla `drivers` no tiene columnas de Yape, y `yape-qr.tsx` muestra el QR del restaurante), así que hay que construirlo (`driver_payment_qrs`, patrón `0184`, **precargado por Jesús**).

**Si quien debe pagar no paga:** se cancela (`transport_unpaid`) y el artículo vuelve a quien lo entregó (o lo decide el admin). **Riesgo asumido** por Jesús: con «paga quien recibe», el receptor puede negarse y se pierde el viaje.

## 4. El Yape es el personal del motorizado

Decisión de Jesús. Es lo más simple y verificable: **quien confirma es quien lo ve entrar**. Lo que hay que tener presente:

- El dinero de Tindivo queda **mezclado con el suyo**; por eso la deuda **se deriva de las entregas completadas**, no de su saldo (§5).
- **No verificado:** si Yape limita o bloquea una cuenta personal que recibe muchos cobros pequeños de terceros. Un bloqueo detendría el servicio. **Comprobarlo antes del piloto.**

## 5. La deuda del motorizado

> **Deuda = suma del precio de todas las entregas que el motorizado completó y todavía no ha rendido.**

Se calcula desde los pedidos `delivered`, **no** desde lo que el motorizado diga haber cobrado. Es robusto: si entrega y «no cobró», la deuda existe igual y lo que se discute es la incidencia.

| Situación | Deuda |
|---|---|
| Entregó y cobró (efectivo o Yape) | Su precio (S/ 3) |
| Entregó pero **no cobró** | Su precio; el admin puede **condonarla** con una nota |
| No entregó (cancelado, sin motorizado, artículo devuelto) | **S/ 0** |

**Rendición** (motorizado → Tindivo, **a diario**):

1. Al cerrar el turno ve **entrega por entrega** lo que debe (hora, código, monto) y el total.
2. Rinde en **efectivo en mano o Yape a la cuenta de Tindivo** y declara el monto. **Puede ser parcial**: la deuda es un saldo.
3. El admin **confirma** o **reporta diferencia**. Sin respuesta en **24 h**, se auto-confirma con marca de auditoría (`auto_assumed_confirmed`, `DECISIONS §10`).

**No se reutiliza `cash_settlements`:** su circuito asume un negocio y una cajera. Se usa una tabla propia (`courier_remittances`, `03` §3).
**Quién es «Tindivo» al rendir:** el admin. *(Pendiente de confirmar por Jesús: que sea siempre él, y si la cuenta de Tindivo es de negocio.)*

## 6. Efecto de «sin recargos» en la economía

Los documentos calculan un punto de equilibrio de **~10 viajes completados** por noche a S/ 3 con el motorizado adicional (S/ 30). Un viaje cancelado por «no estaba listo» cuesta tiempo y no ingresa nada:

| Cancelados por «no estaba listo» | Solicitudes para completar 10 viajes |
|---|---|
| 0 % | 10 |
| 10 % | ~11 |
| **20 % (alarma de Jesús)** | **~13** |
| 30 % | ~14 |

Hasta el 20 % la regla se sostiene. **Se mide `not_ready` desde el primer día** y se deja listo el interruptor para reintroducir un costo si se supera. Mitigación barata: el aviso por WhatsApp al negocio con la hora, y que el kit le pida avisar si se retrasa.

## 7. Reportes mínimos (admin)

- Entregas por día y semana, **entre semana y fin de semana** (1 vs 2 motorizados), y por tipo (negocio / persona).
- **Deuda viva por motorizado** y antigüedad; rendiciones confirmadas, en disputa y auto-confirmadas.
- Entregas completadas **sin cobro** (incidencias abiertas).
- Minutos de espera del motorizado y **% cancelado por `not_ready`**.
- Tiempo hasta que un motorizado acepta.
