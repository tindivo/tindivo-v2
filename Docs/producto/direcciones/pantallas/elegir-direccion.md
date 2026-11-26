---
canvas: [Direccion-elegir]
requisitos: [CUS-ADR-001, CUS-ADR-003, CUS-ADR-009, CUS-ADR-010]
operaciones: [listCustomerAddresses, updateCustomerAddress]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/account/components/addresses-list.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/addresses/AddressListScreen.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/addresses/AddressListViewModel.kt]
  ios: []
---

# Elegir dirección

| | |
|---|---|
| **Tarea de la persona** | Escoger a cuál de sus direcciones guardadas va el pedido, o crear una nueva. |
| **Se llega desde** | El checkout («Cambiar» o «Agrega tu dirección»), el inicio («Entregar en») y Tindivo Entregas. |
| **Se sale hacia** | Tocar una fila: la hoja se cierra a los 200 ms con esa dirección elegida. El lápiz: `direcciones/mapa` con la dirección cargada. «Nueva dirección»: `direcciones/mapa` vacío. |

- La hoja vive dentro del checkout. El envío y el total se recalculan al elegir, pero eso es del checkout (CUS-ADR-012, migra con él).
- En un recojo esta hoja no se abre (CUS-ADR-014, del checkout).

## Contenido, de arriba abajo

1. Título «¿Dónde entregamos?».
2. Una fila por dirección: radio, etiqueta, insignia «Principal» en la predeterminada, calle, referencia y lápiz. La elegida va resaltada (borde y fondo naranja suave).
3. Fila final «Nueva dirección».

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | Esqueleto de dos filas | CUS-ADR-010 |
| Vacío | «Añade tu primera dirección» · «Guárdala una vez y úsala siempre para recibir tus pedidos de forma rápida.» + «Añadir» | CUS-ADR-010 |
| Error | «Sin conexión. Revisa tu internet e inténtalo de nuevo.» o «Algo salió mal. Inténtalo de nuevo.» + «Reintentar» | CUS-ADR-010 |
| Sin punto en el mapa | «Sin punto en el mapa. Márcalo para que el motorizado no se pierda.» No se puede elegir hasta marcarlo | CUS-ADR-003 |
| Fuera de zona | No se puede elegir; se ofrece corregirla en el mapa | CUS-ADR-003, CA-ADR-03 |
| Referencia corta | Una dirección guardada con menos del mínimo actual pide completarla antes de usarla | CUS-ADR-001, CA-ADR-01 |
| Una sola principal | Exactamente una fila lleva «Principal»; al borrarla pasa a la primera restante | CUS-ADR-009, CA-ADR-05 |

## Diferencias por plataforma

- Con «reducir movimiento»: sin animaciones, en todas.
- Hoy Android tiene «Mis direcciones» a pantalla completa y un selector propio en el checkout; la hoja es el destino. Mientras no haya pasada de UX, «Hacer predeterminada» y «Eliminar» siguen en la pantalla de la cuenta y en `direcciones/mapa`, no en esta hoja.
- Los textos de la maqueta («¿Dónde entregamos?», «Nueva dirección») mandan sobre los del código («Elige tu dirección», «Agregar nueva») cuando exista el catálogo de textos.
