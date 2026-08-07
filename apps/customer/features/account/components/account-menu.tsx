import { TINDIVO_SUPPORT_WHATSAPP } from '@tindivo/core'
import { Icon } from '@tindivo/ui'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getSupportWhatsapp } from '@/lib/support'

interface AccountMenuProps {
  onSignOut: () => void
}

export function AccountMenu({ onSignOut }: AccountMenuProps) {
  const [wa, setWa] = useState(TINDIVO_SUPPORT_WHATSAPP)

  useEffect(() => {
    getSupportWhatsapp().then(setWa)
  }, [])

  const whatsappUrl = `https://wa.me/${wa}?text=${encodeURIComponent('Hola Tindivo, tengo una consulta sobre mi cuenta. ')}`

  return (
    <div className="mt-5">
      <div className="mb-2">
        <div className="font-display font-bold tracking-tight text-[17px] text-ink">
          Más opciones
        </div>
      </div>
      <div className="overflow-hidden rounded-[18px] border border-border bg-card">
        <MenuItem href="/pedidos" icon="schedule" label="Historial completo" />
        <MenuItem external href={whatsappUrl} icon="chat" label="Ayuda y soporte" />
        <MenuItem href="/terminos" icon="description" label="Términos y privacidad" />
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 border-t border-border px-4 py-3.5 text-left text-[14px] font-medium text-danger transition-colors hover:bg-danger-soft"
        >
          <Icon name="logout" size={20} />
          <span className="flex-1">Cerrar sesión</span>
        </button>
      </div>
    </div>
  )
}

interface MenuItemProps {
  href: string
  icon: string
  label: string
  external?: boolean
}

function MenuItem({ href, icon, label, external }: MenuItemProps) {
  const content = (
    <div className="group flex items-center gap-3 px-4 py-3.5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-low">
      <Icon name={icon} size={20} className="text-ink-subtle" />
      <span className="flex-1">{label}</span>
      <Icon
        name={external ? 'open_in_new' : 'chevron_right'}
        size={18}
        className="text-ink-subtle transition-transform group-hover:translate-x-0.5"
      />
    </div>
  )

  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block">
        {content}
      </a>
    )
  }
  return <Link href={href}>{content}</Link>
}
