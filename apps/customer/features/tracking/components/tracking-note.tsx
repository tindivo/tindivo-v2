import { Icon } from '@tindivo/ui'

interface TrackingNoteProps {
  /** La nota, tal como quedó guardada. `null` = no escribió ninguna. */
  note: string | null
  /** Ya se entregó: la nota pasa a ser historia, no una instrucción viva. */
  entregado: boolean
}

/**
 * La nota que el cliente le escribió al motorizado, devuelta a quien la escribió.
 *
 * POR QUÉ EXISTE. La nota se podía escribir en el checkout y la pintaba el app
 * del motorizado, pero en ningún sitio del app del cliente. Quien escribía
 * «toca el timbre dos veces» confirmaba el pedido y ya no volvía a verla: ni
 * para comprobar que se guardó, ni para descubrir que se había comido una
 * palabra. Una instrucción que solo puede leer el destinatario deja al que la
 * dio sin manera de saber si dijo lo que quería decir.
 *
 * QUÉ NO HACE, todavía: no se puede corregir desde aquí. Editarla necesita
 * camino de escritura, su guard de estado —una nota nueva cuando el motorizado
 * ya salió no la va a leer nadie— y decidir qué pasa si la cambia con el pedido
 * en la puerta. Enseñarla es el primer paso y el que no puede salir mal.
 *
 * SE MUESTRA SOLO AL DUEÑO. La nota llega por la lectura con RLS de
 * `useTracking`, no por `get_tracking`, que es público: el enlace de
 * seguimiento se reenvía por WhatsApp y esta frase habla de la casa de alguien.
 */
export function TrackingNote({ note, entregado }: TrackingNoteProps) {
  const limpia = note?.trim()
  if (!limpia) return null

  return (
    <section className="mt-3.5 rounded-[22px] border border-ink/[0.04] bg-card px-[18px] py-4 shadow-elev-1">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-low text-ink-muted"
        >
          <Icon name="chat_bubble" size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-[14px] text-ink">Tu nota para el motorizado</h2>
          {/*
            `whitespace-pre-line` no sobra aunque la base colapse los saltos de
            línea al guardar (0199): lo que se pinta aquí es lo que hay en la
            columna, y si mañana ese saneo cambia, esto lo enseña tal cual en
            vez de pegar dos frases en una.
          */}
          <p className="mt-1 whitespace-pre-line text-[13.5px] text-ink leading-snug">{limpia}</p>
          <p className="mt-1.5 text-[11.5px] text-ink-subtle leading-snug">
            {entregado
              ? 'Se la enseñamos al motorizado que trajo tu pedido.'
              : 'La verá el motorizado cuando salga hacia tu dirección.'}
          </p>
        </div>
      </div>
    </section>
  )
}
