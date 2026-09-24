# Tindivo — Catálogo de negocios y Encargos (spec v1)

2026-09-21 · @Someone

## 1. Objetivo y alcance

**Qué resuelve:** hoy la demanda de recojo/encargos está limitada por dos cosas — la gente no sabe qué negocios existen fuera de sus contactos habituales, y pedir un recojo cuesta más pasos que pedirle delivery directo a un negocio. El catálogo ataca lo primero (descubrimiento); el flujo de solicitud ataca lo segundo (fricción).

**Para quién:** cualquier persona en San Jacinto que quiera ver qué hay abierto, sin necesidad de ser cliente de recojo todavía. El catálogo es la puerta de entrada; el recojo es la conversión.

**Dos objetivos distintos, no uno solo:**

- Tráfico y utilidad: que la gente entre al mapa como entraría a Google Maps, encuentre un negocio, vea su horario y foto. Esto debe funcionar **siempre**, no solo en el horario de recojo.
- Conversión a Tindivo: de ese tráfico, que una parte pida el recojo (6pm-11pm) o, con el tiempo, que el negocio pase a ser partner.

**Qué NO es esta v1:**

- No es una app de reseñas ni una red social de negocios.
- No depende de tener el 100% de los negocios de San Jacinto cargados el día del lanzamiento — se lanza con un grupo inicial y crece cada semana.
- No reemplaza el flujo de pedidos a restaurantes partner que ya existe en tindivo.com; es un directorio adicional.

## 2. Visibilidad vs. solicitud del recojo

Son dos reglas separadas — dos campos, no uno:

**a) `visible_en_mapa`** (sí/no) — controla si el negocio aparece en el mapa/directorio. Por defecto **sí** para casi todos, incluidos los negocios que ya trabajan con Zorritos y los vendedores informales (ej. carritos). El mapa es una herramienta de descubrimiento tipo Google Maps: mientras más completo, más tráfico y más útil para cualquier búsqueda, no solo para pedir recojo.

**b) `recojo_habilitado`** (sí/no) — controla si aparece el botón "Solicitar recojo" en la ficha del negocio. Va en **no** para negocios que trabajan exclusivamente con Zorritos (compiten en el mismo paso: ellos ofrecen delivery en un solo paso y más barato) y para cualquier negocio sin forma confirmada de recibir la solicitud. Va en **sí** solo cuando confirmaste que el negocio acepta que un tercero recoja a nombre del cliente.

**Por qué el mapa no se apaga fuera de 6pm-11pm:** apagar el mapa entero fuera de ese horario mata justo el objetivo de "ganar visitas" — nadie puede buscar un negocio a medio día, y se pierde tráfico y SEO. Además, en el mapa también viven los pines de tus restaurantes partner, cuyo pedido normal no tiene esa restricción de horario.

**Recomendación:** el mapa se navega siempre; solo el botón "Solicitar recojo" se limita a 6pm-11pm. Fuera de ese horario, la ficha muestra el negocio igual, con un aviso ("Recojo disponible de 6pm a 11pm") en vez del botón, o un botón de Llamar.

## 3. Atributos del negocio

| Campo | ¿Se muestra? | Obligatorio | Nota |
| --- | --- | --- | --- |
| Nombre | Sí | Sí |  |
| Categoría | Sí | Sí | Lista fija, ver sección 4 |
| Pin de ubicación | Sí | Sí |  |
| Referencia en texto | Sí | Sí | "Frente al parque…" — clave en un pueblo sin direcciones formales |
| Teléfono | Sí, con botón Llamar | Sí | Si no existe, el negocio queda solo "visible", sin botón de Solicitar |
| WhatsApp | Sí, ícono junto al teléfono | No | Puede repetir el mismo número que Teléfono; si no hay, se omite el ícono sin afectar el botón Llamar |
| Horario | Sí, como "Abierto ahora / Cerrado" | Sí | Un rango simple, marcado como referencial; nunca bloquea, solo informa |
| Foto de portada | Sí | No, pero muy recomendada | Reemplaza al logo — la mayoría no tiene logo, y una foto real del local vende mejor la idea de "Google Maps". Una sola foto por negocio en v1, no galería |
| Internos: `visible_en_mapa`, `recojo_habilitado`, `es_aliado`, `tiene_carta_en_tindivo`, `trabaja_con_zorritos`, `última_verificación` | No (uso interno) | Sí | Combinados, definen color de pin, badges y qué botones aparecen — ver 3.1 |

### 3.1 Cómo se traduce en el pin y la tarjeta

Son tres estados visuales, no dos — `recojo_habilitado` y `es_aliado` son excluyentes entre sí, y `tiene_carta_en_tindivo` se suma aparte:

