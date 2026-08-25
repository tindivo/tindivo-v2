// menu-data.jsx — Items de Priamo con grupos de modificadores completos
// Priamo · San Jacinto, Áncash — Pizzas, sanguches, broaster, bebidas

const PRIAMO_CATEGORIES = [
  { id: 'pizzas',    name: 'Pizzas',          icon: 'local_pizza' },
  { id: 'sanguches', name: 'Sanguches',        icon: 'lunch_dining' },
  { id: 'broaster',  name: 'Broaster',         icon: 'set_meal' },
  { id: 'bebidas',   name: 'Bebidas',          icon: 'local_drink' },
];

// ─── Shared modifier group templates ─────────────────────────────────────────
// (viven por-item, no son plantillas globales — regla de producto)

const PRIAMO_ITEMS = [

  // ── 1. Pizza Hawaiana — item complejo (3 grupos) ───────────────────────────
  {
    id: 'hawaiana',
    categoryId: 'pizzas',
    name: 'Pizza Hawaiana',
    description: 'Salsa de tomate, jamón, piña y queso mozzarella. Masa delgada y crujiente.',
    price: 15,
    available: true,
    featured: true,
    hasPhoto: false,
    prepTime: null, // usa default del restaurante
    modifierGroups: [
      {
        id: 'haw-g1',
        name: 'Tamaño',
        required: true, min: 1, max: 1,
        options: [
          { id: 'haw-o1', name: 'Personal',  delta: 0,  available: true },
          { id: 'haw-o2', name: 'Familiar',  delta: 18, available: true },
          { id: 'haw-o3', name: 'Fiesta',    delta: 26, available: true },
        ],
      },
      {
        id: 'haw-g2',
        name: 'Cremas para llevar',
        required: false, min: 0, max: 3,
        options: [
          { id: 'haw-o4', name: 'Mayonesa', delta: 0, available: true },
          { id: 'haw-o5', name: 'Ketchup',  delta: 0, available: true },
          { id: 'haw-o6', name: 'Ají',      delta: 0, available: true },
          { id: 'haw-o7', name: 'Mostaza',  delta: 0, available: true },
        ],
      },
      {
        id: 'haw-g3',
        name: 'Extras',
        required: false, min: 0, max: 5,
        options: [
          { id: 'haw-o8',  name: 'Doble queso',    delta: 4, available: true },
          { id: 'haw-o9',  name: 'Champiñones',    delta: 3, available: true },
          { id: 'haw-o10', name: 'Aceitunas negras', delta: 2, available: true },
        ],
      },
    ],
  },

  // ── 2. Pizza Fullmeat — sin tamaño Personal ────────────────────────────────
  {
    id: 'fullmeat',
    categoryId: 'pizzas',
    name: 'Pizza Fullmeat',
    description: 'Pepperoni, jamón, carne molida, salchicha y queso extra. Sin masa personal.',
    price: 37,
    available: true,
    featured: false,
    hasPhoto: false,
    prepTime: null,
    modifierGroups: [
      {
        id: 'fm-g1',
        name: 'Tamaño',
        required: true, min: 1, max: 1,
        options: [
          { id: 'fm-o1', name: 'Familiar', delta: 0, available: true },
          { id: 'fm-o2', name: 'Fiesta',   delta: 7, available: true },
        ],
      },
      {
        id: 'fm-g2',
        name: 'Cremas para llevar',
        required: false, min: 0, max: 3,
        options: [
          { id: 'fm-o3', name: 'Mayonesa', delta: 0, available: true },
          { id: 'fm-o4', name: 'Ketchup',  delta: 0, available: true },
          { id: 'fm-o5', name: 'Ají',      delta: 0, available: true },
        ],
      },
    ],
  },

  // ── 3. Alitas BBQ — grupo de salsas obligatorio ────────────────────────────
  {
    id: 'alitas',
    categoryId: 'broaster',
    name: 'Alitas BBQ (6 piezas)',
    description: 'Alitas de pollo doradas. Elige tu salsa.',
    price: 23,
    available: true,
    featured: true,
    hasPhoto: false,
    prepTime: 20,
    modifierGroups: [
      {
        id: 'al-g1',
        name: 'Salsa',
        required: true, min: 1, max: 1,
        options: [
          { id: 'al-o1', name: 'BBQ',        delta: 0, available: true },
          { id: 'al-o2', name: 'Oriental',   delta: 0, available: true },
          { id: 'al-o3', name: 'Acevichada', delta: 0, available: true },
        ],
      },
    ],
  },

  // ── 4. Chicha morada — item simple, sin modificadores ─────────────────────
  {
    id: 'chicha',
    categoryId: 'bebidas',
    name: 'Chicha morada',
    description: '',
    price: 2.50,
    available: true,
    featured: false,
    hasPhoto: false,
    prepTime: null,
    modifierGroups: [],
  },

  // ── Más items para poblar la lista del menú ────────────────────────────────
  {
    id: 'pepperoni',
    categoryId: 'pizzas',
    name: 'Pizza Pepperoni',
    description: 'Salsa de tomate, pepperoni y queso mozzarella.',
    price: 15,
    available: true,
    featured: false,
    hasPhoto: false,
    prepTime: null,
    modifierGroups: [
      {
        id: 'pp-g1',
        name: 'Tamaño',
        required: true, min: 1, max: 1,
        options: [
          { id: 'pp-o1', name: 'Personal', delta: 0,  available: true },
          { id: 'pp-o2', name: 'Familiar', delta: 18, available: true },
          { id: 'pp-o3', name: 'Fiesta',   delta: 26, available: true },
        ],
      },
    ],
  },
  {
    id: 'sanguchon',
    categoryId: 'sanguches',
    name: 'Sanguchón de pollo',
    description: 'Pan artesanal, pechuga de pollo, lechuga, tomate y salsas.',
    price: 12,
    available: true,
    featured: false,
    hasPhoto: false,
    prepTime: 15,
    modifierGroups: [
      {
        id: 'sg-g1',
        name: 'Salsas',
        required: false, min: 0, max: 2,
        options: [
          { id: 'sg-o1', name: 'Mayonesa', delta: 0, available: true },
          { id: 'sg-o2', name: 'Mostaza',  delta: 0, available: true },
          { id: 'sg-o3', name: 'Ají',      delta: 0, available: true },
        ],
      },
    ],
  },
  {
    id: 'broaster-personal',
    categoryId: 'broaster',
    name: 'Broaster personal (3 piezas)',
    description: 'Pollo broaster crujiente con papas y cremas.',
    price: 18,
    available: true,
    featured: false,
    hasPhoto: false,
    prepTime: 20,
    modifierGroups: [],
  },
  {
    id: 'inca-kola',
    categoryId: 'bebidas',
    name: 'Inca Kola 1.5L',
    description: '',
    price: 8,
    available: false, // agotado
    featured: false,
    hasPhoto: false,
    prepTime: null,
    modifierGroups: [],
  },
];

