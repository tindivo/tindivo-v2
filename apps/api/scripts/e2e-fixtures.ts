/**
 * IDs y datos fijos del mundo e2e — SOLO DB LOCAL.
 *
 * Los UUIDs son constantes conocidas: es lo que hace idempotente al seed
 * (upsert por id) y lo que permite a la limpieza identificar con precisión
 * qué es "de prueba" sin tocar nada más.
 *
 * El prefijo e2e00000 hace evidente de un vistazo que una fila es del e2e.
 */

export const E2E = {
  PASSWORD: 'e2e-password-12345',

  // ── Usuarios ──────────────────────────────────────────────────────────────
  BUSINESS_USER_ID: 'e2e00000-0000-4000-8000-000000000001',
  DRIVER_USER_ID: 'e2e00000-0000-4000-8000-000000000002',
  /** MARCADOR de limpieza: todo pedido de prueba cuelga de este cliente. */
  CUSTOMER_USER_ID: 'e2e00000-0000-4000-8000-000000000003',

  BUSINESS_EMAIL: 'negocio@e2e.local',
  DRIVER_EMAIL: 'motorizado@e2e.local',
  CUSTOMER_EMAIL: 'cliente@e2e.local',

  // ── Negocio ───────────────────────────────────────────────────────────────
  BUSINESS_ID: 'e2e00000-0000-4000-8000-000000000010',
  BUSINESS_NAME: 'La Florencia E2E',
  BUSINESS_LAT: -9.1465,
  BUSINESS_LNG: -78.2779,

  /**
   * Segundo negocio, deliberadamente SIN motorizados asignados.
   *
   * Existe para probar el aislamiento de la RLS: un pedido suyo no debe ser
   * visible para ningún motorizado de La Florencia, por muy abierta que tenga
   * la ventana de cola. Sin este negocio no hay forma de distinguir "la policy
   * filtra bien" de "solo hay un negocio y por eso todo cuadra".
   */
  BUSINESS_2_USER_ID: 'e2e00000-0000-4000-8000-0000000000a1',
  BUSINESS_2_EMAIL: 'negocio2@e2e.local',
  BUSINESS_2_ID: 'e2e00000-0000-4000-8000-0000000000b1',
  BUSINESS_2_NAME: 'Otro Negocio E2E',
  BUSINESS_2_SCHEDULE_IDS: [
    'e2e00000-0000-4000-8000-0000000000c0',
    'e2e00000-0000-4000-8000-0000000000c1',
    'e2e00000-0000-4000-8000-0000000000c2',
    'e2e00000-0000-4000-8000-0000000000c3',
    'e2e00000-0000-4000-8000-0000000000c4',
    'e2e00000-0000-4000-8000-0000000000c5',
    'e2e00000-0000-4000-8000-0000000000c6',
  ],
  /** Un horario por día de la semana (0=domingo … 6=sábado). */
  SCHEDULE_IDS: [
    'e2e00000-0000-4000-8000-000000000020',
    'e2e00000-0000-4000-8000-000000000021',
    'e2e00000-0000-4000-8000-000000000022',
    'e2e00000-0000-4000-8000-000000000023',
    'e2e00000-0000-4000-8000-000000000024',
    'e2e00000-0000-4000-8000-000000000025',
    'e2e00000-0000-4000-8000-000000000026',
  ],

  // ── Menú ──────────────────────────────────────────────────────────────────
  CATEGORY_ID: 'e2e00000-0000-4000-8000-000000000030',
  /** El único item con grupo de modificadores. */
  ITEM_POLLO_ID: 'e2e00000-0000-4000-8000-000000000031',
  ITEM_POLLO_NAME: 'Pollo entero',
  ITEM_MEDIO_ID: 'e2e00000-0000-4000-8000-000000000032',
  ITEM_GASEOSA_ID: 'e2e00000-0000-4000-8000-000000000033',
  MODGROUP_ID: 'e2e00000-0000-4000-8000-000000000040',
  MODOPT_QUESO_ID: 'e2e00000-0000-4000-8000-000000000041',
  MODOPT_QUESO_NAME: 'Extra queso',
  MODOPT_PAPAS_ID: 'e2e00000-0000-4000-8000-000000000042',
  MODOPT_AJI_ID: 'e2e00000-0000-4000-8000-000000000043',

  // ── Motorizado ────────────────────────────────────────────────────────────
  DRIVER_ID: 'e2e00000-0000-4000-8000-000000000050',

  /**
   * Segundo motorizado, asignado al MISMO negocio que el primero.
   *
   * Habilita dos cosas que con un solo motorizado no se pueden probar:
   *   - Concurrencia real sobre el pool: dos motorizados compitiendo por el
   *     mismo pedido, que es lo que cubre el FOR UPDATE de advance_order.
   *   - Aislamiento por `driver_id`: un pedido ya tomado por este no debe
   *     aparecerle al otro.
   */
  DRIVER_2_USER_ID: 'e2e00000-0000-4000-8000-0000000000a2',
  DRIVER_2_EMAIL: 'motorizado2@e2e.local',
  DRIVER_2_ID: 'e2e00000-0000-4000-8000-0000000000d2',

  // ── Cliente ───────────────────────────────────────────────────────────────
  ADDRESS_ID: 'e2e00000-0000-4000-8000-000000000060',
  CUSTOMER_PHONE: '+51900000003',
  CUSTOMER_ADDRESS: 'Jr. Los Pinos 123',
  CUSTOMER_REFERENCE: 'Portón azul, frente al parque',
  /**
   * Coordenadas VERIFICADAS dentro de la zona: se comprobó con
   * `SELECT public.point_in_coverage_polygon(-9.1510, -78.2800)` -> true.
   * (Control negativo: (-9.1600, -78.3000) -> false.)
   */
  CUSTOMER_LAT: -9.151,
  CUSTOMER_LNG: -78.28,

  /**
   * Los tres clientes de prueba, en orden. El primero es el histórico
   * (`CUSTOMER_USER_ID`); los otros dos existen para poder correr recorridos en
   * paralelo contra el mismo negocio.
   *
   * `create_customer_order` bloquea un segundo pedido ACTIVO del mismo cliente
   * en el mismo negocio. Con un solo cliente, los recorridos de prueba tendrían
   * que encadenarse: terminar uno hasta `delivered` antes de empezar el
   * siguiente, y cualquier pedido atascado dejaría la suite bloqueada.
   *
   * Comparten dirección y coordenadas con el principal — verificadas dentro del
   * polígono de cobertura. Solo cambian id, email, teléfono y el id de la
   * dirección.
   */
  CUSTOMERS: [
    {
      userId: 'e2e00000-0000-4000-8000-000000000003',
      email: 'cliente@e2e.local',
      fullName: 'Cliente E2E',
      phone: '+51900000003',
      addressId: 'e2e00000-0000-4000-8000-000000000060',
    },
    {
      userId: 'e2e00000-0000-4000-8000-000000000004',
      email: 'cliente2@e2e.local',
      fullName: 'Cliente E2E 2',
      phone: '+51900000004',
      addressId: 'e2e00000-0000-4000-8000-000000000061',
    },
    {
      userId: 'e2e00000-0000-4000-8000-000000000005',
      email: 'cliente3@e2e.local',
      fullName: 'Cliente E2E 3',
      phone: '+51900000005',
      addressId: 'e2e00000-0000-4000-8000-000000000062',
    },
  ],
} as const