- **Aliado** (`es_aliado = sí` — plantilla Veneburguer, hoy La Florencia): pin naranja sólido, un solo botón ancho "Pedir en Tindivo". El pedido va directo por Tindivo, así que el recojo no aplica y `recojo_habilitado` queda en no.
- **Recojo habilitado** (`recojo_habilitado = sí`, no aliado): pin carbón, doble botón "Llamar" + "Pedir entrega · Desde S/ 3".
- **Solo visible** (ninguno de los dos, o sin `recojo_habilitado` por trabajar con Zorritos o no tener contacto confiable): pin gris, un solo botón "Llamar" (ninguno si tampoco hay teléfono).

`tiene_carta_en_tindivo` es independiente de esos tres: si el negocio tiene menú digital cargado (ej. Bodega Doña Ana), suma un tercer botón "Ver carta en Tindivo" al patrón que le toque por su otro flag.

**Por qué una sola foto y no galería:** esto lo cubres tú solo, de noche, y el universo acaba de crecer a "todos los negocios de San Jacinto". Una foto de portada por negocio ya cambia la sensación del mapa de "lista de teléfonos" a "Google Maps". Una galería completa (interior, productos) es mucho trabajo para un beneficio marginal — evalúalo más adelante, solo para partners.

## 4. Categorías de negocio

Lista fija (evita categorías libres que se vuelven inconsistentes con el tiempo):

- Pollo / parrilla
- Chifa
- Pizza y hamburguesas
- Snacks y comida rápida
- Postres y helados
- Bebidas y licores
- Farmacia
- Minimarket / bodega
- Otros

## 5. Flujo de solicitud de recojo

1. El cliente busca el negocio en el mapa (o lo escribe a mano si aún no está cargado — el catálogo estará incompleto al inicio, esto no debe bloquear el pedido).
2. Si elige un negocio con `recojo_habilitado = sí`, se autocompletan nombre y teléfono.
3. Checkbox obligatorio: "Ya hice mi pedido y lo confirmé con el negocio" — evita solicitudes sin un pedido real detrás.
4. El cliente ingresa: nombre con el que hizo el pedido (lo que dirá el motorizado al recoger), dirección con referencia, teléfono de contacto.
5. Si el negocio figura cerrado o la hora está fuera de 6pm-11pm, se avisa antes de dejar continuar.
6. Queda confirmado solo cuando el motorizado lo acepta en su app — no antes.
7. Si el motorizado llega y el pedido no está listo, se cancela a los 5 minutos de espera.
8. El motorizado puede rechazar algo difícil de transportar (ej. tortas).
9. Seguimiento solo por estados, sin GPS en vivo.

## 6. Parámetros ya definidos del servicio de recojo prepagado

- Precio base: S/3 (fijo, sin negociación tipo inDrive por ahora)
- Horario: todos los días, 6pm-11pm
- Zona: solo dentro de San Jacinto
- Peso máximo: 5 kg
- Sin foto obligatoria al solicitar
- Sin recargos
- **Pendiente de tu confirmación: quién paga el transporte.** Recomendación: paga quien solicita (más simple de cobrar, evita reclamos entre negocio y cliente). Alternativa: paga quien recibe.

## 7. Fuera de alcance en v1

- **Reseñas públicas.** Suena fácil pero no lo es: implica moderar contenido público sobre negocios reales, en un pueblo chico, donde un negocio molesto por una mala reseña es un conflicto real — y necesitas buena relación con esos mismos negocios para venderles ser partners más adelante. Es una tarea que requiere atención sostenida, y no pasa el filtro de "una sola persona la puede sostener".
  - **Alternativa ligera:** después de cada recojo, un feedback interno opcional (👍/👎), visible solo para ti, no público. Sirve para depurar el catálogo (detectar negocios poco confiables) sin exponerte a un conflicto público. Se puede construir después del lanzamiento; no bloquea nada ahora.
- **Galería de fotos por negocio** (más allá de una foto de portada). Ver sección 3.
- **Horarios por día de la semana** (por ahora, un solo rango general).
- **Login o panel propio para negocios.** Tú sigues cargando y editando cada ficha desde tu panel admin.

## 8. Decisiones pendientes

1. ~~Quién paga el transporte del recojo~~ — **resuelto 2026-09-22: elige el cliente** entre "Quien entrega" (al recoger) y "Quien recibe" (al entregar), tal como ya lo construyó la pantalla 4b/4c. No se fuerza a un solo lado, pero **"Quien recibe" viene preseleccionado** — el usuario cambia solo si quiere que pague el otro extremo.
2. **Negocios sin WhatsApp/teléfono claro** (ej. carritos informales, como el de la señora de sánguches): ¿quedan solo "visibles" sin botón de Solicitar hasta conseguir un contacto confiable, o hay otra forma de confirmarles pedidos?
3. **Reseñas** — confirmar que quedan fuera de v1 (sección 7), o si hay una razón de peso para forzarlas ya.
4. **Meta de carga inicial** — cuántos negocios te comprometes a fotografiar/registrar en las primeras 2 semanas, para no bloquear el lanzamiento esperando tener a "todos".

