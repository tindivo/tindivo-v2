'use client'

import { type CustomerSecurityNotice, CustomerSecurityNoticesSchema } from '@tindivo/contracts'
import { Button } from '@tindivo/ui'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

/** El aviso persiste hasta que el dueño confirma que lo leyó. */
export function SecurityNotices() {
  const [notices, setNotices] = useState<CustomerSecurityNotice[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    api
      .get<{ data: unknown }>('/customer/security-notices')
      .then((response) => {
        if (mounted) setNotices(CustomerSecurityNoticesSchema.parse(response.data))
      })
      .catch(() => {
        if (mounted)
          setError('No pudimos cargar tus avisos de seguridad. Vuelve a abrir tu cuenta.')
      })
    return () => {
      mounted = false
    }
  }, [])

  async function markSeen(id: string) {
    setBusyId(id)
    setError(null)
    try {
      await api.post(`/customer/security-notices/${id}/seen`, {})
      setNotices((current) => current.filter((notice) => notice.id !== id))
    } catch {
      setError('No pudimos marcar el aviso. Intenta de nuevo.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {notices.map((notice) => (
        <div
          key={notice.id}
          className="mb-4 rounded-2xl bg-warning-soft p-4 text-sm text-ink"
          role="status"
        >
          <p>
            Tu número terminado en ··{notice.phoneLast3} dejó de estar verificado en esta cuenta
            porque se verificó en otra. Tus pedidos y datos siguen aquí. Si fue un error, verifica
            tu número de nuevo.
          </p>
          <Button
            className="mt-3"
            variant="ghost"
            disabled={busyId !== null}
            onClick={() => void markSeen(notice.id)}
          >
            Entendido
          </Button>
        </div>
      ))}
      {error && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {error}
        </p>
      )}
    </>
  )
}
