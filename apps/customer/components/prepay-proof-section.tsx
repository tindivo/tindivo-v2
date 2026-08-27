'use client'

import { ApiError } from '@tindivo/api-client'
import type { PaymentQrView } from '@tindivo/contracts'
import { compressImage, UPLOAD_CACHE_CONTROL, validateImageInput } from '@tindivo/images'
import { Button, Icon } from '@tindivo/ui'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { getSupabaseBrowser } from '@/lib/supabase/client'
import { CountdownBar, type CountdownBarView } from './countdown-bar'
import { PaymentAccountCard } from './payment-account-card'

interface PrepayInfo {
  businessName: string
  yapeNumber: string | null
  qrUrl: string | null
  /** La cuenta de cobro principal del local (Yape/Plin), la única que ve el cliente (0184). */
  paymentQr: PaymentQrView | null
  total: number
  status: string
  hasProof: boolean
  proofAttempt: number
  comprobantePrepagoUrl: string | null
}

interface Props {
  orderId: string
  proofAttempt: number
  /**
   * El tiempo que le queda al cliente para pagar, ya formateado.
   *
   * Antes se calculaba aqui dentro con `startMs + 15 * 60 * 1000`. El 15 era
   * correcto pero estaba clavado, que es el problema que la migracion 0170 ya
   * habia corregido en el contador hermano: `paymentMinutes` se edita desde
   * /admin/configuracion, y en cuanto alguien lo tocara este contador habria
   * seguido diciendo quince. Ahora el plazo lo decide `activeDeadline` a partir
   * de lo que publica `get_tracking`, y aqui solo se pinta.
   *
   * El tipo es estructural a proposito: este componente vive en `components/` y
   * no debe importar de `features/tracking`. `CountdownBarView` es ese mismo
   * contrato estructural, ya con nombre, mas la fraccion que la barra necesita
   * para representar la ventana.
   */
  countdown: CountdownBarView | null
  onProofUploaded: () => void
}

