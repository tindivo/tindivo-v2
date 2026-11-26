---
canvas: [Direccion-mapa, Direccion-mapa-sin-calle]
requisitos: [CUS-ADR-001, CUS-ADR-002, CUS-ADR-003, CUS-ADR-004, CUS-ADR-005, CUS-ADR-006, CUS-ADR-007, CUS-ADR-008, CUS-ADR-010, CUS-ADR-016, CUS-ADR-017, CUS-ADR-018]
operaciones: [getPublicConfig, createCustomerAddress, updateCustomerAddress, deleteCustomerAddress]
textos: []
tokens: []
codigo:
  web: [apps/customer/components/address-*.tsx, apps/customer/components/map-picker*.tsx, apps/customer/components/location-sheet.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/addresses/AddressForm*.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/addresses/AddressMap.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/addresses/UseMyLocation.kt]
  ios: []
---

# Marcar la dirección en el mapa

| | |
|---|---|
| **Tarea de la persona** | Poner el pin en su puerta, confirmar la calle y la referencia, etiquetarla y guardar. |
| **Se llega desde** | `direcciones/elegir-direccion` («Nueva dirección» o el lápiz), la cuenta («+ Agregar dirección») y Tindivo Entregas («Marcar en el mapa»). |
| **Se sale hacia** | «Guardar dirección»: vuelve a quien la abrió, con la dirección nueva. Cerrar: vuelve sin guardar. |

## Contenido, de arriba abajo

La pantalla tiene dos pasos (decisión de Jesús, 2026-11-23, D-A): primero el mapa, después los datos.

**Paso 1: el mapa.** El mapa ocupa lo que sobra y el panel va debajo, así el pin queda al centro de lo que se ve.

1. Arriba, «Cerrar» (si la pantalla no trae otro) y el selector «Mapa | Satélite».
2. El pin fijo al centro (40×52 dp, con sombra y un punto de anclaje). Sube 8 dp mientras el mapa se mueve; con «reducir movimiento» no se eleva. Sin punto, el pin no se dibuja (solo aparece mientras la persona mueve el mapa).
3. «Mi ubicación»: botón circular de 56 dp con una mira, sobre el mapa, abajo a la derecha.
4. Abajo, el panel (ver «Panel del mapa»).

**Paso 2: los datos.**

1. Mini-mapa quieto de 120 dp (zoom 17) con el sello «Ubicación confirmada» y «Cambiar» de 48 dp.
2. «Calle y número», con la calle sugerida y debajo «Sugerida desde el mapa · edítala».
3. «Referencia», con contador en vivo.
4. Etiqueta: «Casa», «Trabajo» u «Otro».
5. Botón «Guardar dirección».

## Panel del mapa

| Estado | Texto del panel | Botón |
|---|---|---|
| Tarjeta inicial (sin punto, antes del primer gesto) | «¿Dónde te entregamos?» · «Marca la puerta de tu casa para que el motorizado llegue sin llamarte.» | «Usar mi ubicación» (primario, 56 dp) y «Marcar en el mapa» (contorno, 56 dp) |
| Sin gesto todavía | «Mueve el mapa hasta tu puerta» | «Mueve el mapa para marcar», apagado |
| Moviendo | «Ubicando…» | «Sí, aquí es mi puerta», apagado |
| Quieto y dentro de la zona | «¿El pin está en tu puerta?» | «Sí, aquí es mi puerta» |
| Quieto y dentro, con GPS impreciso | «¿El pin está en tu puerta?» y, encima, el aviso ámbar | «Revisa y confirma» |
| Fuera de zona | «Esa ubicación está fuera de nuestra zona de reparto en San Jacinto» (pin rojo) | «Muévelo dentro de la zona», apagado |

Tras la tarjeta inicial sale 4 s la píldora «Mueve el mapa. El pin se queda quieto.». El botón siempre está apagado mientras el mapa se mueve.

El mapa no se aleja del polígono de reparto más un 25 %, con zoom de 14 a 20; al fijar un punto, el zoom es 18. Un gesto que mueve el centro menos de 3 m no fija punto.

