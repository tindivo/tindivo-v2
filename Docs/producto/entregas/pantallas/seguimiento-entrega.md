---
canvas: [Entregas]
requisitos: [CUS-ENT-014, CUS-ENT-015, CUS-ENT-016, CUS-ENT-017, CUS-ENT-018, CUS-ENT-020, CUS-ENT-021]
operaciones: [getCourierTracking, cancelCourierOrder]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/courier/components/tracking-sheet.tsx, apps/customer/features/courier/components/accept-countdown.tsx]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/CourierDetail*.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/CourierTracking.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/CourierClock.kt]
  ios: []
---

# Tu entrega (seguimiento)

| | |
|---|---|
| **Tarea de la persona** | Ver cómo va su entrega, cancelarla si nadie la tomó y, al terminar, pedir otra. |
| **Se llega desde** | `entregas/pedir-entrega` (al crearse la entrega) y una entrega de «Mis entregas» en `entregas/inicio-entregas`. |
| **Se sale hacia** | «Pedir otra entrega» o «Volver a pedir»: `entregas/pedir-entrega`. Volver: de donde vino. |

## Contenido, de arriba abajo

1. Titular según el estado: «Buscando motorizado», «Va a recoger», «Recogiendo», «En camino», «Entregado», «Cancelado».
2. Pasos: Pedido, Confirmado, En camino, Entregado.
3. «Motorizado de Tindivo: [nombre]», «Transporte: [importe]» (o «Sin cobro»), quién paga y «Código: [código]». El
   importe lo manda el servidor.
4. Mientras busca: «Avisamos a los motorizados disponibles. Si nadie la toma en [N] min, se cancela sola y no se cobra
   nada.» con la cuenta atrás «Se cancela sola en [mm:ss]».
5. «Cancelar solicitud» → «¿Cancelar esta solicitud? Los motorizados dejarán de verla.» · «No, esperar» / «Sí, cancelar».
6. Entregado: «Tu entrega llegó.» y «Pedir otra entrega».
7. Cancelado: el motivo («No hubo motorizado disponible.», «El motorizado no pudo tomar esta entrega.», «El pedido no
   estuvo listo a tiempo.», «No se pudo cobrar el transporte.», «Cancelaste esta entrega.», «No pudimos contactar a
   quien recibe.», «Esta entrega se canceló.»), «No se cobró nada.» y «Volver a pedir».
8. Soporte y responsabilidad: los daños y pérdidas se atienden por el soporte de WhatsApp (CUS-ENT-020; falta, a la
   espera de la revisión legal).

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | «Cargando tu entrega» | CUS-ENT-014 |
| Error | «No pudimos cargar tu entrega.»; «No encontramos esa entrega, o ya no está disponible.» | CUS-ENT-014 |
| Buscando | Titular, pasos y cuenta atrás; «Cancelar solicitud» | CUS-ENT-015, CUS-ENT-016, CA-ENT-08 |
| Plazo vencido | «Se acabó el tiempo» y «No se cobró nada.» | CUS-ENT-016, CA-ENT-08 |
| Cancelando | «Cancelando…» | CUS-ENT-015 |
| Ya la tomó un motorizado (409) | La app dice que ya no se puede cancelar y refresca el detalle | CUS-ENT-015, CA-ENT-06 |
| Error al cancelar | «No pudimos cancelar: revisa tu conexión.» / «No se pudo cancelar.» | CUS-ENT-015 |
| Entregado | «Tu entrega llegó.» y «Pedir otra entrega» | CUS-ENT-018 |
| Cancelado | El motivo, «No se cobró nada.» y «Volver a pedir» | CUS-ENT-017, CUS-ENT-018 |

## Diferencias por plataforma

- Hoy Android no tiene el aviso del soporte de WhatsApp (CUS-ENT-020).
- «Cliente ausente» (CUS-ENT-021) queda fuera del lanzamiento: lo registra el motorizado y no tiene pantalla del cliente.
