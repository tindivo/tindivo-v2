# Tindivo: Documento maestro (Recoge y Lleva + Catálogo de negocios)

> **Instrucciones para el agente**
> 1. Lee este documento primero y luego los específicos (índice en la sección 3).
> 2. Antes de programar, revisa lo que ya existe en el código (flujo de encargos, mapa Leaflet, panel admin, app del motorizado, entidad de pedidos). **Complementa lo existente; no lo dupliques ni lo reescribas.** Si algo choca con la arquitectura actual, propón el cambio y pregunta antes de ejecutarlo.
> 3. Lo marcado como **[DEFINIDO]** lo decidió Jesús. Lo marcado como **[POR CONFIRMAR]** no está decidido: impleméntalo como configuración editable o déjalo fuera, pero no lo asumas.
> 4. El sistema de restaurantes partners (menús, pedidos de restaurante, su panel) **está fuera de alcance**. Solo se toca donde este documento lo diga.
> 5. Restricción de diseño: el negocio lo sostiene **una sola persona**. Prefiere automatizar y simplificar.
> 6. **Nombre público:** el servicio se llama **"Tindivo Recoge y Lleva"** (abreviado "Recoge y Lleva"). En toda pantalla y texto visible al usuario usa ese nombre. **Nunca** uses "Recojo", "encargos" ni "mandado" hacia el usuario ("recojo en tienda" es otra cosa: el cliente va personalmente a recoger su comida). Internamente (tablas, claves de configuración, eventos, nombres de archivo) se mantiene `recojo` como nombre técnico.

---

## 1. Contexto y objetivo

- Tindivo es logística de última milla en San Jacinto (Perú), con flota propia (2 motos + un motorizado adicional jueves, sábado y domingo). Todo es web, sin apps nativas.
- **Ingreso actual:** pedidos de restaurantes partners. El restaurante paga S/1.50 por viaje y el usuario paga S/2–2.50 (total S/3.50–4 por viaje).
- **Problema:** entre semana hay pocos pedidos (10–12 al día; un día hubo solo 4). El motorizado adicional cuesta S/30 por noche.
- **Objetivo:** llenar los días flojos con **Recoge y Lleva**, un servicio nuevo desde S/3 por viaje, y generar tráfico con un **catálogo de negocios** de San Jacinto que lo alimente.
- **Meta operativa:** ~20 viajes al día entre semana (el punto de equilibrio del motorizado adicional a S/3 es ~10 viajes por noche; ver 05).

## 2. Qué es Recoge y Lleva [DEFINIDO]

Tindivo **recoge algo que ya está pedido, pagado y listo** en un punto A y **lo lleva** a un punto B dentro de San Jacinto. Tarifa fija de **S/3** (impreso como "desde S/3"). Dos usos, un solo flujo:

- **En un negocio:** el cliente llama al negocio, pide y paga su pedido por su cuenta, y luego solicita el servicio en tindivo.com.
- **Con una persona o en otro lugar:** alguien deja listo un objeto (papel, un detalle pequeño, algo olvidado) y Tindivo lo lleva a otro punto.

**Regla central:** *Solo recogemos y llevamos. No compramos ni pagamos por ti.* El artículo debe estar **coordinado, pagado y listo** antes de solicitar.

**Quién paga el transporte (S/3):**
- Recojo en un **negocio**: paga **quien recibe** en el punto B. El negocio nunca paga.
- Recojo con una **persona**: el cliente elige al pedir si paga **quien entrega** (se cobra en el punto A) o **quien recibe** (se cobra en el punto B).
- El motorizado cobra **solo el transporte** (efectivo o Yape) y **nunca maneja dinero del producto**.

## 3. Índice de documentos

| Archivo | Contenido |
|---|---|
| `01-flujo-recojo.md` | Flujo de 4 pasos, textos, quién paga, estados, motorizado, cancelación, modelo de datos |
| `02-negocios-campos-categorias.md` | Glosario, categorías, campos del negocio, panel admin, checklist de visita, reglas de contenido |
| `03-mapa.md` | Mapa Leaflet: colores, marcadores, tarjetas, filtros, selector de punto |
| `04-visibilidad-y-adquisicion.md` | Puntos de entrada, pop-ups, enlaces, kit para negocios, afiche, contenido |
| `05-precio-promos-metricas.md` | Precio, configuración, promos, economía, métricas y criterios de decisión |

(El brief de publicidad para el afiche es un documento aparte, `brief-publicidad-recoge-y-lleva.md`, para otro agente.)

## 4. Principios de producto

