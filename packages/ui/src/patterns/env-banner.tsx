'use client'

declare const process: { env: Record<string, string | undefined> }

/**
 * Banner de advertencia visual para señalar cuando una app en desarrollo
 * está conectada a la base de datos de producción/remota.
 *
 * Criterio de despliegue (C2):
 *  - NODE_ENV === 'development' (desarrollo activo / pnpm dev)
 *  - NEXT_PUBLIC_SUPABASE_URL no contiene '127.0.0.1' ni 'localhost'
 *
 * En producción (build/deploy real) NUNCA se muestra.
 */
export function EnvBanner() {
  const isDev = process.env.NODE_ENV === 'development'
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const isRemoteUrl =
    Boolean(supabaseUrl) && !supabaseUrl.includes('127.0.0.1') && !supabaseUrl.includes('localhost')

  if (!isDev || !isRemoteUrl) {
    return null
  }

  return (
    <div
      role="alert"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 99999,
        background: '#dc2626',
        color: '#ffffff',
        padding: '6px 12px',
        textAlign: 'center',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      ⚠️ ENTORNO REMOTO DE PRODUCCIÓN CONECTADO ({supabaseUrl})
    </div>
  )
}
