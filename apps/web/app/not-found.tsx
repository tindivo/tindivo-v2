import { ButtonLink } from '@/components/button-link'

export default function NotFound() {
  return (
    <section>
      <h1 className="text-3xl font-bold tracking-tight text-ink">No encontramos esa página</h1>
      <p className="mt-3 text-lg leading-relaxed text-ink-2">
        Puede que el enlace haya cambiado. Vuelve al inicio para pedir con Tindivo.
      </p>
      <div className="mt-6">
        <ButtonLink href="/">Ir al inicio</ButtonLink>
      </div>
    </section>
  )
}
