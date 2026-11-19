#!/usr/bin/env node
/** Tras `supabase db reset` Auth y Storage locales tardan unos segundos en volver: espera sus /health (máx. 90 s). */
const URLS = ['http://127.0.0.1:54321/auth/v1/health', 'http://127.0.0.1:54321/storage/v1/status']
async function up(url) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(3000) })).ok
  } catch {
    return false
  }
}
for (let i = 0; i < 45; i++) {
  if ((await Promise.all(URLS.map(up))).every(Boolean)) {
    await new Promise((r) => setTimeout(r, 3000)) // margen: el health responde antes de aceptar escrituras
    process.exit(0)
  }
  await new Promise((r) => setTimeout(r, 2000))
}
console.error('Auth o Storage locales no respondieron en 90 s.')
process.exit(1)