/** Ids de los tres clientes de prueba. Marcador de limpieza de transaccionales. */
export const E2E_CUSTOMER_USER_IDS: readonly string[] = E2E.CUSTOMERS.map((c) => c.userId)

/**
 * Anon key del stack local de Supabase CLI. Es pública y está en su
 * documentación, igual que la service_role que hardcodea
 * `lib/__tests__/helpers/local-db.ts`. Se lee del entorno si está definida para
 * no romper si alguien levanta el stack con otras llaves.
 */
const LOCAL_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/**
 * Ajustes que el seed SOBRESCRIBE en local para que el e2e sea determinista.
 *
 * Las migraciones siembran estas claves con los valores reales de operación
 * (`platform_schedule` 18:00-23:00 y `order_intake_cutoff` 22:30), que impedirían
 * crear pedidos fuera de la tarde-noche. En local se abren 24h para que la suite
 * pueda correr a cualquier hora.
 *
 * El resto de claves (timers, comisiones, coverage_polygon, prepay_threshold…)
 * NO se tocan: se usan tal cual las dejan las migraciones.
 */
export const LOCAL_ONLY_SETTINGS = [
  {
    key: 'platform_schedule',
    value: {
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      startHHMM: '00:00',
      endHHMM: '23:59',
    },
  },
  { key: 'order_intake_cutoff', value: '23:59' },
  /**
   * El outbox dispara push por `net.http_post` contra la URL que hay aquí. La
   * 0088 la fija al proyecto de PRODUCCIÓN, así que sin esto un cambio de
   * estado en la base local golpea la Edge Function de producción — y el día
   * que producción tenga suscripciones reales, un pedido de prueba avisaría a
   * motorizados de verdad.
   *
   * `host.docker.internal` porque quien hace la petición es pg_net, desde
   * DENTRO del contenedor de Postgres: `127.0.0.1` sería el propio contenedor.
   */
  {
    key: 'push_dispatch',
    value: {
      url: 'http://host.docker.internal:54321/functions/v1/send-push',
      anonKey: LOCAL_ANON_KEY,
    },
  },
]
