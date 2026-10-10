# Tindivo Entregas

> **2026-10-06 · Hay un servicio nuevo en propuesta: Tindivo Encargos** («te lo
> compramos y te lo llevamos»), en [`compras/` (borrado; en git: `8f26aed`)](https://github.com/tindivo/tindivo-v2/blob/8f26aed/Docs/Encargos/compras/README.md). Es **otro
> servicio**: lo de esta carpeta, incluido «no compramos ni pagamos por ti»,
> sigue valiendo **para Entregas**.

> **Estado:** documentación **v1.0** · 2026-09-19 · diseñada, **sin construir**. Reemplaza a las versiones «Encargos» anteriores (guardadas en `historico-pre-v2/` (borrado; en git: `8f26aed`)).
> **Dueño de las decisiones:** Jesús. **Redacción:** Claude, sobre lo leído en el repo (`DECISIONS.md`, migraciones hasta la `0228`, apps `customer`, `motorizados`, `admin`, `api`) y los documentos de Jesús (`origen-jesus/` (borrado; en git: `8f26aed`) v1, `origen-jesus-v2/`).
> **Nombre público:** **Tindivo Entregas** · **nombre técnico:** `courier`. La carpeta se llama `Encargos` por historia.

## Qué es

**Tindivo recoge algo que ya está pedido, pagado y listo en un punto A y lo lleva a un punto B dentro de San Jacinto, por S/ 3.** Bajada fija: *«Recogemos lo que ya pagaste y lo llevamos.»*

- **Para qué existe:** llenar los días flojos (lunes a jueves) con un servicio nuevo, y generar tráfico con un **directorio de negocios** de San Jacinto que lo alimente. Punto de equilibrio: ~10 viajes por noche.
- **Dos usos, un flujo:** recoger **en un negocio** (el cliente pide y paga allí por su cuenta) o **con una persona / en otro lugar** (un papel, un detalle pequeño, algo olvidado).
- **Regla central:** *Solo recogemos y llevamos. No compramos ni pagamos por ti.*

## Lo que NO es

- No compra ni paga nada por el cliente. No cobra el valor del artículo: **solo el transporte**.
- No es «recojo en tienda» (ahí el cliente va a buscar su comida): aquí **nosotros vamos**.
- No lleva dinero, documentos de identidad, alcohol ni lo que pase de 5 kg (`05`).
- No tiene recargos, foto del cliente, GPS en vivo ni pedidos por WhatsApp.

## Documentos

**¿Sesión nueva? Empieza por [`00-retomar-sesion.md`](https://github.com/tindivo/tindivo-v2/blob/8f26aed/Docs/Encargos/00-retomar-sesion.md).**

| # | Documento | Para qué sirve |
|---|---|---|
| 00 | [`00-retomar-sesion.md`](https://github.com/tindivo/tindivo-v2/blob/8f26aed/Docs/Encargos/00-retomar-sesion.md) | Estado, lo decidido y lo que falta, para retomar sin releer todo |
| 01 | [`01-concepto-y-flujo.md`](01-concepto-y-flujo.md) | Qué es, la pantalla de pedido, estados, lado del motorizado, cobro, cancelación |
| 02 | [`02-dinero-y-cuadre.md`](02-dinero-y-cuadre.md) | Precio, quién paga, la deuda del motorizado y la rendición diaria |
| 03 | [`03-plan-tecnico.md`](03-plan-tecnico.md) | Nombres técnicos, qué se reutiliza, tablas, RPC, rutas, apps, fases y riesgos |
| 04 | [`04-decisiones-abiertas.md`](04-decisiones-abiertas.md) | **Registro de lo decidido** y lo que se asume por defecto |
| 05 | [`05-que-se-puede-llevar.md`](05-que-se-puede-llevar.md) | Qué se lleva y qué no, medicinas, alcohol, límites, términos |
| 06 | [`06-backlog.md`](06-backlog.md) | Lo que **no** entra en v1, cada cosa con su condición de entrada |
| 08 | [`08-ux-conversion.md`](08-ux-conversion.md) | **El UX que manda:** pedir en dos toques desde cualquier sitio, superficies, moto en el mapa, modelo del directorio, medición |
| — | [`../Home/README.md`](../Home/README.md) | El home nuevo tipo Rappi, puerta de entrada del servicio |
| 09 | [`09-analisis-documentos-v2.md`](https://github.com/tindivo/tindivo-v2/blob/8f26aed/Docs/Encargos/09-analisis-documentos-v2.md) | Registro del razonamiento al pasar a la versión 2 de los documentos de Jesús |
| 07 | [`07-integracion-recojo.md`](https://github.com/tindivo/tindivo-v2/blob/8f26aed/Docs/Encargos/07-integracion-recojo.md) | *(Superado)* Análisis de la versión 1 de los documentos de Jesús |
| — | [`origen-jesus-v2/`](origen-jesus-v2/) | **Los documentos de Jesús, versión vigente** (incluye el brief de publicidad del afiche) |
| — | [`origen-jesus/` (borrado; en git: `8f26aed`)](https://github.com/tindivo/tindivo-v2/tree/8f26aed/Docs/Encargos/origen-jesus) · [`historico-pre-v2/` (borrado; en git: `8f26aed`)](https://github.com/tindivo/tindivo-v2/tree/8f26aed/Docs/Encargos/historico-pre-v2) | Versión 1 de sus documentos y nuestras versiones anteriores |

## Resumen en diez líneas

1. El cliente entra por **«Pedir entrega · S/ 3»** junto al teléfono de cada negocio, el pin del mapa, el aviso tras «Llamar», un enlace/QR o el home. **Nunca hay que «ir a una sección».**
2. Se abre una **hoja sobre el mapa** (el mapa es lo principal), con casi todo **ya relleno**: A, B, hora de listo y «a nombre de».
3. Elige **dónde recogemos** (un negocio del directorio, o una persona / otro lugar) y **dónde entregamos**, y ve el **precio S/ 3** antes de iniciar sesión.
4. Si A es un negocio, **paga quien recibe**; si es una persona, **el cliente elige** quién paga. **El artículo no cambia de manos hasta cobrar.**
5. Queda **«solicitado»**; **confirmado** cuando un motorizado lo acepta. Si nadie acepta en **15 min**, se cancela solo.
6. El motorizado lo ve en **el mismo panel** que los pedidos de restaurante, con la insignia **«ENTREGA» azul**, y avanza: *Salgo → Llegué → Recogí → Entregué*.
7. **Sin recargos:** si no está listo, espera 5 min y se cancela sin cobrar a nadie.
8. El motorizado cobra **solo el transporte** (efectivo exacto o su Yape) y **queda en deuda con Tindivo**, que **rinde a diario**.
9. El **directorio** (logo, notas, ubicación, teléfono, tiempo de preparación) se carga **a mano** en la calle desde el celular; los aliados aparecen en **naranja**.
10. Tabla propia **`courier_requests`**, **no** `orders`: reutiliza motorizados, push, realtime y mapa, pero no la máquina de estados del restaurante.

## Cuándo se actualiza `DECISIONS.md`

Cuando Jesús apruebe, se añade **§29 · Tindivo Entregas** (fuente única de verdad) y notas en §4 y §7 sobre «Tindivo no retiene fondos», que aquí se matiza (`02` §1). Hasta entonces, **gana `DECISIONS.md`**.

> Nota de historia: el roadmap (`14-roadmap-y-fuera-de-mvp.md §2`) lo tenía como **«Encomiendas»**, fase 2, condicionado a ≥ 10 consultas al mes. Se adelantó por decisión del dueño.
