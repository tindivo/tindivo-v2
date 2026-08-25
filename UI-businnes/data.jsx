// Mock data — Tindivo Negocios v2
// Pollería "El Tumi" — San Jacinto, Áncash
// Corregido: pagos genéricos, source manual/web, presets correctos

const RESTAURANT = {
  name: 'Pollería El Tumi',
  slug: 'el-tumi',
  accent: '#F472B6',
  papelito: 'Rosado',
  district: 'San Jacinto, Áncash',
  supportWhatsapp: '51987100200',
  phone: '987 451 203',
  tagline: 'Pollo a la brasa de leña desde 1998',
  deliveryFee: 3,
  etaMin: 25,
  etaMax: 40,
  publishesCatalog: true,
  acceptsWebPickup: true,
  acceptsWebDelivery: true,
  usesTindivoDrivers: true,
  primaryCapability: 'Delivery web + recojo',
  isBlocked: false,
  platformOpen: true,
};

// ─── Payment methods (new unified spec) ───────────────────────────────────────
// prepaid           → "Ya pagó"
// pending_wallet    → "Cobrar con billetera digital"
// pending_cash      → "Cobrar en efectivo"  (default)
// pending_mixed     → "Billetera digital + Efectivo"

// ─── Source ───────────────────────────────────────────────────────────────────
// 'web'    → pedido del cliente desde la PWA pública
// 'manual' → creado por el cajero (llamada telefónica)

const ORDERS = [
  // ── web, pending_acceptance, countdown, items desglosados ──────────────────
  {
    id: 'A8K23F',
    source: 'web',
    state: 'pending_acceptance',
    countdownSec: 212,
    customer: 'María Quispe',
    phone: '987 234 561',
    method: 'delivery',
    payment: 'pending_cash',
    addressRef: 'Jr. San Martín 245 — Casa azul, al lado de la bodega Lucy',
    items: [
      { qty: 1, name: 'Pollo entero a la brasa', price: 48 },
      { qty: 1, name: 'Chicha morada 1L', price: 7 },
    ],
    subtotal: 55, delivery: 3, total: 58,
    createdMinAgo: 1,
  },

  // ── manual, waiting_driver (recién creado) ─────────────────────────────────
  {
    id: 'B2M91X',
    source: 'manual',
    state: 'waiting_driver',
    customer: 'Carlos Mendoza',
    phone: '954 102 887',
    method: 'delivery',
    payment: 'pending_wallet',
    addressRef: 'Av. Industrial 1820 · Frente a la panadería Don José',
    amount: 39,
    subtotal: 39, delivery: 3, total: 39,
    createdMinAgo: 2,
  },

  // ── web, confirmed (aceptado, elige prep time) ─────────────────────────────
  {
    id: 'C7P44J',
    source: 'web',
    state: 'confirmed',
    customer: 'Roxana Vega',
    phone: '999 451 200',
    method: 'pickup',
    payment: 'pending_wallet',
    addressRef: '',
    items: [
      { qty: 1, name: '1/2 pollo + papas + ensalada', price: 28 },
      { qty: 2, name: 'Gaseosa personal', price: 8 },
    ],
    subtotal: 36, delivery: 0, total: 36,
    prepDefault: 20,
    createdMinAgo: 3,
  },

  // ── manual, preparing, sin extensión ──────────────────────────────────────
  {
    id: 'D5N12K',
    source: 'manual',
    state: 'preparing',
    customer: 'Jorge Salinas',
    phone: '987 003 451',
    method: 'delivery',
    payment: 'pending_cash',
    addressRef: 'Jr. Bolívar 412 · Casa 2 pisos, reja verde',
    amount: 52,
    paysWith: 60,
    cashChange: 8,
    subtotal: 52, delivery: 3, total: 52,
    prepMinutes: 25, minutesLeft: 17,
    extensionUsed: false,
    createdMinAgo: 8,
  },

  // ── web, preparing, con extensión ya usada ─────────────────────────────────
  {
    id: 'E9R66B',
    source: 'web',
    state: 'preparing',
    customer: 'Familia Huamán',
    phone: '978 121 845',
    method: 'delivery',
    payment: 'prepaid',
    addressRef: 'Pasaje Las Flores 14 · Casa con techo rojo',
    items: [
      { qty: 2, name: 'Pollo entero a la brasa', price: 96 },
      { qty: 1, name: 'Inca Kola 3L', price: 14 },
    ],
    subtotal: 110, delivery: 3, total: 113,
    prepMinutes: 35, minutesLeft: 9,
    extensionUsed: true, extensionMinutes: 10,
    createdMinAgo: 28,
  },

  // ── manual, waiting_driver con cobro mixto + vuelto ────────────────────────
  {
    id: 'F4L78D',
    source: 'manual',
    state: 'waiting_driver',
    customer: 'Diego Tapia',
    phone: '978 220 901',
    method: 'delivery',
    payment: 'pending_mixed',
    addressRef: 'Av. Industrial 2045',
    amount: 45,
    walletPart: 20, cashPart: 25,
    paysWith: 30, cashChange: 5,
    subtotal: 45, delivery: 3, total: 45,
    readyMinAgo: 3,
    createdMinAgo: 18,
  },

  // ── web, heading_to_restaurant, extensión disponible ──────────────────────
  {
    id: 'G2T55Y',
    source: 'web',
    state: 'heading_to_restaurant',
    customer: 'Pedro Cárdenas',
    phone: '922 778 110',
    method: 'delivery',
    payment: 'pending_cash',
    addressRef: 'Av. Túpac Amaru 902 · Tienda de abarrotes Cárdenas',
    items: [
      { qty: 1, name: '1/4 de pollo + papas', price: 14 },
      { qty: 1, name: 'Sangucito de pollo', price: 9 },
    ],
    subtotal: 23, delivery: 3, total: 26,
    driver: 'Andy R.', driverEta: 4,
    extensionUsed: false,
    createdMinAgo: 22,
  },

  // ── manual, picked_up ──────────────────────────────────────────────────────
  {
    id: 'H6V89P',
    source: 'manual',
    state: 'picked_up',
    customer: 'Lucía Romero',
    phone: '987 451 333',
    method: 'delivery',
    payment: 'pending_wallet',
    addressRef: 'Jr. San Martín 1102',
    amount: 31,
    subtotal: 31, delivery: 3, total: 31,
    driver: 'Juan P.', driverEta: 6,
    createdMinAgo: 35,
  },
];

