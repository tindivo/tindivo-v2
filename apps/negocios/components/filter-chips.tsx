'use client'

/**
 * Chips de filtro con contador. El patrón, sin el vocabulario de nadie.
 *
 * POR QUÉ SUBE AQUÍ. Vivía dentro de `features/historial`, atado a su enum
 * `HistFilter`. Con el filtro de canal del tablero llega a su tercer uso
 * (historial · pestañas móviles · tablero activo) y una feature no puede
 * importar de otra (CLAUDE.md): lo común sube a `components/`. El vocabulario
 * se queda abajo — cada pantalla trae sus opciones y su tipo.
 *
 * LA REGLA QUE NO SE PUEDE ROMPER AL USARLO: `counts[id]` tiene que ser
 * EXACTAMENTE cuántas tarjetas se verían al pulsar ese chip. Suena obvio y en
 * producción se rompió dos veces (el descuadre de `JMAXL98Z`: el chip contaba
 * sobre el array completo y la lista pintaba un subconjunto ya filtrado, así
 * que decían cosas distintas de lo mismo). El componente no puede comprobarlo
 * —recibe los números hechos—, así que la comprobación vive en quien los
 * calcula: deriva SIEMPRE los contadores del mismo array del que sale la lista.
 */

export interface FilterChipOption<T extends string> {
  id: T
  label: string
}

export function FilterChips<T extends string>({
  options,
  active,
  counts,
  onChange,
}: {
  options: readonly FilterChipOption<T>[]
  active: T
  counts: Record<T, number>
  onChange: (f: T) => void
}) {
  /*
   * SIN `role="group"` NI `aria-label` EN EL CONTENEDOR. Biome lo marca
   * (`useSemanticElements`: ese rol pide un `<fieldset>`), y el `<fieldset>`
   * arrastra estilos por defecto que habría que deshacer para no ganar nada:
   * cada chip es un `<button>` con `aria-pressed` y su propia etiqueta, que ya
   * se lee sola.
   */
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
      {options.map((f) => {
        const on = active === f.id
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(f.id)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold transition-all ${
              on
                ? 'bg-ink text-white'
                : 'border border-ink/[0.06] bg-card text-ink hover:bg-surface'
            }`}
          >
            {f.label}
            <span
              className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                on ? 'bg-white/20 text-white' : 'bg-ink/[0.06] text-ink'
              }`}
            >
              {counts[f.id]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
