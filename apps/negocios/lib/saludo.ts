import datos from './saludos.json'

/**
 * EL SALUDO DE APERTURA.
 *
 * Nace pegado a la prueba de sonido, y por eso existe: la prueba pregunta «¿lo
 * escuchaste?», y para contestar hay que oír algo que valga la pena oír. Un bip
 * a secas convierte la comprobación en un trámite que se despacha sin escuchar;
 * una frase hablada obliga a atender de verdad —si se entiende lo que dice, el
 * audio funciona— y de paso arranca el turno con algo mejor que un formulario.
 *
 * De rebote comprueba la voz, que es un camino distinto al del bip: el tono sale
 * del `AudioContext` y la frase de `speechSynthesis`. Puede fallar uno sin el
 * otro, y hasta ahora nada probaba el segundo.
 */

/** Lo que se dice y se muestra al abrir el turno. */
export interface SaludoApertura {
  /** «Buenas noches, La Florencia». */
  cabecera: string
  /** La frase del día. */
  frase: string
  /** Las dos juntas, que es lo que lee la voz. */
  completo: string
}

const FRASES: readonly string[] = datos.frases

/**
 * De qué se saluda según la hora. Es la hora del dispositivo y aquí sí vale:
 * lo único que decide es si se dice «buenos días» o «buenas noches», y para eso
 * el reloj de la tablet que está en el mostrador es la mejor fuente que hay.
 */
function cabeceraPorHora(ahora: Date): string {
  const h = ahora.getHours()
  if (h < 12) return datos.saludos.manana[0] as string
  if (h < 18) return datos.saludos.mediodia[0] as string
  return datos.saludos.noche[0] as string
}

/**
 * ELIGE UNA FRASE SIN REPETIR LA ANTERIOR.
 *
 * Repetirse es exactamente lo que mata el efecto: una frase de ánimo que sale
 * dos veces seguidas deja de ser un saludo y pasa a ser un cartel. Con 24 frases
 * y una excluida, el azar basta — no hace falta llevar un historial.
 *
 * Es pura para poder comprobarla: quien la llama le pasa la última y el número
 * aleatorio los da el hook.
 */
export function elegirFrase(anterior: string | null, azar: number): string {
  const candidatas = FRASES.filter((f) => f !== anterior)
  const pool = candidatas.length > 0 ? candidatas : FRASES
  const i = Math.min(pool.length - 1, Math.max(0, Math.floor(azar * pool.length)))
  return pool[i] as string
}

/** Arma el saludo completo. `negocio` es el nombre del local. */
export function construirSaludo({
  negocio,
  anterior,
  ahora = new Date(),
  azar = Math.random(),
}: {
  negocio: string
  anterior: string | null
  ahora?: Date
  azar?: number
}): SaludoApertura {
  const cabecera = `${cabeceraPorHora(ahora)}, ${negocio}`
  const frase = elegirFrase(anterior, azar)
  return { cabecera, frase, completo: `${cabecera}. ${frase}` }
}
