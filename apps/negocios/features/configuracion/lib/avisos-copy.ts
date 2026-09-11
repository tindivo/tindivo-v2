import type { PushStatus } from '@/hooks/use-push-status'

/** El aviso destacado que acompaña al interruptor cuando algo no está bien. */
export interface AvisosAlerta {
  icon: string
  tono: string
  titulo: string
  detalle: string
}

/** Cómo se enseña cada estado de los avisos. Ver `avisosVista`. */
export interface AvisosVista {
  /** La línea de debajo del interruptor. Siempre hay algo que decir. */
  resumen: string
  /**
   * ¿Se puede tocar el interruptor desde aquí?
   *
   * `false` NO significa «apagado»: significa que este panel no manda sobre
   * ello. Ver la regla del `denied` más abajo.
   */
  editable: boolean
  /** El aviso destacado, o `null` cuando no hay nada que explicar. */
  alerta: AvisosAlerta | null
}

/**
 * ¿Está el interruptor encendido?
 *
 * SOLO `subscribed` CUENTA. Ni el permiso concedido ni la intención de la
 * cajera valen: lo único que hace que llegue un aviso es una suscripción viva
 * registrada en el backend, y esa es exactamente la diferencia que este módulo
 * existe para no volver a perder.
 */
export function avisosEncendidos(status: PushStatus): boolean {
  return status === 'subscribed'
}

/**
 * QUÉ SE LE DICE A LA CAJERA EN CADA ESTADO, Y CUÁNDO SE LA DEJA TOCAR NADA.
 *
 * Vive aparte del JSX porque tiene una regla que conviene poder comprobar sin
 * abrir un navegador: **con el permiso bloqueado (`denied`) el interruptor NO
 * se puede tocar**. Una vez bloqueado, `Notification.requestPermission()` ya no
 * vuelve a preguntar —resuelve `denied` al instante y sin diálogo—, así que un
 * interruptor vivo ahí no haría absolutamente nada. Dejarlo activo sería peor
 * que bloquearlo: la persona lo mueve, lo ve volver a su sitio, y se queda
 * creyendo que es cosa del panel mientras sigue sin recibir avisos. En ese
 * estado lo único útil es el camino a los ajustes del navegador, así que es lo
 * que se da.
 *
 * `unsupported` tampoco se toca, por lo mismo: no hay nada que activar.
 *
 * LOS TRES ESTADOS QUE SÍ SE ARREGLAN AQUÍ son `default` (nunca se preguntó),
 * `off` (lo apagó alguien a mano) y `granted` — el que motivó todo esto:
 * permiso concedido y token sin registrar, que se veía exactamente igual que un
 * equipo sano.
 *
 * Y `subscribed` es el único sin alerta. El interruptor encendido ya lo dice;
 * repetirlo en un cartel verde enseñaba a la cajera a no leer los carteles, que
 * es justo la costumbre que no queremos la noche en que uno diga algo.
 */
export function avisosVista(status: PushStatus): AvisosVista {
  switch (status) {
    case 'subscribed':
      return {
        resumen: 'Te llega una notificación cuando entra un pedido, aunque cierres el panel.',
        editable: true,
        alerta: null,
      }
    case 'off':
      return {
        resumen: 'Apagados en este equipo.',
        editable: true,
        alerta: {
          icon: 'notifications_off',
          tono: 'bg-warning-soft text-amber-900',
          titulo: 'Este equipo no va a sonar',
          detalle:
            'Sin avisos, un pedido puede cancelarse solo sin que nadie se entere. Enciéndelos si es el equipo del mostrador.',
        },
      }
    case 'granted':
      return {
        resumen: 'Diste permiso, pero el equipo no está registrado.',
        editable: true,
        alerta: {
          icon: 'sync_problem',
          tono: 'bg-warning-soft text-amber-900',
          titulo: 'Diste permiso, pero este equipo no está registrado',
          detalle:
            'Los avisos no van a llegar. Se reintenta solo; si en unos segundos sigue así, apaga el interruptor y vuelve a encenderlo.',
        },
      }
    case 'default':
      return {
        resumen: 'Todavía no se activaron en este equipo.',
        editable: true,
        alerta: {
          icon: 'notifications_off',
          tono: 'bg-warning-soft text-amber-900',
          titulo: 'Este equipo no recibe avisos',
          detalle:
            'Sin avisos, un pedido puede cancelarse solo sin que nadie se entere. Al encenderlos, el navegador te va a pedir permiso.',
        },
      }
    case 'denied':
      return {
        resumen: 'Bloqueados desde el navegador.',
        editable: false,
        alerta: {
          icon: 'block',
          tono: 'bg-danger-soft text-danger',
          titulo: 'Los avisos están bloqueados',
          detalle:
            'Se bloquearon desde el navegador y no se pueden reactivar desde aquí. Entra a los ajustes del navegador, busca Notificaciones y permite este sitio.',
        },
      }
    case 'unsupported':
      return {
        resumen: 'No disponibles en este navegador.',
        editable: false,
        alerta: {
          icon: 'info',
          tono: 'bg-ink/[0.06] text-ink-muted',
          titulo: 'Este navegador no admite avisos',
          detalle: 'El sonido del panel sigue funcionando mientras lo tengas abierto.',
        },
      }
  }
}
