import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': resolve(__dirname, './') } },
  test: {
    // El export lo genera `next build`; tarda más que una prueba unitaria.
    testTimeout: 30_000,
  },
})
