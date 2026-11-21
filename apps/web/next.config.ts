import type { NextConfig } from 'next'

const config: NextConfig = {
  // Web 100 % estática: `next build` deja el sitio en `out/`, sin servidor, sin sesión y sin API.
  output: 'export',
  // `terminos/index.html` en vez de `terminos.html`: cualquier servidor estático responde 200 en `/terminos/`.
  trailingSlash: true,
  transpilePackages: ['@tindivo/legal'],
  poweredByHeader: false,
  images: { unoptimized: true },
}

export default config