1. **Un solo camino, poca información.** Se entiende en cinco segundos.
2. **El producto siempre llega pagado.** El motorizado cobra solo el transporte.
3. **Tindivo transporta; no responde por el contenido.** La calidad y el error del producto son del negocio.
4. **Los negocios son el canal.** El tráfico llega vía negocios (QR, estado de WhatsApp, mensaje por teléfono) y el afiche.
5. **Partners primero.** En horas pico, los pedidos de partners tienen prioridad; el motorizado puede rechazar un recojo.
6. **Medir una sola cosa:** ¿esto genera recojos completados? Las visitas no cuentan por sí solas.
7. **Configurable en vez de hardcodeado:** precio, horario, peso máximo, tiempos y promos van en configuración.

## 5. Decisiones tomadas [DEFINIDO]

- **Nombre público:** Tindivo Recoge y Lleva.
- **Precio:** S/3 fijo, editable por configuración; se imprime "desde S/3". S/3.50 se evaluará con datos.
- **Horario:** todos los días, **de 6 pm a 11 pm**, por ahora (configurable).
- **Zona:** solo San Jacinto (casco urbano). Nada fuera del pueblo.
- **Sin foto** al solicitar. Solo una línea de texto que dice qué se lleva.
- **Sin recargo por espera.** Si el pedido no está listo, se cancela y no se cobra a nadie.
- **Espera máxima:** 5 minutos desde que llega el motorizado; luego se cancela.
- **Peso máximo:** 5 kg. Tamaño: lo que quepa con seguridad en la mochila o caja de la moto.
- **El motorizado puede rechazar** cualquier recojo que no pueda llevar con seguridad (por ejemplo, tortas o cosas que se puedan voltear).
- **Confirmado** = un motorizado lo acepta en su app. Antes de eso el pedido está solo "solicitado".
- **Seguimiento por estados** en la web (solicitado, aceptado, en camino a recoger, recogido, en camino a entregar, entregado). **No hay GPS en vivo** del motorizado.
- **Negocios en el catálogo:** buscador de negocios disponible al lanzar; carga manual desde el panel admin.
- **WhatsApp:** solo para consultas, no para hacer pedidos.
- **Promoción del primer delivery gratis:** solo pedidos a restaurantes; no aplica a Recoge y Lleva. Jesús absorbe solo lo que paga el usuario (S/2–2.50) en esa promo; el fee de S/1.50 del restaurante no cambia.
- **No apilar promos:** Recoge y Lleva sale a S/3 sin descuento al lanzar. La promo de primer uso se activa después, con límites (ver 05).
- Negociación de precio: backlog.
- No se espera a la app móvil para lanzar.

## 6. Decisiones pendientes [POR CONFIRMAR]

| # | Tema | Dónde |
|---|---|---|
| 1 | Número de WhatsApp de consultas que se imprime en el afiche | 04 |
| 2 | Cuántos negocios estarán cargados al lanzar (no anunciar una cifra hasta saberlo) | 02 |
| 3 | Tope de pedidos gratis de la promo del afiche de restaurantes | 05 |
| 4 | Precio real de la competencia (servicio por llamada) | 05 |
| 5 | Vista por defecto del catálogo: lista o mapa | 03 |
| 6 | Umbral de visitas para empezar a vender publicidad | 05 |
| 7 | S/3 vs S/3.50 (decidir con datos tras 2 semanas) | 05 |

## 7. Orden de trabajo sugerido

1. Cerrar el flujo (01) y el buscador de negocios con los negocios cargados a mano (02).
2. Panel admin de negocios y mapa rojo/gris (02, 03).
3. Estados, aceptación del motorizado y cobro del transporte (01).
4. Eventos de tracking (05).
5. Kit para negocios, enlaces `/r/<slug>` y afiche con QR (04).
6. Puntos de entrada y aviso posterior a "Llamar" (04).
7. Promo limitada de primer uso (05), cuando el flujo esté estable.
8. Página pública del catálogo y contenido para redes (04).

## 8. Criterios de éxito de la primera prueba (2 semanas) [PROPUESTA]

- **Meta:** ~40 recojos por semana entre semana.
- **Alarma de cancelaciones:** si más de 1 de cada 5 pedidos se cancela por "no estaba listo", reforzar el aviso de hora de listo o el trato con los negocios.
- **Alarma de catálogo:** muchos clics en "Llamar" y pocos en "Pedir Recoge y Lleva" significa que el catálogo funciona como guía telefónica y no genera ingreso.
- **Señal de salud:** clientes que repiten un segundo recojo pagando S/3.
- Si tras 2 semanas hay menos de ~15 por semana, no invertir más en funciones; revisar el canal (negocios, afiche).

## 8b. Backlog (no construir en v1)

Negociación de precio · recargo por espera · foto del artículo · compras con dinero adelantado · documentos y DNI (con código de entrega, si algún día entran) · supermercados · negocios con delivery propio · programar hora exacta · autoregistro de negocios · GPS en vivo del motorizado · publicidad y marcadores destacados de pago · horarios estructurados con cálculo de abierto/cerrado · foto de carta · app móvil nativa.
