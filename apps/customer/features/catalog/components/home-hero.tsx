import { Icon } from '@tindivo/ui'

export function HomeHero() {
  return (
    <section className="px-4 pt-2 pb-4">
      {/* Banner principal con imagen de placeholder para destacar una promo o valor */}
      <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-brand via-brand-dark to-ink px-5 pt-5 pb-5 text-white shadow-glow-brand-lg lg:px-8 lg:pt-8 lg:pb-8">
        <div className="pointer-events-none absolute -right-10 -top-10 h-[180px] w-[180px] rounded-full bg-white/10 blur-3xl" />

        <div className="relative flex items-center gap-5">
          <div className="min-w-0 flex-1">
            <div className="mb-2 inline-block rounded-full border border-white/10 bg-white/15 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] backdrop-blur-sm">
              Solo en Tindivo
            </div>
            <h2 className="t-display text-[22px] leading-[1.1] lg:text-[26px]">
              Tu comida favorita,
              <br />
              en minutos.
            </h2>
            <p className="mt-2 text-[13px] text-white/80">
              Paga al recibir o con Yape/Plin. Sin complicaciones.
            </p>
          </div>

          {/* Placeholder visual: aquí puedes poner una imagen real de promo/comida */}
          <div className="hidden shrink-0 sm:block">
            <div className="t-ph-image relative h-[110px] w-[110px] rounded-[18px] lg:h-[130px] lg:w-[130px]">
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon name="local_dining" size={48} className="text-ink/20" />
              </div>
              <span className="ph-label absolute bottom-2 left-2">Imagen promo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Chips de valor: dan contexto y llenan visualmente el home */}
      <div className="mt-3 flex flex-wrap gap-2">
        <ValuePill icon="schedule" label="Rápido" />
        <ValuePill icon="payments" label="Paga como quieras" />
        <ValuePill icon="storefront" label="Negocios locales" />
      </div>
    </section>
  )
}

function ValuePill({ icon, label }: { icon: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-ink/[0.06] bg-card px-3 py-1.5 text-[13px] font-medium text-ink shadow-elev-1">
      <Icon name={icon} size={16} className="text-brand" />
      {label}
    </div>
  )
}
