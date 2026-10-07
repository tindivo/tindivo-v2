# Tindivo Encargos · «Te lo compramos y te lo llevamos» · v2

> **ARCHIVADA · 2026-10-07.** Jesús decidió no seguir con Encargos: «paga lo
> mismo, más trabajo y encima más riesgo». La apuesta pasa a crear hábito de
> pedir en la app de comida (ver [`Docs/ingresos/conclusion.md`](../../ingresos/conclusion.md)).
> Esta carpeta queda como registro de lo que se pensó y por qué no se hizo.

> **Propuesta v2 · 2026-10-07.** Reescrita después de la conversación del
> 7-oct con Jesús. La v1 (6-oct) está en [`historico-v1/`](historico-v1/): se
> escribió sin saber cómo funcionan hoy los encargos y varias de sus bases
> no se sostenían (las explica la tabla del final).
> Insumos: esa conversación, lo ya construido de Entregas (`0232`–`0241`) y
> la mitad útil de la investigación de Gemini
> ([`Modelo Rappi Favor Para Tindivo.md`](Modelo%20Rappi%20Favor%20Para%20Tindivo.md),
> §1 a §4; de §5 en adelante solo resume la v1).

## Qué es, en una frase

**El cliente pide algo de una tienda o restaurante de San Jacinto. El
motorizado le dice en cuánto tiempo lo atiende, el cliente acepta, el
motorizado lo compra con su propia plata y lo cobra al entregar: lo comprado
más S/ 3.50.**

## Los tres objetivos de Jesús, y cómo los cumple esta versión

| Objetivo | Cómo se cumple |
|---|---|
| **Más ingresos** | S/ 2.50 limpios para Tindivo por encargo, sin poner plata. La demanda ya existe: más de 5 por semana sin publicidad (`01` §1) |
| **Que los motorizados no dependan de Jesús** | El motorizado tiene la información (lista de quién atiende de noche), las reglas (`03`), su propia plata y la app, que le dice el paso siguiente. Jesús solo es la puerta de entrada mientras WhatsApp siga siendo el canal |
| **Controlar lo que hacen** | Ningún encargo existe fuera del sistema: el bono solo se paga por lo registrado. La prueba de cada compra es la constancia de Yape a la tienda. Los tiempos que promete el motorizado contra los reales, a la vista (`02`) |

## Lo que cambió de la v1, y por qué

| Tema | v1 (6-oct) | v2 (7-oct) | Por qué |
|---|---|---|---|
| Plata de la compra | Fondo de S/ 100 que Jesús entrega cada noche | **El motorizado compra con lo suyo** y lo recupera en la puerta | Con el fondo, el motorizado dependía de Jesús todas las noches |
| Pago al motorizado | S/ 0.50 si cuadra | **S/ 1 por encargo, S/ 2 si hubo segunda tienda** | Idea de Jesús. Es un trabajo de atención al cliente, no solo de transporte |
| Prueba de compra | Boleta obligatoria | **Constancia de Yape a la tienda** (o foto) | El 90 % de los restaurantes no da boleta. Todos aceptan Yape |
| Aceptar el pedido | 15 min o se cancela | **El motorizado propone «te atiendo en X min» y el cliente acepta** | Idea de Jesús: transparencia, y que la moto no salga por alguien que desaparece |
| Canal | Formulario de 6 pasos con reglas por artículo | **WhatsApp de Jesús como entrada → ficha corta → todo lo demás en la app** | Los clientes coordinan por WhatsApp; la ficha es para que el motorizado se planifique |
| WhatsApp del motorizado | — | **No.** El motorizado no da su número | Los motorizados rotan (una semana es lo normal) y les escribirían fuera de horario |
| «No hay» | 4 opciones por artículo, 3 min | **Se pregunta en la app; 5 min sin respuesta = se cancela sin cobro** | Regla elegida por Jesús |
| Segunda tienda | +S/ 1 en la lista de precios | **+S/ 1 solo con permiso del cliente, y es para el motorizado** | Un precio de S/ 4.50 a la vista espantaría |
| Horario | Lunes a jueves, 6-10 pm | **Todos los días, 6-11 pm** | Es el horario real de Tindivo |
| Catálogo y aliados de encargos | 3 capas, 5 aliados, stickers | **Lista de quién atiende de noche, hasta qué hora y su teléfono** | Lo que de verdad faltó en el último encargo fue eso |
| Topes | S/ 20 al nuevo / S/ 40 al conocido | **Un tope: S/ 50** | El último pedido fue de S/ 39 y Jesús nunca ha tenido un impago |

## Los documentos

| # | Documento | Qué resuelve |
|---|---|---|
| 01 | [`01-servicio.md`](01-servicio.md) | Precio, horario, qué sí y qué no, el flujo de punta a punta y los casos difíciles |
| 02 | [`02-dinero-y-control.md`](02-dinero-y-control.md) | Quién pone la plata, el reparto, la rendición, la prueba de compra y las pérdidas |
| 03 | [`03-reglas-del-motorizado.md`](03-reglas-del-motorizado.md) | **La hoja que se le da al motorizado nuevo**, más los mensajes listos de Jesús |
| 04 | [`04-plan-tecnico.md`](04-plan-tecnico.md) | Qué se construye sobre Entregas y qué no |
| 05 | [`05-arranque-y-metricas.md`](05-arranque-y-metricas.md) | Fase 0 sin código (desde ya), fase 1 con la app, qué se mide y cuándo se decide |
| 06 | [`06-para-el-debate.md`](06-para-el-debate.md) | **Lo que sigue abierto.** Es lo que conviene llevar al debate con ChatGPT |

## Decidido con Jesús el 7-oct

- El motorizado compra con su plata. Jesús le adelanta **un día** como mucho.
- Bono de **S/ 1** por encargo. Si se pierde la compra (el cliente no paga), **pierde Tindivo**.
- Si el cliente no contesta una pregunta en **5 min**: se cancela sin cobro.
- WhatsApp sigue siendo el canal principal por ahora, con la meta de que deje
  de serlo.
- El reloj para restaurantes: el motorizado pone «listo en X min» y vuelve a la hora.
- «Te atiendo en X min» como paso para aceptar (idea de Jesús).
- El motorizado **no** lleva el WhatsApp de Tindivo en su celular.

Lo que **no** se habló y esta versión decide por defecto (alcohol, recetas,
fin de semana, llamadas desde el número del motorizado, gasolina) está en
`06`, para el debate.

**Al aprobar:** se escribe `DECISIONS.md §33 · Tindivo Encargos` y se matiza
«Tindivo no retiene fondos»: con esta versión, **Tindivo ni siquiera adelanta**
(lo adelanta el motorizado). Lo único que pasa por Tindivo son los S/ 2.50 de
cada encargo. Hasta entonces, gana `DECISIONS.md`.
