// In-memory seed for the dev mock API (VITE_USE_MOCK=1).
// Mirrors the real DB shapes returned by the Flask endpoints.

import type {
  ChannelStatus,
  MLSettings,
  Product,
  StockMovement,
} from '../lib/api/types'

export interface MockProduct extends Product {
  description: string | null
  gtin: string | null
  model: string | null
  dimensions: string | null
  drive_url: string | null
  created_at: string
}

export interface MockListing {
  id: number
  platform: 'mercadolibre' | 'tiendanube'
  account_id: number
  external_id: string | null
  price: number | null
  db_status: string | null
  reason: string | null
  remedy: string | null
  permalink: string | null
  updated_at: string
}

export interface MockImage {
  id: number
  url: string
}

export const DEMO_USERS = [
  {
    email: 'demo@guiaslocales.com',
    password: 'demo1234',
    user: {
      id: 1,
      business_id: 1,
      role: 'business' as const,
      email: 'demo@guiaslocales.com',
      full_name: 'Nicolas Gallucci',
    },
  },
  {
    email: 'empleado@guiaslocales.com',
    password: 'demo1234',
    user: {
      id: 2,
      business_id: 1,
      role: 'employee' as const,
      email: 'empleado@guiaslocales.com',
      full_name: 'Empleado Demo',
    },
  },
]

export const MOCK_ACCOUNTS = [
  { id: 10, platform: 'mercadolibre', external_account_id: '182931344', name: 'Guías Locales ML', has_credentials: 1 },
  { id: 11, platform: 'tiendanube', external_account_id: '1234567', name: 'Guías Locales TN', has_credentials: 1 },
] as const

export const ML_CATEGORIES = [
  { id: 'MLA433536', domain_id: 'MLA-FOOD_CONTAINERS', domain_name: 'Contenedores de alimentos', category_name: 'Tápers y contenedores' },
  { id: 'MLA372471', domain_id: 'MLA-KITCHEN_ACCESSORIES', domain_name: 'Accesorios de cocina', category_name: 'Accesorios de cocina' },
  { id: 'MLA981234', domain_id: 'MLA-TABLEWARE', domain_name: 'Vajilla y cristalería', category_name: 'Queseras y tablas' },
]

export const LISTING_TYPES = [
  { id: 'gold_pro', name: 'Premium', sale_fee: 1640.23, pct: 27.7, meli_pct: 14.3, financing: 13.4, fixed: 1330 },
  { id: 'gold_special', name: 'Clásica', sale_fee: 1490.15, pct: 14.3, meli_pct: 14.3, financing: 0, fixed: 1330 },
  { id: 'gold_premium', name: 'Oro Premium', sale_fee: 0, pct: 0, meli_pct: 0, financing: 0, fixed: 0 },
  { id: 'gold', name: 'Oro', sale_fee: 0, pct: 0, meli_pct: 0, financing: 0, fixed: 0 },
  { id: 'silver', name: 'Plata', sale_fee: 0, pct: 0, meli_pct: 0, financing: 0, fixed: 0 },
  { id: 'bronze', name: 'Bronce', sale_fee: 0, pct: 0, meli_pct: 0, financing: 0, fixed: 0 },
  { id: 'free', name: 'Gratuita', sale_fee: 0, pct: 0, meli_pct: 0, financing: 0, fixed: 0 },
]

export function mlSettingsTemplate(categoryId: string | null): MLSettings {
  return {
    category_id: categoryId,
    settings: [
      {
        attributes: [
          { id: 'VALUE_ADDED_TAX', name: 'IVA', value_type: 'list', values: ['Exento', '0 %', '10.5 %', '21 %', '27 %'], user_input_value: '21 %' },
          { id: 'IMPORT_DUTY', name: 'Impuesto interno', value_type: 'list', values: ['0 %', '1 %', '2.5 %', '4 %', '5 %', '8 %', '10 %', '15 %', '20 %', '25 %'], user_input_value: '0 %' },
          { id: 'IS_KIT', name: 'Es un kit de fábrica', value_type: 'list', values: ['Si', 'No'], user_input_value: 'No' },
        ],
      },
      {
        shipping: [
          { id: 'MODE', name: 'Método de envío', value_type: 'list', values: ['me1', 'me2', 'not_specified', 'custom'], user_input_value: 'me2' },
          { id: 'LOGISTIC_TYPE', name: 'Logística', value_type: 'list', values: ['fulfillment', 'cross_docking', 'self_service', 'drop_off', 'custom'], user_input_value: 'drop_off' },
          { id: 'LOCAL_PICK_UP', name: 'Buscar en local', value_type: 'list', values: ['True', 'False'], user_input_value: 'True' },
          { id: 'FREE_SHIPPING', name: 'Envío gratis', value_type: 'list', values: ['True', 'False'], user_input_value: 'False' },
        ],
      },
      {
        sale_terms: [
          { id: 'WARRANTY_TYPE', name: 'Tipo de garantía', value_type: 'list', values: ['Garantía del vendedor', 'Garantía de fábrica', 'Sin garantía'], user_input_value: 'Garantía del vendedor' },
          { id: 'WARRANTY_TIME', name: 'Tiempo de garantía', value_type: 'list', values: ['30 dias', '60 dias', '90 dias'], user_input_value: '30 dias' },
        ],
      },
      {
        listing: [
          { id: 'LISTING_TYPE', name: 'Campaña', value_type: 'list', values: LISTING_TYPES.map((l) => l.name), user_input_value: 'gold_special' },
        ],
      },
    ],
  }
}

