# 02. Negocios: glosario, categorías, campos y panel admin

> Lee primero `00-maestro.md`. Los datos los ingresa **Jesús manualmente** desde el panel admin, al visitar cada negocio. Por eso el catálogo se limita a lo mínimo útil y mantenible.

## 1. Glosario

| Término | Definición |
|---|---|
| **Partner (aliado)** | Restaurante que trabaja el 100% de su delivery con Tindivo. Se pide dentro de Tindivo (flujo actual). |
| **Negocio del catálogo** | Cualquier negocio de San Jacinto registrado en el catálogo. Puede ser partner o no. |
| **Negocio no partner** | Negocio en el catálogo sin flujo de pedido en Tindivo. El cliente le llama, pide y paga por su cuenta, y luego pide Recojo. |
| **Recojo** | Servicio de recoger un pedido ya pagado en el punto A y llevarlo al punto B. S/3 fijo. |
| **Envío** | Recojo persona a persona (papel, galleta, objeto). Mismo flujo, con punto A manual. |
| **Punto A / Punto B** | Origen (donde recogemos) / destino (donde entregamos). |
| **Prepagado** | El producto ya fue pagado por el cliente al negocio (o no requiere pago, en el caso de un envío). El motorizado no maneja dinero. |
| **Hora de listo** | Momento en que el negocio tendrá el pedido preparado. Se elige en minutos en el paso 3. |
| **A nombre de** | Nombre bajo el cual el negocio guardó el pedido; lo que el motorizado dice al llegar. |
| **Slug** | Identificador corto en la URL del negocio, p. ej. `elmer` en `tindivo.com/r/elmer`. |

## 2. Categorías (v1) [PROPUESTA]

| `categoria` | Incluye |
|---|---|
| `comida` | Restaurantes, chifas, pollerías, salchipaperías, pizzerías, comida para llevar |
| `bodega` | Bodegas, minimarkets, abarrotes |
| `farmacia` | Farmacias y boticas |
| `panaderia_postres` | Panaderías, pastelerías, heladerías |
| `otro` | Papelerías, ferreterías, librerías, servicios varios |

Notas:
- Categoría única obligatoria por negocio. Sirve para los filtros del catálogo.
- **Etiquetas** (opcional, hasta 3 por negocio, texto libre en minúsculas): `chaufa`, `pollo a la brasa`, `salchipapa`, `menú`, `jugos`. Sirven para el buscador ("busco chaufa" encuentra el negocio de Elmer).
- **Licorerías / alcohol:** no incluir en v1 (verificación de edad y responsabilidad). **[POR CONFIRMAR]**
- **Supermercados:** backlog (bolsas grandes, armado, más espera).

## 3. Campos del negocio

| Campo | Req. | Tipo | Notas |
|---|---|---|---|
| `id` | auto | id | |
| `slug` | Sí | text único | Se genera del nombre, editable. Usado en `/r/<slug>` |
| `nombre` | Sí | text | |
| `categoria` | Sí | enum | Ver sección 2 |
| `etiquetas` | No | text[] (máx. 3) | Para el buscador |
| `logo_url` | Sí | image | Cuadrado. Redimensionar y comprimir al subir (p. ej. 256×256, WebP) |
| `descripcion_corta` | Sí | text (≤ 80 car.) | Ej.: "Chaufa y salchipapas para llevar" |
| `telefono` | Sí | text (9 dígitos) | Para "Llamar" |
| `telefono_alterno` | No | text | |
| `tiene_whatsapp` | Sí | bool | Si el `telefono` tiene WhatsApp (habilita el botón de aviso) |
| `lat`, `lng` | Sí | number | Se marcan haciendo clic en el mapa del admin |
| `referencia` | Sí | text | "Frente al parque, portón verde". Clave en un pueblo sin direcciones formales |
| `horario` | Sí | text libre | "Lun–Dom 6pm–11pm". Sin cálculo de abierto/cerrado en v1 |
| `prep_tipico_min` | No | int | Tiempo típico de preparación, para preseleccionar el chip en el paso 3 |
| `es_partner` | Sí | bool | Define color y botones |
| `activo` | Sí | bool | Oculta sin borrar |
| `permiso_ok` | Sí (interno) | bool | El negocio aceptó salir en el catálogo. No se muestra. Solo activar `activo` si está en true |
| `nota_interna` | No | text | Pedidos que recibe al día, si promocionará, etc. No se muestra |
| `created_at`, `updated_at` | auto | datetime | Para detectar datos viejos |

