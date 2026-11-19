---
canvas: [Entregas]
requisitos: [CUS-ENT-001, CUS-ENT-002, CUS-ENT-003, CUS-ENT-013, CUS-ENT-010]
operaciones: [getCourierServiceStatus, listCustomerCourierOrders]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/courier/components/courier-home.tsx, apps/customer/features/courier/components/courier-history-card.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/catalog/home/CourierEntryCard.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/CourierHome*.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/CourierLoadResult.kt]
  ios: []
---

# Inicio de Tindivo Entregas y «Mis entregas»

| | |
|---|---|
| **Tarea de la persona** | Saber si Entregas está abierto y cuánto cuesta, pedir una entrega y ver las que ya pidió. |
| **Se llega desde** | La tarjeta «Tindivo Entregas» del Inicio («Llevar algo de un lugar a otro»); «Ver mis entregas» del formulario. |
| **Se sale hacia** | «Pedir una entrega»: `entregas/pedir-entrega`. Una entrega de la lista: `entregas/seguimiento-entrega`. «Iniciar sesión»: acceso. Volver: el Inicio. |

## Contenido, de arriba abajo

1. Barra con volver y «Tindivo Entregas». Subtítulo «Llevamos tus cosas de un lugar a otro».
2. Datos: «Desde [tarifa] · Hasta [peso] kg» y, si se sabe el horario, «· [horario]» (por ejemplo «6 a 11 pm»). La tarifa
   la manda el servidor y se muestra tal cual.
3. Si no se puede pedir, el motivo: «Cerrado ahora», «Abre a las [hora]», el aviso del servidor, o «Tindivo Entregas no
   está disponible ahora.» si está apagado.
4. Botón «Pedir una entrega». Sin sesión: «Inicia sesión para pedir una entrega y ver las tuyas.» y «Iniciar sesión».
5. «Entrega en curso» arriba, si hay una activa.
6. **«Mis entregas»:** cada una con «[origen] → [destino]», «#[código] · [fecha] · [importe]» (o «Sin cobro»), el estado
   («Buscando motorizado», «Confirmado», «En camino», «Entregado», «Cancelado», «En curso») y «Ver más».

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | «Cargando…» y «Cargando tus entregas» | CUS-ENT-013 |
| Sin entregas | «Aún no has pedido ninguna entrega.» · «Cuando pidas una, aquí verás cómo va.» | CUS-ENT-013 |
| Cerrado o apagado | El motivo del punto 3 y «Pedir una entrega» no avanza | CUS-ENT-002, CA-ENT-04 |
| Sin sesión | «Inicia sesión para pedir una entrega y ver las tuyas.» | CUS-ENT-001 |
| Error del estado | «No pudimos ver si Entregas está abierto.» | CUS-ENT-002 |
| Error de la lista | «No pudimos cargar tus entregas.»; «No pudimos cargar más. Toca para reintentar.» | CUS-ENT-013 |

## Diferencias por plataforma

- Hoy Android muestra «Hasta 5 kg» escrito en el texto; el peso debe leerse de `courier.maxWeightKg` (CUS-ENT-003,
  CUS-ENT-010; ver `capacidad.md`, defecto 2).
- La maqueta `Entregas` del canvas es de la versión anterior: no manda hasta que se rediseñe.