export const TN_SETTINGS_TEMPLATE = {
  SEO_TITLE: { DEFAULT_VALUE: null, USER_INPUT_VALUE: null },
  SEO_DESCRIPTION: { DEFAULT_VALUE: null, USER_INPUT_VALUE: null },
  BARCODE: { DEFAULT_VALUE: null, USER_INPUT_VALUE: null },
  VIDEO_URL: { DEFAULT_VALUE: null, USER_INPUT_VALUE: null },
  TAGS: { DEFAULT_VALUE: [null], USER_INPUT_VALUE: null },
  PROMOTIONAL_PRICE: { DEFAULT_VALUE: null, USER_INPUT_VALUE: null },
  MPN: { DEFAULT_VALUE: null, USER_INPUT_VALUE: null },
  AGE_GROUP: { DEFAULT_VALUE: 'Adultos', USER_INPUT_VALUE: 'Adultos' },
  GENDER: { DEFAULT_VALUE: 'Unisex', USER_INPUT_VALUE: 'Unisex' },
  FREE_SHIPPING: { DEFAULT_VALUE: false, USER_INPUT_VALUE: false },
}

// ─── Seed: the 9 Figma products verbatim ─────────────────────────────────────

const FIGMA_PRODUCTS: Array<[string, string, string, string, string, number, number, number, ChannelStatus, ChannelStatus, string, string]> = [
  ['182762', 'QP-001', 'Quesera Plástico Premium', 'Quesera Plástico', 'HomeDeco', 0, 817, 2500, 'failed', 'unpublished', 'Cocina', '2025-09-20'],
  ['205311', 'PD-002', 'Paño Decoración Estampado', 'Paño Decoración Estampado', 'Textil Sur', 0, 995, 3000, 'published', 'published', 'Hogar', '2025-09-19'],
  ['214349', 'PV-003', 'Promo Vaso y Perfume Set', 'Set Vaso + Perfume', 'GiftBox', 0, 5000, 15000, 'unpublished', 'prepublished', 'Regalos', '2025-09-18'],
  ['193140', 'PM-004', 'Promo Mate Día del Padre', 'Promo Mate Día del Padre', 'Yerba & Co', 0, 3320, 10000, 'paused', 'unpublished', 'Regalos', '2025-09-17'],
  ['193141', 'PT-005', 'Promo Taza + Perfume', 'Promo Taza + Perfume', 'GiftBox', 0, 5000, 15000, 'unpublished', 'unpublished', 'Regalos', '2025-09-16'],
  ['193142', 'PTC-006', 'Promo Tabla + Chocolate', 'Set Tabla Gourmet', 'Gourmet AR', 1, 10000, 30000, 'published', 'published', 'Gastronomía', '2025-09-15'],
  ['191496', 'PSA-007', 'Promo Set Asado Completo', 'Promo Set Asado Completo', 'BBQ Arg', 0, 11650, 35000, 'unpublished', 'unpublished', 'Gastronomía', '2025-09-14'],
  ['185813', 'PCP-008', 'Promo Caja Perfume Mujer', 'Promo Caja Perfume Mujer', 'Belle', 1, 6650, 20000, 'unpublished', 'unpublished', 'Belleza', '2025-09-13'],
  ['185814', 'PBM-009', 'Promo Bolsa Madera Natural', 'Promo Bolsa Madera Natural', 'EcoWood', 1, 6650, 20000, 'unpublished', 'unpublished', 'Hogar', '2025-09-12'],
]

