'use client'

import { ApiError } from '@tindivo/api-client'
import { Button, Icon } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/**
 * «Ver captura del cliente»: el motorizado ve lo que el cliente mandó al
 * negocio, y NUNCA lo aprueba (solo el negocio confirma el ingreso).
 *
 * La URL firmada dura 120 s: se pide en CADA toque y no se guarda.
 */
export function PaymentProofViewer({ orderId }: { orderId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Escape cierra, y el fondo deja de hacer scroll debajo de la captura.
  useEffect(() => {
    if (!url) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setUrl(null)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [url])

  async function open() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get<{ data: { url: string } }>(`/driver/orders/${orderId}/prepay-proof`)
      setUrl(res.data.url)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 404
          ? 'La captura ya no está disponible.'
          : 'No pudimos abrir la captura. Intenta de nuevo.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Button variant="outline" size="sm" disabled={loading} onClick={open}>
        <Icon name="visibility" size={18} />
        {loading ? 'Abriendo…' : 'Ver captura del cliente'}
      </Button>
      {error && (
        <p role="alert" className="mt-1.5 text-caption font-semibold text-danger">
          {error}
        </p>
      )}

      {url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Captura del cliente"
          onClick={() => setUrl(null)}
          onKeyDown={(e) => e.key === 'Escape' && setUrl(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-5"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setUrl(null)}
            className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white"
          >
            <Icon name="close" size={24} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Captura del cliente"
            className="max-h-[85vh] max-w-[90vw] rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  )
}
