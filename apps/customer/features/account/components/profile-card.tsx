import { Icon } from '@tindivo/ui'

interface ProfileCardProps {
  name: string
  email: string
  phone: string
  onEdit?: () => void
}

export function ProfileCard({ name, email, phone, onEdit }: ProfileCardProps) {
  const initial = (name[0] ?? email[0] ?? 'U').toUpperCase()

  return (
    <div className="relative flex items-center gap-4 overflow-hidden rounded-[22px] bg-gradient-to-br from-brand to-brand-dark p-5 text-white">
      <div className="absolute -right-5 -top-[30px] h-[140px] w-[140px] rounded-full bg-white/10" />
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/[0.18] font-bold text-[22px]">
        {initial}
      </div>
      <div className="relative min-w-0 flex-1">
        <div className="t-display truncate text-[20px] leading-[1.1]">{name || 'Usuario'}</div>
        <div className="mt-0.5 truncate text-[12px] text-white/85">{email}</div>
        {phone && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/[0.18] px-2.5 py-[3px] text-[11px] backdrop-blur-sm">
            <Icon name="phone" size={12} className="text-white/90" /> {phone}
          </div>
        )}
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          aria-label="Editar perfil"
        >
          <Icon name="edit" size={20} />
        </button>
      )}
    </div>
  )
}
