import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

// Raíz del monorepo. `fileURLToPath` y no `new URL(...).pathname`: en Windows ese
// `pathname` llega con el espacio de «Tinkuy Creativo» escapado como %20 y con
// una barra delante de la letra de unidad, así que ninguna ruta que salga de él
// existe. Mismo motivo que documenta `scripts/check-deploy-order.mjs`.
const MONOREPO_ROOT = fileURLToPath(new URL('../../', import.meta.url))

const config: NextConfig = {
  // Compila los paquetes del workspace (que exportan TS source).
  transpilePackages: ['@tindivo/contracts', '@tindivo/core', '@tindivo/supabase'],
  // API-only: sin optimización de imágenes ni assets de página.
  poweredByHeader: false,
  // `puppeteer-core` y `@sparticuz/chromium` (reporte PDF de rendimiento) traen
  // binarios nativos: si Next intenta empaquetarlos como cualquier import, el
  // bundle de la función serverless revienta de tamaño. `serverExternalPackages`
  // los deja como `require()` real, resueltos desde `node_modules` en runtime.
  serverExternalPackages: ['puppeteer-core', '@sparticuz/chromium'],
  //
  // La traza se calcula desde la raíz del monorepo, no desde `apps/api`: con
  // pnpm los paquetes reales viven en `<raíz>/node_modules/.pnpm/...` y lo que
  // hay bajo `apps/api/node_modules` son enlaces. Sin esto, todo lo que se
  // incluya a mano desde fuera de `apps/api` se queda fuera del bundle.
  outputFileTracingRoot: MONOREPO_ROOT,
  //
  // ESTO ES LO QUE TUMBÓ EL PDF EN PRODUCCIÓN (2026-09-08). Y no falló al
  // desplegar, falló al pulsar el botón:
  //
  //   Error: The input directory "/var/task/node_modules/.pnpm/
  //   @sparticuz+chromium@149.0.0/node_modules/@sparticuz/chromium/bin"
  //   does not exist.
  //
  // `serverExternalPackages` (arriba) hizo su parte: el paquete NO se empaquetó
  // y su ruta en runtime era la real de pnpm, no una reescrita por el bundler.
  // Lo que faltó es distinto — que Next COPIARA al bundle de la función la
  // carpeta `bin/` con los cuatro `.br` (chromium, fonts, swiftshader,
  // al2023: 65 MB). El JS del paquete viajó; sus binarios no.
  //
  // Por qué el trazador no los ve solo: `@sparticuz/chromium` localiza su `bin`
  // en tiempo de ejecución con `join(dirname(fileURLToPath(import.meta.url)),
  // '..', 'bin')` (su `build/paths.js`). Eso no es un `require()`, así que el
  // análisis estático de nft no tiene ningún import al que seguir. Hay que
  // decírselo a mano.
  //
  // Los patrones se resuelven desde el directorio del PROYECTO (`apps/api`, el
  // que tiene este fichero), no desde `outputFileTracingRoot`; esa raíz solo
  // amplía hasta dónde se PUEDE llegar. De ahí el `../../` del segundo.
  //
  // Y son el MISMO directorio por dos caminos —el enlace bajo
  // `apps/api/node_modules` y la ruta real del store de pnpm—, porque basta con
  // que acierte uno y depende de si el glob sigue enlaces simbólicos. Un patrón
  // que no case no rompe nada, así que se dejan los dos en vez de apostar.
  //
  // La clave es la RUTA DE LA RUTA, no el fichero: si algún día se mueve el
  // endpoint, hay que moverla aquí o el PDF vuelve a romperse exactamente igual.
  outputFileTracingIncludes: {
    '/api/v1/business/reports/rendimiento/pdf': [
      './node_modules/@sparticuz/chromium/bin/**/*',
      '../../node_modules/.pnpm/@sparticuz+chromium@*/node_modules/@sparticuz/chromium/bin/**/*',
    ],
  },
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