**Fuera de v1:** foto de carta, precios, menú, redes sociales, horarios estructurados, reseñas. (Los precios y cartas cambian y no vale la pena mantenerlos a mano. Si más adelante se quiere carta, que sea un enlace al Facebook o WhatsApp del negocio.)

## 4. Panel admin (mínimo)

- **Lista** de negocios con filtro por categoría y partner, y búsqueda por nombre. Indicador de "actualizado hace X días".
- **Formulario** con los campos anteriores, con:
  - Selector de pin en mapa Leaflet (clic o arrastrar).
  - Subida de logo con redimensionado automático.
  - Generación automática del slug.
  - Validación de teléfono (9 dígitos).
- Acciones: crear, editar, activar/desactivar. Eliminar es opcional (mejor desactivar).
- **Interruptor global** "Recojo disponible / pausado" y campo de texto del aviso (ver 01, sección 9).
- **Vista rápida en celular:** Jesús registra negocios en la calle; el formulario debe funcionar bien en móvil (subir logo desde la cámara, capturar ubicación con GPS con un botón "usar mi ubicación actual").

## 5. Checklist de visita a un negocio

Datos a pedir (los cuatro básicos):
1. Número de teléfono (y si tiene WhatsApp).
2. Ubicación (en persona, con GPS) y referencia.
3. Logo (foto de la cartilla, fachada o su perfil de WhatsApp/Facebook).
4. Descripción de una línea y horario.

Preguntas que valen más que los datos (anotar en `nota_interna`):
1. **¿Cuántos pedidos para llevar recibes al día?**
2. **¿Se lo dirías a tus clientes** ("pídelo y te lo llevan")? ¿Pondrías el enlace en tu estado de WhatsApp o en el mostrador?
3. ¿Cuánto tardas normalmente en tener un pedido listo? (`prep_tipico_min`)
4. **Permiso** para aparecer en el catálogo (`permiso_ok`).

Si el negocio no piensa promocionarlo, se registra igual, pero no se cuenta como una fuente de demanda.

## 6. Reglas de qué se puede llevar [POR CONFIRMAR: lista definitiva]

**Permitido en v1:** comida y bebida ya preparada y pagada, productos de bodega ya pagados y empacados, medicinas comunes ya pagadas en bolsa sellada, objetos pequeños y paquetes que caben en la mochila o caja del motorizado.

**No permitido en v1:**
- Dinero en efectivo ni valores.
- **Documentos de identidad (DNI, CNI), pasaportes y documentos originales de valor.** Si algún día entran, con código de entrega que el cliente da al motorizado.
- Medicamentos con receta retenida o controlados.
- Alcohol.
- Animales, sustancias peligrosas, artículos ilegales.
- Cosas que el motorizado deba comprar o pagar por el cliente.
- Objetos que no quepan en la mochila o caja de la moto. Peso/tamaño máximo: por definir.

Estas reglas deben estar disponibles como enlace corto en el paso 4 del flujo.

## 7. Datos iniciales sugeridos

Cargar **8–10 negocios** que ya reciben pedidos para llevar y que **no** tienen delivery propio. Después, con datos, se amplía a los demás. La cantidad de negocios en San Jacinto que no se cargan a mano no debería contarse como un objetivo de esta etapa.
