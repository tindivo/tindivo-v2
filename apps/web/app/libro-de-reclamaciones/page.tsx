import type { Metadata } from 'next'
import { ButtonLink } from '@/components/button-link'
import { whatsappUrl } from '@/lib/site'

// Provisional: el formulario llega con su capacidad (`libro-reclamaciones`). Hasta que el RUC y el
// domicilio del proveedor estén cargados (CUS-LIB-008) la página no acepta envíos y no se indexa.
export const metadata: Metadata = {
  title: 'Libro de Reclamaciones',
  description: 'Libro de Reclamaciones virtual de Tindivo: muy pronto.',
  alternates: { canonical: '/libro-de-reclamaciones/' },
  robots: { index: false, follow: true },
}

export default function LibroPage() {
  return (
    <article>
      <h1 className="text-3xl font-bold tracking-tight text-ink">Libro de Reclamaciones</h1>
      <p className="mt-3 text-lg leading-relaxed text-ink-2">
        Muy pronto podrás registrar aquí tu reclamo o tu queja. Mientras tanto, nunca te quedas sin
        dónde reclamar: escríbenos por WhatsApp y lo atendemos.
      </p>
      <div className="mt-6">
        <ButtonLink
          href={whatsappUrl('Hola Tindivo, quiero presentar un reclamo o una queja.')}
          external
        >
          Escríbenos por WhatsApp
        </ButtonLink>
      </div>
    </article>
  )
}
