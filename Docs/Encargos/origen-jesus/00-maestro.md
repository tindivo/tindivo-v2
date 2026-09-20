# Tindivo: Documento maestro (Recojo + Catálogo de negocios)

> **Instrucciones para el agente**
> 1. Lee este documento primero y luego los específicos (índice en la sección 3).
> 2. Antes de programar, revisa lo que ya existe en el código (encargos, mapa Leaflet, panel admin, app del motorizado, entidad de pedidos). **Complementa lo existente; no lo dupliques ni lo reescribas.** Si algo choca con la arquitectura actual, propón el cambio y pregunta antes de ejecutarlo.
> 3. Lo marcado como **[POR CONFIRMAR]** no está decidido: impleméntalo como configuración editable o déjalo fuera, pero no lo asumas.
> 4. Lo marcado como **[PROPUESTA]** es una recomendación con la que Jesús estuvo en general de acuerdo, pero sin números cerrados.
> 5. El sistema de restaurantes partners (menús, pedidos de restaurante, su panel) **está fuera de alcance**. Solo se toca donde este documento lo diga (botón "Pedir en Tindivo" desde el catálogo, y el cruce de promociones).
> 6. Restricción de diseño: el negocio lo sostiene **una sola persona**. Prefiere automatizar y simplificar. Todo lo manual debe ser mínimo.

---

## 1. Contexto y objetivo

- Tindivo es logística de última milla en San Jacinto (Perú), con flota propia (2 motos + un motorizado adicional jueves, sábado y domingo). Todo es web, sin apps nativas.
- **Ingreso actual:** pedidos de restaurantes partners. El restaurante paga S/1.50 por viaje y el usuario paga S/2–2.50 (total S/3.50–4 por viaje).
- **Problema:** entre semana hay pocos pedidos (10–12 al día; un día hubo solo 4). El motorizado adicional cuesta S/30 por noche.
- **Objetivo de esta iniciativa:** llenar los días flojos (lunes a jueves) con **Recojo**, un servicio nuevo a S/3 por viaje, y generar tráfico con un **catálogo de negocios** de San Jacinto que alimente ese servicio.
- **Meta operativa:** subir el promedio entre semana hacia ~20 viajes al día (recordar que el punto de equilibrio del motorizado adicional es ~10 viajes por noche a S/3; ver 05).

## 2. Qué es Recojo (definición corta)

Servicio de **recoger un pedido ya pagado** en un punto A y llevarlo a un punto B, con tarifa fija de S/3 pagada por el usuario. Dos usos, un mismo flujo:

- **Recojo desde un negocio del catálogo:** el cliente llama al negocio, pide y paga (Yape o similar) por su cuenta, y luego solicita en tindivo.com que Tindivo lo recoja y lo lleve.
- **Envío persona a persona:** un papel, una galleta, un objeto pequeño. El punto A se marca a mano.

**Regla central:** *Solo recogemos y llevamos. No compramos ni pagamos por ti.* El motorizado **nunca maneja dinero del pedido**.

## 3. Índice de documentos

| Archivo | Contenido |
|---|---|
| `01-flujo-recojo.md` | Flujo de 4 pasos, textos de pantalla, estados, lado motorizado, reglas de espera y cancelación, modelo de datos |
| `02-negocios-campos-categorias.md` | Glosario, categorías, campos del negocio, panel admin, checklist de visita, reglas de qué se puede llevar |
| `03-mapa.md` | Mapa Leaflet: colores, marcadores, tarjetas, filtros, selector de punto, flujo del usuario |
| `04-visibilidad-y-adquisicion.md` | Cómo hacer visible Recojo: puntos de entrada, pop-ups, deep links, kit para negocios, afiche, contenido |
| `05-precio-promos-metricas.md` | Precio, regla de espera, promos, economía, métricas y criterios de decisión |

## 4. Principios de producto

