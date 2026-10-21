import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// Raíz del monorepo: el build standalone tiene que trazar los paquetes de `packages/*`.
const MONOREPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const config: NextConfig = {
  transpilePackages: [
    '@tindivo/ui',
    '@tindivo/map',
    '@tindivo/api-client',
    '@tindivo/contracts',
    '@tindivo/supabase',
  ],
  poweredByHeader: false,
  // Servidor Node autocontenido para la imagen Docker de Coolify (infra/coolify).
  output: 'standalone',
  outputFileTracingRoot: MONOREPO_ROOT,
}

export default config
