# ADR · Marcar la dirección en el mapa

> Maquetas: `Direccion-mapa` (calle sugerida desde el mapa), `Direccion-mapa-sin-calle` (el Geocoder solo devolvió la
> localidad) y la variante **«fuera de la zona de reparto»**, descrita en un comentario del tablero y **sin dibujar**.

| | |
|---|---|
| **Tarea de la persona** | Poner el pin en la puerta, confirmar la calle y la referencia, ponerle etiqueta y guardar. |
| **Se llega desde** | `ADR-elegir-direccion` («Nueva dirección» o el lápiz) · `ACC-cuenta` («+ Agregar dirección» o una dirección) · `ENT-pedir-entrega` («Marcar en el mapa»). |
| **Se sale hacia** | «Guardar dirección» → la hoja baja y el checkout (o la cuenta) muestra la dirección nueva. Cancelar o cerrar → quien la abrió, sin guardar. |
| **Requisitos** | CUS-ADR-001, 002, 003 ★, 004, 005, 006, 008, 010, 011 ★, 012 ★, 014, 015 · (requisito nuevo: hoja del mapa con calle sugerida editable) |
| **Endpoints** | `GET /public/config` (polígono de reparto o centro y radio) · `POST /customer/addresses` (alta, 201) · `PATCH /customer/addresses/{id}` (edición; `coordinates` solo si el punto cambió) · `DELETE /customer/addresses/{id}` · `POST /customer/checkout/quote` (envío según el punto) · Geocoder del sistema (calle sugerida) |
| **Estado** | Android: 🟡 formulario completo «Nueva dirección» / «Editar dirección» con mapa, etiqueta, calle, referencia, «Usar como predeterminada» y «Eliminar»; el mapa vive dentro del formulario, no es hoja; falta la sugerencia del Geocoder · iOS: ⬜ |

## Contenido, de arriba abajo

1. **Mapa** con el pin fijo al centro y el texto «Mueve el mapa a tu puerta». Botón **«Usar mi ubicación»**.
2. **«Calle y número»:** campo con la calle sugerida («Jr. Lima 214») y debajo «Sugerida desde el mapa · edítala».
3. **«Referencia»:** campo («Puerta verde, frente a la plaza»).
4. **Etiqueta** (chips): «Casa» · «Trabajo» · «Otro».
5. **Botón primario:** «Guardar dirección».

### Variante sin calle (`Direccion-mapa-sin-calle`)

El Geocoder solo devuelve «San Jacinto»: «Calle y número» queda vacío con el ejemplo «Ej. Jr. Sucre 412», toma el foco, abre el teclado y
dice «Solo encontramos «San Jacinto». Escribe tu calle.» «Guardar dirección» se habilita cuando se cumplen calle y referencia.

### Variante fuera de zona (sin dibujar)

El pin pasa a `#B3261E`; justo bajo el asa de la hoja aparece una línea con ícono de alerta (20): «Fuera de la zona de reparto», y
«Guardar dirección» queda deshabilitado (`#E0E4E8` / `#50565D`). Regla: `missingField` devuelve `OutsideZone` cuando el punto no cae
en el polígono del servidor o en el círculo de 3 km. Texto real de la app: «Esa ubicación está fuera de nuestra zona de reparto
en San Jacinto».

## Estados

