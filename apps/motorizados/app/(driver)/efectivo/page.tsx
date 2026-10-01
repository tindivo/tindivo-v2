import { redirect } from 'next/navigation'

/** «Efectivo» pasó a llamarse «Deuda». Esto mantiene vivos los accesos guardados. */
export default function EfectivoPage() {
  redirect('/deuda')
}