Al abrir el mapa sin punto, si el permiso de ubicación **ya está concedido**, el GPS se lee solo (D-E). Con el permiso sin conceder, nunca se pide solo: solo al tocar «Usar mi ubicación» o «Mi ubicación».

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Sin ubicación todavía | Sin pin y la tarjeta inicial; nunca el centro del pueblo | CUS-ADR-004, CA-ADR-04 |
| Buscando el GPS | «Buscando tu ubicación…»; en el botón «Mi ubicación» gira un indicador | CUS-ADR-005 |
| Permiso denegado | Tarjeta neutra: «Activa el permiso de ubicación para usar esta función. También puedes mover el pin manualmente.» | CUS-ADR-005 |
| Denegado para siempre | Tarjeta neutra: «El permiso de ubicación está desactivado. Actívalo en Ajustes o mueve el pin manualmente.» + «Abrir Ajustes» (solo en este caso) | CUS-ADR-005 |
| GPS apagado | «La ubicación de tu celular está apagada. Actívala o mueve el pin manualmente.» | CUS-ADR-005 |
| Sin lectura a tiempo | «No pudimos obtener tu ubicación a tiempo. Intenta de nuevo o mueve el pin.» | CUS-ADR-005 |
| Solo ubicación aproximada | Se pide la precisa una vez; si no la da, sigue con el pin a mano | CUS-ADR-007 |
| Precisión insuficiente | Aviso ámbar (no rojo): «Tu GPS no es exacto (±N m). Mueve el mapa hasta tu puerta.»; el botón dice «Revisa y confirma». Se quita al mover el pin | CUS-ADR-006 |
| Buscando la calle | Esqueleto de una línea mientras responde el geocodificador | CUS-ADR-016 |
| Con calle sugerida | El campo trae la calle y debajo «Sugerida desde el mapa · edítala» | CUS-ADR-016, CUS-ADR-017 |
| Sin calle | Solo llegó «San Jacinto»: el campo queda vacío con «Ej. Jr. Sucre 412», toma el foco y dice «Solo encontramos «San Jacinto». Escribe tu calle.» | CUS-ADR-018 |
| Fuera de zona | Pin rojo, «Esa ubicación está fuera de nuestra zona de reparto en San Jacinto» y confirmar apagado | CUS-ADR-003, CA-ADR-03 |
| Calle o referencia inválida | El campo dice qué falta y guardar se deshabilita; el servidor rechaza lo mismo con 422 | CUS-ADR-001, CUS-ADR-002, CA-ADR-01, CA-ADR-02 |
| Guardando o eliminando | «Guardando…» o «Eliminando…» | CUS-ADR-010 |
| Ya no existe | «Esa dirección ya no existe.» | CUS-ADR-010, CA-ADR-07 |
| Eliminar | «¿Eliminar esta dirección?» · «Dejará de aparecer en tu lista. Tus pedidos anteriores no cambian.» · «Sí, eliminar» | CUS-ADR-010 |

## Precisión del GPS

- La app conserva la precisión (`accuracyM`) de la lectura que dio el punto y la envía al guardar (CUS-ADR-001, CA-ADR-06). Si la persona mueve el mapa después, la precisión se anula: el punto ya es suyo y no del sensor.
- El umbral de «impreciso» es `location_validation.maxAccuracyM` de `app_settings`, que la API pública ya entrega en `GET /config` (D-C, Jesús, 2026-11-23). Si la configuración no llega, la app usa 30 m.

## Atrás

- En los datos, «Atrás» vuelve al mapa sin perder lo escrito.
- En el mapa, si se llegó con «Cambiar», «Atrás» vuelve a los datos con lo escrito intacto y el punto de antes.
- En el mapa de una dirección nueva, «Atrás» cierra la pantalla.

## Diferencias por plataforma

- Mapa: Leaflet en la web, Google Maps en Android, MapKit en iOS (CUS-ADR-008). Ninguno se aleja más del polígono + 25 %.
- Geocodificador: `Geocoder` en Android y `CLGeocoder` en iOS, sin coste (CUS-ADR-016). La web no sugiere calle y no se le añade, porque se apaga.
- Hoy Android es un formulario a pantalla completa con «Usar como predeterminada» y «Eliminar dirección»; la maqueta es una hoja sin esos dos controles. Hasta la pasada de UX, ambos se quedan en el formulario.
- Desde el checkout, el formulario se abre a pantalla completa, fuera de la hoja inferior.
- Selector «Mapa | Satélite», zoom 14–20 y mini-mapa del paso 2 (modo «lite» de Google Maps): Android.
- Con «reducir movimiento»: el pin no se eleva ni rebota.
- Referencias del pueblo (decisión D-D): se dejan para una segunda tanda; no están en esta pantalla.
