import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@tindivo/ui', '@tindivo/api-client', '@tindivo/contracts'],
  poweredByHeader: false,
}

export default config