| Estado | Qué se ve | Requisito |
|---|---|---|
| Sin ubicación todavía | Mapa sin pin elegido; nunca se usa el centro del pueblo por defecto: «Falta marcar tu ubicación» | CUS-ADR-004 |
| Buscando la calle | Esqueleto de una línea mientras responde el Geocoder | CUS-ADR-005 |
| Buscando el GPS | «Buscando tu ubicación…»; el ícono late | CUS-ADR-005 |
| Permiso de ubicación denegado | «Activa el permiso de ubicación para usar esta función. También puedes mover el pin manualmente.» | CUS-ADR-005 |
| Denegado para siempre | «El permiso de ubicación está desactivado. Actívalo en Ajustes o mueve el pin manualmente.» + «Abrir Ajustes» | CUS-ADR-005 |
| GPS apagado | «La ubicación de tu celular está apagada. Actívala o mueve el pin manualmente.» | CUS-ADR-005 |
| Sin lectura a tiempo | «No pudimos obtener tu ubicación a tiempo. Intenta de nuevo o mueve el pin.» | CUS-ADR-005 |
| Sin geolocalización | «Tu dispositivo no permite geolocalización. Mueve el pin manualmente.» | CUS-ADR-005 |
| Precisión insuficiente | Aviso cuando la lectura no pasa de 30 m de error | CUS-ADR-006 |
| Fuera de zona | Pin rojo + «Fuera de la zona de reparto»; guardar deshabilitado | CUS-ADR-003 |
| Calle inválida | «Falta calle/número»; 5 a 200 caracteres, no solo dígitos, no repetidos | CUS-ADR-001, 002 |
| Referencia inválida | «Falta la referencia»; 5 a 140 caracteres; contador y «Referencia suficiente» | CUS-ADR-001, 002 |
| Guardando / eliminando | «Guardando…» / «Eliminando…» | CUS-ADR-010 |
| No existe | «Esa dirección ya no existe.» | CUS-ADR-010 |
| Eliminar | «¿Eliminar esta dirección?» · «Dejará de aparecer en tu lista. Tus pedidos anteriores no cambian.» · «Sí, eliminar» | CUS-ADR-010 |

## Criterios de aceptación propios de la pantalla

```
CA-ADR-P4 · Fuera de zona no se guarda
  Dado un pin fuera del polígono de reparto y del círculo de 3 km
  Entonces el pin es rojo y se lee «Fuera de la zona de reparto»
  Y «Guardar dirección» está deshabilitado

CA-ADR-P5 · Sin calle del Geocoder, el foco va al campo
  Dado un Geocoder que solo devuelve «San Jacinto»
  Entonces «Calle y número» queda vacío, con foco y teclado abierto
  Y aparece «Solo encontramos «San Jacinto». Escribe tu calle.»

CA-ADR-P6 · Las reglas de texto son las del servidor
  Dado una calle de 4 caracteres, o una referencia con solo dígitos o con un patrón repetido
  Entonces «Guardar dirección» está deshabilitado y el campo dice qué falta
  Y el servidor rechaza los mismos valores con 422

CA-ADR-P7 · El centro del pueblo nunca es el pin inicial
  Dado una persona sin permiso de ubicación
  Cuando abre la hoja
  Entonces el pin no está colocado hasta que ella mueva el mapa o use su ubicación
```

## Movimiento

Al arrastrar el mapa el pin se eleva 8 px y su sombra se achica; al soltar cae con un rebote leve (200 ms) y la dirección sugerida
se actualiza con un fundido corto (esqueleto de una línea mientras responde el Geocoder). «Usar mi ubicación» centra el mapa en
400 ms y el ícono late mientras busca el GPS. Al guardar, la hoja baja y el checkout muestra la dirección nueva. Con «reducir
movimiento»: sin elevación ni rebote.

## Pendiente (va a `decisiones-abiertas.md`)

- **Maqueta ↔ código:** la maqueta es una **hoja** (asa, mapa, tres campos y «Guardar dirección»); el código es un **formulario de pantalla completa** con la barra «Nueva dirección», cancelar, mapa en el medio, interruptor «Usar como predeterminada» y botón «Eliminar dirección». La hoja v3 no tiene el interruptor ni «Eliminar»: ¿dónde viven?
- **Maqueta ↔ código:** la maqueta sugiere la calle desde el Geocoder (CUS-ADR-005 describe lo mismo); el código no autocompleta la calle (campo con ejemplo «Ej. Jr. Sucre 412»).
- **Maqueta ↔ código:** el código usa «Tu ubicación en el mapa *», «Calle y número *» y «Referencia *» con asterisco y un ejemplo largo en la referencia («Frente a la bodega de don Carlos, casa de reja negra, tocar timbre 2 veces…»); la maqueta no usa asteriscos.
- **Maqueta ↔ código:** el estado fuera de zona solo existe como comentario; el texto «Fuera de la zona de reparto» (maqueta) y «Esa ubicación está fuera de nuestra zona de reparto en San Jacinto» (código) son dos versiones del mismo aviso.
- **Documento ↔ código:** `DECISIONS.md` §13 dice referencia ≥ 15; el código usa 5 a 140 (CUS-ADR-001).
- El mapa no puede alejarse más del polígono + 25 % (CUS-ADR-008): sin diseño en la maqueta.
