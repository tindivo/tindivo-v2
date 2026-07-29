export function HomeHero() {
  return (
    <div className="px-4 pt-2 pb-4">
      <div className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-brand via-brand-dark to-ink px-[22px] pt-[22px] pb-6 text-white shadow-glow-brand-lg lg:px-9 lg:pt-9 lg:pb-9">
        <svg
          viewBox="0 0 200 200"
          className="pointer-events-none absolute -right-10 -top-[50px] h-[220px] w-[220px] opacity-[0.15]"
          aria-hidden
        >
          <title>blob</title>
          <path
            fill="currentColor"
            className="text-white"
            d="M44.7,-67.3C58.1,-58.9,68.9,-44.7,74.6,-29C80.3,-13.3,80.9,3.9,75.6,18.6C70.3,33.4,59.1,45.7,46.1,55.4C33.1,65.1,18.3,72.1,1.7,69.9C-14.8,67.6,-31.3,56.1,-44.6,43.2C-57.9,30.3,-68.1,16.1,-71.8,-0.4C-75.5,-16.9,-72.7,-35.6,-62.4,-46.9C-52.1,-58.1,-34.3,-61.9,-18.5,-67.4C-2.7,-72.8,11.1,-79.9,25,-78.6C38.9,-77.4,52.8,-67.9,65.1,-55.6"
            transform="translate(100 100)"
          />
        </svg>
        <div className="relative">
          <div className="mb-3 inline-block rounded-full border border-white/10 bg-white/15 px-2.5 py-1 font-bold text-[10px] uppercase tracking-[0.12em] backdrop-blur-sm">
            Solo en Tindivo
          </div>
          <div className="t-display text-[22px] leading-[1.15] lg:text-[28px]">
            Pide en minutos,
            <br />
            paga al recibir o por Yape.
          </div>
        </div>
      </div>
    </div>
  )
}
