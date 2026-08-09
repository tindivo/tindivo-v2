import type { ReactNode } from 'react'

/**
 * Toggle pill (Delivery/Recojo, rangos de fecha, sub-tabs, etc.).
 *
 * `badge` es OPCIONAL y aditivo: quien no lo pasa renderiza exactamente lo de
 * antes. Se añadió para las pestañas del motorizado, que necesitan un censo de
 * pedidos por bandeja.
 *
 * REGLA DEL BADGE: es un CENSO, no un semáforo. Cuenta lo que la lista de esa
 * pestaña muestra, sin tonos de alerta ni animaciones. Un contador que además
 * grita compite con las señales que sí piden acción —en el motorizado, el banner
 * de traspaso— y acaba enseñando a ignorar los dos.
 *
 * Un `0` NO se pinta: pasa `undefined` en vez de `0` y el chip desaparece. Así
 * el número significa algo cuando aparece, en vez de ser adorno permanente.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode; badge?: number }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    // Semántica de pestañas: sin esto un lector de pantalla anuncia botones
    // sueltos y NO dice cuál está seleccionado — el estado activo vivía solo en
    // una clase CSS. `aria-selected` es la única forma de que ese estado exista
    // fuera de lo visual.
    //
    // La navegación con flechas (roving tabindex) NO está aquí a propósito: es
    // comportamiento, y este componente lo usa el checkout del cliente, donde
    // mover el foco es tocar un flujo de dinero.
    <div role="tablist" className="flex rounded-[14px] bg-ink/[0.06] p-1">
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[10px] px-4 py-3 text-[14px] font-semibold transition-all ${
              active
                ? 'bg-white text-ink shadow-[0_2px_8px_rgba(18,38,32,0.08)]'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {o.icon}
            {o.label}
            {o.badge !== undefined && (
              <span
                className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${
                  active ? 'bg-ink/[0.08] text-ink' : 'bg-ink/[0.08] text-ink-muted'
                }`}
              >
                {o.badge}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
