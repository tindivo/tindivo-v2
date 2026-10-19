/** Generador de identificadores inyectable. */
export interface IdGenerator {
  uuid(): string
}

export const randomIdGenerator: IdGenerator = {
  uuid: () => crypto.randomUUID(),
}
