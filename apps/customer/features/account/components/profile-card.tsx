import { Icon } from '@/components/ui'

interface ProfileCardProps {
  name: string
  email: string
  phone: string
}

export function ProfileCard({ name, email, phone }: ProfileCardProps) {
  const initial = (name[0] ?? email[0] ?? 'U').toUpperCase()

  return (
    <div className="relative flex items-center gap-4 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#F97316] to-[#C2410C] p-5 text-white">
      <div className="absolute -right-5 -top-[30px] h-[140px] w-[140px] rounded-full bg-white/10" />
      <div className="relative flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.18] font-bold text-[22px]">
        {initial}
      </div>
      <div className="relative flex-1">
        <div className="t-display text-[20px] leading-[1.1]">{name || 'Usuario'}</div>
        <div className="mt-0.5 text-[12px] opacity-85">{email}</div>
        {phone && (
          <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-white/[0.18] px-2.5 py-[3px] text-[11px]">
            <Icon name="phone" size={12} /> {phone}
          </div>
        )}
      </div>
    </div>
  )
}
