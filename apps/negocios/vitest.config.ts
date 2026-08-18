import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * El alias `@/` que ya declara `tsconfig.json` (`"@/*": ["./*"]`).
 *
 * Vitest no lee los `paths` del tsconfig, así que sin esto no se puede probar
 * ningún módulo que use el alias **ni directamente ni a través de sus imports**.
 * Esa segunda parte es la que muerde: un test puede importar con ruta relativa y
 * fallar igual porque el módulo importado hace `from '@/...'` por dentro.
 *
 * TypeScript no lo detecta —resuelve por `paths` y compila igual—, así que el
 * síntoma solo aparece al ejecutar los tests, y se lee como si el módulo bajo
 * prueba estuviera roto.
 *
 * `apps/api` ya tenía esta resolución con el mismo motivo documentado; faltaba
 * propagarla. Cuando se añadió aquí había 63 ficheros en `negocios` y 49 en
 * `motorizados` que no se podían cubrir por esto, incluidos los `lib/sign-out.ts`
 * de ambas.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
})
