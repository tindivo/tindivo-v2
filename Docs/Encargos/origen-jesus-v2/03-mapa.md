# 03. Mapa de negocios (Leaflet)

> Lee primero `00-maestro.md` y `02-negocios-campos-categorias.md`. Jesús ya tiene un mapa con Leaflet personalizado: **reutiliza ese componente**. La meta es un solo componente con dos modos, no dos mapas distintos.

## 1. Dos modos del mismo componente

| Modo | Uso | Interacción |
|---|---|---|
| `catalogo` | Pestaña "Mapa" del catálogo de negocios | Ver marcadores de negocios, tocar y abrir tarjeta |
| `selector_punto` | Elegir punto A o B dentro del flujo de Recoge y Lleva | Pin arrastrable; muestra negocios cercanos como sugerencia |

## 2. Configuración base

- Centro y zoom iniciales: San Jacinto **[coordenadas por definir por Jesús]**.
- Límites (`maxBounds`) alrededor del pueblo para que el usuario no se pierda.
- Un solo request con todos los negocios activos (JSON), con caché de 5–10 minutos. Con decenas de negocios no se necesita clustering ni paginación.
- Solo aparecen negocios con `activo = true` y con coordenadas.

## 3. Marcadores

| Tipo | Estilo | Notas |
|---|---|---|
| **Partner** (`es_partner = true`) | **Rojo vibrante**, tamaño mayor, por encima de los demás (z-index) | Es lo que más mueve el negocio; debe destacarse |
| **No partner** | **Gris**, tamaño estándar | |
| Ubicación del usuario | Punto azul (solo si el usuario dio permiso) | No pedir permiso al abrir el mapa |

- **No depender solo del color:** el partner debe diferenciarse también por forma o ícono (p. ej. un pin con estrella o logo) para personas con dificultad para distinguir colores.
- **Leyenda visible** sobre el mapa, que además comunica el mensaje:
  - 🔴 **Aliados Tindivo: pídelo aquí**
  - ⚪ **Otros negocios: llama y pide Recoge y Lleva**

## 4. Tarjeta al tocar un marcador (bottom sheet)

Contenido: logo, nombre, categoría, descripción corta y horario.

| Tipo | Botones |
|---|---|
| Partner | **"Pedir en Tindivo"** (abre el flujo actual de restaurantes) |
| No partner | **"Llamar"** (`tel:`) y **"Pedir Recoge y Lleva"** (abre el flujo 01 con el negocio ya elegido) |

- El teléfono se muestra siempre (no se esconde detrás de ningún pedido).
- La tarjeta se cierra al tocar fuera y no bloquea el mapa.
- Al tocar "Llamar" en un negocio no partner, activar el mecanismo posterior a la llamada (ver 04, sección 4).

## 5. Buscador y filtros

- Buscador por texto sobre nombre, etiquetas y descripción.
- **Chips** de categoría (`comida`, `bodega`, `farmacia`, `panaderia_postres`, `otro`) y un chip **"Aliados Tindivo"** para ver solo partners.
- Al filtrar, el mapa oculta los marcadores que no coinciden y ajusta el encuadre.
- **Vista lista sincronizada:** pestañas **Lista | Mapa**. Al tocar un elemento de la lista, se centra el mapa en ese negocio. **[POR CONFIRMAR]** Vista por defecto. **Recomendación:** lista con buscador por defecto en móvil (la gente busca por nombre); mapa como segunda vista.

## 6. Modo `selector_punto` (dentro de Recoge y Lleva)

- Un pin central arrastrable o un clic para fijar el punto.
- Botón "usar mi ubicación" solo bajo demanda.
- **Sugerencia de negocio cercano:** si el pin queda a menos de ~40 m de un negocio del catálogo, mostrar: **"¿Es [Negocio]?"** con un botón para autocompletar. Esto evita marcar a mano un punto que ya existe.
- Siempre exigir la **referencia escrita** (texto) además del pin.
- Mostrar los negocios del catálogo como marcadores grises pequeños de fondo, sin tarjeta.

## 7. Flujo del usuario en el mapa (ejemplo)

1. Abre tindivo.com → toca "Negocios" (o el QR de un negocio).
2. Busca "chaufa" → ve a Elmer (gris) en el mapa.
3. Toca el marcador → tarjeta con logo, descripción, horario, **Llamar** y **Pedir Recoge y Lleva**.
4. Toca **Llamar** → llama a Elmer y hace su pedido.
5. Vuelve a la pestaña → aparece el aviso **"¿Ya hiciste tu pedido a Elmer? Que Tindivo lo recoja · S/3"**.
6. Pulsa → flujo de Recoge y Lleva con Elmer como punto A → elige "En 20 min" → confirma.

## 8. Eventos a registrar

`mapa_abierto`, `marcador_tocado` (con `negocio_id`), `click_llamar`, `click_pedir_recojo`, `click_pedir_en_tindivo`, `filtro_aplicado`, `busqueda` (texto).

## 9. Fuera de v1

Clustering, rutas dentro del catálogo, capas de tráfico, marcadores destacados de pago (posible producto publicitario futuro), horarios abierto/cerrado calculados.
