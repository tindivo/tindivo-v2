import type { DriverCourierOrderView } from '@tindivo/contracts'

/**
 * Plantillas de WhatsApp de Tindivo Entregas, una lista por punto del viaje.
 *
 * NO SON LAS DE LA COMIDA (`whatsapp-templates.ts`): aquí hay dos personas, y
 * ninguna es «el cliente que espera su pedido». A quien entrega se le pregunta
 * si está listo; a quien recibe se le avisa que va en camino. Y el cobro va
 * DENTRO del mensaje cuando le toca pagar a esa persona: es lo que se olvida
 * en la puerta y lo que evita el «no sabía que tenía que pagar».
 */

export type CourierWaPoint = 'origin' | 'destination'

export interface CourierWaTemplate {
  id: string
  label: string
  icon: string
  text: string
}

/**
 * «Quien entrega» / «Quien recibe» es lo que se guarda cuando el cliente no
 * puso nombre (`trip-details-sheet`). Saludar con eso suena a robot.
 */
function greet(name: string): string {
  const n = name.trim()
  return n && !/^quien (entrega|recibe)$/i.test(n) ? `Hola ${n}, ` : 'Hola, '
}

const ME = 'soy el motorizado de Tindivo Entregas. '

function fee(o: DriverCourierOrderView): string {
  return `S/ ${o.feeAmount.toFixed(2)}`
}

/** «Son S/ 3.00 del transporte…» solo si paga ESTA persona y aún no se cobró. */
function payLine(o: DriverCourierOrderView, point: CourierWaPoint): string {
  if (o.transportCollected) return ''
  const paysHere = point === 'origin' ? o.payer === 'origin' : o.payer === 'destination'
  return paysHere ? ` Son ${fee(o)} del transporte, por Yape o en efectivo.` : ''
}

export function courierWaTemplates(
  o: DriverCourierOrderView,
  point: CourierWaPoint,
): CourierWaTemplate[] {
  const item = o.itemDescription.trim()
  const lleva = item ? ` (${item})` : ''

  if (point === 'origin') {
    const hola = greet(o.origin.name) + ME
    return [
      {
        id: 'ready',
        label: '¿Ya está listo?',
        icon: 'hourglass_top',
        text: `${hola}Voy a recoger el encargo${lleva} para llevarlo a ${o.destination.referenceText}. ¿Ya está listo?`,
      },
      {
        id: 'on_the_way',
        label: 'Ya voy a recoger',
        icon: 'two_wheeler',
        text: `${hola}Ya estoy yendo a recoger el encargo${lleva}. Llego en unos minutos.${payLine(o, 'origin')}`,
      },
      {
        id: 'outside',
        label: 'Ya estoy afuera',
        icon: 'person_pin_circle',
        text: `${hola}Ya estoy afuera para recoger el encargo${lleva}.${payLine(o, 'origin')}`,
      },
      {
        id: 'need_location',
        label: 'No ubico el lugar',
        icon: 'my_location',
        text: `${hola}Estoy yendo a recoger el encargo pero no logro ubicar ${o.origin.referenceText}. ¿Me podrías enviar tu ubicación? (📎 → Ubicación)`,
      },
    ]
  }

  const hola = greet(o.destination.name) + ME
  return [
    {
      id: 'on_the_way',
      label: 'Ya voy con tu encargo',
      icon: 'two_wheeler',
      text: `${hola}Ya recogí tu encargo${lleva} y voy en camino. Llego en unos minutos.${payLine(o, 'destination')}`,
    },
    {
      id: 'outside',
      label: 'Ya estoy afuera',
      icon: 'person_pin_circle',
      text: `${hola}Ya estoy afuera con tu encargo${lleva}.${payLine(o, 'destination')}`,
    },
    {
      id: 'need_location',
      label: 'No ubico la dirección',
      icon: 'my_location',
      text: `${hola}Voy con tu encargo pero no logro ubicar ${o.destination.referenceText}. ¿Me podrías enviar tu ubicación? (📎 → Ubicación)`,
    },
  ]
}
