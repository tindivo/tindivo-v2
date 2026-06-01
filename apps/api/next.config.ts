import type { NextConfig } from 'next'

const config: NextConfig = {
  // Compila los paquetes del workspace (que exportan TS source).
  transpilePackages: ['@tindivo/contracts', '@tindivo/core', '@tindivo/supabase'],
  // API-only: sin optimización de imágenes ni assets de página.
  poweredByHeader: false,
}

export default config
