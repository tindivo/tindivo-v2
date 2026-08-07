import { Icon } from '@tindivo/ui'

interface CapabilityNotesProps {
  capability: string
  whatsappNumber: string
}

export function CapabilityNotes({ capability, whatsappNumber }: CapabilityNotesProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 rounded-xl bg-info/10 px-3 py-2.5 text-[13px] font-medium text-info">
        <Icon name="lock" size={16} className="mt-0.5 shrink-0" />
        <span>
          El modo del negocio lo gestiona Tindivo. Si quieres cambiar entre catálogo y delivery,
          escríbenos.
        </span>
      </div>
      {capability === 'catalog_only' && !whatsappNumber.trim() && (
        <div className="flex gap-2 rounded-xl bg-warning/10 px-3 py-2.5 text-[13px] font-medium text-warning">
          <Icon name="warning" size={16} className="mt-0.5 shrink-0" />
          <span>
            Estás en modo catálogo: agrega tu número de WhatsApp en «Datos» para que los clientes
            puedan pedirte.
          </span>
        </div>
      )}
    </div>
  )
}