// Helpers
function groupedByCategory(items) {
  return PRIAMO_CATEGORIES.map(cat => ({
    ...cat,
    items: items.filter(i => i.categoryId === cat.id),
  })).filter(cat => cat.items.length > 0);
}

function itemMinPrice(item) {
  if (!item.modifierGroups.length) return item.price;
  const mainGroup = item.modifierGroups.find(g => g.required && g.min >= 1);
  if (!mainGroup) return item.price;
  const cheapestDelta = Math.min(...mainGroup.options.map(o => o.delta));
  return item.price + cheapestDelta;
}

function itemMaxPrice(item) {
  if (!item.modifierGroups.length) return item.price;
  const allMaxDeltas = item.modifierGroups.map(g =>
    g.options.reduce((s, o) => s + Math.max(0, o.delta), 0)
  );
  return item.price + allMaxDeltas.reduce((a, b) => a + b, 0);
}

function groupRuleLabel(group) {
  if (group.required) {
    if (group.max === 1) return 'Obligatorio · elegir 1';
    return `Obligatorio · elegir ${group.min}–${group.max}`;
  }
  if (group.max === 1) return 'Opcional · elegir 1';
  return `Opcional · hasta ${group.max}`;
}

// Price base warning: price base should match cheapest option of main required group
function priceWarning(item) {
  const mainGroup = item.modifierGroups.find(g => g.required && g.min >= 1);
  if (!mainGroup) return null;
  const cheapest = Math.min(...mainGroup.options.map(o => o.delta));
  if (cheapest === 0) return null; // base price IS the cheapest, no warning
  const expectedBase = item.price + cheapest;
  if (Math.abs(expectedBase - item.price) < 0.01) return null;
  return {
    current: item.price,
    suggested: item.price + cheapest,
    groupName: mainGroup.name,
    delta: cheapest,
  };
}

Object.assign(window, {
  PRIAMO_CATEGORIES,
  PRIAMO_ITEMS,
  groupedByCategory,
  itemMinPrice,
  itemMaxPrice,
  groupRuleLabel,
  priceWarning,
});
