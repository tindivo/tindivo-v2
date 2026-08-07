import { Icon } from '@tindivo/ui'
import type { ProfileProgress } from '@/features/account/hooks/use-account-page'

interface ProfileHeroProps {
  name: string
  email: string
  phone: string
  progress: ProfileProgress
  onEdit: () => void
}

export function ProfileHero({ name, email, phone, progress, onEdit }: ProfileHeroProps) {
  const initial = (name[0] ?? email[0] ?? 'U').toUpperCase()
  const isComplete = progress.completed === progress.total
  const pct = Math.round((progress.completed / progress.total) * 100)

  return (
    <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-brand to-brand-dark p-5 text-white">
      <div className="absolute -right-5 -top-[30px] h-[140px] w-[140px] rounded-full bg-white/10" />
      <div className="absolute -bottom-10 -left-10 h-[100px] w-[100px] rounded-full bg-white/5" />

      <div className="relative flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/[0.18] font-bold text-[22px]">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold tracking-tight truncate text-[20px] leading-[1.1]">
            {name || 'Usuario'}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-white/85">{email}</div>
          {phone && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/[0.18] px-2.5 py-[3px] text-[11px] backdrop-blur-sm">
              <Icon name="phone" size={12} className="text-white/90" />
              <span>{phone}</span>
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success text-[8px]">
                <Icon name="check" size={10} className="text-white" />
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25"
          aria-label="Editar perfil"
        >
          <Icon name="edit" size={20} />
        </button>
      </div>

      <div className="relative mt-4 rounded-[14px] bg-white/10 px-3.5 py-2.5 backdrop-blur-sm">
        <div className="flex items-center justify-between text-[12px]">
          <span className="font-medium">
            {isComplete ? 'Perfil completo' : 'Completa tu perfil'}
          </span>
          <span className="text-white/80">
            {progress.completed}/{progress.total}
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        {!isComplete && progress.missing.length > 0 && (
          <div className="mt-1.5 text-[11px] text-white/75">{progress.missing[0]}</div>
        )}
      </div>
    </div>
  )
}
