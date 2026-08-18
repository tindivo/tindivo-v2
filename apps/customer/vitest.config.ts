import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/**
 * El alias `@/` que ya declara `tsconfig.json` (`"@/*": ["./*"]`).
 *
 * Sin esto, vitest solo puede probar módulos que no usen el alias **ni
 * directamente ni a través de sus imports**, y esa segunda parte es la que
 * muerde: `features/tracking/lib/format.ts` se importa con ruta relativa, pero
 * él a su vez hace `export { soles } from '@/lib/format'` y el test revienta
 * con «Cannot find package '@/lib/format'». El módulo bajo prueba no tiene la
 * culpa; le faltaba la resolución al runner.
 *
 * TypeScript no lo detecta —resuelve por `paths` y compila igual— así que el
 * síntoma aparece solo al ejecutar los tests.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
    },
  },
})
