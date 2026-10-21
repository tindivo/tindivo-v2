import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// Raíz del monorepo: el build standalone tiene que trazar los paquetes de `packages/*`.
const MONOREPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const config: NextConfig = {
  // `@tindivo/supabase` entró aquí cuando el logout pasó a usar `signOutLocal`:
  // hasta entonces esta app solo importaba TIPOS del paquete, que se borran al
  // compilar y no necesitan transpilarse. Un import de runtime sí.
  transpilePackages: [
    '@tindivo/ui',
    '@tindivo/api-client',
    '@tindivo/contracts',
    '@tindivo/images',
    '@tindivo/supabase',
  ],
  poweredByHeader: false,
  // Servidor Node autocontenido para la imagen Docker de Coolify (infra/coolify).
  output: 'standalone',
  outputFileTracingRoot: MONOREPO_ROOT,
}

export default config
