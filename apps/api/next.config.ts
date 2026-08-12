import type { NextConfig } from 'next'

const config: NextConfig = {
  // Compila los paquetes del workspace (que exportan TS source).
  transpilePackages: ['@tindivo/contracts', '@tindivo/core', '@tindivo/supabase'],
  // API-only: sin optimización de imágenes ni assets de página.
  poweredByHeader: false,
  //
  // AQUÍ NO VA CORS. Vivía aquí un bloque `headers()` que ponía
  // `Access-Control-Allow-Origin: *` a todo `/api/:path*`, y tumbó el registro
  // del piloto en producción (2026-08-12):
  //
  //   blocked by CORS policy: The value of the 'Access-Control-Allow-Origin'
  //   header in the response must not be the wildcard '*' when the request's
  //   credentials mode is 'include'.
  //
  // `packages/api-client` manda `credentials: 'include'` en TODAS las peticiones
  // (`src/index.ts`), y con credenciales el navegador exige un origen CONCRETO:
  // el comodín no es que sea laxo, es que NUNCA funciona. Además se emitía junto
  // a `Allow-Credentials: true`, combinación que el propio spec prohíbe.
  //
  // Y no se podía arreglar aquí: `headers()` es ESTÁTICO —se resuelve sin ver la
  // petición—, así que no puede devolver el `Origin` de quien llama, que es
  // justo lo que CORS con credenciales necesita. Eso solo se hace por petición.
  //
  // El CORS de verdad está en `lib/http/cors.ts` y lo aplican las rutas: 71 de
  // las 72 lo llaman (la excepción es `/api/inngest`, webhook server-to-server
  // sin navegador de por medio). Este bloque no añadía nada: solo pisaba con un
  // comodín inservible lo que las rutas ya calculaban bien.
}

export default config
