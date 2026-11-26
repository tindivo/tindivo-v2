import Link from 'next/link'
import { SHOW_LIBRO_LINK, whatsappUrl } from '@/lib/site'

const LINK = 'inline-flex min-h-12 items-center text-ink-2 underline underline-offset-2'

export function SiteFooter() {
  return (
    <footer className="border-t border-divider bg-card">
      <nav aria-label="Información legal y ayuda" className="mx-auto max-w-3xl px-4 py-4">
        <ul className="flex flex-wrap gap-x-6">
          <li>
            <Link href="/terminos/" className={LINK}>
              Términos y Condiciones
            </Link>
          </li>
          <li>
            <Link href="/privacidad/" className={LINK}>
              Política de Privacidad
            </Link>
          </li>
          <li>
            <Link href="/borrar-cuenta/" className={LINK}>
              Borrar mi cuenta
            </Link>
          </li>
          {SHOW_LIBRO_LINK && (
            <li>
              <Link href="/libro-de-reclamaciones/" className={LINK}>
                Libro de Reclamaciones
              </Link>
            </li>
          )}
          <li>
            <a
              href={whatsappUrl('Hola Tindivo, necesito ayuda.')}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK}
            >
              Soporte por WhatsApp
            </a>
          </li>
        </ul>
        <p className="mt-2 text-sm text-ink-3">Tindivo · San Jacinto, Áncash, Perú</p>
      </nav>
    </footer>
  )
}
