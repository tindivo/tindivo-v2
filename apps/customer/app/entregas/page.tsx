import { redirect } from 'next/navigation'

/**
 * `tindivo.com/entregas` no es una pantalla: es la puerta al MISMO flujo que la
 * tarjeta de Tindivo Entregas del inicio (`Docs/Entregas/ux-entrada/`). Antes
 * abría «Lugares», otro camino con su propio botón de recojo que además se
 * saltaba el login.
 *
 * Redirige al inicio con `?entregas`, y `CourierHost` abre el flujo desde ahí
 * (pidiendo la cuenta si hace falta). `?lugar=<id>` (el enlace que comparte una
 * tienda) lo abre con el recojo ya puesto en ese lugar.
 */
export default async function EntregasPage({
  searchParams,
}: {
  searchParams: Promise<{ lugar?: string | string[] }>
}) {
  const { lugar } = await searchParams
  const id = Array.isArray(lugar) ? lugar[0] : lugar
  redirect(id ? `/?entregas=1&lugar=${encodeURIComponent(id)}` : '/?entregas=1')
}
