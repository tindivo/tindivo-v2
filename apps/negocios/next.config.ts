import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: [
    '@tindivo/ui',
    '@tindivo/api-client',
    '@tindivo/contracts',
    '@tindivo/images',
    '@tindivo/supabase',
  ],
  poweredByHeader: false,
}

export default config
