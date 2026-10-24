import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// Raíz del monorepo: el build standalone tiene que trazar los paquetes de `packages/*`.
const MONOREPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))
// Solo el build de la imagen Docker de Coolify (infra/coolify) pone TINDIVO_NEXT_STANDALONE=1. En Vercel la
// configuración queda exactamente como antes de existir la imagen.
const STANDALONE = process.env.TINDIVO_NEXT_STANDALONE === '1'

const config: NextConfig = {
  transpilePackages: [
    '@tindivo/ui',
    '@tindivo/map',
    '@tindivo/api-client',
    '@tindivo/contracts',
    '@tindivo/supabase',
  ],
  poweredByHeader: false,
  // Servidor Node autocontenido, solo para la imagen Docker de Coolify (infra/coolify).
  ...(STANDALONE ? { output: 'standalone' as const, outputFileTracingRoot: MONOREPO_ROOT } : {}),
}

export default config
