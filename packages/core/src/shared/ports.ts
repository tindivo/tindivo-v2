/**
 * Puertos (interfaces) del dominio. La infraestructura (apps/api, @tindivo/supabase)
 * provee las implementaciones. El dominio nunca importa Supabase/Next directamente.
 */

/** Reloj inyectable (testeable; evita `new Date()` esparcido por el dominio). */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}

/** Generador de identificadores del dominio. */
export interface IdGenerator {
  /** UUID v4 para PKs. */
  uuid(): string
  /** short_id de 8 chars (alfabeto sin I/O/0/1) para tracking público. */
  shortId(): string
}
