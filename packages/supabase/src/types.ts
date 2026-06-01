import type { Database } from './database.types'

export type { Database }

/** Fila de una tabla pública. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']

/** Payload de inserción de una tabla pública. */
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']

/** Payload de actualización de una tabla pública. */
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']

/** Valores de un enum del esquema público (mapea 1:1 con @tindivo/contracts). */
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]