export function PrepayProofSection({ orderId, proofAttempt, countdown, onProofUploaded }: Props) {
  const [info, setInfo] = useState<PrepayInfo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Comprimiendo la captura recién elegida, antes de que exista preview. */
  const [preparing, setPreparing] = useState(false)
  /** URL firmada del comprobante ya enviado (el bucket es privado). */
  const [sentProofUrl, setSentProofUrl] = useState<string | null>(null)
  /** URL de imagen para zoom en modal lightbox. */
  const [zoomUrl, setZoomUrl] = useState<string | null>(null)
  /** El selector de archivo, disparable desde la barra fija y desde la zona grande. */
  const inputRef = useRef<HTMLInputElement>(null)
  /**
   * El cliente se fue de la pestaña y volvió — casi seguro, a pagar.
   *
   * Es el momento exacto en que hoy se atasca: vuelve del Yape con la captura
   * hecha, la pantalla está donde la dejó —a la altura del QR— y el botón de
   * subir queda fuera de vista, más abajo. No sabe que hay algo más abajo, así
   * que se queda mirando. La barra fija ya resuelve el fondo del problema; esto
   * solo la hace latir un momento para que el ojo la encuentre sin buscarla.
   */
  const [volvioDePagar, setVolvioDePagar] = useState(false)

  const loadInfo = useCallback(async () => {
    try {
      const res = await api.get<{ data: PrepayInfo }>(`/customer/orders/${orderId}/prepay-info`)
      setInfo(res.data)
    } catch {
      // Ignorar error perezoso si aún no está listo
    }
  }, [orderId])

  useEffect(() => {
    loadInfo()
  }, [loadInfo])

  // Ida y vuelta a la billetera. Solo cuenta el viaje completo —oculta y luego
  // visible—, no un `visibilitychange` suelto: bloquear la pantalla un segundo
  // no es haber ido a pagar. El latido se apaga solo a los seis segundos para
  // que no se quede parpadeando toda la espera.
  useEffect(() => {
    let sefue = false
    let apagar: ReturnType<typeof setTimeout> | undefined
    const alCambiar = () => {
      if (document.visibilityState === 'hidden') {
        sefue = true
        return
      }
      if (!sefue) return
      sefue = false
      setVolvioDePagar(true)
      apagar = setTimeout(() => setVolvioDePagar(false), 6000)
    }
    document.addEventListener('visibilitychange', alCambiar)
    return () => {
      document.removeEventListener('visibilitychange', alCambiar)
      if (apagar) clearTimeout(apagar)
    }
  }, [])

  // Comprobante ya enviado: `comprobante_prepago_url` guarda la RUTA dentro de
  // `payment-proofs`, que es un bucket privado. Sin firmar esa ruta no hay nada
  // que pintar, y el cliente se quedaba sin ver lo que había mandado —ni para
  // comprobar que subió la captura correcta, ni mientras la cajera la revisa.
  // La RLS de storage deja al usuario leer su propia carpeta, así que la firma
  // se puede pedir desde el navegador con su sesión.
  useEffect(() => {
    const path = info?.comprobantePrepagoUrl
    if (!path) {
      setSentProofUrl(null)
      return
    }
    let cancelled = false
    getSupabaseBrowser()
      .storage.from('payment-proofs')
      .createSignedUrl(path, 600)
      .then(({ data }) => {
        if (!cancelled) setSentProofUrl(data?.signedUrl ?? null)
      })
    return () => {
      cancelled = true
    }
  }, [info?.comprobantePrepagoUrl])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const invalid = validateImageInput(f)
    if (invalid) {
      setError(invalid)
      return
    }
    setError(null)
    setPreparing(true)
    try {
      // El cliente sube desde datos móviles: una captura de Yape sin comprimir
      // sale del celular pesando megas.
      const optimized = await compressImage(f, 'proof')
      setPendingFile(optimized)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(optimized)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos procesar la imagen.')
    } finally {
      setPreparing(false)
    }
  }

  async function submitProof() {
    if (!pendingFile) return
    setUploading(true)
    setError(null)
    try {
      const supabase = getSupabaseBrowser()
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess.session?.user.id
      if (!userId) {
        setError('Debes iniciar sesión para subir el comprobante')
        setUploading(false)
        return
      }
      const attempt = proofAttempt + 1
      const ts = Date.now()
      const ext =
        pendingFile.type === 'image/png'
          ? 'png'
          : pendingFile.type === 'image/jpeg'
            ? 'jpg'
            : pendingFile.type === 'image/webp'
              ? 'webp'
              : 'jpg'
      const path = `${userId}/${orderId}/attempt-${attempt}-${ts}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, pendingFile, {
          contentType: pendingFile.type,
          cacheControl: UPLOAD_CACHE_CONTROL,
        })

      if (upErr) throw upErr

      await api.post(`/customer/orders/${orderId}/prepay-proof`, { path })
      onProofUploaded()
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.problem.detail ?? err.message)
          : err instanceof Error
            ? err.message
            : 'Error al subir el comprobante',
      )
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      <div className="mt-4 rounded-[22px] border border-brand/20 bg-white p-5 text-left shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        {proofAttempt === 1 && (
          <div className="mb-2.5 flex justify-end">
            <span className="rounded-full bg-danger-soft px-2.5 py-0.5 font-sans text-[11px] font-bold text-danger">
              Reintento final (1/2)
            </span>
          </div>
        )}

        {/* La luz verde, y por que es verde.
          Este es el unico momento del prepago en que la pelota pasa al cliente,
          y hasta ahora lo anunciaba un parrafo gris que empezaba por el nombre
          del restaurante. El verde dice «adelante» de un vistazo, que es lo que
          hace falta para alguien que no va a leer.
          NO se usa para «ya pagaste» —eso lo dice el azul de la verificacion, en
          `TrackingPrepay`—: el mismo color para dos cosas opuestas es como se
          pierde la gente. */}
        <div className="flex items-center gap-2.5 rounded-[16px] border border-success/25 bg-success-soft px-3.5 py-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-success text-white">
            <Icon name="check" size={17} filled />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-[15px] font-bold tracking-tight text-emerald-900">
              {info?.businessName ?? 'El restaurante'} confirmó tu pedido
            </h3>
            <p className="text-[12px] leading-snug text-emerald-800/80">
              Ahora te toca pagar para que entre a cocina.
            </p>
          </div>
        </div>

        {/* El reloj, a ancho completo y con la barra. Antes era una pildora de 11
          px en la esquina, mas pequena incluso que la del pill compartido: el
          plazo con consecuencias mas duras del flujo —si vence, el pedido se
          cancela solo— era el dato mas discreto de la pantalla. */}
        {countdown && (
          <div className="mt-2.5">
            <CountdownBar view={countdown} titulo="Tiempo para pagar" />
          </div>
        )}

        {/* Cuánto y a quién, en UNA caja y vestida con la marca de la billetera.
          El monto vivía en un recuadro aparte, encima: son los dos datos que el
          cliente se lleva a la otra app, y separarlos era pedirle que memorizara
          en dos viajes. */}
        <PaymentAccountCard
          method={info?.paymentQr ?? null}
          fallbackNumber={info?.yapeNumber ?? null}
          total={info?.total ?? 0}
          onZoom={setZoomUrl}
        />

        {/* Comprobante ya enviado. Se muestra para que el cliente pueda comprobar
          que mandó la captura correcta mientras la cajera la revisa. */}
        {sentProofUrl && (
          <div className="mt-3.5 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-center justify-between pb-1.5 text-[12px] font-semibold text-emerald-900">
              <span>Comprobante enviado</span>
              <span className="text-[11px] font-normal text-emerald-700">
                Toca para agrandar 🔍
              </span>
            </div>
            <button
              type="button"
              onClick={() => setZoomUrl(sentProofUrl)}
              className="group relative block w-full overflow-hidden rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <img
                src={sentProofUrl}
                alt="Comprobante enviado"
                decoding="async"
                className="max-h-48 w-full object-contain p-1 transition-transform group-hover:scale-[1.02]"
              />
            </button>
          </div>
        )}

        {/* El input vive aqui, escondido y con ref, para que lo pueda disparar
          tanto esta zona como la barra fija de abajo. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={preparing}
          onChange={handleFileChange}
        />

        <div className="mt-3.5">
          {previewUrl ? (
            <div className="rounded-[18px] border border-ink/[0.06] bg-surface p-2.5">
              <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <span className="text-[12px] font-bold text-ink">Tu captura</span>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-[10px] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted shadow-elev-1"
                >
                  Cambiar
                </button>
              </div>
              <button
                type="button"
                onClick={() => setZoomUrl(previewUrl)}
                className="block w-full cursor-zoom-in overflow-hidden rounded-[12px] bg-white"
                aria-label="Agrandar vista previa"
              >
                <img
                  src={previewUrl}
                  alt="Vista previa"
                  className="max-h-52 w-full object-contain"
                />
              </button>
            </div>
          ) : (
            // La zona grande sigue estando para quien baje hasta aqui, pero ya no
            // es la unica via: el boton de verdad es la barra fija.
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={preparing}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-[18px] border-2 border-dashed border-brand-light bg-brand-soft p-5 transition-colors hover:bg-brand-soft/70"
            >
              <Icon name="add_a_photo" size={26} className="text-brand" />
              <span className="text-[14px] font-bold text-brand-dark">
                {preparing ? 'Preparando imagen…' : 'Subir mi captura'}
              </span>
              {/* La regla de validacion, encogida. Era un recuadro azul de veinte
                palabras que nadie leia; dicha en ocho y en el sitio donde se
                elige la foto, llega justo cuando sirve. */}
              <span className="text-[11px] text-ink-subtle">
                Que se vea tu nombre y la hora del pago
              </span>
            </button>
          )}
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-danger-soft p-2.5 text-[12px] text-danger">
            {error}
          </div>
        )}
      </div>

      {/* Hueco para que la barra fija no tape el final de la pantalla. Va FUERA
          de la tarjeta: dentro abría un vacío blanco de cien píxeles bajo la
          zona de subida, como si algo se hubiera roto al maquetar. */}
      <div className="h-24" aria-hidden="true" />

      {/*
        LA BARRA FIJA · el arreglo de fondo de esta pantalla.

        EL PROBLEMA. Pagar obliga a SALIR de la app: el cliente se va al Yape,
        transfiere, hace la captura y vuelve. Al volver, el navegador lo deja
        exactamente donde estaba —a la altura del QR— y el botón de subir queda
        más abajo, fuera de pantalla. No sabe que hay algo más abajo, así que se
        queda parado con la captura hecha y el reloj corriendo. La zona de subida
        estaba ahí desde siempre; el problema nunca fue que faltara, sino que
        había que ir a buscarla justo cuando el cliente ya no está leyendo.

        LA SOLUCIÓN. La única acción de esta pantalla deja de estar en un sitio y
        pasa a estar SIEMPRE al alcance del pulgar, encima de todo. Y cambia sola
        con el momento: subir → enviar → enviando. El cliente nunca tiene que
        decidir dónde tocar, porque solo hay un sitio donde tocar.

        Va dentro del ancho de la pantalla (`max-w-[768px]`) y no a sangre para
        no descolgarse del layout en tablet y escritorio.
      */}
      <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-ink/[0.06] bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-[768px] px-4 py-3">
          <Button
            type="button"
            variant="brand"
            disabled={uploading || preparing}
            onClick={() => (pendingFile ? submitProof() : inputRef.current?.click())}
            className={`w-full ${
              volvioDePagar && !pendingFile
                ? 'animate-[t-attention_1.1s_ease-in-out_infinite] ring-4 ring-brand/30'
                : ''
            }`}
          >
            {uploading
              ? 'Enviando…'
              : preparing
                ? 'Preparando imagen…'
                : pendingFile
                  ? 'Enviar mi comprobante'
                  : 'Ya pagué · Subir captura'}
          </Button>
        </div>
      </div>

      {/* Lightbox Zoom Modal */}
      {zoomUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Comprobante ampliado"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            className="fixed inset-0 h-full w-full cursor-default bg-transparent border-0"
            onClick={() => setZoomUrl(null)}
            aria-label="Cerrar modal"
          />
          <div className="relative z-10 flex max-h-[90vh] max-w-[95vw] flex-col items-center justify-center pointer-events-auto">
            <button
              type="button"
              onClick={() => setZoomUrl(null)}
              className="absolute -top-12 right-0 flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-[18px] font-bold text-white transition-colors hover:bg-white/40 focus:outline-none"
              aria-label="Cerrar"
            >
              ✕
            </button>
            <img
              src={zoomUrl}
              alt="Comprobante ampliado"
              className="max-h-[85vh] max-w-full rounded-2xl bg-white object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </>
  )
}
