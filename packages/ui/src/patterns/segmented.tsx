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
  size = 'md',
}: {
  options: { value: T; label: string; icon?: ReactNode; badge?: number }[]
  value: T
  onChange: (v: T) => void
  /**
   * `sm` aligera tipografía y padding para filas de tres pestañas en pantallas
   * estrechas (el tablero del motorizado). NO se cambió la talla base porque
   * este componente también lo usan el checkout del cliente y las métricas del
   * admin: encoger el toggle de Delivery/Recojo es encoger el objetivo táctil
   * de un flujo de dinero para resolver un problema que no tiene.
   *
   * EL SUELO ES EL DEDO. `md` da ~44px de alto, que es el mínimo recomendado en
   * iOS y Android. `sm` baja a ~40px y ahí me planté: quien usa esto va en moto,
   * de noche y a veces con guantes, y cada píxel que se le quita al objetivo se
   * paga en toques fallidos. Lo que de verdad aligera el bloque es la tipografía
   * y el padding HORIZONTAL, no el vertical.
   */
  size?: 'md' | 'sm'
}) {
  const sm = size === 'sm'
  return (
    // Semántica de pestañas: sin esto un lector de pantalla anuncia botones
    // sueltos y NO dice cuál está seleccionado — el estado activo vivía solo en
    // una clase CSS. `aria-selected` es la única forma de que ese estado exista
    // fuera de lo visual.
    //
    // La navegación con flechas (roving tabindex) NO está aquí a propósito: es
    // comportamiento, y este componente lo usa el checkout del cliente, donde
    // mover el foco es tocar un flujo de dinero.
    // RADIOS CONCÉNTRICOS: el del riel menos su padding da el de la pastilla
    // (14−4=10 en `md`, 12−3=9 en `sm`). Cuando no cuadran, la pastilla parece
    // pegada a una esquina y el conjunto se ve hecho a ojo aunque nadie sepa
    // decir por qué.
    <div
      role="tablist"
      className={`flex bg-ink/[0.06] ${sm ? 'gap-0.5 rounded-[12px] p-[3px]' : 'gap-1 rounded-[14px] p-1'}`}
    >
      {options.map((o) => {
        const active = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            /**
             * `grow` y NO `flex-1`.
             *
             * `flex-1` fija `basis:0`, así que las tres pestañas miden lo mismo
             * pase lo que pase: "Míos" (4 letras) se lleva el mismo ancho que
             * "En espera" (9), que entonces no cabe y parte en dos líneas. Con
             * `grow` cada una parte de su ancho natural y solo se reparte el
             * sobrante, así que la larga recibe lo que necesita y la corta deja
             * de acaparar. El `whitespace-nowrap` es el cinturón: una etiqueta
             * de pestaña partida en dos nunca es lo correcto, ni aquí ni en el
             * checkout.
             */
            className={`flex grow items-center justify-center whitespace-nowrap transition-all ${
              sm
                ? 'gap-1.5 rounded-[9px] px-2 py-2.5 text-[13px] tracking-[-0.01em]'
                : 'gap-2 rounded-[10px] px-4 py-3 text-[14px]'
            } ${
              active
                ? 'bg-white font-semibold text-ink shadow-[0_1px_3px_rgba(18,38,32,0.10)]'
                : 'font-medium text-ink-muted hover:text-ink'
            }`}
          >
            {o.icon}
            {o.label}
            {o.badge !== undefined && (
              /**
               * El chip SOLO en la activa.
               *
               * Antes las tres llevaban la misma píldora gris, así que la fila
               * tenía seis elementos con fondo compitiendo entre sí y el número
               * de la pestaña que estás mirando no se distinguía de los otros
               * dos. En reposo basta el número: pesa menos y sigue leyéndose.
               *
               * Sigue siendo CENSO y no semáforo — ni color de marca ni de
               * alerta, solo la misma jerarquía de tinta que el resto.
               */
              <span
                className={`inline-flex items-center justify-center rounded-full font-mono font-bold tabular-nums ${
                  sm ? 'text-[10px]' : 'text-[11px]'
                } ${
                  active
                    ? sm
                      ? 'min-w-[17px] bg-ink/[0.07] px-1 text-ink'
                      : 'min-w-[20px] bg-ink/[0.07] px-1.5 py-0.5 text-ink'
                    : 'text-ink-subtle'
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
