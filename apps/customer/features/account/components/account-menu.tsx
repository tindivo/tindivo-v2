import { Icon } from '@tindivo/ui'
import Link from 'next/link'

interface AccountMenuProps {
  onSignOut: () => void
}

export function AccountMenu({ onSignOut }: AccountMenuProps) {
  return (
    <>
      <div className="mt-6 mb-2">
        <div className="t-display text-[19px]">Cuenta</div>
      </div>
      <div className="overflow-hidden rounded-[18px] border border-border bg-card">
        <Link
          href="/terminos"
          className="group flex items-center gap-3 border-b border-border px-4 py-3.5 text-[14px] font-medium text-ink transition-colors hover:bg-surface-low"
        >
          <Icon name="description" size={20} className="text-ink-subtle" />
          <span className="flex-1">Términos y privacidad</span>
          <Icon
            name="chevron_right"
            size={18}
            className="text-ink-subtle transition-transform group-hover:translate-x-0.5"
          />
        </Link>
        <button
          type="button"
          onClick={onSignOut}
          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-[14px] font-medium text-danger transition-colors hover:bg-danger-soft"
        >
          <Icon name="logout" size={20} />
          <span className="flex-1">Cerrar sesión</span>
        </button>
      </div>
    </>
  )
}
