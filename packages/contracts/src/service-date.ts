/**
 * La JORNADA operativa: qué "día" es, para un negocio que trabaja de noche.
 *
 * Espejo exacto de `public.current_service_date(timestamptz)` (migración 0154):
 *
 *   select (timezone('America/Lima', coalesce(p_at, now())) - interval '5 hours')::date
 *
 * POR QUÉ NO VALE LA FECHA DE CALENDARIO. El servicio va de ~18:00 a ~01:00, o
 * sea que una noche de trabajo cruza la medianoche. Con la fecha natural, a las
 * 00:00 y en plena faena: el historial del turno se vacía, lo cobrado esta noche
 * pasa a contar como "arrastre" de noches anteriores, y a la cajera le vuelve a
 * saltar el "¿abren hoy?". La cabecera de la 0154 lo dice con esas palabras.
 *
 * POR QUÉ LAS 05:00. Es un corte arbitrario pero seguro: nadie reparte a esa
 * hora, así que ninguna jornada real lo cruza. Lo eligió la 0154 y aquí solo se
 * respeta — el valor NO se toca sin cambiar también la función de la base, o las
 * dos mitades del sistema dejarían de estar de acuerdo sobre qué noche es.
 *
 * SOBRE EL DESFASE FIJO. Perú no aplica horario de verano desde 1994, así que
 * `America/Lima` es UTC−5 siempre. Aun así aquí no se resta el desfase a mano:
 * se lee el reloj de pared de Lima con `Intl`, igual que hace `timezone()` en
 * Postgres. Si algún día Perú adoptara DST, esta función y la 0154 seguirían de
 * acuerdo; una resta de 5 horas cableada, no.
 */

/** `YYYY-MM-DD` en el calendario de Lima. `en-CA` da justo ese formato. */
const fechaLima = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' })

/** Hora (0-23) del reloj de pared de Lima. */
const horaLima = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Lima',
  hour: '2-digit',
  hourCycle: 'h23',
})

/** Hora a la que arranca la jornada, en el reloj de Lima. Ver 0154. */
export const SERVICE_DAY_START_HOUR = 5

/**
 * Jornada operativa (`YYYY-MM-DD`) a la que pertenece un instante.
 *
 * Antes de las 05:00 de Lima devuelve el día ANTERIOR: la madrugada pertenece a
 * la noche que la trajo.
 */
export function serviceDate(at: Date = new Date()): string {
  const hora = Number(horaLima.format(at))
  if (hora >= SERVICE_DAY_START_HOUR) return fechaLima.format(at)
  // Madrugada: la jornada es la del día anterior. Se retrocede un día entero y
  // se vuelve a leer el calendario de Lima, en vez de restarle uno al string —
  // que obligaría a manejar a mano el cambio de mes y de año.
  return fechaLima.format(new Date(at.getTime() - 24 * 60 * 60 * 1000))
}

/**
 * Instante en que empezó la jornada en curso, en ISO con desfase explícito.
 *
 * Es lo que se le pasa a un `.gte('created_at', …)` de PostgREST para acotar una
 * consulta a "esta noche". Sale con `-05:00` porque el instante hay que
 * expresarlo en ALGÚN desfase y el de Lima es fijo; la fecha, que es la parte
 * que podría equivocarse, la decide `serviceDate` leyendo el reloj real.
 */
export function serviceDayStart(at: Date = new Date()): string {
  const hh = String(SERVICE_DAY_START_HOUR).padStart(2, '0')
  return `${serviceDate(at)}T${hh}:00:00-05:00`
}
