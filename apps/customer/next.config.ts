import type { NextConfig } from 'next'

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
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

export default config
