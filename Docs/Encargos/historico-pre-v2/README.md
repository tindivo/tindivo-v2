# Encargos — Tindivo v2

> **Estado:** borrador v0.4 · 2026-09-19 · **solo de noche** en esta primera prueba · con las decisiones de Jesús del mismo día incorporadas. **Nada está aprobado del todo ni construido.**
> **Dueño de las decisiones:** Jesús. **Redacción:** Claude, sobre lo leído en el repo (`DECISIONS.md`, migraciones hasta la `0228`, apps `customer` / `motorizados` / `api`).

## Qué es

**Encargos** es un servicio de **recojo y entrega** (lo que InDrive llama *courier*): un cliente de `tindivo.com` pide que un motorizado de Tindivo **recoja algo que ya está listo** y quepa en una mochila —un documento, comida preparada, unas llaves— en un punto A y **lo lleve a un punto B**. El cliente escribe los dos puntos.

Lo distintivo frente al resto de Tindivo: **aquí no hay restaurante**. El vendedor del servicio es Tindivo mismo, así que no hay cajera que acepte ni comisión a un negocio. El cliente le paga al motorizado, y el motorizado le debe a Tindivo.

## Lo que NO es (v1)

- **No hace compras.** El motorizado no compra ni paga nada por el cliente. Solo recoge y entrega (`05` §1).
- No cobra el valor del artículo: solo el servicio.
- No transporta lo que no cabe en la mochila (45 × 45 × 45 cm), ni nada fuera del **catálogo de categorías permitidas** (`05`).
- No es un marketplace de precios a la InDrive (regateo): el precio lo fija Tindivo (**S/ 3 fijo**; por distancia, más adelante).

## Documentos

**¿Sesión nueva? Empieza por [`00-retomar-sesion.md`](00-retomar-sesion.md).**

| # | Documento | Para qué sirve |
|---|---|---|
| 01 | [`01-concepto-y-flujo.md`](01-concepto-y-flujo.md) | Cómo funciona de punta a punta: pantallas del cliente, del motorizado y del admin; estados; casos borde. |
| 02 | [`02-dinero-y-cuadre.md`](02-dinero-y-cuadre.md) | Las dos tarifas, cuándo se cobra, y cómo se le lleva la cuenta al motorizado. |
| 03 | [`03-plan-tecnico.md`](03-plan-tecnico.md) | Qué se reutiliza, qué se crea (tablas, RPC, rutas, apps), fases y riesgos. |
| 04 | [`04-decisiones-abiertas.md`](04-decisiones-abiertas.md) | Qué está cerrado, qué sigue abierto y la propuesta por defecto de cada cosa. **Es el documento a discutir primero.** |
| 05 | [`05-que-se-puede-llevar.md`](05-que-se-puede-llevar.md) | Qué es Encargos dicho al cliente, catálogo de categorías permitidas, límites y borrador de términos. |
| **09** | [`09-analisis-documentos-v2.md`](09-analisis-documentos-v2.md) | **Análisis de la segunda versión de los documentos de Jesús** (`origen-jesus-v2/`): qué cambió, qué se adopta, las contradicciones (10 vs 15 min, alcohol, nombre) y qué habría que actualizar en 01–08. **Es lo más reciente.** |
| **08** | [`08-ux-conversion.md`](08-ux-conversion.md) | **El UX que manda:** por qué la gente llama y no pide, las reglas para que pedir sea facilísimo desde cualquier sitio, la pantalla de pedido, todas las superficies, la moto en el mapa, el nombre y cómo medirlo. |
| **07** | [`07-integracion-recojo.md`](07-integracion-recojo.md) | **Comparación con los documentos de «Recojo» de Jesús**: qué se adopta, dónde discrepan y qué recomiendo. **Donde discrepe con 01–06, manda 07.** Los originales están en [`origen-jesus/`](origen-jesus/). |
| 06 | [`06-backlog.md`](06-backlog.md) | Lo que **no** entra en v1 (subir la oferta, servicio de día, distancia, ruta real, código de entrega…), cada cosa con su condición de entrada. |
| — | [`../Home/README.md`](../Home/README.md) | **Feature aparte pero conectada:** el home nuevo tipo Rappi, que es la puerta de entrada de Encargos. |

## Resumen en diez líneas

1. Botón **Encargos** en `tindivo.com`, con la línea fija *«Solo recojo y entrega. No hacemos compras.»* Exige sesión y teléfono verificado (ya existe).
2. El cliente elige una **categoría permitida** (documentos, comida, bebidas, medicinas, ropa, llaves, paquete cerrado), describe qué llevamos, declara el valor (hasta S/ 200) y confirma que **cabe en la mochila**.
3. Elige el sentido —*«que me traigan algo»* o *«que lleven algo»*— y escribe **A y B**, con mapa, referencia y teléfono de contacto.
4. Ve el **precio (S/ 3)** y elige **cuándo paga** (al recoger o al entregar) y **cómo** (Yape o efectivo exacto).
5. Pulsa *Pedir motorizado* → pantalla **«Buscando motorizado…»**.
6. Al motorizado le llega un **push**; el primero que acepta se queda el encargo.
7. El motorizado avanza: *voy a A → llegué → recogí → llegué a B → entregué*, con **notas** en cualquier momento.
8. **El artículo no cambia de manos hasta que el motorizado cobre**: nada viaja fiado.
9. **Todo el dinero pasa por el motorizado** (efectivo exacto o su Yape). La deuda con Tindivo es el precio de cada encargo entregado, y la rinde al cierre.
10. Tabla propia (`errands`), **no** se mete en `orders`: reutiliza motorizados, push, realtime y mapa, pero no la máquina de estados del restaurante.

## Cuándo se actualiza `DECISIONS.md`

Cuando las decisiones de `04` estén cerradas, se añade **§29 · Encargos** a `DECISIONS.md` (fuente única de verdad) y estos documentos pasan a ser el detalle de apoyo. Hasta entonces, **gana `DECISIONS.md`**, incluida su frase «Tindivo no retiene fondos», que Encargos matiza (`02` §1).

> Nota de historia: el roadmap (`14-roadmap-y-fuera-de-mvp.md §2`) tenía esto como **«Encomiendas»**, fase 2, condicionado a ≥10 consultas/mes. Aquí se adelanta por decisión del dueño; el roadmap ya sugería un módulo separado heredando de `orders`, no reutilizar la tabla.
