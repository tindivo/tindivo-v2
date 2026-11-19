---
canvas: [Entregas]
requisitos: [CUS-ENT-002, CUS-ENT-003, CUS-ENT-004, CUS-ENT-005, CUS-ENT-006, CUS-ENT-007, CUS-ENT-008, CUS-ENT-009, CUS-ENT-010, CUS-ENT-012, CUS-ENT-019, CUS-ENT-020, CUS-ENT-022]
operaciones: [getCourierServiceStatus, createCourierOrder, listCustomerCourierOrders, listCustomerAddresses, getPublicConfig]
textos: []
tokens: []
codigo:
  web: [apps/customer/features/courier/components/route-sheet.tsx, apps/customer/features/courier/components/point-field.tsx, apps/customer/features/courier/components/payer-field.tsx, apps/customer/features/courier/components/trip-details-sheet.tsx, apps/customer/features/courier/components/confirm-sheet.tsx, apps/customer/features/courier/components/map/**]
  android: [apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/CourierRequest*.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/CourierAttempts.kt, apps/android/customer/src/main/kotlin/com/tindivo/customer/feature/courier/CourierFormActions.kt]
  ios: []
---

# Detalles de la entrega

| | |
|---|---|
| **Tarea de la persona** | Decir dónde recoger, dónde entregar y qué llevar, y pedir la entrega. |
| **Se llega desde** | `entregas/inicio-entregas` («Pedir una entrega»). |
| **Se sale hacia** | Éxito: `entregas/seguimiento-entrega` de la entrega creada. «Marcar en el mapa» y «Agregar una dirección»: `direcciones/mapa`. «Verificar mi celular» y «Completar mi nombre»: acceso y perfil. «Ver mis entregas»: `entregas/inicio-entregas`. |

## Contenido, de arriba abajo

1. **«Recogemos de»** → «Elegir dónde recogemos» y **«Entregamos a»** → «Elegir dónde entregamos». Cada punto lleva dirección,
   «Cómo llegar (referencia)», «Celular (+51)» y el nombre de quien entrega o recibe (opcional). «Soy yo» rellena con los
   datos propios. Se elige entre «Mis direcciones», «Sitios anteriores», «Agregar una dirección» o «Marcar en el mapa»
   («Confirmar recojo» / «Confirmar entrega»; «Dentro de la zona de reparto» o «Esta ubicación está fuera de la zona de
   reparto de San Jacinto»).
2. **«¿Qué llevamos?»** con descripción («Ej.: Un sobre con documentos») y categoría. Las categorías no pueden
   contradecir la lista del canon (CUS-ENT-022; «Medicinas» está por decidir).
3. **«¿Quién paga?»**: «Quien entrega · Al recoger» o «Quien recibe · Al entregar»; «Al motorizado: efectivo exacto o
   Yape. Transporte desde [tarifa].»
4. «Indicaciones para el motorizado (opcional)».
5. Confirmaciones: «Ya está listo y pagado. Tindivo no compra ni adelanta dinero.» y que lo que se envía está permitido
   (CUS-ENT-008), con el texto de lo que cabe en la mochila y pesa hasta [peso] kg (CUS-ENT-010) y la lista del canon
   (CUS-ENT-022). El motorizado puede rechazar la entrega si al recoger no cumple.
6. Botón «Pedir entrega · [tarifa]». Lo que falta se dice sobre el botón, en este orden: dónde recogemos, dónde
   entregamos, cómo llegar a cada uno, qué llevamos, celular de quien entrega, celular de quien recibe, listo y pagado,
   celular verificado de quien pide. La tarifa es la del servidor.

## Estados

| Estado | Qué se ve | Requisito o CA |
|---|---|---|
| Cargando | «Preparando tu solicitud» | CUS-ENT-009 |
| Falta nombre | «Para pedir, dinos cómo te llamas.» + «Completar mi nombre» | CUS-ENT-009 |
| Falta celular | «Verifica tu número de WhatsApp antes de hacer un pedido.» + «Verificar mi celular» | CUS-ENT-009 |
| Cerrado | «Cerrado ahora» o «Abre a las [hora]»; no se puede pedir | CUS-ENT-002, CA-ENT-04 |
| Falta algo | «Falta elegir dónde recogemos / entregamos», «Falta cómo llegar a donde recogemos / entregamos», «Falta decir qué llevamos», «Falta el celular de quien entrega / recibe», «Marca que está listo y pagado» | CUS-ENT-004, CUS-ENT-008, CA-ENT-01 |
| Referencia o pin inválido | La referencia no llega a `ADDRESS_REFERENCE_MIN` o es basura; el pin está fuera de zona y no se elige | CUS-ENT-004, CA-ENT-02, CA-ENT-03 |
| Enviando | «Enviando…»; no se puede tocar dos veces | CUS-ENT-019 |
| Sin red al pedir | «No pudimos conectarnos. Revisa tu señal y vuelve a tocar «Pedir entrega».» | CUS-ENT-019, CA-ENT-07 |
| Solicitud en proceso | «Tu solicitud se está procesando. Espera un momento y vuelve a tocar.» | CUS-ENT-019 |
| Ya creada | «Ya habíamos creado esta entrega. Revísala en «Mis entregas».» | CUS-ENT-019 |
| Duda tras un corte | «No sabemos si tu última solicitud se creó. Revisa «Mis entregas» antes de pedir otra.» + «Ver mis entregas» / «Ya revisé, pedir» | CUS-ENT-019, CA-ENT-07 |
| Rechazo del servidor | El texto del servidor (por ejemplo, ya tiene una entrega activa) | CUS-ENT-012, CA-ENT-09 |

## Diferencias por plataforma

- El cuerpo del pedido no lleva importes: la tarifa la pone el servidor (CA-ENT-05).
- `isFragile` viaja en `false`; lo frágil se dice en las indicaciones (CUS-ENT-006).
- Hoy Android tiene una sola casilla de confirmación y envía las dos en `true` (CUS-ENT-008); no hay búsqueda de lugares
  ni negocios del directorio (CUS-ENT-005); el texto de lo permitido es el anterior a la decisión del 2026-11-17 (CUS-ENT-022).
