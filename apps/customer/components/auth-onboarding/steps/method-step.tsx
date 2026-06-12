'use client'

import Link from 'next/link'
import { useState } from 'react'

function GoogleLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.1H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"
      />
    </svg>
  )
}

/** Pantalla inicial: elegir método de creación de cuenta (réplica del demo). */
export function MethodStep({
  onGoogle,
  onEmail,
  onLogin,
}: {
  onGoogle: () => Promise<void>
  onEmail: () => void
  onLogin: () => void
}) {
  const [googleBusy, setGoogleBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex h-full flex-col">
      <div className="t-scroll flex-1 px-5 pt-2 pb-4">
        <div
          className="flex h-14 w-14 items-center justify-center rounded-2xl font-bold text-[24px] text-white"
          style={{
            background: '#F97316',
            boxShadow: '0 8px 20px -6px rgba(249,115,22,0.55)',
            fontFamily: 'var(--font-display, inherit)',
          }}
        >
          T
        </div>
        <h2 className="t-display mt-4 text-[26px] leading-[1.1]">
          Crea tu cuenta
          <br />
          en Tindivo
        </h2>
        <p className="mt-2 text-[14px]" style={{ color: 'rgba(26,22,20,0.6)' }}>
          Sin verificación de correo. Empiezas a pedir al instante.
        </p>

        <button
          type="button"
          disabled={googleBusy}
          onClick={async () => {
            setError(null)
            setGoogleBusy(true)
            try {
              await onGoogle()
            } catch (err) {
              setError(err instanceof Error ? err.message : 'No se pudo continuar con Google')
              setGoogleBusy(false)
            }
          }}
          className="mt-6 flex w-full items-center gap-3.5 rounded-[18px] bg-white p-4 text-left disabled:opacity-60"
          style={{
            border: '1px solid rgba(26,22,20,0.08)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          }}
        >
          <GoogleLogo />
          <span className="flex-1">
            <span className="block font-semibold text-[15px]">
              {googleBusy ? 'Conectando…' : 'Continuar con Google'}
            </span>
            <span className="block text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              Recomendado · 1 toque
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onEmail}
          className="mt-3 flex w-full items-center gap-3.5 rounded-[18px] p-4 text-left"
          style={{ background: 'rgba(26,22,20,0.04)', border: '1px solid rgba(26,22,20,0.06)' }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="5" width="18" height="14" rx="2.5" stroke="#1A1614" strokeWidth="1.8" />
            <path d="M3.5 7l8.5 6 8.5-6" stroke="#1A1614" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="flex-1">
            <span className="block font-semibold text-[15px]">Ingresar con correo</span>
            <span className="block text-[12px]" style={{ color: 'rgba(26,22,20,0.55)' }}>
              Crea tu cuenta en 1 paso
            </span>
          </span>
        </button>

        {error && <p className="mt-3 text-[13px] text-danger">{error}</p>}

        <div className="mt-6 flex items-center gap-3">
          <span className="h-px flex-1" style={{ background: 'rgba(26,22,20,0.1)' }} />
          <span className="t-eyebrow" style={{ marginBottom: 0 }}>
            ¿Ya tienes cuenta?
          </span>
          <span className="h-px flex-1" style={{ background: 'rgba(26,22,20,0.1)' }} />
        </div>
        <button
          type="button"
          onClick={onLogin}
          className="mt-4 w-full text-center font-semibold text-[15px] text-brand"
        >
          Iniciar sesión
        </button>
      </div>

      <p
        className="border-t px-5 pt-3 pb-5 text-center text-[11px]"
        style={{ borderColor: 'rgba(26,22,20,0.06)', color: 'rgba(26,22,20,0.5)' }}
      >
        Al continuar aceptas los{' '}
        <Link href="/terminos" target="_blank" className="underline">
          Términos
        </Link>{' '}
        y la{' '}
        <Link href="/privacidad" target="_blank" className="underline">
          Política de privacidad
        </Link>{' '}
        de Tindivo.
      </p>
    </div>
  )
}
