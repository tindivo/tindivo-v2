import type { Metadata } from 'next'
import Link from 'next/link'
import { DeleteAccountPanel } from '@/features/account/components/delete-account-panel'

// Página pública y rastreable: Google Play pide una URL para borrar la cuenta
// sin abrir la app, y la enlaza en la ficha. El sufijo "— Tindivo" lo pone la
// plantilla de `app/layout.tsx`.
export const metadata: Metadata = {
  title: 'Borrar mi cuenta',
  description:
    'Cómo borrar tu cuenta de Tindivo y tus datos personales, qué se elimina y qué se conserva.',
  alternates: { canonical: '/borrar-cuenta' },
}

export default function BorrarCuentaPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-[768px] bg-surface px-5 pt-12 pb-16">
      <Link
        href="/"
        className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
      >
        ← Volver
      </Link>
      <h1 className="mt-3 font-display text-[28px] font-bold tracking-tight">Borrar mi cuenta</h1>
      <p className="mt-1 text-[13px] text-ink-muted">
        Tindivo · San Jacinto, Áncash · Ley N.° 29733 (Perú)
      </p>

      <div className="mt-6 space-y-5">
        <section>
          <h2 className="font-display text-[17px] font-bold tracking-tight">Qué se elimina</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px] leading-[1.55] text-ink/75">
            <li>Tu cuenta y tu inicio de sesión (Google, Apple o correo).</li>
            <li>Tu perfil: nombre, teléfono y correo.</li>
            <li>Tus direcciones guardadas y tu ubicación en el mapa.</li>
            <li>Tus avisos en el celular y tu aceptación de términos.</li>
            <li>Tus canjes de promociones.</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-[17px] font-bold tracking-tight">
            Qué se conserva, y sin tu nombre
          </h2>
          <p className="mt-1 text-[14px] leading-[1.55] text-ink/75">
            Los pedidos que ya hiciste se quedan porque son la caja de cada negocio. Pierden todo lo
            que te identifica: tu nombre, tu teléfono, la dirección, la referencia, la ubicación y
            tus notas. Solo quedan el importe, el estado y las fechas. También se conservan, por
            seguridad contra fraudes, los reportes de pedidos no recibidos ligados a un número de
            teléfono, y el directorio de direcciones que usa la cajera para reconocer vecinos. Las
            reseñas se quedan sin tu nombre. Las fotos de comprobantes de pago se guardan con el
            pedido anonimizado el tiempo que su negocio las necesite para su caja; el plazo exacto
            está en la política de privacidad.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[17px] font-bold tracking-tight">Cuánto tarda</h2>
          <p className="mt-1 text-[14px] leading-[1.55] text-ink/75">
            Es inmediato: al confirmar, tu cuenta deja de existir y no se puede recuperar. Si
            quieres volver a usar Tindivo, tendrás que crear una cuenta nueva.
          </p>
        </section>

        <section>
          <h2 className="font-display text-[17px] font-bold tracking-tight">
            Cuándo no se puede todavía
          </h2>
          <p className="mt-1 text-[14px] leading-[1.55] text-ink/75">
            Si tienes un pedido en curso, o una apelación o devolución sin resolver, tienes que
            esperar a que termine. Si tu cuenta también es de un negocio o de un motorizado, la
            cierra el equipo de soporte.
          </p>
        </section>
      </div>

      <DeleteAccountPanel />

      <p className="mt-8 text-[12px] text-ink-muted">
        Lee también nuestra{' '}
        <Link href="/privacidad" className="text-brand underline">
          Política de Privacidad
        </Link>{' '}
        y los{' '}
        <Link href="/terminos" className="text-brand underline">
          Términos y Condiciones
        </Link>
        .
      </p>
    </main>
  )
}
