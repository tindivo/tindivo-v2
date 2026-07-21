import type { NextConfig } from 'next'

const config: NextConfig = {
  // Compila los paquetes del workspace (que exportan TS source).
  transpilePackages: ['@tindivo/contracts', '@tindivo/core', '@tindivo/supabase'],
  // API-only: sin optimización de imágenes ni assets de página.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT,OPTIONS' },
          {
            key: 'Access-Control-Allow-Headers',
            value:
              'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, Idempotency-Key, X-Request-Id',
          },
        ],
      },
    ]
  },
}

export default config
