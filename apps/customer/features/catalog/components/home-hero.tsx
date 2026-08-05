import { Icon } from '@tindivo/ui'

export function HomeHero() {
  return (
    <section className="w-full bg-surface px-5 pt-2 pb-4">
      {/* Banner con gradiente negro-naranja cálido */}
      <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-brand via-[#c2410c] to-[#2a1205] px-5 pt-6 pb-6 text-white shadow-glow-brand-lg lg:px-8 lg:pt-8 lg:pb-8">
        <div className="pointer-events-none absolute -right-6 -top-6 h-[160px] w-[160px] rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-10 -left-10 h-[140px] w-[140px] rounded-full bg-brand/20 blur-3xl" />

        <div className="relative flex items-center gap-5">
          <div className="min-w-0 flex-1">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              Solo en Tindivo
            </div>
            <h2 className="font-display text-[24px] font-bold leading-[1.05] tracking-tight lg:text-[30px]">
              Tu comida favorita,
              <br />
              en minutos.
            </h2>
            <p className="mt-2 max-w-[280px] text-[13px] leading-relaxed text-white/80">
              Paga al recibir o con Yape/Plin. Sin complicaciones.
            </p>
          </div>

          {/* Placeholder de imagen promo */}
          <div className="hidden shrink-0 sm:block">
            <div className="relative h-[110px] w-[110px] overflow-hidden rounded-[18px] bg-white/15 ring-1 ring-inset ring-white/20 lg:h-[130px] lg:w-[130px]">
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon name="local_dining" size={48} className="text-white/40" />
              </div>
              <span className="absolute bottom-2 left-2 rounded bg-white/80 px-1.5 py-0.5 font-mono text-[9px] font-medium uppercase tracking-wider text-ink-subtle">
                Imagen promo
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Línea de confianza minimalista */}
      <div className="mt-3 flex items-center gap-4 text-[12px] font-medium text-ink-muted">
        <span className="inline-flex items-center gap-1">
          <Icon name="schedule" size={14} className="text-brand" /> Rápido
        </span>
        <span className="inline-flex items-center gap-1">
          <Icon name="payments" size={14} className="text-brand" /> Paga como quieras
        </span>
      </div>
    </section>
  )
}
