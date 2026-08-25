// pedidos-data.jsx v3 — 3 columnas: Nuevos / En cocina / En reparto
// ORDERS_COOKING ahora incluye todos los sub-estados (cooking → buffer → heading → waiting)

// ── Columna 1: NUEVOS (pending_acceptance, solo Online/web) ──────────────────
const ORDERS_NEW = [
  // Efectivo — countdown 3:32
  {
    id: 'A8K23F', source: 'web', state: 'pending_acceptance',
    countdownSec: 212,
    customer: 'María Quispe', phone: '987 234 561',
    method: 'delivery', payment: 'pending_cash',
    addressRef: 'Jr. San Martín 245 — Casa azul, al lado de la bodega Lucy',
    items: [
      { qty: 1, name: 'Pizza Hawaiana', mods: 'Familiar · Doble queso', price: 33, note: '' },
      { qty: 1, name: 'Chicha morada', mods: '', price: 2.50, note: '' },
    ],
    subtotal: 35.50, deliveryFee: 3, total: 38.50,
    paysWith: 50, cashChange: 11.50,
    createdMinAgo: 1,
  },
  // Billetera — countdown 2:25
  {
    id: 'B4K77M', source: 'web', state: 'pending_acceptance',
    countdownSec: 145,
    customer: 'Carla Mamani', phone: '978 330 201',
    method: 'delivery', payment: 'pending_wallet',
    addressRef: 'Av. Grau 555 — Edificio Los Alamos, piso 2',
    items: [
      { qty: 1, name: 'Broaster familiar (8 piezas)', mods: '', price: 42, note: 'Sin salsa en la bolsa' },
      { qty: 1, name: 'Inca Kola 1.5L', mods: '', price: 8, note: '' },
    ],
    subtotal: 50, deliveryFee: 3, total: 53,
    createdMinAgo: 2,
  },
  // Prepago — countdown 4:47, con comprobante
  {
    id: 'C9P22D', source: 'web', state: 'pending_acceptance',
    countdownSec: 287,
    customer: 'Diego Torres', phone: '987 654 321',
    method: 'delivery', payment: 'prepaid',
    addressRef: 'Calle Los Pinos 88 — Frente al parque infantil',
    items: [
      { qty: 2, name: 'Sanguchón de pollo', mods: 'Mayonesa, Ketchup, Ají', price: 24, note: '' },
      { qty: 1, name: 'Chicha morada', mods: '', price: 2.50, note: 'Sin hielo por favor' },
    ],
    subtotal: 26.50, deliveryFee: 3, total: 29.50,
    proofUrl: 'proof-placeholder',
    proofVerified: false,
    createdMinAgo: 1,
  },
];

