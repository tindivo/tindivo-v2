# Plataforma: qué es Tindivo, quién participa, dónde y cuándo

> Verificado: 2026-10-10 · entorno: `tindivo-prod` (solo lectura) + `develop@7d00aa4` · Nombres: `Docs/glosario.md`

## Qué es

Tindivo es una plataforma de delivery hiperlocal para pueblos del Perú. Une a los negocios de un pueblo, a sus
clientes y a un equipo de motorizados, y cobra a los negocios una comisión por cada pedido que llega a su cliente.
Opera en **San Jacinto (Áncash)**, de noche. `tindivo-prod` es **operación real** desde el **2026-08-08** (primer
pedido registrado); antes funcionaba el v1.

## Servicios

| Servicio | Estado al 2026-10-10 (medido en `tindivo-prod`) |
|---|---|
| **Pedidos de restaurante** (con entrega o recojo en el local) | En operación: **~500 pedidos entregados en 30 días**, 7 de ellos recogidos en el local |
| **Tindivo Entregas** | Encendido de lunes a domingo, de 18:00 a 23:00 (ADR 0035). **3 entregas** en total |
| **Tindivo Store** | Construido y en producción, **sin productos publicados** |

Encargos («te lo compramos y te lo llevamos») no existe: se descartó (ADR 0034).

## Quién participa

- **Clientes.** Piden por la app o llamando al negocio. **El 84 % de los pedidos entregados en 30 días los tecleó la
  cajera** (420 de 497): el hábito del pueblo es llamar. Que el pueblo pida por la app es la apuesta (ADR 0034).
- **Negocios aliados.** Cuatro, todos activos:

  | Negocio | Cómo trabaja con Tindivo | Pedidos entregados en 30 días |
  |---|---|---|
  | Pizza Priamo | Catálogo con pedidos web, entrega y recojo | 332 |
  | Pollería Nadia | Solo catálogo: la cajera crea los pedidos a mano; los entrega Tindivo | 87 |
  | La Florencia | Catálogo con pedidos web, entrega y recojo | 67 |
  | Al Punto | Catálogo con pedidos web, entrega y recojo | 11 |

  Un solo negocio hace dos tercios de los pedidos: es el mayor riesgo del negocio (debate de ingresos, 2026-10-07).
  Pollería Nadia **depende al 100 % de Tindivo** para entregar (Jesús, 2026-10-10); recibe por WhatsApp porque todavía
  no tiene sistema web. Su marca `uses_tindivo_drivers = false` está mal y no afecta a ninguna lógica: se corrige desde
  el admin.
- **Motorizados.** Tres activos; los tres entregaron en los últimos 30 días.
- **Jesús**, como administrador: operación, cobros a los negocios y apelaciones.

## Cuándo

- **De noche.** Cada negocio declara su horario por día (`business_schedule`; `0` = lunes). Hoy los cuatro abren entre
  las 18:00 y las 18:30 y cierran entre las 22:30 y las 23:30. La Florencia sirve además al mediodía los sábados y
  domingos (11:00 a 15:00).
- **La jornada cambia a las 05:00 de Lima**: la madrugada pertenece a la noche anterior (`SERVICE_DAY_START_HOUR`).
- Cada noche el negocio confirma que atiende (`business_service_days`); esa confirmación guarda lo **declarado**, no lo
  trabajado.

## Principios

1. **Tindivo no retiene fondos.** El cliente le paga directo al negocio (Yape, Plin o efectivo) y Tindivo cobra su
   comisión al negocio aparte. **Por qué:** evita el riesgo regulatorio de intermediar dinero. El fondo de contingencia
   se eliminó en la `0123`. **Una excepción, autorizada por Jesús:** cuando una apelación se aprueba (el negocio
   rechazó por error un comprobante de prepago), Jesús le devuelve el dinero al cliente y lo carga a la deuda del
   negocio (`register_appeal_refund` → `refund_charge`). Es la única forma en que Tindivo pone dinero en el medio:
   adelanta y recupera, nunca guarda el del cliente (ADR 0036).
2. **El antifraude es humano.** Ante un cliente nuevo o con strikes que paga contraentrega, **la cajera lo llama**
   antes de cocinar (`validando`). La llamada es antifraude, no un canal para avisarle del estado del pedido.
3. **Se cobra solo lo entregado.** Un pedido cancelado no genera comisión ni deuda.
4. **Los parámetros del negocio viven en la base** (`app_settings`: comisiones, tarifas, plazos, horario de
   Entregas), no en el código: cambiarlos no exige desplegar.
5. **Un pedido entregado no vuelve atrás** (`delivered` es terminal).

## Cómo gana dinero (resumen)

Por cada pedido entregado, el negocio le debe a Tindivo una **comisión** más la **tarifa de envío** que pagó el
cliente, y lo liquida aparte. Valores vivos en `app_settings` al 2026-10-10 (la comisión, confirmada por Jesús el
mismo día): comisión de **S/ 1.50** por pedido con
entrega y **S/ 1.00** por recojo; envío de **S/ 2.00** cerca y **S/ 2.50** lejos; Entregas, **S/ 3** que paga el cliente.
El detalle (deuda, liquidaciones, corte de caja del motorizado) está en `Docs/negocio/dinero.md`.

## Pendientes

Ninguno.
