'use client'

import { useId } from 'react'

const NOTAS = [1, 2, 3, 4, 5] as const

/** Qué significa cada nota, dicho en voz alta para quien no ve la pantalla. */
const ETIQUETA: Record<number, string> = {
  1: 'Muy mal',
  2: 'Mal',
  3: 'Regular',
  4: 'Bien',
  5: 'Muy bien',
}

function Estrella({ llena, size }: { llena: boolean; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={llena ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" />
    </svg>
  )
}

interface StarsProps {
  /** 0 = sin elegir. */
  value: number
  onChange: (nota: number) => void
  /** `card` es el punto de entrada; `sheet` es donde se corrige. */
  tamano?: 'card' | 'sheet'
  disabled?: boolean
}

/**
 * Las cinco estrellas, y el primer toque YA ES la respuesta.
 *
 * En la tarjeta no abren un formulario para que el cliente lo rellene: el toque
 * elige la nota y esa nota se lleva a la hoja ya puesta. Una reseña que empieza
 * con «abrir» y sigue con «elegir» pierde gente en el primer paso; una que
 * empieza contestada solo puede ganar detalle.
 *
 * RADIOS DE VERDAD, no botones con `role="radio"`. Es una pregunta con cinco
 * respuestas excluyentes, que es exactamente lo que un grupo de radios es: así
 * las flechas del teclado se mueven entre ellas sin escribir nada, y el lector
 * de pantalla anuncia «2 de 5» solo. Mismo patrón que la lista de métodos de
 * pago del checkout.
 *
 * Cada estrella se llama por lo que vale («Bien», no «4»): «4 de 5» obliga a
 * saber de antemano si más es mejor.
 */
export function Stars({ value, onChange, tamano = 'card', disabled = false }: StarsProps) {
  const name = useId()
  const size = tamano === 'sheet' ? 38 : 30
  return (
    <fieldset
      className={
        tamano === 'sheet' ? 'flex justify-center gap-2 border-0 p-0' : 'flex gap-1.5 border-0 p-0'
      }
      disabled={disabled}
    >
      <legend className="sr-only">Qué nota le pones</legend>
      {NOTAS.map((nota) => {
        const activa = nota <= value
        return (
          <label
            key={nota}
            className={`flex cursor-pointer items-center justify-center p-0.5 transition-colors has-[:disabled]:cursor-default has-[:disabled]:opacity-50 has-[:focus-visible]:rounded-[8px] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-brand ${
              activa ? 'text-warning' : 'text-border'
            }`}
          >
            <input
              type="radio"
              name={name}
              value={nota}
              checked={value === nota}
              onChange={() => onChange(nota)}
              className="sr-only"
            />
            <span className="sr-only">{ETIQUETA[nota]}</span>
            <Estrella llena={activa} size={size} />
          </label>
        )
      })}
    </fieldset>
  )
}

export { ETIQUETA as ETIQUETA_NOTA }