// ── Columna 2: EN COCINA (todos los estados hasta picked_up) ─────────────────
// sub-estados: cooking | buffer_p1 | buffer_p2 | buffer_p3 | heading | waiting
const ORDERS_COOKING = [
  // 1. Online · cocinando · 22 min restantes
  {
    id: 'D2M91X', source: 'web', state: 'cooking',
    customer: 'José Mamani', phone: '954 102 887',
    method: 'delivery', payment: 'pending_wallet',
    addressRef: 'Av. Túpac Amaru 902 — Tienda de abarrotes Mamani',
    items: [
      { qty: 2, name: 'Broaster personal (3 piezas)', mods: '', price: 36, note: '' },
      { qty: 1, name: 'Inca Kola 1.5L', mods: '', price: 8, note: '' },
    ],
    subtotal: 44, deliveryFee: 3, total: 47,
    prepMinutes: 25, minutesLeft: 22, extensionUsed: false,
    createdMinAgo: 3,
  },
  // 2. Directo · cocinando · 10 min · efectivo con vuelto
  {
    id: 'E7P44J', source: 'manual', state: 'cooking',
    customer: 'Andrea Vargas', phone: '999 451 200',
    method: 'delivery', payment: 'pending_cash',
    addressRef: 'Pasaje Las Flores 14 — Casa con techo rojo',
    amount: 28,
    paysWith: 50, cashChange: 22,
    subtotal: 28, deliveryFee: 3, total: 28,
    prepMinutes: 20, minutesLeft: 10, extensionUsed: false,
    createdMinAgo: 10,
  },
  // 3. Online · cocinando · 4 min · extensión aplicada · mixto
  {
    id: 'F5N12K', source: 'web', state: 'cooking',
    customer: 'Luis Paredes', phone: '987 003 451',
    method: 'delivery', payment: 'pending_mixed',
    addressRef: 'Jr. Bolívar 412 — Casa 2 pisos, reja verde',
    walletPart: 20, cashPart: 15, paysWith: 20, cashChange: 5,
    items: [
      { qty: 1, name: 'Pizza Fullmeat', mods: 'Familiar', price: 37, note: '' },
      { qty: 1, name: 'Sanguchón de pollo', mods: 'Mayonesa, Ají', price: 12, note: '' },
    ],
    subtotal: 49, deliveryFee: 3, total: 52,
    prepMinutes: 35, minutesLeft: 4,
    extensionUsed: true, extensionMin: 10,
    createdMinAgo: 32,
  },
  // 4. Online · buffer fase 1 · 2 min esperando · prepago
  {
    id: 'G9R66B', source: 'web', state: 'buffer_p1',
    bufferMinutes: 2,
    customer: 'Rosa Díaz', phone: '978 121 845',
    method: 'delivery', payment: 'prepaid',
    addressRef: 'Av. Industrial 1820 — Frente a la panadería Don José',
    items: [
      { qty: 1, name: 'Pizza Pepperoni', mods: 'Personal', price: 15, note: '' },
    ],
    subtotal: 15, deliveryFee: 3, total: 18,
    createdMinAgo: 24,
  },
  // 5. Directo · buffer fase 2 · 4 min sin moto · efectivo
  {
    id: 'H4L78D', source: 'manual', state: 'buffer_p2',
    bufferMinutes: 4,
    customer: 'Carlos Huanca', phone: '978 220 901',
    method: 'delivery', payment: 'pending_cash',
    addressRef: 'Jr. San Martín 1102',
    amount: 22, paysWith: 30, cashChange: 8,
    subtotal: 22, deliveryFee: 3, total: 22,
    createdMinAgo: 26,
  },
  // 6. Online · buffer fase 3 · 7 min sin moto · ALARMA
  {
    id: 'I2T55Y', source: 'web', state: 'buffer_p3',
    bufferMinutes: 7,
    customer: 'Juan Quispe', phone: '922 778 110',
    method: 'delivery', payment: 'pending_cash',
    addressRef: 'Calle Los Pinos 88 — Frente al parque',
    items: [
      { qty: 1, name: 'Alitas BBQ (6 piezas)', mods: 'Salsa BBQ', price: 23, note: '' },
      { qty: 1, name: 'Chicha morada', mods: '', price: 2.50, note: '' },
    ],
    subtotal: 25.50, deliveryFee: 3, total: 28.50,
    createdMinAgo: 32,
  },
  // 7. Online · motorizado en camino
  {
    id: 'J6V89P', source: 'web', state: 'heading',
    driver: { name: 'Andy R.', phone: '987 102 334' },
    customer: 'Lucía Romero', phone: '987 451 333',
    method: 'delivery', payment: 'pending_wallet',
    addressRef: 'Av. Grau 555 — Edificio Los Alamos, piso 2',
    items: [
      { qty: 1, name: 'Pizza Hawaiana', mods: 'Familiar · Aceitunas negras', price: 35, note: '' },
    ],
    subtotal: 35, deliveryFee: 3, total: 38,
    createdMinAgo: 30,
  },
  // 8. Directo · motorizado LLEGÓ (CRÍTICO) · vuelto S/15
  {
    id: 'K1W34Q', source: 'manual', state: 'waiting',
    driver: { name: 'Juan P.', phone: '978 451 220', arrivedMinAgo: 1 },
    customer: 'Marco Salinas', phone: '954 003 201',
    method: 'delivery', payment: 'pending_cash',
    addressRef: 'Jr. Libertad 303',
    amount: 35, paysWith: 50, cashChange: 15,
    subtotal: 35, deliveryFee: 3, total: 35,
    createdMinAgo: 28,
  },
];

// ── Columna 3: EN REPARTO (picked_up) ────────────────────────────────────────
const ORDERS_ROUTE = [
  // Normal · 8 min en reparto
  {
    id: 'L7P11C', source: 'web', state: 'picked_up',
    driver: { name: 'Andy R.', phone: '987 102 334' },
    pickupMinAgo: 8,
    customer: 'Fernando León', phone: '987 651 200',
    method: 'delivery', payment: 'pending_wallet',
    addressRef: 'Av. Túpac Amaru 902',
    items: [
      { qty: 1, name: 'Broaster familiar (8 piezas)', mods: '', price: 42, note: '' },
      { qty: 1, name: 'Inca Kola 3L', mods: '', price: 14, note: '' },
    ],
    subtotal: 56, deliveryFee: 3, total: 59,
    createdMinAgo: 38,
  },
  // Demorado · 32 min en reparto (>30 min → badge amarillo)
  {
    id: 'M3M77B', source: 'manual', state: 'picked_up',
    driver: { name: 'Carlos M.', phone: '978 779 100' },
    pickupMinAgo: 32,
    customer: 'Sonia Quispe', phone: '922 445 900',
    method: 'delivery', payment: 'pending_cash',
    addressRef: 'Pasaje Santa Rosa 7 — Puerta marrón',
    amount: 18, subtotal: 18, deliveryFee: 3, total: 18,
    createdMinAgo: 55,
  },
  // Muy demorado · 47 min en reparto (>45 min → badge naranja)
  {
    id: 'N5K44G', source: 'web', state: 'picked_up',
    driver: { name: 'Pedro B.', phone: '987 445 211' },
    pickupMinAgo: 47,
    customer: 'Angela Cruz', phone: '978 003 890',
    method: 'delivery', payment: 'prepaid',
    addressRef: 'Av. Industrial 2045 — Taller mecánico Inca',
    items: [
      { qty: 1, name: 'Pizza Hawaiana', mods: 'Fiesta', price: 41, note: '' },
    ],
    subtotal: 41, deliveryFee: 3, total: 44,
    createdMinAgo: 62,
  },
];

