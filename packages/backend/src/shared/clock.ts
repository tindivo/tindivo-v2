/** Reloj inyectable: los casos de uso piden la hora aquí y no a `Date` (TS-4). */
export interface Clock {
  now(): Date
}

export const systemClock: Clock = {
  now: () => new Date(),
}