const MORE: Array<[string, string, ChannelStatus, ChannelStatus, number, number, number]> = [
  ['Set Espátulas Silicona x3', 'Cocina', 'published', 'unpublished', 12, 2200, 6900],
  ['Taza Térmica Acero 500ml', 'Cocina', 'published', 'published', 34, 4500, 12900],
  ['Organizador Especias Giratorio', 'Cocina', 'prepublished', 'unpublished', 8, 3900, 11500],
  ['Mantel Individual Yute x4', 'Hogar', 'published', 'unpublished', 21, 3100, 9500],
  ['Cortina Blackout 2.40m', 'Hogar', 'paused', 'published', 5, 12800, 29900],
  ['Almohadón Decorativo 45x45', 'Hogar', 'unpublished', 'unpublished', 0, 3400, 9900],
  ['Set Vasos Vidrio Soplado x6', 'Gastronomía', 'published', 'published', 17, 6800, 19900],
  ['Tabla Picada Roble + Cuchillo', 'Gastronomía', 'published', 'unpublished', 9, 7600, 22000],
  ['Delantal Chef Denim', 'Gastronomía', 'unpublished', 'unpublished', 3, 4900, 14500],
  ['Vela Aromática Soja 220g', 'Hogar', 'published', 'published', 26, 2800, 8400],
  ['Difusor Varillas Bambú', 'Hogar', 'unpublished', 'prepublished', 0, 3300, 9800],
  ['Kit Jardín Vertical Macetas x5', 'Jardín', 'published', 'unpublished', 11, 8700, 25900],
  ['Regadera Cobre 1.5L', 'Jardín', 'unpublished', 'unpublished', 4, 7200, 21000],
  ['Maceta Cemento Geométrica', 'Jardín', 'paused', 'unpublished', 7, 4100, 12000],
  ['Buzo Algodón Peinado Unisex', 'Indumentaria', 'published', 'published', 42, 9800, 27900],
  ['Remera Básica Premium', 'Indumentaria', 'published', 'unpublished', 55, 4200, 12900],
  ['Campera Rompeviento Packable', 'Indumentaria', 'prepublished', 'unpublished', 18, 18500, 49900],
  ['Gorra Trucker Bordada', 'Indumentaria', 'unpublished', 'unpublished', 0, 3100, 9200],
  ['Bolso Tote Lona Reforzada', 'Accesorios', 'published', 'published', 23, 5600, 16500],
  ['Billetera Cuero Vegano', 'Accesorios', 'published', 'unpublished', 31, 3800, 11000],
  ['Riñonera Antirrobo Slim', 'Accesorios', 'unpublished', 'unpublished', 0, 4700, 13900],
  ['Cinturón Cuero Hebilla Automática', 'Accesorios', 'paused', 'published', 14, 5300, 15500],
  ['Set Toalla Mano Algodón x3', 'Hogar', 'published', 'published', 27, 4900, 14400],
  ['Juego Sábanas 2 Plazas', 'Hogar', 'published', 'unpublished', 19, 16400, 45900],
  ['Acolchado Cuna Antialérgico', 'Hogar', 'unpublished', 'unpublished', 6, 11200, 32900],
  ['Organizador Ropa Colgante x6', 'Hogar', 'published', 'published', 33, 3600, 10500],
  ['Caja Hermética Cristal x3', 'Cocina', 'published', 'published', 24, 6900, 19900],
  ['Pava Eléctrica Acero 1.7L', 'Cocina', 'published', 'unpublished', 13, 21900, 59900],
  ['Balanza Digital Cocina 5kg', 'Cocina', 'unpublished', 'published', 9, 5900, 17200],
  ['Set Cubiertos Acero x24', 'Cocina', 'published', 'published', 16, 18600, 52900],
  ['Tabla Bambú con Canaleta', 'Cocina', 'unpublished', 'unpublished', 0, 3700, 10800],
  ['Frascos Vidrio 500ml x6', 'Cocina', 'prepublished', 'unpublished', 22, 6100, 17900],
  ['Estantería Bambú 5 Niveles', 'Hogar', 'published', 'unpublished', 7, 24800, 69900],
  ['Cesto Fibra Natural 30L', 'Hogar', 'unpublished', 'unpublished', 3, 4700, 13800],
  ['Espejo Redondo 60cm Dorado', 'Hogar', 'published', 'published', 8, 15600, 43900],
  ['Perchero Pie Minimalista', 'Hogar', 'paused', 'unpublished', 5, 8300, 23900],
  ['Bandeja Mármol 30cm', 'Hogar', 'published', 'unpublished', 12, 9600, 27900],
  ['Porta Velas Vidrio Ámbar x3', 'Hogar', 'unpublished', 'unpublished', 0, 3500, 10200],
  ['Set Repasadores Algodón x6', 'Hogar', 'published', 'published', 38, 2900, 8600],
  ['Cuchillo Chef Acero Alemán', 'Cocina', 'published', 'published', 11, 13400, 38900],
  ['Sartén Antiadherente 28cm', 'Cocina', 'published', 'unpublished', 15, 12900, 36900],
  ['Olla Essen Réplica 24cm', 'Cocina', 'unpublished', 'unpublished', 2, 21900, 61900],
  ['Licuadora Multifunción 700W', 'Electro', 'published', 'unpublished', 6, 32900, 89900],
  ['Freidora Sin Aceite 5L', 'Electro', 'published', 'published', 9, 54900, 149900],
  ['Cafetera Espresso Manual', 'Electro', 'prepublished', 'unpublished', 4, 38900, 109900],
  ['Tostadora 2 Ranuras Acero', 'Electro', 'unpublished', 'unpublished', 0, 27900, 79900],
  ['Auriculares Bluetooth Over-Ear', 'Electro', 'published', 'published', 28, 31900, 89900],
  ['Parlante Portátil 20W', 'Electro', 'published', 'unpublished', 17, 24900, 69900],
  ['Power Bank 20000mAh', 'Electro', 'unpublished', 'unpublished', 0, 18900, 54900],
  ['Cargador Inalámbrico 15W', 'Electro', 'paused', 'published', 21, 9900, 28900],
  ['Lámpara Escritorio LED', 'Hogar', 'published', 'published', 14, 8900, 25900],
  ['Set Destornilladores 32pcs', 'Herramientas', 'published', 'unpublished', 19, 12400, 35900],
  ['Taladro Percutor 550W', 'Herramientas', 'unpublished', 'unpublished', 3, 64900, 179900],
  ['Caja Herramientas 180pcs', 'Herramientas', 'published', 'published', 5, 84900, 239900],
  ['Guantes Jardinería x2', 'Jardín', 'unpublished', 'unpublished', 26, 1900, 5600],
  ['Pala Mano Acero Inoxidable', 'Jardín', 'published', 'unpublished', 13, 3400, 9900],
  ['Manguera Expandible 15m', 'Jardín', 'published', 'published', 18, 9900, 28900],
  ['Aspersor 360° Giratorio', 'Jardín', 'unpublished', 'unpublished', 0, 3900, 11400],
  ['Kit Limpieza Piscina', 'Jardín', 'prepublished', 'unpublished', 7, 15900, 44900],
  ['Sombrilla Playa 2.10m', 'Jardín', 'published', 'unpublished', 4, 28900, 79900],
  ['Reposera Plegable Aluminio', 'Jardín', 'published', 'published', 6, 39900, 109900],
  ['Colchoneta Yoga 10mm', 'Deportes', 'published', 'unpublished', 22, 11900, 33900],
  ['Pesas Mancuernas 10kg x2', 'Deportes', 'unpublished', 'unpublished', 0, 24900, 69900],
  ['Banda Elástica Set x5', 'Deportes', 'published', 'published', 35, 5900, 17200],
  ['Botella Deportiva 1L', 'Deportes', 'paused', 'unpublished', 41, 3300, 9600],
  ['Soga Saltar Profesional', 'Deportes', 'unpublished', 'unpublished', 0, 2500, 7300],
]

