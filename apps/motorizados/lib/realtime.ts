/**
 * Nombres de canal de Realtime que no chocan consigo mismos.
 *
 * EL FALLO QUE ESTO EVITA
 *   `cannot add \`postgres_changes\` callbacks for realtime:drv-cash after
 *   \`subscribe()\`.`
 *
 * DE DÓNDE SALE. Dos piezas de `@supabase/realtime-js` que por separado son
 * razonables y juntas muerden:
 *
 *   1. `RealtimeClient.channel(topic)` NO crea siempre un canal. Si ya hay uno
 *      con ese topic registrado, DEVUELVE EL EXISTENTE
 *      (`RealtimeClient.js`: `const exists = this.getChannels().find(...)`).
 *
 *   2. `RealtimeChannel.on()` lanza si el canal está `joined` **o `joining`**
 *      (`RealtimeChannel.js:389-395`). Basta con que esté a medio conectar.
 *
 * Y la tercera: `supabase.removeChannel()` es ASÍNCRONO. Nadie puede esperarlo
 * en el `return` de un `useEffect`, que es síncrono. Así que entre que se pide
 * la baja y el canal desaparece de `client.channels` hay una ventana, y quien
 * vuelva a pedir el mismo nombre dentro de esa ventana recibe el canal viejo,
 * todavía conectado, y su `.on()` revienta.
 *
 * CUÁNDO SE ABRE ESA VENTANA. No es un caso raro:
 *   · React StrictMode en desarrollo monta, desmonta y vuelve a montar.
 *   · Cualquier remontaje del componente (navegar y volver).
 *   · `useTeam` reabre su canal en cada `TOKEN_REFRESHED` de Supabase, o sea
 *     una vez por hora en producción, sin que nadie navegue.
 *
 * POR QUÉ UN NOMBRE ÚNICO Y NO "ESPERAR AL removeChannel". Porque el cierre de
 * `useEffect` no puede esperar nada. Con un sufijo aleatorio por suscripción, el
 * `find()` del punto 1 no encuentra nunca nada y siempre se crea un canal nuevo:
 * la carrera deja de existir en vez de ganarse por poco. El canal viejo se cierra
 * cuando le toque, sin estorbar al nuevo.
 *
 * OJO CON `useRef`. Guardar el nombre en un ref NO basta, y era lo que hacía
 * `useDriverOrders`: el ref sobrevive al ciclo desmontar-montar de StrictMode,
 * así que la segunda suscripción pide exactamente el mismo nombre que la
 * primera. Tiene que generarse DENTRO del efecto, una vez por suscripción.
 */
export function canalUnico(prefijo: string): string {
  return `${prefijo}-${crypto.randomUUID()}`
}
