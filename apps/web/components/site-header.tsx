import Link from 'next/link'

export function SiteHeader() {
  return (
    <header className="border-b border-divider bg-card">
      <div className="mx-auto flex max-w-3xl items-center px-4">
        <Link
          href="/"
          className="flex min-h-12 items-center gap-2 py-2"
          aria-label="Tindivo, inicio"
        >
          {/* El logo es la imagen de la marca, no se escribe con fuente; el nombre al lado es solo la etiqueta del sitio. */}
          <img src="/icon-96x96.png" alt="" width={40} height={40} className="rounded-lg" />
          <span className="text-xl font-bold text-ink">Tindivo</span>
        </Link>
      </div>
    </header>
  )
}