function makeProducts(): MockProduct[] {
  const out: MockProduct[] = []
  const figmaDesc: Record<string, string> = {
    '182762': 'Quesera de plástico con tapa y 3 posiciones. Diseñada para almacenar y organizar quesos con tapa regulable.',
    '205311': 'Paño decorativo con estampado exclusivo para el hogar.',
    '214349': 'Set regalo con vaso y perfume de alta gama.',
    '193140': 'Kit de mate completo, ideal regalo Día del Padre.',
    '193141': 'Combo taza personalizada + perfume importado.',
    '193142': 'Tabla de madera premium con selección de chocolates artesanales.',
    '191496': 'Set completo de asado con utensilios premium.',
    '185813': 'Caja regalo con perfume de mujer de edición limitada.',
    '185814': 'Bolsa de madera natural ecológica, ideal para regalo.',
  }

  let id = 1
  for (const [code, sku, name, nameEdited, brand, stock, cost, price, ml, tn, category, date] of FIGMA_PRODUCTS) {
    out.push({
      id: id++,
      internal_code: code,
      sku,
      name,
      name_edited: nameEdited === name ? null : nameEdited,
      brand,
      category,
      stock,
      cost,
      price,
      updated_at: `${date} 09:3${(id % 6)}:00`,
      created_at: `${date} 09:30:00`,
      ml_status: ml,
      tn_status: tn,
      image_url: null,
      description: figmaDesc[code] ?? `${name}. Producto de alta calidad, listo para publicar.`,
      gtin: null,
      model: null,
      dimensions: '15x20x30,1500',
      drive_url: null,
    })
  }

  let i = 0
  for (const [name, category, ml, tn, stock, cost, price] of MORE) {
    const day = 10 + (i % 12)
    i++
    out.push({
      id: id++,
      internal_code: String(210000 + id * 7),
      sku: `MOCK-${String(id).padStart(3, '0')}`,
      name,
      name_edited: null,
      brand: ['HomeDeco', 'GiftBox', 'EcoWood', 'Urban House', 'Gourmet AR'][id % 5],
      category,
      stock,
      cost,
      price,
      updated_at: `2025-09-${String(day).padStart(2, '0')} 10:0${id % 6}:00`,
      created_at: '2025-08-01 10:00:00',
      ml_status: ml,
      tn_status: tn,
      image_url: null,
      description: `${name}. Producto de alta calidad, listo para publicar.`,
      gtin: null,
      model: null,
      dimensions: '20x25x35,1200',
      drive_url: null,
    })
  }
  return out
}