const HISTORY_TODAY = [
  {
    id: 'Z9K12A', source: 'web',
    customer: 'Ana Solís', total: 32, payment: 'pending_cash',
    state: 'delivered', method: 'delivery', closedAt: '19:42',
  },
  {
    id: 'Y3M88B', source: 'manual',
    customer: 'Marcos Rivas', total: 58, payment: 'prepaid',
    state: 'delivered', method: 'delivery', closedAt: '19:18',
  },
  {
    id: 'X7N40C', source: 'web',
    customer: 'Cliente nuevo', total: 51, payment: 'pending_cash',
    state: 'cancelled', reason: 'No contestó', method: 'delivery', closedAt: '18:55',
  },
  {
    id: 'W4P22D', source: 'manual',
    customer: 'Sara Quispe', total: 26, payment: 'pending_wallet',
    state: 'delivered', method: 'delivery', closedAt: '18:30',
  },
  {
    id: 'V8Q66E', source: 'web',
    customer: 'Luis Morales', total: 44, payment: 'pending_mixed',
    state: 'delivered', method: 'pickup', closedAt: '18:12',
  },
  {
    id: 'U2X33F', source: 'manual',
    customer: 'Rosa Díaz', total: 18, payment: 'pending_cash',
    state: 'delivered', method: 'delivery', closedAt: '17:50',
  },
  {
    id: 'T1Y44G', source: 'web',
    customer: 'Fernando León', total: 67, payment: 'prepaid',
    state: 'delivered', method: 'delivery', closedAt: '17:22',
  },
  {
    id: 'S5Z11H', source: 'manual',
    customer: 'Cliente', total: 22, payment: 'pending_cash',
    state: 'cancelled', reason: 'Restaurante canceló', method: 'delivery', closedAt: '17:05',
  },
];

// Presets de tiempo de preparación (HU-R-008)
const PREP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50];
const PREP_DEFAULT = 20;

