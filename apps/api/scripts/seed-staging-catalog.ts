/**
 * Catálogo de PRUEBA para staging (`tindivo-dev`): 4 negocios abiertos con 4-5 categorías y 4-7 platos
 * por categoría, opciones (modificadores), platos agotados y platos sin foto, más portada y fotos.
 *
 * Lo llama `seed-staging.ts` después de `seedWorld`; allí viven la guardia de staging y las
 * contraseñas. Este módulo NUNCA se importa desde la siembra local ni de producción.
 *
 * IDEMPOTENTE: los ids salen de una clave estable (`stableId`), todo es upsert y las imágenes se
 * suben con `upsert: true` a rutas fijas. Los precios son `numeric(10,2)`.
 *
 * IMÁGENES: viven en `fixtures/staging-catalog/*.jpg` (JPEG ≤ 200 KB; generadas para pruebas, sin
 * logos de marcas reales). Son pocas y se REUTILIZAN: un plato representativo por familia
 * (pollo, menú, chifa, jugo, postre, parrilla) y una portada por negocio. La portada va a
 * `business-logos/<negocio>/banner.jpg` (`businesses.banner_url`). Cada plato con foto tiene SU PROPIA
 * copia, con la convención de Negocios (`itemImagePaths`): `menu-items/<negocio>/items/<itemId>.seed` y su
 * miniatura WebP de 384 px `…<itemId>.seed-t` (`fixtures/staging-catalog/thumb-<foto>.webp`, generadas
 * una vez a partir de los JPEG), de modo que borrar la foto de un plato no deje sin foto a sus hermanos.
 * La «Bodega» queda SIN portada ni fotos, para probar el estado vacío.
 *
 * GUARDIA: `seedStagingCatalog` exige un cliente creado con `createStagingClient` (destino y huella
 * de la service role verificados); con cualquier otro aborta antes de la primera petición.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { E2E } from './e2e-fixtures.ts'
import { type EnsureAuthUser, qrDe } from './seed-world.ts'
import { assertVerifiedStagingClient, type StagingClient } from './staging-client.ts'

const IMG_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'staging-catalog')

/** UUID estable a partir de una clave: el mismo texto da siempre el mismo id. */
export function stableId(key: string): string {
  const h = createHash('sha1').update(`tindivo-staging-catalog:${key}`).digest('hex')
  const variant = ((Number.parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(18, 20)}-${h.slice(20, 32)}`
}

/** `n` = sin foto; `x` = agotado. */
type Flag = '' | 'n' | 'x'
type Dish = [name: string, price: number, description: string | null, flags?: Flag]
interface Category {
  name: string
  /** Foto representativa de la categoría (`fixtures/staging-catalog/<clave>.jpg`) o null. */
  image: string | null
  /** Grupos de opciones que se enlazan a TODOS los platos de la categoría. */
  groups?: string[]
  dishes: Dish[]
}
interface ModGroup {
  key: string
  name: string
  type: 'single' | 'multi'
  required: boolean
  max: number | null
  options: [name: string, extra: number][]
}
interface Biz {
  key: string
  name: string
  tagline: string
  categoria: string[]
  phone: string
  accent: string
  fee: number
  eta: [number, number]
  cover: string | null
  lat: number
  lng: number
  groups: ModGroup[]
  categories: Category[]
}

const OFFSET = 0.0006

export const CATALOG_BUSINESSES: Biz[] = [
  {
    key: 'brasero',
    name: 'Pollería El Brasero',
    tagline: 'Pollo a la brasa y parrillas',
    categoria: ['pollos', 'parrillas'],
    phone: '+51900000021',
    accent: 'c2410c',
    fee: 2,
    eta: [25, 35],
    cover: 'portada-pollos',
    lat: E2E.BUSINESS_LAT + OFFSET,
    lng: E2E.BUSINESS_LNG + OFFSET,
    groups: [
      {
        key: 'cremas',
        name: 'Cremas',
        type: 'multi',
        required: false,
        max: 3,
        options: [
          ['Ají de la casa', 0],
          ['Mayonesa', 0],
          ['Ketchup', 0],
          ['Salsa de rocoto', 1],
        ],
      },
      {
        key: 'extras',
        name: 'Extras',
        type: 'multi',
        required: false,
        max: 2,
        options: [
          ['Papas extra', 5],
          ['Ensalada extra', 4],
          ['Arroz chaufa', 6],
        ],
      },
    ],
    categories: [
      {
        name: 'Pollos a la brasa',
        image: 'pollo',
        groups: ['cremas', 'extras'],
        dishes: [
          ['Pollo entero con papas y ensalada', 58, 'Pollo entero, papas fritas, ensalada y cremas'],
          ['1/2 pollo con papas y ensalada', 31, 'Medio pollo, papas fritas y ensalada'],
          ['1/4 de pollo con papas y ensalada', 17, 'Un cuarto, papas fritas y ensalada'],
          ['1/8 de pollo con papas', 10, 'Porción personal con papas'],
          ['Pollo entero con arroz chaufa', 62, 'Pollo entero y arroz chaufa', 'x'],
          ['Mostrito (1/4 pollo y chaufa)', 19, null, 'n'],
        ],
      },
      {
        name: 'Parrillas',
        image: 'parrilla',
        dishes: [
          ['Anticuchos de corazón', 18, 'Dos palitos con papas y choclo'],
          ['Parrilla personal', 32, 'Pollo, chorizo y anticucho con papas'],
          ['Parrilla familiar', 85, 'Para cuatro: pollo, chorizo, anticucho y chuleta'],
          ['Chuleta de cerdo a la parrilla', 24, 'Con papas doradas y ensalada'],
          ['Chorizo parrillero', 12, null, 'n'],
          ['Choclo con queso', 9, null, 'x'],
        ],
      },
      {
        name: 'Guarniciones',
        image: null,
        dishes: [
          ['Papas fritas porción grande', 12, null],
          ['Papas fritas porción personal', 7, null],
          ['Ensalada fresca', 6, 'Lechuga, tomate y cebolla'],
          ['Arroz chaufa', 10, null],
          ['Yucas fritas', 9, null],
        ],
      },
      {
        name: 'Bebidas',
        image: 'jugo',
        dishes: [
          ['Chicha morada 1 litro', 10, 'Casera'],
          ['Gaseosa 1.5 litros', 9, null, 'n'],
          ['Gaseosa personal 500 ml', 4, null, 'n'],
          ['Jugo de fresa con leche', 8, null],
          ['Limonada frozen', 8, null],
          ['Agua mineral', 3, null, 'n'],
        ],
      },
      {
        name: 'Postres',
        image: 'postre',
        dishes: [
          ['Flan de vainilla', 7, null],
          ['Gelatina con crema', 5, null, 'n'],
          ['Torta de chocolate', 9, 'Porción'],
          ['Mazamorra morada', 6, null, 'x'],
        ],
      },
    ],
  },
  {
    key: 'rosa',
    name: 'Comedor Doña Rosa',
    tagline: 'Menú del día y platos criollos',
    categoria: ['menu', 'criollo'],
    phone: '+51900000022',
    accent: 'be185d',
    fee: 2,
    eta: [20, 30],
    cover: 'portada-menu',
    lat: E2E.BUSINESS_LAT - OFFSET,
    lng: E2E.BUSINESS_LNG + OFFSET,
    groups: [
      {
        key: 'segundo',
        name: 'Elige tu segundo',
        type: 'single',
        required: true,
        max: 1,
        options: [
          ['Seco de pollo', 0],
          ['Arroz con pollo', 0],
          ['Lomo saltado', 3],
          ['Tallarín saltado', 2],
        ],
      },
      {
        key: 'bebida',
        name: 'Refresco',
        type: 'single',
        required: false,
        max: 1,
        options: [
          ['Chicha morada', 0],
          ['Maracuyá', 0],
        ],
      },
    ],
    categories: [
      {
        name: 'Menú del día',
        image: 'menu',
        groups: ['segundo', 'bebida'],
        dishes: [
          ['Menú completo (entrada, segundo y refresco)', 12, 'Sopa del día, segundo a elegir y refresco'],
          ['Menú ejecutivo (con postre)', 15, 'Sopa, segundo, refresco y postre'],
          ['Menú económico (solo segundo)', 9, 'Segundo a elegir con refresco', 'n'],
          ['Menú infantil', 8, 'Porción pequeña con refresco', 'x'],
        ],
      },
      {
        name: 'Sopas',
        image: 'menu',
        dishes: [
          ['Caldo de gallina', 10, 'Con huevo y fideos'],
          ['Sopa a la minuta', 9, null],
          ['Chupe de camarones', 22, 'Con huevo, queso y leche'],
          ['Caldo de cabeza', 12, 'Solo domingos', 'x'],
          ['Aguadito de pollo', 11, null],
        ],
      },
      {
        name: 'Platos criollos',
        image: 'menu',
        dishes: [
          ['Lomo saltado', 20, 'Con arroz y papas'],
          ['Ají de gallina', 16, 'Con arroz y papa sancochada'],
          ['Tallarines verdes con bistec', 18, null],
          ['Seco de res con frejoles', 18, null],
          ['Cuy chactado (porción)', 38, 'Con papas y ensalada', 'n'],
          ['Trucha frita', 22, 'Con arroz y ensalada'],
          ['Chicharrón de cerdo', 22, 'Con camote y salsa criolla'],
        ],
      },
      {
        name: 'Jugos y refrescos',
        image: 'jugo',
        dishes: [
          ['Jugo de papaya', 6, null],
          ['Jugo de fresa con leche', 8, null],
          ['Jugo surtido', 7, null],
          ['Chicha morada vaso', 3, null, 'n'],
          ['Maracuyá jarra', 12, null, 'n'],
        ],
      },
      {
        name: 'Postres',
        image: 'postre',
        dishes: [
          ['Arroz con leche', 5, null],
          ['Mazamorra morada', 5, null],
          ['Flan casero', 6, null],
          ['Suspiro limeño', 7, null, 'x'],
        ],
      },
    ],
  },
  {
    key: 'chifa',
    name: 'Chifa Tía Mei',
    tagline: 'Chifa casero a la sartén',
    categoria: ['chifa'],
    phone: '+51900000023',
    accent: '2e3236',
    fee: 2.5,
    eta: [30, 40],
    cover: 'portada-chifa',
    lat: E2E.BUSINESS_LAT + OFFSET,
    lng: E2E.BUSINESS_LNG - OFFSET,
    groups: [
      {
        key: 'tamano',
        name: 'Tamaño',
        type: 'single',
        required: true,
        max: 1,
        options: [
          ['Personal', 0],
          ['Familiar', 12],
        ],
      },
      {
        key: 'picante',
        name: 'Picante',
        type: 'single',
        required: false,
        max: 1,
        options: [
          ['Sin ají', 0],
          ['Con ají', 0],
          ['Ají extra', 1],
        ],
      },
    ],
    categories: [
      {
        name: 'Arroz chaufa',
        image: 'chifa',
        groups: ['tamano', 'picante'],
        dishes: [
          ['Chaufa de pollo', 14, 'Con huevo y cebolla china'],
          ['Chaufa de carne', 16, null],
          ['Chaufa especial', 19, 'Pollo, carne y chancho'],
          ['Chaufa de mariscos', 22, null, 'x'],
          ['Chaufa vegetariano', 12, null, 'n'],
        ],
      },
      {
        name: 'Tallarines saltados',
        image: 'chifa',
        groups: ['tamano'],
        dishes: [
          ['Tallarín saltado de pollo', 15, null],
          ['Tallarín saltado de carne', 17, null],
          ['Tallarín saltado especial', 20, null],
          ['Tallarín con verduras', 13, null, 'n'],
        ],
      },
      {
        name: 'Aeropuertos',
        image: 'chifa',
        dishes: [
          ['Aeropuerto de pollo', 17, 'Chaufa y tallarín juntos'],
          ['Aeropuerto especial', 22, null],
          ['Aeropuerto de carne', 19, null, 'n'],
          ['Aeropuerto de mariscos', 25, null, 'n'],
        ],
      },
      {
        name: 'Platos al wok',
        image: 'chifa',
        dishes: [
          ['Pollo con tausi', 18, null],
          ['Pollo con piña (tipakay)', 18, null],
          ['Sulibao', 20, null],
          ['Kam lu wantán', 19, null, 'n'],
          ['Wantán frito (8 unidades)', 10, null],
        ],
      },
      {
        name: 'Bebidas',
        image: 'jugo',
        dishes: [
          ['Té chino', 3, null, 'n'],
          ['Chicha morada vaso', 3, null, 'n'],
          ['Gaseosa 1 litro', 7, null, 'n'],
          ['Jugo de fresa con leche', 8, null],
        ],
      },
    ],
  },
  {
    key: 'bodega',
    name: 'Bodega Don Lucho',
    tagline: 'Abarrotes y víveres',
    categoria: ['abarrotes'],
    phone: '+51900000024',
    accent: '15803d',
    fee: 2,
    eta: [20, 30],
    cover: null, // sin portada ni fotos: prueba el estado vacío
    lat: E2E.BUSINESS_LAT - OFFSET,
    lng: E2E.BUSINESS_LNG - OFFSET,
    groups: [],
    categories: [
      {
        name: 'Abarrotes',
        image: null,
        dishes: [
          ['Arroz extra 1 kg', 4.5, null],
          ['Azúcar rubia 1 kg', 4, null],
          ['Aceite vegetal 1 litro', 10.5, null],
          ['Fideos spaghetti 500 g', 3.5, null],
          ['Menestras: lentejas 500 g', 6, null],
          ['Sal de mesa 1 kg', 2, null, 'x'],
          ['Atún en lata', 6.5, null],
        ],
      },
      {
        name: 'Lácteos y huevos',
        image: null,
        dishes: [
          ['Leche evaporada lata', 4.2, null],
          ['Huevos (docena)', 10, null],
          ['Queso fresco 250 g', 9, null],
          ['Mantequilla 200 g', 7, null],
          ['Yogurt 1 litro', 8.5, null],
        ],
      },
      {
        name: 'Bebidas',
        image: null,
        dishes: [
          ['Gaseosa 2 litros', 10, null],
          ['Agua sin gas 625 ml', 2, null],
          ['Jugo en caja 1 litro', 6, null],
          ['Chicha morada botella', 8, null, 'x'],
        ],
      },
      {
        name: 'Snacks y golosinas',
        image: null,
        dishes: [
          ['Galletas de soda (paquete)', 2.5, null],
          ['Papas fritas bolsa', 2, null],
          ['Chocolate en barra', 3, null],
          ['Caramelos surtidos 100 g', 3, null],
          ['Chifles bolsa', 3.5, null],
          ['Maní salado 100 g', 3, null],
        ],
      },
      {
        name: 'Limpieza',
        image: null,
        dishes: [
          ['Detergente 500 g', 6, null],
          ['Lejía 1 litro', 4.5, null],
          ['Jabón de tocador', 2.5, null],
          ['Papel higiénico (4 rollos)', 6, null],
        ],
      },
    ],
  },
]

/** Dueños de los negocios de prueba (los crea `seed-staging.ts` con contraseña al azar). */
export const CATALOG_OWNERS = CATALOG_BUSINESSES.map((b) => ({
  businessId: stableId(`biz:${b.key}`),
  userId: stableId(`owner:${b.key}`),
  email: `catalogo-${b.key}@staging.tindivo.local`,
  fullName: `Dueño ${b.name}`,
  business: b,
}))

function readFixture(file: string): Buffer {
  const path = join(IMG_DIR, file)
  if (!existsSync(path)) throw new Error(`Falta la imagen de prueba ${path}`)
  return readFileSync(path)
}

/** Rutas de la foto de UN plato y de su miniatura (misma convención que `itemImagePaths` de Negocios). */
export function catalogImagePaths(bizId: string, itemId: string): { full: string; thumb: string } {
  const full = `${bizId}/items/${itemId}.seed`
  return { full, thumb: `${full}-t` }
}

export interface CatalogSummary {
  businesses: number
  categories: number
  items: number
  soldOut: number
  withoutImage: number
  images: number
}

export async function seedStagingCatalog(
  db: StagingClient,
  ensureAuthUser: EnsureAuthUser,
): Promise<CatalogSummary> {
  // Antes de cualquier petición o activación de cuentas.
  assertVerifiedStagingClient(db)
  // biome-ignore lint/suspicious/noExplicitAny: las filas se escriben por nombre de tabla dinámico, sin tipar
  const raw = db as any
  const summary: CatalogSummary = {
    businesses: 0,
    categories: 0,
    items: 0,
    soldOut: 0,
    withoutImage: 0,
    images: 0,
  }

  async function upsert(
    table: string,
    rows: Record<string, unknown>[],
    onConflict: string,
  ): Promise<void> {
    if (rows.length === 0) return
    const { error } = await raw.from(table).upsert(rows, { onConflict })
    if (error) throw new Error(`upsert ${table} falló: ${error.message}`)
    console.log(`  ✓ ${table.padEnd(28)} ${rows.length} fila(s)`)
  }

  async function upload(
    bucket: string,
    path: string,
    file: string,
    contentType = 'image/jpeg',
  ): Promise<string> {
    const { error } = await db.storage.from(bucket).upload(path, readFixture(file), {
      upsert: true,
      contentType,
      cacheControl: '3600',
    })
    if (error) throw new Error(`subir ${bucket}/${path} falló: ${error.message}`)
    summary.images++
    return db.storage.from(bucket).getPublicUrl(path).data.publicUrl
  }

  console.log('\ncatálogo de prueba')
  for (const o of CATALOG_OWNERS) await ensureAuthUser(o.userId, o.email, o.fullName)
  // El trigger handle_new_user crea la fila de users; el upsert fija el primary_role.
  await upsert(
    'users',
    CATALOG_OWNERS.map((o) => ({
      id: o.userId,
      email: o.email,
      full_name: o.fullName,
      primary_role: 'business',
    })),
    'id',
  )
  await upsert(
    'user_roles',
    CATALOG_OWNERS.map((o) => ({ user_id: o.userId, role: 'business' })),
    'user_id,role',
  )

  const { data: serviceDate, error: sdErr } = await raw.rpc('current_service_date')
  if (sdErr || !serviceDate) throw new Error(`current_service_date falló: ${sdErr?.message}`)

  for (const o of CATALOG_OWNERS) {
    const b = o.business
    const bid = o.businessId
    console.log(`\n${b.name}`)

    // Portada (banner_url) en el bucket de identidad del negocio.
    const bannerUrl = b.cover ? await upload('business-logos', `${bid}/banner.jpg`, `${b.cover}.jpg`) : null

    await upsert(
      'businesses',
      [
        {
          id: bid,
          user_id: o.userId,
          name: b.name,
          tagline: b.tagline,
          categoria: b.categoria,
          phone: b.phone,
          yape_number: b.phone.slice(3),
          accent_color: b.accent,
          banner_url: bannerUrl,
          delivery_fee: b.fee,
          estimated_eta_min: b.eta[0],
          estimated_eta_max: b.eta[1],
          is_active: true,
          is_blocked: false,
          blocked_for_debt: false,
          publishes_catalog: true,
          accepts_web_pickup: true,
          accepts_web_delivery: true,
          uses_tindivo_drivers: true,
          coordinates_lat: b.lat,
          coordinates_lng: b.lng,
        },
      ],
      'id',
    )
    summary.businesses++

    await upsert(
      'business_payment_qrs',
      [
        {
          business_id: bid,
          slot: 1,
          wallet: 'yape',
          account_number: b.phone.slice(3),
          account_name: b.name,
          qr_url: qrDe(b.phone.slice(3)),
        },
      ],
      'business_id,slot',
    )

    await upsert(
      'business_schedule',
      [0, 1, 2, 3, 4, 5, 6].map((day) => ({
        id: stableId(`sched:${b.key}:${day}`),
        business_id: bid,
        day_of_week: day,
        is_open: true,
        shift1_start: '00:00',
        shift1_end: '23:59',
        crosses_midnight: false,
      })),
      'id',
    )
    // Apertura declarada de HOY (0154): hay que volver a correr la semilla cada día de prueba.
    await upsert(
      'business_service_days',
      [{ business_id: bid, service_date: serviceDate, status: 'open' }],
      'business_id,service_date',
    )

    await upsert(
      'menu_modifier_groups',
      b.groups.map((g, i) => ({
        id: stableId(`grp:${b.key}:${g.key}`),
        business_id: bid,
        name: g.name,
        selection_type: g.type,
        is_required: g.required,
        min_selections: g.required ? 1 : 0,
        max_selections: g.max,
        display_order: i,
      })),
      'id',
    )
    await upsert(
      'menu_modifier_options',
      b.groups.flatMap((g) =>
        g.options.map(([name, extra], i) => ({
          id: stableId(`opt:${b.key}:${g.key}:${name}`),
          group_id: stableId(`grp:${b.key}:${g.key}`),
          name,
          additional_price: Number(extra.toFixed(2)),
          display_order: i,
          is_available: true,
        })),
      ),
      'id',
    )

    const cats: Record<string, unknown>[] = []
    const items: Record<string, unknown>[] = []
    const links: Record<string, unknown>[] = []
    for (const [ci, c] of b.categories.entries()) {
      const catId = stableId(`cat:${b.key}:${c.name}`)
      cats.push({ id: catId, business_id: bid, name: c.name, display_order: ci, is_active: true })
      for (const [di, [name, price, description, flags = '']] of c.dishes.entries()) {
        const itemId = stableId(`item:${b.key}:${c.name}:${name}`)
        let imageUrl: string | null = null
        let thumbnailUrl: string | null = null
        if (flags !== 'n' && c.image && b.cover) {
          const paths = catalogImagePaths(bid, itemId)
          imageUrl = await upload('menu-items', paths.full, `${c.image}.jpg`)
          thumbnailUrl = await upload(
            'menu-items',
            paths.thumb,
            `thumb-${c.image}.webp`,
            'image/webp',
          )
        } else {
          summary.withoutImage++
        }
        const soldOut = flags === 'x'
        if (soldOut) summary.soldOut++
        items.push({
          id: itemId,
          business_id: bid,
          category_id: catId,
          name,
          description,
          base_price: Number(price.toFixed(2)),
          image_url: imageUrl,
          thumbnail_url: thumbnailUrl,
          display_order: di,
          is_available: !soldOut,
        })
        for (const [gi, gk] of (c.groups ?? []).entries()) {
          links.push({
            item_id: itemId,
            group_id: stableId(`grp:${b.key}:${gk}`),
            display_order: gi,
          })
        }
      }
    }
    summary.categories += cats.length
    summary.items += items.length
    await upsert('menu_categories', cats, 'id')
    await upsert('menu_items', items, 'id')
    await upsert('menu_item_modifier_groups', links, 'item_id,group_id')
  }

  return summary
}
