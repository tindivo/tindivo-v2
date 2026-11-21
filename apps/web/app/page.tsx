import type { ReactNode } from 'react'
import { ButtonLink } from '@/components/button-link'
import { APP_STORE_URL, GOOGLE_PLAY_URL, whatsappUrl } from '@/lib/site'

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="rounded-2xl bg-card p-5 shadow-card">
      <h3 className="text-lg font-bold text-ink">{title}</h3>
      <p className="mt-1 leading-relaxed text-ink-2">{children}</p>
    </li>
  )
}

export default function HomePage() {
  return (
    <>
      <section aria-labelledby="titulo">
        <h1 id="titulo" className="text-4xl leading-tight font-bold tracking-tight text-ink">
          El delivery de San Jacinto
        </h1>
        <p className="mt-3 text-lg leading-relaxed text-ink-2">
          Pide de los negocios de tu pueblo y recíbelo en tu puerta. Pagas por Yape, Plin o en
          efectivo, directo al negocio.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <ButtonLink href={GOOGLE_PLAY_URL} external>
            Descárgala en Google Play
          </ButtonLink>
          {APP_STORE_URL ? (
            <ButtonLink href={APP_STORE_URL} external>
              Descárgala en App Store
            </ButtonLink>
          ) : null}
          <ButtonLink
            href={whatsappUrl('Hola Tindivo, necesito ayuda.')}
            variant="secondary"
            external
          >
            Escríbenos por WhatsApp
          </ButtonLink>
        </div>
        {APP_STORE_URL ? null : (
          <p className="mt-3 text-sm text-ink-3">La versión para iPhone llegará muy pronto.</p>
        )}
      </section>

      <section aria-labelledby="que-hacemos" className="mt-12">
        <h2 id="que-hacemos" className="text-2xl font-bold tracking-tight text-ink">
          Qué puedes hacer con Tindivo
        </h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          <Card title="Pedir a restaurantes">
            Elige de los restaurantes de San Jacinto y un motorizado te lo lleva.
          </Card>
          <Card title="Tindivo Entregas">
            Llevamos de un punto a otro algo que ya está pagado: un paquete, un encargo.
          </Card>
          <Card title="Tindivo Store">
            Pide artículos de la tienda desde la app y te los llevamos a casa.
          </Card>
        </ul>
      </section>

      <section aria-labelledby="como" className="mt-12">
        <h2 id="como" className="text-2xl font-bold tracking-tight text-ink">
          Cómo funciona
        </h2>
        <p className="mt-2 leading-relaxed text-ink-2">
          Tindivo no cobra por ti: pagas directo al negocio con Yape, Plin o efectivo. Y para que
          nadie te dé gato por liebre, una persona del equipo llama a confirmar los pedidos.
        </p>
      </section>
    </>
  )
}
