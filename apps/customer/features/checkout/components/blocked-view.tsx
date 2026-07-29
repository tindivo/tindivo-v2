import Link from 'next/link'

export function BlockedView() {
  const wa = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP
  const href = wa
    ? `https://wa.me/${wa.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, mi cuenta aparece pausada y quiero regularizarla.')}`
    : undefined

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-danger text-white">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <title>pausa</title>
          <path
            d="M6 10V8a6 6 0 0112 0v2m-9 0h6a3 3 0 013 3v4a3 3 0 01-3 3H9a3 3 0 01-3-3v-4a3 3 0 013-3z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <h1 className="t-display mt-5 text-[26px]">Cuenta en pausa</h1>
      <p className="t-muted mt-2 text-[15px]">
        Tu cuenta está temporalmente pausada por incidentes reiterados en las entregas. Escríbenos
        para regularizar tu situación y reactivarla.
      </p>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="t-btn t-btn-primary t-btn-block mt-6"
        >
          Escribir por WhatsApp
        </a>
      )}
      <Link href="/" className="mt-3 text-[14px] text-brand">
        Volver al inicio
      </Link>
    </main>
  )
}