// ── Historial ─────────────────────────────────────────────────────────────────
const HISTORY_SHIFT = [
  { id: 'Z9K12A', source: 'web',    customer: 'Ana Solís',      total: 32, payment: 'pending_cash',   state: 'delivered', closedAt: '19:42' },
  { id: 'Y3M88B', source: 'manual', customer: 'Marcos Rivas',   total: 58, payment: 'prepaid',        state: 'delivered', closedAt: '19:18' },
  { id: 'X7N40C', source: 'web',    customer: 'Cliente',        total: 51, payment: 'pending_cash',   state: 'cancelled', reason: 'Tiempo expirado', closedAt: '18:55' },
  { id: 'W4P22D', source: 'manual', customer: 'Sara Quispe',    total: 26, payment: 'pending_wallet', state: 'delivered', closedAt: '18:30' },
  { id: 'V8Q66E', source: 'web',    customer: 'Luis Morales',   total: 44, payment: 'pending_mixed',  state: 'delivered', closedAt: '18:12' },
  { id: 'U2X33F', source: 'manual', customer: 'Rosa Díaz',      total: 18, payment: 'pending_cash',   state: 'delivered', closedAt: '17:50' },
  { id: 'T1Y44G', source: 'web',    customer: 'Fernando León',  total: 67, payment: 'prepaid',        state: 'delivered', closedAt: '17:22' },
  { id: 'S5Z11H', source: 'manual', customer: 'Cliente',        total: 22, payment: 'pending_cash',   state: 'cancelled', reason: 'Restaurante canceló', closedAt: '17:05' },
  { id: 'R4K88P', source: 'web',    customer: 'Carla Mamani',   total: 38, payment: 'pending_wallet', state: 'delivered', closedAt: '16:40' },
  { id: 'Q8M22N', source: 'manual', customer: 'Pedro Torres',   total: 28, payment: 'pending_cash',   state: 'delivered', closedAt: '16:10' },
  { id: 'P3L55T', source: 'web',    customer: 'Angela Cruz',    total: 52, payment: 'prepaid',        state: 'delivered', closedAt: '15:48' },
];

// ── Restaurant state ──────────────────────────────────────────────────────────
const RESTAURANT_STATE = {
  name: 'Priamo', papelito: 'Rosado', accent: '#F472B6',
  isOpen: true, isPaused: false, pausedUntilMin: null, soundOn: true,
};

// ── Display maps ──────────────────────────────────────────────────────────────
const SOURCE_DISPLAY = {
  web:    { label: 'Online',  icon: 'language', bg: '#DBEAFE', color: '#1E40AF' },
  manual: { label: 'Directo', icon: 'call',     bg: '#FFEDD5', color: '#9A3412' },
};

const PAY_DISPLAY = {
  pending_cash:   { label: 'Efectivo',  bg: '#D1FAE5', color: '#065F46' },
  pending_wallet: { label: 'Billetera', bg: '#EDE9FE', color: '#5B21B6' },
  prepaid:        { label: 'Prepago',   bg: '#E0F2FE', color: '#0C4A6E' },
  pending_mixed:  { label: 'Mixto',     bg: '#FEF3C7', color: '#78350F' },
};

// Border/status config per cooking sub-state
const COOKING_STATE_STYLE = {
  cooking:   { border: 'var(--tv-border)', borderW: '1px', bg: '#fff', glow: false },
  buffer_p1: { border: 'var(--tv-border)', borderW: '1px', bg: '#fff', glow: false },
  buffer_p2: { border: '#FDBA74',          borderW: '1px', bg: '#fff', glow: false },
  buffer_p3: { border: '#FCA5A5',          borderW: '1px', bg: '#fff', glow: false },
  heading:   { border: 'var(--tv-border)', borderW: '1px', bg: '#fff', glow: false },
  waiting:   { border: '#4ADE80',          borderW: '2px', bg: 'rgba(22,163,74,0.025)', glow: true },
};

// Prep presets (shared with nuevo.jsx)
const PREP_PRESETS = [10, 15, 20, 25, 30, 35, 40, 45, 50];

// Derived counts
const V3_COUNTS = {
  new:     ORDERS_NEW.length,
  cooking: ORDERS_COOKING.length,
  route:   ORDERS_ROUTE.length,
  today:   HISTORY_SHIFT.filter(h => h.state === 'delivered').length,
};

// Keep empty ORDERS_READY for any legacy references
const ORDERS_READY = [];
const CASH_SETTLEMENTS = window.CASH_SETTLEMENTS || [];

Object.assign(window, {
  ORDERS_NEW, ORDERS_COOKING, ORDERS_READY, ORDERS_ROUTE,
  HISTORY_SHIFT, RESTAURANT_STATE,
  SOURCE_DISPLAY, PAY_DISPLAY, COOKING_STATE_STYLE,
  PREP_PRESETS, V3_COUNTS,
});