const MENU = [
  {
    id: 'cat1', name: 'Pollo a la brasa',
    items: [
      { id: 'i1', name: 'Pollo entero', price: 48, available: true, featured: true, note: 'incluye papas + ensalada' },
      { id: 'i2', name: '1/2 pollo + papas + ensalada', price: 28, available: true, featured: true },
      { id: 'i3', name: '1/4 de pollo + papas', price: 14, available: true },
      { id: 'i4', name: '1/8 personal + papas', price: 9, available: false },
    ],
  },
  {
    id: 'cat2', name: 'Broaster',
    items: [
      { id: 'i5', name: 'Broaster familiar (8 piezas)', price: 42, available: true, featured: true, note: 'con papas y cremas' },
      { id: 'i6', name: 'Broaster personal (3 piezas)', price: 18, available: true },
      { id: 'i7', name: 'Alitas BBQ (6 piezas)', price: 22, available: false, note: 'agotado hasta jueves' },
    ],
  },
  {
    id: 'cat3', name: 'Sanguches',
    items: [
      { id: 'i8', name: 'Sangucito de pollo', price: 9, available: true },
      { id: 'i9', name: 'Pan con chicharrón', price: 12, available: true },
    ],
  },
  {
    id: 'cat4', name: 'Bebidas',
    items: [
      { id: 'i10', name: 'Chicha morada 1L', price: 7, available: true },
      { id: 'i11', name: 'Inca Kola 1.5L', price: 8, available: true },
      { id: 'i12', name: 'Inca Kola 3L', price: 14, available: true },
      { id: 'i13', name: 'Gaseosa personal', price: 4, available: true },
    ],
  },
];

const CASH_SETTLEMENTS = [
  {
    id: 's1', date: 'Hoy · 23:15', driver: 'Andy R.', driverPhone: '987 102 334',
    orders: [
      { id: 'A8K23F', total: 58 },
      { id: 'G2T55Y', total: 26 },
      { id: 'Z9K12A', total: 32 },
      { id: 'V8Q66E', total: 44 },
    ],
    expectedCash: 160, reportedCash: 160,
    state: 'pending_confirmation',
  },
  {
    id: 's2', date: 'Hoy · 22:48', driver: 'Juan P.', driverPhone: '978 451 220',
    orders: [
      { id: 'X7N40C', total: 51 },
      { id: 'W4P22D', total: 26 },
    ],
    expectedCash: 77, reportedCash: 75,
    state: 'pending_confirmation', flagDiff: true,
  },
  {
    id: 's3', date: 'Ayer · 23:30', driver: 'Andy R.',
    orders: [{ id: 'U2X33F', total: 88 }, { id: 'T1Y44G', total: 42 }],
    expectedCash: 130, reportedCash: 130,
    state: 'confirmed',
  },
  {
    id: 's4', date: 'Ayer · 22:10', driver: 'Carlos M.',
    orders: [{ id: 'S5Z11H', total: 64 }],
    expectedCash: 64, reportedCash: 50, businessCount: 60,
    state: 'disputed', note: 'Faltó S/14. Andy dice que cobró completo pero solo entregó S/50.',
  },
];

const DEBT = {
  balance: 124.50,
  isBlocked: false,
  blockThreshold: 300,
  nextSettlement: 'Lunes 9 jun · S/124.50',
  weeklyCommission: 0.12,
  settlements: [
    { week: '26 may – 1 jun', orders: 84, amount: 142.30, state: 'paid', paidAt: '2 jun' },
    { week: '19 – 25 may', orders: 92, amount: 158.40, state: 'paid', paidAt: '26 may' },
    { week: '12 – 18 may', orders: 78, amount: 133.20, state: 'paid', paidAt: '19 may' },
    { week: '5 – 11 may', orders: 66, amount: 118.80, state: 'paid', paidAt: '12 may' },
  ],
  advances: [
    {
      id: 'adv1', amount: 18, orderId: 'L9K23A',
      reason: 'Reembolso a cliente: pollo crudo según foto enviada',
      date: 'Hace 14 h', actor: 'restaurante', state: 'activo', canDispute: true, hoursLeft: 33,
    },
    {
      id: 'adv2', amount: 12, orderId: 'K3M77B',
      reason: 'Compensación delivery: pedido entregado 50 min tarde',
      date: 'Hace 2 días', actor: 'restaurante', state: 'activo', canDispute: false,
    },
    {
      id: 'adv3', amount: 32, orderId: 'J7P11C',
      reason: 'Reembolso por anulación: cocina cerró antes',
      date: 'Hace 5 días', actor: 'restaurante', state: 'disputado', canDispute: false,
    },
  ],
};

Object.assign(window, {
  RESTAURANT, ORDERS, HISTORY_TODAY, MENU, CASH_SETTLEMENTS, DEBT,
  PREP_PRESETS, PREP_DEFAULT,
});
