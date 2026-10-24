// Resultado de una lectura de la base, sin imports de Deno para poder probarlo desde vitest
// (apps/api/lib/__tests__/send-push-must.test.ts).
//
// Una lectura que falla NO es «cero destinatarios»: si decide a quién se avisa y se descarta su
// `error`, el evento terminaría como entregado (`push_done_at`) sin que nadie lo recibiera.
// `must` convierte el error en excepción para que caiga en el `catch` final de la función (500,
// sin marcar el final) y el reintento de la base lo vuelva a intentar. Un resultado vacío sin
// error (`data` null o []) es legítimo y sigue devolviéndose tal cual.

export type DbResult<T> = { data: T; error: { code?: string; message: string } | null }

/** Devuelve `data`, o lanza si hubo `error`. El mensaje lleva solo el código, nunca datos personales. */
export function must<T>(r: DbResult<T>, what: string): T {
  if (r.error) throw new Error(`[send-push] ${what}: ${r.error.code ?? 'sin_codigo'}`)
  return r.data
}
