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
} as const

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
]