## 9. Métricas de éxito (30 días)

- Recojos/encargos por día laborable (meta: 5 — hoy el hueco es de lunes a viernes)
- % de negocios con `recojo_habilitado = sí` que reciben al menos 1 solicitud
- Clientes que repiten un recojo
- Negocios que pasan de "visible" a partner (plantilla Veneburguer)
- Visitas al mapa fuera del horario 6pm-11pm (mide si el mapa siempre-visible realmente atrae tráfico adicional)

## 10. Arquitectura de datos

Decidido el 2026-09-22, antes de escribir la primera migración.

**El nombre en inglés es `courier`, no `pickup`.** `pickup` ya está tomado: 81
migraciones (`0219`–`0225`) construyen con ese nombre el recojo en mostrador
de un pedido normal de Tindivo (el cliente pide por la app, no hay delivery,
viene él mismo, paga antes de que cocinen — S/1.00, antifraude y comisión
propios). Es un mecanismo distinto al de este doc: aquí el cliente ya pagó
**afuera** de Tindivo y un motorizado se lo trae. Usar `recojo`/`pickup` en
tablas, columnas o rutas habría chocado con eso. `courier` es el nombre en
identificadores; en español y en la UI sigue siendo "recojo"/"Tindivo
Entregas" como ya lo bautizó el diseño.

**Tablas nuevas, no extender `businesses`/`orders`.** `businesses` ya carga
144 migraciones de columnas pensadas para un partner operando de verdad
(comisión, dashboard, horarios, RLS de cajera) — no tiene sentido meter ahí
cientos de negocios informales con casi nada de datos. `orders` tiene su
propia máquina de estados (invariante 8) atada a un `business_id`; el camino
"otro lugar o persona" del diseño ni siquiera siempre tiene negocio. Van dos
tablas propias:

- **`directory_businesses`** — el catálogo/mapa (sección 3): nombre,
  categoría, `lat`/`lng` (`numeric(10,7)`), `reference_text`, `phone`,
  `whatsapp`, `opens_at`/`closes_at`, `cover_photo_url`, y los flags internos
  de 3.1 (`visible_on_map`, `courier_enabled`, `is_partner`,
  `has_menu_in_tindivo`, `works_with_zorritos`, `last_verified_at`).
  `is_partner = true` lleva además `partner_business_id` (FK a
  `businesses.id`) para que el botón "Pedir en Tindivo" enrute al negocio
  real.
- **`courier_orders`** — la solicitud de entrega, con **snapshot, no FK
  obligatoria**: si el cliente eligió un negocio del catálogo,
  `directory_business_id` queda como referencia solo para las métricas de la
  sección 9 (ej. "% de negocios con `courier_enabled` que reciben ≥1
  solicitud"); los datos que de verdad usa el pedido —
  `origin_name`/`origin_phone`/`origin_lat`/`origin_lng`/`origin_reference_text`
  y su espejo `destination_*` — se copian al crear el pedido y ya no dependen
  de que el negocio exista o no cambie después. Así "elegir del catálogo" y
  "otro lugar o persona" llenan la misma fila de la misma forma. Resto de
  columnas: `recipient_display_name` (a nombre de quién se pregunta al
  recoger), `item_category`/`item_description`/`is_fragile`, `payer`,
  `payment_method`, `fee_amount` (`numeric(10,2)`, desde `app_settings`, no
  hardcode), `pickup_window_minutes`, `weight_confirmed`, `courier_user_id`,
  `status` con su propia máquina de estados (no reutiliza la de `orders`),
  y los timestamps de cada transición + `cancel_reason`.

`payer` (resuelto en 8.1, 2026-09-22): enum `origin | destination` — quien
entrega (recoge) o quien recibe, no "quien usa la app". Elegido por el
cliente en 4b/4c, con **`destination` preseleccionado por defecto** en las
dos pantallas (el radio "Quien recibe" ya viene marcado); el usuario lo
cambia solo si quiere que pague el otro extremo. No es un valor fijo del
sistema, pero tampoco una elección neutra sin sugerencia.

**Alcance de la primera noche de build (2026-09-22):** no existe ningún
diseño del lado del motorizado para `courier_orders` — lo único en curso en
`apps/motorizados` es la tarjeta de un pedido normal, sin relación. Se
construye backend completo (migración, contracts, core con TDD, API) +
las 15 pantallas de cliente. El loop completo (un motorizado aceptando de
verdad) queda para una fase aparte, con su propio diseño antes de tocar
código — igual que se hizo con el lado cliente. El `coverage_polygon` /
`point_in_coverage_polygon()` de `app_settings` (migraciones `0045`/`0064`)
se reutiliza tal cual para "Fuera de la zona"; el horario del courier
necesita su propia clave en `app_settings` — no puede compartir
`platform_schedule`, que es martes a sábado y courier es todos los días.
