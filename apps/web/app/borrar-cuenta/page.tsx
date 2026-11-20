import type { Metadata } from 'next'
import { ButtonLink } from '@/components/button-link'
import { whatsappUrl } from '@/lib/site'

// Google Play exige una URL pública para pedir el borrado de la cuenta, sin iniciar sesión.
export const metadata: Metadata = {
  title: 'Borrar mi cuenta',
  description:
    'Cómo borrar tu cuenta de Tindivo y tus datos personales, qué se elimina y qué se conserva.',
  alternates: { canonical: '/borrar-cuenta/' },
}

const H2 = 'text-lg font-bold tracking-tight text-ink'
const P = 'mt-1 leading-relaxed text-ink-2'

export default function BorrarCuentaPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Borrar mi cuenta</h1>
      <p className="mt-1 text-sm text-ink-3">
        Tindivo · San Jacinto, Áncash · Ley N.° 29733 (Perú)
      </p>

      <div className="mt-6 space-y-6">
        <section>
          <h2 className={H2}>Cómo borrarla desde la app</h2>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-ink-2">
            <li>Abre la app de Tindivo e inicia sesión.</li>
            <li>Entra a «Cuenta».</li>
            <li>Toca «Borrar mi cuenta» y confirma.</li>
          </ol>
          <p className={P}>
            Es inmediato: al confirmar, tu cuenta deja de existir y no se puede recuperar. Si
            quieres volver a usar Tindivo, tendrás que crear una cuenta nueva.
          </p>
        </section>

        <section>
          <h2 className={H2}>Si no puedes entrar a la app</h2>
          <p className={P}>
            Escríbenos por WhatsApp y lo hacemos por ti. No necesitas iniciar sesión para pedirlo.
          </p>
          <div className="mt-3">
            <ButtonLink
              href={whatsappUrl('Hola Tindivo, quiero borrar mi cuenta y mis datos. ')}
              variant="secondary"
              external
            >
              Pedir el borrado por WhatsApp
            </ButtonLink>
          </div>
        </section>

        <section>
          <h2 className={H2}>Qué se elimina</h2>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-2">
            <li>Tu cuenta y tu inicio de sesión (Google, Apple o correo).</li>
            <li>Tu perfil: nombre, teléfono y correo.</li>
            <li>Tus direcciones guardadas y tu ubicación en el mapa.</li>
            <li>Tus avisos en el celular, tus avisos de seguridad y tu aceptación de términos.</li>
            <li>Tus canjes de promociones.</li>
          </ul>
        </section>

        <section>
          <h2 className={H2}>Qué se conserva, y sin tu nombre</h2>
          <p className={P}>
            Los pedidos que ya hiciste se quedan porque son la caja de cada negocio. Pierden todo lo
            que te identifica: tu nombre, tu teléfono, la dirección, la referencia, la ubicación y
            tus notas. Solo quedan el importe, el estado y las fechas. También se conservan, por
            seguridad contra fraudes, los reportes de pedidos no recibidos ligados a un número de
            teléfono, y el directorio de direcciones que usa la cajera para reconocer vecinos. Si tu
            número estaba bloqueado o solo podía pagar por adelantado, esa restricción se queda con
            el número hasta su fecha, aunque otra cuenta lo verifique después. Las reseñas se quedan
            sin tu nombre. Las fotos de comprobantes de pago se guardan con el pedido anonimizado el
            tiempo que su negocio las necesite para su caja; el plazo exacto está en la política de
            privacidad.
          </p>
        </section>

        <section>
          <h2 className={H2}>Cuándo no se puede todavía</h2>
          <p className={P}>
            Si tienes un pedido en curso, o una apelación o devolución sin resolver, tienes que
            esperar a que termine. Si tu cuenta también es de un negocio o de un motorizado, la
            cierra el equipo de soporte.
          </p>
        </section>
      </div>
    </article>
  )
}
