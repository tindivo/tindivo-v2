---
id: direcciones
nombre: Direcciones y mapa
actores: [CUS]
lineas: [pedidos-restaurante, entregas]
depende_de: []
dinero: false
codigo:
  web: [apps/customer/lib/address-*.ts, apps/customer/lib/coverage.ts, apps/customer/lib/geolocation.ts, apps/customer/lib/landmarks.ts, apps/customer/components/address-*.tsx, apps/customer/components/map-picker*.tsx, apps/customer/components/location-sheet.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/addresses/**]
  ios: []
  backend: [apps/api/app/api/v1/customer/addresses/**, apps/api/lib/mappers/customer-address.ts]
operaciones: [listCustomerAddresses, createCustomerAddress, updateCustomerAddress, deleteCustomerAddress]
reglas: [ADDRESS_LINE_MIN, ADDRESS_LINE_MAX, ADDRESS_REFERENCE_MIN, ADDRESS_REFERENCE_API_MIN, ADDRESS_REFERENCE_MAX, isGarbageText, app_settings:coverage_polygon, app_settings:location_validation]
---

# Direcciones y mapa

> Verificado: 2026-11-18 · entorno: develop@97b552dd (código) · Aprobado por Jesús el AAAA-MM-DD (medio) — PILOTO, pendiente de su visto bueno

## Antes de tocar

- Es la libreta del cliente: guardar, editar, borrar y predeterminar direcciones, cada una con un pin dentro de la zona de reparto.
- No incluye la tarifa de envío ni lo que viaja con el pedido (CUS-ADR-011 a 015): eso es del checkout y migra con él.
- Por eso `dinero: false`. Si una pantalla de aquí llega a mostrar una tarifa, pasa a depender de checkout y entra Codex.
- Las filas se leen y escriben con la sesión del cliente; la policy `ca_self_all` limita cada libreta a su dueño. La API no recibe ningún id de usuario.
- Las reglas de texto viven en `packages/contracts` (`primitives.ts`) y las usan la API, la web y, copiadas, Android (`AddressRules.kt`). Si cambias una, cambia las tres en el mismo PR.
- La zona de reparto es un polígono de `app_settings`; la app lo recibe en `GET /config`. Nunca se escribe en el código.
- Trampa conocida: sin GPS ni gesto del cliente, el pin queda vacío. Nunca se usa el centro del pueblo por defecto (CUS-ADR-004).
- Trampa conocida: los valores de respaldo de cobertura en la web no coinciden con los reales (defecto 4).
- Trampa conocida: una dirección guardada con el mínimo anterior puede tener una referencia de 5 a 14 caracteres. Sigue sirviendo para pedir (la API v1 acepta desde 5); el formulario pide completarla a 15 solo cuando el cliente la edita.
- iOS aún no empieza: `codigo.ios` vacío.

## Requisitos

| ID | Requisito | Fuente | ★ |
|---|---|---|---|
| CUS-ADR-001 | La app debe permitir guardar varias direcciones con etiqueta (Casa, Trabajo u Otro), línea, referencia, pin y precisión. | `DECISIONS.md §13` (punto 12) · Decisión de Jesús, 2026-11-18 (D-31: referencia mínima 15 en los formularios, la API v1 acepta desde 5; vale también para Tindivo Entregas) | |
| CUS-ADR-002 | La app debe rechazar textos basura en la línea y en la referencia, con el mismo criterio que el servidor. | `packages/contracts/src/primitives.ts` (`isGarbageText`) | |
| CUS-ADR-003 | La app no debe permitir guardar una dirección sin pin, o con el pin fuera de la zona de reparto. | `DECISIONS.md §13` (punto 11, polígono) | ★ |
| CUS-ADR-004 | El centro del pueblo nunca debe usarse como ubicación por defecto. | Defecto cerrado en la web (guardaba la plaza como «casa») | |
| CUS-ADR-005 | Cuando el cliente toca «Usar mi ubicación», la app debe leer el GPS una vez, con alta precisión y sin caché; con el permiso denegado no reintenta. | `apps/customer/lib/geolocation.ts` | |
| CUS-ADR-006 | La app debe avisar cuando la precisión de la lectura no sirve para encontrar una puerta. | `apps/customer/components/map-picker.tsx` | |
| CUS-ADR-007 | La app debe aceptar la ubicación aproximada y pedir la precisa cuando haga falta. | iOS 14+ y Android 12+ | |
| CUS-ADR-008 | La app debe mostrar un mapa con vista previa inerte y pantalla completa para ajustar el pin, sin alejarse de la zona de reparto. | `apps/customer/components/map-picker.tsx` | |
| CUS-ADR-009 | La app debe mantener una sola dirección predeterminada; al borrarla se promueve la primera restante. | `DECISIONS.md §15` | |
| CUS-ADR-010 | La app debe permitir añadir, editar, eliminar y predeterminar direcciones sin perder la medida del sensor al editar. | `apps/customer/features/account/` | |
| CUS-ADR-016 | Cuando el cliente coloca el pin, la app debe sugerir la dirección con el geocodificador del sistema, sin coste. | Decisión de Jesús, 2026-11-16 | |
| CUS-ADR-017 | La app debe permitir editar la dirección sugerida antes de guardarla. | Decisión de Jesús, 2026-11-16 | |
| CUS-ADR-018 | Si el geocodificador devuelve solo la localidad, la app debe pedir que se escriba la calle. | Decisión de Jesús, 2026-11-16 | |
| CUS-ADR-019 | Un cliente no debe poder leer, cambiar ni borrar una dirección de otro cliente. | `AGENTS.md` invariante 3 (RLS) · policy `ca_self_all` (lo garantiza el servidor: no es de paridad) | |

## Criterios de aceptación

| CA | Criterio | Requisitos |
|---|---|---|
| CA-ADR-01 | Dado una referencia más corta que el mínimo del formulario, cuando se intenta guardar, entonces la app la rechaza con el mensaje del mínimo; la API la rechaza solo por debajo de su piso. | CUS-ADR-001 |
| CA-ADR-02 | Dado una línea de solo dígitos o con un patrón repetido, cuando se intenta guardar, entonces se rechaza como texto basura. | CUS-ADR-002 |
| CA-ADR-03 | Dado un pin fuera del polígono de reparto, cuando se intenta guardar, entonces se rechaza y la dirección no se crea. | CUS-ADR-003 |
| CA-ADR-04 | Dado un formulario nuevo sin lectura del sensor ni gesto del cliente, entonces la ubicación está vacía y no se puede guardar. | CUS-ADR-004, CUS-ADR-003 |
| CA-ADR-05 | Dado dos direcciones con la segunda predeterminada, cuando se borra la predeterminada, entonces la que queda pasa a ser la predeterminada. | CUS-ADR-009 |
| CA-ADR-06 | Dado una dirección guardada con su precisión, cuando se edita solo la referencia, entonces la precisión y la hora de confirmación no cambian. | CUS-ADR-010 |
| CA-ADR-07 | Dado la dirección de la clienta A, cuando el cliente B la pide, la cambia o la borra por la API, entonces recibe «no encontrado» y la fila de A no cambia. Prueba: `apps/api/lib/__tests__/mv4b-customer-routes.integration.test.ts` («solo del dueño…»). | CUS-ADR-019 |

## Reglas

- Línea de la dirección: `ADDRESS_LINE_MIN` y `ADDRESS_LINE_MAX`.
- Referencia: `ADDRESS_REFERENCE_MIN` (formulario) y `ADDRESS_REFERENCE_MAX`; la API acepta desde `ADDRESS_REFERENCE_API_MIN`.
- Textos basura: `isGarbageText`.
- Zona de reparto: `app_settings:coverage_polygon`.
- Lectura del GPS (tiempo de espera y precisión máxima aceptada): `app_settings:location_validation`.

## Defectos

| # | Requisito | Hallazgo | Dónde |
|---|---|---|---|
| 4 | CUS-ADR-003 | Los valores de respaldo de cobertura de la web no coinciden con el polígono real. | `apps/customer/lib/coverage.ts` |
| 6 | CUS-ADR-006 | El umbral de precisión «suficiente» es una constante local de la web, no una regla compartida: Android e iOS no tienen de dónde leerlo. | `apps/customer/components/map-picker.tsx` |
