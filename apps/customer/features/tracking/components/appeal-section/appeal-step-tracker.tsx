import { AppealCompletedCard } from './appeal-completed-card'
import { APPEAL_STEPS } from './types'

interface AppealStepTrackerProps {
  status: string
  refundStatus: string | null
  refundAmount: number | null
  refundProofUrl: string | null
  total: number
}

export function AppealStepTracker({
  status,
  refundStatus,
  refundAmount,
  refundProofUrl,
  total,
}: AppealStepTrackerProps) {
  let currentStepIndex = 0
  if (status === 'in_review') currentStepIndex = 1
  if (status === 'approved' || status === 'rejected') currentStepIndex = 2

  let resolvedDescription = ''
  if (status === 'approved' && refundStatus === 'pending') {
    resolvedDescription = 'Aprobado. Tu devolución está en proceso.'
  } else if (status === 'rejected') {
    resolvedDescription = 'Caso cerrado: el pago no fue verificado por el restaurante'
  }

  const isRefundCompleted = status === 'approved' && refundStatus === 'completed'

  return (
    <div className="mt-4">
      {APPEAL_STEPS.map((step, i) => {
        const done = i < currentStepIndex
        const active = i === currentStepIndex
        const isResolved = step.key === 'resolved'
        const last = i === APPEAL_STEPS.length - 1

        if (isResolved && currentStepIndex < 2) return null

        const description = isResolved ? resolvedDescription : step.description
        const hideConnector = last || (isResolved && active)

        const dotClass = done
          ? 'bg-[#1A8050]'
          : active
            ? status === 'rejected'
              ? 'bg-[#DC2626]'
              : isRefundCompleted
                ? 'bg-[#1A8050]'
                : 'bg-[#F97316]'
            : 'bg-black/15'

        const ringClass = active
          ? status === 'rejected'
            ? 'ring-4 ring-[#DC2626]/15'
            : isRefundCompleted
              ? 'ring-4 ring-[#1A8050]/15'
              : 'ring-4 ring-[#F97316]/15'
          : ''

        const labelClass = done || active ? 'text-[#1A1614]' : 'text-black/40'

        const descriptionClass = active
          ? status === 'rejected'
            ? 'text-[#DC2626]'
            : 'text-[#F97316]'
          : 'text-black/50'

        return (
          <div
            key={step.key}
            className={`relative flex gap-3.5 ${hideConnector ? 'pb-0' : 'pb-[18px]'}`}
          >
            {!hideConnector && (
              <div
                className={`absolute left-[11px] top-6 -bottom-1.5 w-0.5 ${done ? 'bg-[#1A8050]' : 'bg-black/10'}`}
              />
            )}
            <div
              className={`z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${dotClass} ${ringClass}`}
            >
              {done || isRefundCompleted ? (
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  role="img"
                  aria-label="Completado"
                >
                  <title>Completado</title>
                  <path
                    d="M5 12l5 5L19 7"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <span
                  className={`h-1.5 w-1.5 rounded-full bg-white ${active ? 'animate-pulse' : ''}`}
                />
              )}
            </div>
            <div className="flex-1 pt-0">
              <div
                className={`text-[14px] ${active ? 'font-semibold' : 'font-medium'} ${labelClass}`}
              >
                {step.label}
              </div>
              {isResolved && isRefundCompleted ? (
                <AppealCompletedCard
                  refundAmount={refundAmount}
                  total={total}
                  refundProofUrl={refundProofUrl}
                />
              ) : (active || done) && description ? (
                <p className={`mt-0.5 text-[12px] leading-relaxed ${descriptionClass}`}>
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