function makeListings(products: MockProduct[]): {
  ml: Map<number, MockListing>
  tn: Map<number, MockListing>
} {
  const ml = new Map<number, MockListing>()
  const tn = new Map<number, MockListing>()
  let listingId = 1
  for (const p of products) {
    if (p.ml_status !== 'unpublished') {
      const dbStatus =
        p.ml_status === 'published' ? 'active' : p.ml_status === 'paused' ? 'Paused.' : p.ml_status === 'prepublished' ? 'Procesando..' : 'Failed to Publish.'
      ml.set(p.id, {
        id: listingId++,
        platform: 'mercadolibre',
        account_id: 10,
        external_id: p.ml_status === 'published' || p.ml_status === 'paused' ? `MLA${1100000000 + p.id * 137}` : null,
        price: p.price,
        db_status: dbStatus,
        reason: p.ml_status === 'failed' ? '[{"cause": "Imagen inválida", "message": "La imagen principal no cumple los requisitos de MercadoLibre"}]' : null,
        remedy: p.ml_status === 'failed' ? 'Subir una imagen de al menos 500x500 px con fondo blanco' : null,
        permalink: p.ml_status === 'published' ? `https://articulo.mercadolibre.com.ar/MLA${1100000000 + p.id * 137}` : null,
        updated_at: p.updated_at,
      })
    }
    if (p.tn_status !== 'unpublished') {
      const dbStatus =
        p.tn_status === 'published' ? 'Published' : p.tn_status === 'paused' ? 'Paused.' : p.tn_status === 'prepublished' ? 'Procesando..' : 'Failed to Publish.'
      tn.set(p.id, {
        id: listingId++,
        platform: 'tiendanube',
        account_id: 11,
        external_id: p.tn_status === 'published' ? String(2000 + p.id) : null,
        price: p.price,
        db_status: dbStatus,
        reason: p.tn_status === 'failed' ? '[{"message": "Error al publicar"}]' : null,
        remedy: null,
        permalink: p.tn_status === 'published' ? `https://mitienda.mitiendanube.com/productos/mock-${p.id}` : null,
        updated_at: p.updated_at,
      })
    }
  }
  return { ml, tn }
}

function makeMovements(products: MockProduct[]): Map<number, StockMovement[]> {
  const map = new Map<number, StockMovement[]>()
  const statuses = ['posted', 'posted', 'posted', 'attempting', 'failed']
  let id = 1
  for (const p of products.slice(0, 14)) {
    const items: StockMovement[] = [
      {
        id: id++,
        account_id: 10,
        order_id: String(700000000 + p.id),
        direction: 'sale',
        quantity: 1,
        unit_price: p.price,
        target_system: 'bitcram',
        provider_doc_id: `DOC-${1000 + p.id}`,
        status: statuses[p.id % statuses.length],
        error_message: p.id % 5 === 4 ? 'Timeout al contactar Bitcram' : null,
        created_at: p.updated_at,
      },
    ]
    map.set(p.id, items)
  }
  return map
}

export function createMockDb() {
  const products = makeProducts()
  const { ml, tn } = makeListings(products)
  return {
    products,
    mlListings: ml,
    tnListings: tn,
    movements: makeMovements(products),
    images: new Map<number, MockImage[]>(),
    mlSettings: new Map<number, MLSettings>(),
    tnSettings: new Map<number, Record<string, { DEFAULT_VALUE: unknown; USER_INPUT_VALUE: unknown }>>(),
    imageSeq: 1,
  }
}

export type MockDb = ReturnType<typeof createMockDb>
