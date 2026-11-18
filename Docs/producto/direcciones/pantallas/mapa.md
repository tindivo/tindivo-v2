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

1. Mapa con el pin fijo al centro, «Mueve el mapa a tu puerta» y el botón «Usar mi ubicación».
2. «Calle y número», con la calle sugerida y debajo «Sugerida desde el mapa · edítala».
3. «Referencia», con contador en vivo.
4. Etiqueta: «Casa», «Trabajo» u «Otro».
5. Botón «Guardar dirección».

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Sin ubicación todavía | Sin pin elegido y «Falta marcar tu ubicación»; nunca el centro del pueblo | CUS-ADR-004, CA-ADR-04 |
| Buscando el GPS | «Buscando tu ubicación…»; el ícono late | CUS-ADR-005 |
| Permiso denegado | «Activa el permiso de ubicación para usar esta función. También puedes mover el pin manualmente.» | CUS-ADR-005 |
| Denegado para siempre | «El permiso de ubicación está desactivado. Actívalo en Ajustes o mueve el pin manualmente.» + «Abrir Ajustes» | CUS-ADR-005 |
| GPS apagado | «La ubicación de tu celular está apagada. Actívala o mueve el pin manualmente.» | CUS-ADR-005 |
| Sin lectura a tiempo | «No pudimos obtener tu ubicación a tiempo. Intenta de nuevo o mueve el pin.» | CUS-ADR-005 |
| Solo ubicación aproximada | Se pide la precisa una vez; si no la da, sigue con el pin a mano | CUS-ADR-007 |
| Precisión insuficiente | Aviso de que la lectura no sirve para encontrar la puerta | CUS-ADR-006 |
| Buscando la calle | Esqueleto de una línea mientras responde el geocodificador | CUS-ADR-016 |
| Sin calle | Solo llegó «San Jacinto»: el campo queda vacío con «Ej. Jr. Sucre 412», toma el foco y dice «Solo encontramos «San Jacinto». Escribe tu calle.» | CUS-ADR-018 |
| Fuera de zona | Pin rojo, «Esa ubicación está fuera de nuestra zona de reparto en San Jacinto» y guardar deshabilitado | CUS-ADR-003, CA-ADR-03 |
| Calle o referencia inválida | El campo dice qué falta y guardar se deshabilita; el servidor rechaza lo mismo con 422 | CUS-ADR-001, CUS-ADR-002, CA-ADR-01, CA-ADR-02 |
| Guardando o eliminando | «Guardando…» o «Eliminando…» | CUS-ADR-010 |
| Ya no existe | «Esa dirección ya no existe.» | CUS-ADR-010, CA-ADR-07 |
| Eliminar | «¿Eliminar esta dirección?» · «Dejará de aparecer en tu lista. Tus pedidos anteriores no cambian.» · «Sí, eliminar» | CUS-ADR-010 |

## Diferencias por plataforma

- Mapa: Leaflet en la web, Google Maps en Android, MapKit en iOS (CUS-ADR-008). Ninguno se aleja más del polígono + 25 %.
- Geocodificador: `Geocoder` en Android y `CLGeocoder` en iOS, sin coste (CUS-ADR-016). La web no sugiere calle y no se le añade, porque se apaga.
- Hoy Android es un formulario a pantalla completa con «Usar como predeterminada» y «Eliminar dirección»; la maqueta es una hoja sin esos dos controles. Hasta la pasada de UX, ambos se quedan en el formulario.
- Con «reducir movimiento»: el pin no se eleva ni rebota.
