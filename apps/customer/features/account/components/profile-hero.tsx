import { Icon } from '@tindivo/ui'
import { useState } from 'react'
import type { ProfileProgress } from '@/features/account/hooks/use-account-page'

interface ProfileHeroProps {
  name: string
  email: string
  phone: string
  phoneVerified?: boolean
  progress: ProfileProgress
  onEdit: () => void
  onVerifyPhone: () => void
  onAddAddress: () => void
}

export function ProfileHero({
  name,
  email,
  phone,
  phoneVerified,
  progress,
  onEdit,
  onVerifyPhone,
  onAddAddress,
}: ProfileHeroProps) {
  const [showSteps, setShowSteps] = useState(true)
  const initial = (name[0] ?? email[0] ?? 'U').toUpperCase()
  const isComplete = progress.completed === progress.total
  const pct = Math.round((progress.completed / progress.total) * 100)

  const handleStepAction = (id: 'name' | 'phone' | 'address') => {
    if (id === 'name') onEdit()
    else if (id === 'phone') onVerifyPhone()
    else if (id === 'address') onAddAddress()
  }

  return (
    <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-brand via-brand-dark to-[#0f2e24] p-5 text-white shadow-elev-3">
      {/* Decorative circles */}
      <div className="pointer-events-none absolute -right-6 -top-8 h-36 w-36 rounded-full bg-white/10 blur-xl" />
      <div className="pointer-events-none absolute -bottom-10 -left-10 h-32 w-32 rounded-full bg-brand-soft/10 blur-lg" />

      {/* Profile Header */}
      <div className="relative flex items-start gap-3.5">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/[0.18] font-bold text-[22px] shadow-inner backdrop-blur-md">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[20px] font-bold tracking-tight truncate leading-tight">
            {name || 'Usuario'}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-white/80">{email}</div>
          {phone && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-medium backdrop-blur-md">
              <Icon name="phone" size={12} className="text-white/90" />
              <span>{phone}</span>
              {phoneVerified ? (
                <span
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success text-white"
                  title="Celular verificado"
                >
                  <Icon name="check" size={9} />
                </span>
              ) : (
                <span className="text-[10px] text-amber-300 font-semibold">(sin verificar)</span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-all hover:bg-white/25 active:scale-95"
          aria-label="Editar perfil"
        >
          <Icon name="edit" size={18} />
        </button>
      </div>

      {/* Progress & Steps Section */}
      <div className="relative mt-4 rounded-[18px] bg-white/[0.12] p-3.5 backdrop-blur-md border border-white/10">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-semibold flex items-center gap-1.5">
            {isComplete ? (
              <>
                <span>✨</span> ¡Perfil al 100%!
              </>
            ) : (
              <>
                <span>🚀</span> Completa tu perfil
              </>
            )}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[12px] font-bold text-white/90">
              {progress.completed} de {progress.total}
            </span>
            {!isComplete && (
              <button
                type="button"
                onClick={() => setShowSteps((s) => !s)}
                className="text-[11px] text-white/70 hover:text-white underline transition-colors"
              >
                {showSteps ? 'Ocultar' : 'Ver pasos'}
              </button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Interactive Steps List */}
        {!isComplete && showSteps && progress.steps && (
          <div className="mt-3 flex flex-col gap-2 pt-1 border-t border-white/10">
            {progress.steps.map((step) => (
              <div
                key={step.id}
                className={`flex items-center justify-between gap-2.5 rounded-xl p-2 transition-all ${
                  step.isCompleted ? 'bg-white/5 opacity-80' : 'bg-white/15'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                      step.isCompleted ? 'bg-success text-white' : 'bg-white/25 text-white/90'
                    }`}
                  >
                    {step.isCompleted ? <Icon name="check" size={13} /> : '•'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold leading-snug truncate">
                      {step.title}
                    </div>
                    <div className="text-[11px] text-white/70 truncate">{step.description}</div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleStepAction(step.id)}
                  className={`shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all active:scale-95 ${
                    step.isCompleted
                      ? 'bg-white/10 text-white/80 hover:bg-white/20'
                      : 'bg-white text-brand-dark shadow-sm hover:bg-white/90'
                  }`}
                >
                  {step.actionLabel}
                </button>
              </div>
            ))}
          </div>
        )}

        {isComplete && (
          <div className="mt-2 text-[12px] text-white/85 flex items-center gap-1.5">
            <span>🎉</span> Tu cuenta está lista para realizar pedidos sin interrupciones.
          </div>
        )}
      </div>
    </div>
  )
}
