import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Resolución del alias `@/*` que declara `apps/api/tsconfig.json`.
 *
 * Hace falta para los tests que ejercitan un route handler de Next: el handler
 * se importa como un módulo normal, pero por dentro hace
 * `import ... from '@/lib/http/auth'` y vitest —que no lee los `paths` del
 * tsconfig— fallaba con "Cannot find package '@/lib/http/auth'".
 */
const root = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: { '@': root },
  },
})