1. **Un solo camino, poca información.** El usuario debe entender Recojo en cinco segundos.
2. **Prepago siempre.** Sin dinero en manos del motorizado.
3. **Tindivo transporta; no responde por el contenido.** La calidad y el error del producto son del negocio.
4. **Los negocios son el canal.** El tráfico llega vía negocios (QR, estado de WhatsApp, mensaje por teléfono) y afiche, no por búsqueda espontánea.
5. **Partners primero.** En horas pico, los pedidos de partners tienen prioridad sobre Recojo. Recojo se empuja en horas valle.
6. **Medir una sola cosa:** ¿esto genera recojos completados? Las visitas no cuentan por sí solas.
7. **Configurable en vez de hardcodeado:** precios, promos, disponibilidad y reglas de espera van en configuración.

## 5. Decisiones tomadas

- Recojo es prepagado; no hay compras por parte del motorizado en la v1.
- Precio base **S/3 fijo**, editable por configuración. S/3.50 se evaluará con datos.
- Negociación de precio (sumar S/0.50): **backlog**.
- El catálogo se carga **a mano** desde el panel admin; se empieza con ~10 negocios, principalmente sin delivery propio.
- Se acepta también el envío persona a persona (mismo flujo A→B).
- Mapa Leaflet: **partners en rojo vibrante, resto de negocios en gris**.
- Los teléfonos de los negocios se muestran directamente; no se esconden detrás de un pedido.
- Promo del afiche (restaurantes): "primer pedido gratis al registrarse". Jesús **absorbe solo lo que paga el usuario (S/2–2.50)**; el fee de S/1.50 del restaurante no cambia.
- **No apilar promos:** Recojo sale a S/3 sin descuento al lanzar. La promo de primer Recojo se activa después, con límites (ver 05).
- No se espera a la app móvil para lanzar Recojo.
- La publicidad en el catálogo es una idea futura, condicionada a tener tráfico sostenido.

## 6. Decisiones pendientes

| # | Tema | Dónde |
|---|---|---|
| 1 | Regla y monto de recargo por espera del motorizado | 01 y 05 |
| 2 | Política de cancelación (antes y después de que el motorizado salga) | 01 |
| 3 | Horario de servicio de Recojo y qué pasa cuando no hay motorizado disponible | 01 |
| 4 | Tope de "primer pedido gratis" del afiche (cuántos se regalan) | 05 |
| 5 | Precio real de la competencia (servicio por llamada) | 05 |
| 6 | Vista por defecto del catálogo: lista o mapa | 03 |
| 7 | Lista definitiva de qué se puede y no se puede llevar | 02 |
| 8 | Umbral de visitas para empezar a vender publicidad | 05 |
| 9 | S/3 vs S/3.50 (decidir con datos tras 2 semanas) | 05 |

## 7. Orden de trabajo sugerido

1. Cerrar el flujo de Recojo (01) y el buscador de negocios con ~10 negocios cargados a mano (02).
2. Panel admin de negocios y mapa rojo/gris (02, 03).
3. Eventos de tracking (05).
4. Kit para negocios, deep links `/r/<slug>` y afiche con QR (04).
5. Puntos de entrada y pop-up post-"Llamar" (04).
6. Promo limitada de primer Recojo (05), cuando el flujo esté estable.
7. Página pública del catálogo y contenido para redes (04).

## 8. Criterios de éxito de la primera prueba (2 semanas) [PROPUESTA]

- **Objetivo:** ~40 recojos por semana entre semana.
- **Alarma de espera:** si el promedio de espera del motorizado supera 8–10 minutos, el flujo pierde dinero.
- **Alarma de catálogo:** si hay muchos clics en "Llamar" y pocos en "Pedir recojo", el catálogo es una guía telefónica que no genera ingreso.
- **Señal de salud:** clientes que repiten un segundo recojo pagando S/3.
- Si tras 2 semanas los recojos siguen por debajo de ~15 por semana, no invertir más en funciones nuevas; revisar canal (negocios, afiche) antes que producto.

## 8b. Backlog (no construir en v1)

Negociación de precio · compras con dinero adelantado · documentos y DNI (con código de entrega, si algún día entran) · supermercados · negocios con delivery propio · programación por hora exacta · autoregistro de negocios · publicidad y marcadores destacados de pago · horarios estructurados con cálculo de abierto/cerrado · foto de carta · app móvil nativa.
