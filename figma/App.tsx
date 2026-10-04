import { useState, useEffect, useRef, createContext, useContext, type ReactNode } from "react";
import { toPng } from "html-to-image";
import omnipanelLogo from "./assets/omnipanel-lockup.png";

// ─── Types & Data ─────────────────────────────────────────────────────────────

type ChannelStatus = "unpublished" | "prepublished" | "published" | "paused" | "failed";

type Product = {
  id: number; internal_code: string; sku: string; gtin: string;
  name: string; name_edited: string | null;
  brand: string; model: string; category: string; stock: number;
  cost: number; price: number; dimensions: string;
  created_at: string; updated_at: string;
  ml_price: number | null; tn_price: number | null;
  description: string; ml_status: ChannelStatus; tn_status: ChannelStatus;
  images?: string[];
};

const QUESERA_IMGS = [
  "https://images.unsplash.com/photo-1665667107862-efcdba54298a?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
  "https://images.unsplash.com/photo-1665387075796-4d3717ee856c?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
  "https://images.unsplash.com/photo-1634976089466-2cacb8f9cbb8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
  "https://images.unsplash.com/photo-1688366150258-bee7b2d02479?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
  "https://images.unsplash.com/photo-1665667111473-fcca0e8ea4f0?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&q=80&w=600",
];

const rawProducts = [
  { id: 1, internal_code: "182762", sku: "QP-001", name: "Quesera Plástico Premium", name_edited: "Quesera Plástico", brand: "HomeDeco", model: "QP-PREM", category: "Cocina", stock: 0, cost: 817, price: 2500, dimensions: "15×20×30 cm", created_at: "2025-06-11", updated_at: "2025-09-20", ml_price: null, tn_price: null, description: "Quesera de plástico con tapa y 3 posiciones. Diseñada para almacenar y organizar quesos con tapa regulable.", ml_status: "failed", tn_status: "unpublished", images: QUESERA_IMGS },
  { id: 2, internal_code: "205311", sku: "PD-002", name: "Paño Decoración Estampado", name_edited: null, brand: "Textil Sur", model: "PD-EST", category: "Hogar", stock: 0, cost: 995, price: 3000, dimensions: "40×60×1 cm", created_at: "2025-05-22", updated_at: "2025-09-19", ml_price: 3200, tn_price: 3000, description: "Paño decorativo con estampado exclusivo para el hogar.", ml_status: "published", tn_status: "published" },
  { id: 3, internal_code: "214349", sku: "PV-003", name: "Promo Vaso y Perfume Set", name_edited: "Set Vaso + Perfume", brand: "GiftBox", model: "PV-SET", category: "Regalos", stock: 0, cost: 5000, price: 15000, dimensions: "25×15×10 cm", created_at: "2025-07-03", updated_at: "2025-09-18", ml_price: null, tn_price: 15500, description: "Set regalo con vaso y perfume de alta gama.", ml_status: "unpublished", tn_status: "prepublished" },
  { id: 4, internal_code: "193140", sku: "PM-004", name: "Promo Mate Día del Padre", name_edited: null, brand: "Yerba & Co", model: "PM-DDP", category: "Regalos", stock: 0, cost: 3320, price: 10000, dimensions: "20×20×15 cm", created_at: "2025-04-18", updated_at: "2025-09-17", ml_price: 10500, tn_price: null, description: "Kit de mate completo, ideal regalo Día del Padre.", ml_status: "paused", tn_status: "unpublished" },
  { id: 5, internal_code: "193141", sku: "PT-005", name: "Promo Taza + Perfume", name_edited: null, brand: "GiftBox", model: "PT-005", category: "Regalos", stock: 0, cost: 5000, price: 15000, dimensions: "22×14×12 cm", created_at: "2025-04-18", updated_at: "2025-09-16", ml_price: null, tn_price: null, description: "Combo taza personalizada + perfume importado.", ml_status: "unpublished", tn_status: "unpublished" },
  { id: 6, internal_code: "193142", sku: "PTC-006", name: "Promo Tabla + Chocolate", name_edited: "Set Tabla Gourmet", brand: "Gourmet AR", model: "PTC-GRM", category: "Gastronomía", stock: 1, cost: 10000, price: 30000, dimensions: "35×20×5 cm", created_at: "2025-03-30", updated_at: "2025-09-15", ml_price: 31000, tn_price: 30000, description: "Tabla de madera premium con selección de chocolates artesanales.", ml_status: "published", tn_status: "published" },
  { id: 7, internal_code: "191496", sku: "PSA-007", name: "Promo Set Asado Completo", name_edited: null, brand: "BBQ Arg", model: "PSA-FULL", category: "Gastronomía", stock: 0, cost: 11650, price: 35000, dimensions: "45×30×10 cm", created_at: "2025-05-09", updated_at: "2025-09-14", ml_price: null, tn_price: null, description: "Set completo de asado con utensilios premium.", ml_status: "unpublished", tn_status: "unpublished" },
  { id: 8, internal_code: "185813", sku: "PCP-008", name: "Promo Caja Perfume Mujer", name_edited: null, brand: "Belle", model: "PCP-W", category: "Belleza", stock: 1, cost: 6650, price: 20000, dimensions: "18×12×8 cm", created_at: "2025-02-14", updated_at: "2025-09-13", ml_price: null, tn_price: null, description: "Caja regalo con perfume de mujer de edición limitada.", ml_status: "unpublished", tn_status: "unpublished" },
  { id: 9, internal_code: "185814", sku: "PBM-009", name: "Promo Bolsa Madera Natural", name_edited: null, brand: "EcoWood", model: "PBM-NAT", category: "Hogar", stock: 1, cost: 6650, price: 20000, dimensions: "30×25×12 cm", created_at: "2025-02-14", updated_at: "2025-09-12", ml_price: null, tn_price: null, description: "Bolsa de madera natural ecológica, ideal para regalo.", ml_status: "unpublished", tn_status: "unpublished" },
];
const products: Product[] = rawProducts.map(p => ({ ...p, gtin: `779${String(p.id).padStart(4, "0")}${p.internal_code}` } as Product));

const fmt = (n: number) => `$${n.toLocaleString("es-AR")}`;
const margin = (cost: number, price: number) => Math.round(((price - cost) / price) * 100);

// ─── Channel config (persisted at panel level) ─────────────────────────────────

type MLConfig = {
  iva: string; imp: string; isKit: boolean; envioMode: string; localPickup: boolean;
  freeShipping: boolean; logistic: string; warrantyType: string; warrantyTime: string; listing: string;
};
const ML_CONFIG_DEFAULT: MLConfig = {
  iva: "21 %", imp: "0 %", isKit: false, envioMode: "me2", localPickup: true,
  freeShipping: false, logistic: "drop_off", warrantyType: "Garantía del vendedor", warrantyTime: "30 dias", listing: "gold_special",
};

type TNConfig = {
  gender: string; ageGroup: string; freeShipping: boolean; mpn: string; barcode: string;
  tags: string; promoPrice: string; videoUrl: string; seoTitle: string; seoDesc: string;
};
const TN_CONFIG_DEFAULT: TNConfig = {
  gender: "—", ageGroup: "—", freeShipping: false, mpn: "", barcode: "",
  tags: "", promoPrice: "", videoUrl: "", seoTitle: "", seoDesc: "",
};

// ─── MercadoLibre catálogo ──────────────────────────────────────────────────────
// Una publicación ML puede ser "tradicional" (el vendedor controla la ficha) o estar
// "en catálogo" (la ficha la define MercadoLibre; el vendedor solo pone precio/stock).
type CatalogState = "traditional" | "catalog";
type CatalogComp = "winning" | "tied" | "losing" | "cannot";

type CatalogProduct = { id: string; name: string; brand: string; model: string; color: string; gtin: string; url: string };

// Fichas estándar de catálogo (candidatos de matching).
const CATALOG_PRODUCTS: CatalogProduct[] = [
  { id: "MLA19283", name: "Tabla De Madera Premium Para Picada 35x20cm", brand: "Gourmet AR", model: "GRM-TBL35", color: "Madera natural", gtin: "7790000019283", url: "https://www.mercadolibre.com.ar/p/MLA19283" },
  { id: "MLA44821", name: "Set De Mate Completo Acero Inoxidable", brand: "Yerba & Co", model: "YC-MATE-01", color: "Plata", gtin: "7790000044821", url: "https://www.mercadolibre.com.ar/p/MLA44821" },
  { id: "MLA77390", name: "Paño Decorativo Estampado 40x60cm", brand: "Textil Sur", model: "TS-PANO-EST", color: "Multicolor", gtin: "7790000077390", url: "https://www.mercadolibre.com.ar/p/MLA77390" },
  { id: "MLA55018", name: "Quesera Plástica Con Tapa Regulable 3 Posiciones", brand: "HomeDeco", model: "HD-QSR-3P", color: "Verde menta", gtin: "7790000055018", url: "https://www.mercadolibre.com.ar/p/MLA55018" },
  { id: "MLA63204", name: "Perfume Importado Edición Limitada 100ml", brand: "Belle", model: "BL-PERF-100", color: "—", gtin: "7790000063204", url: "https://www.mercadolibre.com.ar/p/MLA63204" },
  { id: "MLA88117", name: "Combo Mate + Bombilla + Yerbera Set Completo", brand: "Yerba & Co", model: "YC-COMBO", color: "Negro", gtin: "7790000088117", url: "https://www.mercadolibre.com.ar/p/MLA88117" },
];

type CatalogBoost = { key: string; label: string; done: boolean };
type CatalogCompetition = { status: CatalogComp; myPrice: number; priceToWin: number; winnerPrice: number; tiedWith: number; cannotReason: string; boosts: CatalogBoost[] };
type CatalogInfo = {
  state: CatalogState;
  product: CatalogProduct;      // ficha estándar asociada (real si catálogo, sugerida si tradicional)
  mandatory: boolean;           // la categoría obliga a vender en catálogo
  eligible: boolean;            // tradicional elegible para vincularse
  autoOptin: boolean;           // MercadoLibre lo puso en catálogo por su cuenta
  canOptOut: boolean;           // puede salir de catálogo y volver a tradicional
  optOutReason: string;         // por qué no puede salir (si canOptOut === false)
  ineligibleReason: string;     // por qué no es elegible (si tradicional y !eligible)
  shadow: { active: boolean; note: string } | null;  // publicación tradicional "sombra"
  competition: CatalogCompetition | null;
};

const COMP_META: Record<CatalogComp, { label: string; color: string; bg: string; border: string }> = {
  winning: { label: "Ganando", color: "#16A34A", bg: "#F0FDF4", border: "#BBF7D0" },
  tied:    { label: "Empatando", color: "#D97706", bg: "#FFFBEB", border: "#FDE68A" },
  losing:  { label: "Perdiendo", color: "#DC2626", bg: "#FEF2F2", border: "#FECACA" },
  cannot:  { label: "No puede competir", color: "#64748B", bg: "#F8FAFC", border: "#E2E8F0" },
};

function mlCatalog(p: Product): CatalogInfo {
  const cp = CATALOG_PRODUCTS[p.id % CATALOG_PRODUCTS.length];
  const isCatalog = p.id % 3 === 0;                    // 3, 6, 9 → en catálogo
  const mandatory = p.id % 5 === 0;                    // categoría obliga catálogo
  const autoOptin = isCatalog && p.id % 2 === 0;       // Meli lo puso solo (sin tradicional previa)
  const eligible = !isCatalog && p.id % 2 === 0;       // tradicionales elegibles
  const price = p.ml_price ?? p.price;
  const comps: CatalogComp[] = ["winning", "tied", "losing", "cannot"];
  const status = comps[(p.id * 7) % comps.length];
  const shadowActive = isCatalog && !autoOptin;        // había una tradicional detrás
  const competition: CatalogCompetition | null = isCatalog ? {
    status,
    myPrice: price,
    winnerPrice: Math.round(price * 0.93),
    priceToWin: Math.round(price * 0.93),
    tiedWith: 1 + (p.id % 3),
    cannotReason: "necesitás al menos 2 unidades de stock para competir por esta ficha.",
    boosts: [
      { key: "free_ship", label: "Ofrecé envío gratis", done: p.id % 2 === 0 },
      { key: "full", label: "Activá MercadoLibre Full", done: p.id % 4 === 0 },
      { key: "cuotas", label: "Sumá cuotas sin interés", done: p.id % 3 === 1 },
    ],
  } : null;
  return {
    state: isCatalog ? "catalog" : "traditional",
    product: cp,
    mandatory,
    eligible,
    autoOptin,
    canOptOut: isCatalog && !mandatory && shadowActive,
    optOutReason: mandatory
      ? "La categoría exige vender en catálogo, no es posible volver a una publicación tradicional."
      : "Esta publicación nació en catálogo y no tiene una publicación tradicional previa a la que volver.",
    ineligibleReason: "MercadoLibre todavía no tiene una ficha de catálogo para este producto.",
    shadow: shadowActive ? { active: true, note: "Tu publicación tradicional sigue activa detrás del catálogo." } : null,
    competition,
  };
}

// Píldora reutilizable: Catálogo vs Tradicional (listado y drawer).
function CatalogTag({ state, size = "sm" }: { state: CatalogState; size?: "sm" | "xs" }) {
  const isCat = state === "catalog";
  const pad = size === "xs" ? "px-1.5 py-0.5" : "px-2 py-0.5";
  const fs = size === "xs" ? "10px" : "11px";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold ${pad}`}
      style={{ fontSize: fs, color: isCat ? "#4F46E5" : "#64748B", background: isCat ? "#EEF2FF" : "#F1F5F9", border: `1px solid ${isCat ? "#C7D2FE" : "#E2E8F0"}` }}>
      {isCat ? (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M6 1.5l4 2v5l-4 2-4-2v-5l4-2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /><path d="M2 3.5l4 2 4-2M6 5.5V10" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="1.5" y="2" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1" /><path d="M3.5 5h5M3.5 7h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg>
      )}
      {isCat ? "Catálogo" : "Tradicional"}
    </span>
  );
}

// ─── MercadoLibre publication performance (mercadolibre.performance) ─────────────

type PerfRule = { status: "COMPLETED" | "PENDING"; label: string; title: string; link: string };
type PerfVariable = { key: string; score: number; title: string; status: "COMPLETED" | "PENDING"; rule: PerfRule };
type PerfBucket = { key: string; title: string; score: number; variables: PerfVariable[] };

const PERFORMANCE = {
  score: 65,
  level: "medium",
  level_wording: "Estándar",
  updated_at: "2026-09-19 18:12:22",
  buckets: [
    {
      key: "USER_PRODUCT", title: "Datos del producto", score: 72,
      variables: [
        { key: "UP_STOCK_AVAILABILITY_TIME", score: 100, title: "Quitá el tiempo de disponibilidad para que tu publicación sea más competitiva", status: "COMPLETED", rule: { status: "COMPLETED", label: "Quitar tiempo", title: "Quitá el tiempo de disponibilidad para que tu publicación sea más competitiva", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_TITLE", score: 100, title: "Mejorá el título o usá nuestra sugerencia para atraer a más compradores", status: "COMPLETED", rule: { status: "COMPLETED", label: "Agregar detalles", title: "Sumá más detalles, el título debe tener al menos 3 palabras.", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_PICTURES", score: 100, title: "Mejorá las fotos para tener más visitas", status: "COMPLETED", rule: { status: "COMPLETED", label: "Generar fotos", title: "Agregá más fotos para mostrar tu producto desde diferentes ángulos, subí 3 como mínimo.", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_CATALOG", score: 100, title: "Verificá el producto de catálogo que te sugerimos y competí para ser la primera opción de compra", status: "COMPLETED", rule: { status: "COMPLETED", label: "Verificar producto", title: "Verificá el producto de catálogo que te sugerimos y competí para ser la primera opción de compra.", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_TECHNICAL_SPECIFICATIONS_MAIN", score: 100, title: "Corregí las características para recibir menos preguntas y devoluciones", status: "COMPLETED", rule: { status: "COMPLETED", label: "Completar", title: "Completá las características principales.", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_GTIN", score: 100, title: "Indicá el código universal de tu producto para no perder exposición", status: "COMPLETED", rule: { status: "COMPLETED", label: "Completar código", title: "Asegurate de completar el código que pertenezca a este producto para estar más arriba en los resultados de búsqueda.", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_SHORTS", score: 0, title: "Creá un video para no perder ventas", status: "PENDING", rule: { status: "PENDING", label: "Crear video", title: "Los videos tienen que ser de hasta un minuto, en formato vertical y se van a publicar en todas tus variantes.", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_STOCK_DEPOSITO", score: 0, title: "Agregá más stock y evitá perder ventas", status: "PENDING", rule: { status: "PENDING", label: "Agregar stock", title: "Asegurate de que tu publicación tenga 2 o más unidades disponibles.", link: "https://www.mercadolibre.com.ar" } },
      ],
    },
    {
      key: "ITEM", title: "Condiciones de venta", score: 55,
      variables: [
        { key: "UP_PROMOTIONS", score: 0, title: "Participá de una promoción para recibir más visitas", status: "PENDING", rule: { status: "PENDING", label: "Participar", title: "Participá de una promoción para recibir más visitas", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_FREE_SHIPPING", score: 100, title: "Ofrecé envío gratis para que tu publicación sea más competitiva", status: "COMPLETED", rule: { status: "COMPLETED", label: "Ofrecer envío", title: "Ofrecé envío gratis para que tu publicación sea más competitiva", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_ME_FLEX_ITEM_OPTIN", score: 100, title: "Entregá en el día con Envíos Flex para que tu publicación sea más competitiva", status: "COMPLETED", rule: { status: "COMPLETED", label: "Ofrecer envío", title: "Entregá en el día con Envíos Flex para que tu publicación sea más competitiva", link: "https://www.mercadolibre.com.ar" } },
        { key: "UP_FINANCING", score: 0, title: "Agregá cuotas al mismo precio que publicaste para que tu publicación sea más competitiva", status: "PENDING", rule: { status: "PENDING", label: "Agregar cuotas", title: "Agregá cuotas al mismo precio que publicaste para que tu publicación sea más competitiva", link: "https://www.mercadolibre.com.ar" } },
      ],
    },
  ] as PerfBucket[],
};

const STATUS: Record<ChannelStatus, { label: string; color: string; bg: string }> = {
  unpublished: { label: "Sin publicar", color: "#94A3B8", bg: "#F1F5F9" },
  prepublished: { label: "Pre-publicado", color: "#D97706", bg: "#FEF3C7" },
  published:    { label: "Publicado",     color: "#16A34A", bg: "#DCFCE7" },
  paused:       { label: "Pausado",       color: "#EA580C", bg: "#FFF7ED" },
  failed:       { label: "Sin publicar",   color: "#94A3B8", bg: "#F1F5F9" },
};

// Line icons (24 viewBox, inherit color via currentColor)
const ICONS = {
  refresh: (
    <>
      <path d="M20.5 9a8 8 0 1 0 .4 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 4v5h-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  pause: (
    <>
      <rect x="7" y="5" width="3.5" height="14" rx="1.5" fill="currentColor" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1.5" fill="currentColor" />
    </>
  ),
  play: <path d="M7 4.5l13 7.5-13 7.5V4.5z" fill="currentColor" />,
  photos: (
    <>
      <rect x="3" y="4.5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" />
      <path d="M4 16.5l4.5-4 3.5 3 3-2.5 5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  gauge: (
    <>
      <path d="M3 20h18M6 20v-6M11 20V8M16 20v-9M20.5 20V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 7l1 12.5A1.5 1.5 0 0 0 8.5 21h7a1.5 1.5 0 0 0 1.5-1.5L18 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

// Iconos 24×24 para acciones de catálogo en el toolbar.
const ICONS_CATALOG = {
  link: <path d="M9.5 14.5l5-5M9 6l1.5-1.5a3.5 3.5 0 015 5L15 11M15 18l-1.5 1.5a3.5 3.5 0 01-5-5L9 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />,
  exit: <><path d="M9 4.5H4.5v15H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M15 7l5 5-5 5M20 12H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></>,
};

// Sample failure reasons — the backend returns one human sentence per failed action.
// In production this string comes straight from the API's `reason`.
const FAIL_REASONS: Record<"ml" | "tn", Record<string, string>> = {
  ml: {
    publicar: "La categoría MLA376317 requiere un precio mínimo de $3.500.",
    actualizar: "El ítem en estado activo no puede actualizarse en este momento.",
    pausar: "Transición de estado inválida: la publicación no puede pausarse ahora.",
    eliminar: "No se puede eliminar un ítem con ventas activas.",
    reactivar: "No se pudo reactivar la publicación en el canal.",
  },
  tn: {
    publicar: "Faltan datos obligatorios para publicar en la tienda.",
    actualizar: "No se pudo sincronizar la actualización con la tienda.",
    pausar: "La publicación no puede pausarse en este momento.",
    eliminar: "No se puede eliminar un producto con ventas activas.",
    reactivar: "No se pudo reactivar la publicación en la tienda.",
  },
};

// ─── Atoms ────────────────────────────────────────────────────────────────────

function ImgPlaceholder({ size = 36 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center flex-shrink-0 rounded-xl"
      style={{ width: size, height: size, background: "#F1F5F9", border: "1px solid #E2E8F0" }}>
      <svg width={size * 0.44} height={size * 0.44} viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" fill="#E2E8F0" />
        <circle cx="9" cy="9" r="2" fill="#CBD5E1" />
        <path d="M3 16l5-5 4 4 3-3 6 6" stroke="#CBD5E1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function TrashIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 4h11M6 4V2.8A.8.8 0 0 1 6.8 2h2.4a.8.8 0 0 1 .8.8V4M12.5 4l-.6 8.4a1 1 0 0 1-1 .9H5.1a1 1 0 0 1-1-.9L3.5 4M6.5 6.8v4M9.5 6.8v4" />
    </svg>
  );
}

const IMG_DEL_WARNED_KEY = "omnipanel.imgdel.warned";

function ImageGallery({ images, alt }: { images?: string[]; alt: string }) {
  const [list, setList] = useState<string[]>(images ?? []);
  const [active, setActive] = useState(0);

  const [confirmIdx, setConfirmIdx] = useState<number | null>(null);

  const remove = (i: number) => {
    setList(prev => prev.filter((_, idx) => idx !== i));
    setActive(a => (i < a ? a - 1 : Math.min(a, list.length - 2)));
  };
  // Solo se confirma la primera vez por sesión de navegador.
  const requestRemove = (i: number) => {
    let warned = false;
    try { warned = sessionStorage.getItem(IMG_DEL_WARNED_KEY) === "1"; } catch { /* storage bloqueado */ }
    if (warned) remove(i); else setConfirmIdx(i);
  };
  const confirmRemove = () => {
    if (confirmIdx == null) return;
    try { sessionStorage.setItem(IMG_DEL_WARNED_KEY, "1"); } catch { /* storage bloqueado */ }
    remove(confirmIdx); setConfirmIdx(null);
  };

  const EmptySlot = (
    <div className="w-full aspect-square rounded-2xl flex items-center justify-center" style={{ background: "#F1F5F9", border: "1px solid #E2E8F0" }}>
      <svg width="52" height="52" viewBox="0 0 64 64" fill="none">
        <rect x="8" y="8" width="48" height="48" rx="8" fill="#E2E8F0" />
        <circle cx="24" cy="24" r="6" fill="#CBD5E1" />
        <path d="M8 44l14-14 10 10 8-8 16 16" stroke="#CBD5E1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );

  const AddButton = (
    <button className="w-full py-2 rounded-lg text-xs font-medium transition-colors hover:bg-slate-100 flex items-center justify-center gap-1.5" style={{ color: "#64748B", border: "1px solid #E2E8F0" }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      {list.length === 0 ? "Subir imagen" : "Agregar imagen"}
    </button>
  );

  if (list.length === 0) {
    return <div className="flex flex-col gap-3">{EmptySlot}{AddButton}</div>;
  }

  const idx = Math.min(active, list.length - 1);

  return (
    <div className="flex flex-col gap-2.5">
      {/* Featured image */}
      <div className="relative w-full aspect-square rounded-2xl overflow-hidden group" style={{ background: "#F1F5F9", border: "1px solid #E2E8F0" }}>
        <img src={list[idx]} alt={`${alt} — imagen ${idx + 1}`} className="w-full h-full object-cover" />
        <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-white" style={{ fontSize: "10px", fontWeight: 600, background: "rgba(10,22,40,0.55)", backdropFilter: "blur(4px)" }}>
          {idx + 1}/{list.length}
        </span>
        <button onClick={() => requestRemove(idx)} title="Quitar imagen"
          className="absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "rgba(220,38,38,0.92)", backdropFilter: "blur(4px)" }}>
          <TrashIcon size={13} />
        </button>
      </div>

      {/* Horizontal filmstrip — single row, scrolls sideways.
          Selección clara (anillo indigo) y patrón de dos pasos: el tacho aparece solo
          en la miniatura ya seleccionada, con su propia zona de toque separada. */}
      <div className="flex gap-3 overflow-x-auto pt-2.5 pb-1.5 px-1.5 -mx-1.5" style={{ scrollbarWidth: "thin" }}>
        {list.map((src, i) => {
          const selected = idx === i;
          return (
            <div key={i} className="relative flex-shrink-0" style={{ width: 62, height: 62 }}>
              <button onClick={() => setActive(i)} title={`Imagen ${i + 1}`}
                className="w-full h-full rounded-xl overflow-hidden transition-all block"
                style={{
                  border: selected ? "2px solid #4F46E5" : "1px solid #E2E8F0",
                  boxShadow: selected ? "0 0 0 3px rgba(79,70,229,0.18), 0 4px 10px rgba(15,23,42,0.12)" : "none",
                  opacity: selected ? 1 : 0.82,
                  transform: selected ? "scale(1)" : "scale(0.96)",
                }}
                onMouseEnter={e => { if (!selected) { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "scale(1)"; } }}
                onMouseLeave={e => { if (!selected) { e.currentTarget.style.opacity = "0.82"; e.currentTarget.style.transform = "scale(0.96)"; } }}>
                <img src={src} alt={`${alt} miniatura ${i + 1}`} className="w-full h-full object-cover" />
              </button>
              {selected && (
                <button onClick={e => { e.stopPropagation(); requestRemove(i); }} title="Quitar imagen"
                  className="absolute flex items-center justify-center rounded-full transition-transform"
                  style={{ top: -9, right: -9, width: 24, height: 24, background: "white", border: "1px solid #FECACA", color: "#DC2626", boxShadow: "0 2px 6px rgba(15,23,42,0.18)", animation: "fadeUp 0.15s ease both" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#FEF2F2"; e.currentTarget.style.transform = "scale(1.08)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.transform = "scale(1)"; }}>
                  <TrashIcon size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {AddButton}

      {confirmIdx != null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} onClick={() => setConfirmIdx(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby="imgdel-title" className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "fadeUp 0.18s ease both" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: "#FEF2F2", color: "#DC2626" }}>
                <TrashIcon size={18} />
              </div>
              <h3 id="imgdel-title" className="text-lg font-bold" style={{ color: "#0A1628" }}>¿Eliminar esta imagen?</h3>
            </div>
            <div className="flex items-center gap-3">
              <img src={list[confirmIdx]} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" style={{ border: "1px solid #E2E8F0" }} />
              <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>La imagen se va a quitar del producto y de la galería. Esta acción no se puede deshacer.</p>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setConfirmIdx(null)} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Cancelar</button>
              <button onClick={confirmRemove} autoFocus className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors" style={{ background: "#DC2626" }}>Eliminar imagen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type StatusVariant = "soft" | "chip" | "outline" | "lifecycle";
const StatusVariantContext = createContext<StatusVariant>("soft");

// Small glyph per status (12px, currentColor)
const STATUS_ICON: Record<ChannelStatus, ReactNode> = {
  published: <path d="M3.5 6.2l1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  paused: <><path d="M4.5 3.5v5M7.5 3.5v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></>,
  prepublished: <><circle cx="6" cy="6" r="3.6" stroke="currentColor" strokeWidth="1.3" /><path d="M6 4v2l1.4.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></>,
  unpublished: <path d="M3.6 6h4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
  failed: <path d="M3.6 6h4.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />,
};
// Lifecycle position: draft → ready → live
const STATUS_STAGE: Record<ChannelStatus, number> = { unpublished: 0, failed: 0, prepublished: 1, published: 2, paused: 2 };

function StatusBadge({ status, variant }: { status: ChannelStatus; variant?: StatusVariant }) {
  const ctx = useContext(StatusVariantContext);
  const v = variant ?? ctx;
  const s = STATUS[status];
  const glyph = <svg width="12" height="12" viewBox="0 0 12 12" fill="none">{STATUS_ICON[status]}</svg>;

  if (v === "chip") {
    // Concept 1 — tinted icon tile + label (product-status style)
    return (
      <span className="inline-flex items-center gap-2">
        <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ color: s.color, background: s.bg }}>{glyph}</span>
        <span className="text-xs font-medium" style={{ color: "#334155" }}>{s.label}</span>
      </span>
    );
  }

  if (v === "outline") {
    // Concept 2 — ghost outline pill with leading glyph
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: s.color, background: "white", border: `1px solid ${s.color}40` }}>
        <span style={{ color: s.color, display: "flex" }}>{glyph}</span>
        {s.label}
      </span>
    );
  }

  if (v === "lifecycle") {
    // Concept 3 — mini lifecycle tracker (draft → ready → live) + label
    const stage = STATUS_STAGE[status];
    return (
      <span className="inline-flex items-center gap-2">
        <span className="flex items-center gap-0.5">
          {[0, 1, 2].map(i => (
            <span key={i} className="rounded-full transition-all" style={{ width: i === stage ? 12 : 7, height: 3, background: i <= stage ? s.color : "#E2E8F0" }} />
          ))}
        </span>
        <span className="text-xs font-medium" style={{ color: s.color }}>{s.label}</span>
      </span>
    );
  }

  // soft — current default (product table)
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: s.color, background: s.bg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.color }} />
      {s.label}
    </span>
  );
}

// ─── ML Category step ────────────────────────────────────────────────────────

const ML_CATEGORIES = [
  { id: "MLA433536", domain_id: "MLA-FOOD_CONTAINERS",       domain_name: "Contenedores de alimentos", category_name: "Tápers y contenedores" },
  { id: "MLA372471", domain_id: "MLA-KITCHEN_ACCESSORIES",   domain_name: "Accesorios de cocina",      category_name: "Accesorios de cocina" },
  { id: "MLA981234", domain_id: "MLA-TABLEWARE",             domain_name: "Vajilla y cristalería",     category_name: "Queseras y tablas" },
];

function MLCategoryStep({ onConfirm, accent }: { onConfirm: () => void; accent: string }) {
  const [selected, setSelected] = useState<string | null>(ML_CATEGORIES[0].id);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [regenerating, setRegenerate] = useState(false);

  const selectedCat = ML_CATEGORIES.find(c => c.id === selected);
  const visible = ML_CATEGORIES.filter(c =>
    !query ||
    c.category_name.toLowerCase().includes(query.toLowerCase()) ||
    c.domain_name.toLowerCase().includes(query.toLowerCase())
  );

  const handleRegenerate = () => {
    setRegenerate(true);
    setSelected(null);
    setOpen(true);
    setTimeout(() => setRegenerate(false), 1200);
  };

  return (
    <div className="flex flex-col gap-4">

      {/* Picker card */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span style={{ fontSize: "10px", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.07em", fontWeight: 600 }}>Categoría</span>
          <button onClick={handleRegenerate} disabled={regenerating}
            className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-md transition-colors hover:bg-slate-100"
            style={{ color: regenerating ? "#CBD5E1" : "#64748B" }}>
            <svg width="10" height="10" viewBox="0 0 14 14" fill="none" style={{ animation: regenerating ? "spin 0.8s linear infinite" : "none" }}>
              <path d="M12 7A5 5 0 1 1 7 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7 2l1.5 1.5L7 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {regenerating ? "Buscando…" : "Regenerar"}
          </button>
        </div>

        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
          style={{ background: open ? "#EEF2FF" : "white", border: `1px solid ${open ? "#C7D2FE" : "#E2E8F0"}` }}>
          {selectedCat ? (
            <div>
              <p className="text-xs font-semibold" style={{ color: "#0A1628" }}>{selectedCat.category_name}</p>
              <p style={{ fontSize: "10px", color: "#94A3B8", marginTop: "1px" }}>{selectedCat.domain_name} · {selectedCat.id}</p>
            </div>
          ) : (
            <span className="text-xs" style={{ color: "#94A3B8" }}>Seleccionar categoría…</span>
          )}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            style={{ color: "#94A3B8", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {open && (
          <div className="mt-1 rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)", opacity: regenerating ? 0.4 : 1, transition: "opacity 0.2s" }}>
            {/* Search */}
            <div className="relative" style={{ borderBottom: "1px solid #F1F5F9" }}>
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="11" height="11" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="#CBD5E1" strokeWidth="1.4" />
                <path d="M9.5 9.5L12 12" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Buscar…" autoFocus
                className="w-full pl-8 pr-3 py-2 text-xs outline-none bg-white"
                style={{ color: "#0A1628" }} />
            </div>
            {/* Options */}
            <div className="p-1.5 flex flex-col gap-0.5">
              {visible.map((cat) => {
                const isSel = cat.id === selected;
                return (
                  <button key={cat.id} onClick={() => { setSelected(cat.id); setOpen(false); setQuery(""); }}
                    className="w-full text-left px-2.5 py-2 rounded-lg transition-colors hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs truncate" style={{ color: isSel ? accent : "#0A1628", fontWeight: isSel ? 600 : 500 }}>{cat.category_name}</p>
                        <p style={{ fontSize: "10px", color: "#94A3B8", marginTop: "1px" }} className="truncate">{cat.domain_name} · {cat.id}</p>
                      </div>
                      {isSel && (
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="flex-shrink-0" style={{ color: accent }}>
                          <path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}

// ─── ML Config step ──────────────────────────────────────────────────────────

const LISTING_TYPES = [
  { id: "gold_pro",     name: "Premium",     sale_fee: 1640.23, pct: 27.7,  meli_pct: 14.3, financing: 13.4, fixed: 1330 },
  { id: "gold_special", name: "Clásica",     sale_fee: 1490.15, pct: 14.3,  meli_pct: 14.3, financing: 0,    fixed: 1330 },
  { id: "gold_premium", name: "Oro Premium", sale_fee: 0,       pct: 0,     meli_pct: 0,    financing: 0,    fixed: 0    },
  { id: "gold",         name: "Oro",         sale_fee: 0,       pct: 0,     meli_pct: 0,    financing: 0,    fixed: 0    },
  { id: "silver",       name: "Plata",       sale_fee: 0,       pct: 0,     meli_pct: 0,    financing: 0,    fixed: 0    },
  { id: "bronze",       name: "Bronce",      sale_fee: 0,       pct: 0,     meli_pct: 0,    financing: 0,    fixed: 0    },
  { id: "free",         name: "Gratuita",    sale_fee: 0,       pct: 0,     meli_pct: 0,    financing: 0,    fixed: 0    },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#94A3B8", letterSpacing: "0.08em" }}>{children}</span>
      <div className="flex-1 h-px" style={{ background: "#F1F5F9" }} />
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5" style={{ borderBottom: "1px solid #F8FAFC" }}>
      <span className="text-xs flex-shrink-0" style={{ color: "#64748B" }}>{label}</span>
      {children}
    </div>
  );
}


// Toggle switch for booleans
function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className="relative flex-shrink-0 transition-all"
      style={{ width: "36px", height: "20px", borderRadius: "10px", background: value ? "#0A1628" : "#E2E8F0" }}>
      <span className="absolute top-0.5 transition-all"
        style={{ width: "16px", height: "16px", borderRadius: "8px", background: "white", left: value ? "18px" : "2px", boxShadow: "0 1px 3px rgba(0,0,0,0.15)" }} />
    </button>
  );
}

// Listing type picker — shows fee breakdown per campaign option
function ListingTypePicker({ value, onChange, accent }: { value: string; onChange: (id: string) => void; accent: string }) {
  const [open, setOpen] = useState(false);
  const selected = LISTING_TYPES.find(l => l.id === value) ?? LISTING_TYPES[0];

  return (
    <div>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all"
        style={{ background: open ? "#EEF2FF" : "white", border: `1px solid ${open ? "#C7D2FE" : "#E2E8F0"}` }}>
        <span style={{ fontSize: "10px", color: "#94A3B8" }}>Campaña</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>{selected.name}</span>
          {selected.pct > 0 && (
            <span className="text-xs font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
              style={{ background: "#FFFBEB", color: accent }}>{selected.pct}%</span>
          )}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
            style={{ color: "#94A3B8", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {open && (
        <div className="mt-1 rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0", boxShadow: "0 4px 16px rgba(0,0,0,0.07)" }}>
          {LISTING_TYPES.map((lt, i) => (
            <button key={lt.id} onClick={() => { onChange(lt.id); setOpen(false); }}
              className="w-full text-left transition-all"
              style={{ borderTop: i > 0 ? "1px solid #F8FAFC" : "none", background: lt.id === value ? "#FFFBEB" : "white" }}>
              <div className="flex items-start justify-between px-3 py-2.5 gap-3">
                <div className="flex items-center gap-2 flex-shrink-0 pt-0.5">
                  <div className="w-3 h-3 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ border: `2px solid ${lt.id === value ? accent : "#E2E8F0"}`, background: lt.id === value ? accent : "white" }}>
                    {lt.id === value && <div className="w-1 h-1 rounded-full bg-white" />}
                  </div>
                  <span className="text-xs font-semibold" style={{ color: "#0A1628", whiteSpace: "nowrap" }}>{lt.name}</span>
                </div>
                {lt.pct > 0 ? (
                  <div className="flex flex-col items-end gap-1 min-w-0">
                    <span className="text-xs font-bold tabular-nums" style={{ color: accent }}>{lt.pct}% total</span>
                    <div className="flex flex-wrap justify-end gap-x-3 gap-y-0.5">
                      <span style={{ fontSize: "10px", color: "#94A3B8" }}>ML {lt.meli_pct}%</span>
                      {lt.financing > 0 && <span style={{ fontSize: "10px", color: "#94A3B8" }}>Financ. {lt.financing}%</span>}
                      {lt.fixed > 0 && <span style={{ fontSize: "10px", color: "#94A3B8" }}>Fijo ${lt.fixed.toLocaleString("es-AR")}</span>}
                    </div>
                  </div>
                ) : (
                  <span style={{ fontSize: "10px", color: "#CBD5E1" }}>Sin comisión activa</span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Value cards: each field is a compact card showing current value, click to open inline picker
function ValueCard({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all group"
        style={{ background: open ? "#EEF2FF" : "white", border: `1px solid ${open ? "#C7D2FE" : "#E2E8F0"}` }}>
        <span style={{ fontSize: "10px", color: "#94A3B8" }}>{label}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>{value}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: "#94A3B8", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 rounded-xl p-1.5 flex flex-col gap-0.5 min-w-full"
          style={{ background: "white", border: "1px solid #E2E8F0", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }}>
          {options.map(o => (
            <button key={o} onClick={() => { onChange(o); setOpen(false); }}
              className="text-left px-3 py-1.5 rounded-lg text-xs transition-all hover:bg-slate-50"
              style={{ color: o === value ? "#4F46E5" : "#0A1628", fontWeight: o === value ? 600 : 400 }}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MLConfigB({ cfg, set, accent }: { cfg: MLConfig; set: <K extends keyof MLConfig>(k: K, v: MLConfig[K]) => void; accent: string }) {
  const { iva, imp, isKit, envioMode, localPickup, freeShipping, logistic, warrantyType, warrantyTime, listing } = cfg;
  const setIva = (v: string) => set("iva", v);
  const setImp = (v: string) => set("imp", v);
  const setIsKit = (v: boolean) => set("isKit", v);
  const setEnvioMode = (v: string) => set("envioMode", v);
  const setLocalPickup = (v: boolean) => set("localPickup", v);
  const setFreeShipping = (v: boolean) => set("freeShipping", v);
  const setLogistic = (v: string) => set("logistic", v);
  const setWarrantyType = (v: string) => set("warrantyType", v);
  const setWarrantyTime = (v: string) => set("warrantyTime", v);
  const setListing = (v: string) => set("listing", v);

  return (
    <div className="flex flex-col gap-5">

      <div className="flex flex-col gap-3">
        <SectionLabel>Atributos</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ background: "white", border: "1px solid #E2E8F0", gridColumn: "span 2" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Es un kit de fábrica</span>
            <Toggle value={isKit} onChange={setIsKit} />
          </div>
          <ValueCard label="IVA" value={iva} options={["Exento","0 %","10.5 %","21 %","27 %"]} onChange={setIva} />
          <ValueCard label="Impuesto interno" value={imp} options={["0 %","1 %","2.5 %","4 %","5 %","8 %","10 %","15 %","20 %","25 %"]} onChange={setImp} />
        </div>

        <SectionLabel>Envío</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <ValueCard label="Método" value={envioMode} options={["me1","me2","not_specified","custom"]} onChange={setEnvioMode} />
          <ValueCard label="Logística" value={logistic} options={["fulfillment","cross_docking","self_service","drop_off","custom"]} onChange={setLogistic} />
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ background: "white", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Buscar en local</span>
            <Toggle value={localPickup} onChange={setLocalPickup} />
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
            style={{ background: "white", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Envío gratis</span>
            <Toggle value={freeShipping} onChange={setFreeShipping} />
          </div>
        </div>

        <SectionLabel>Condiciones de venta</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div style={{ gridColumn: "span 2" }}>
            <ValueCard label="Tipo de garantía" value={warrantyType}
              options={["Garantía del vendedor","Garantía de fábrica","Sin garantía"]} onChange={setWarrantyType} />
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl col-span-2"
            style={{ background: "white", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Tiempo de garantía</span>
            <input value={warrantyTime} onChange={e => setWarrantyTime(e.target.value)}
              className="text-xs font-semibold outline-none bg-transparent text-right"
              style={{ color: "#0A1628", width: "80px" }} />
          </div>
        </div>

        <SectionLabel>Publicación</SectionLabel>
        <ListingTypePicker value={listing} onChange={setListing} accent={accent} />
      </div>

    </div>
  );
}

function MLConfigStep({ cfg, set, accent }: { cfg: MLConfig; set: <K extends keyof MLConfig>(k: K, v: MLConfig[K]) => void; accent: string }) {
  return <MLConfigB cfg={cfg} set={set} accent={accent} />;
}

// ─── ML catálogo: nota explicativa reutilizable ────────────────────────────────
function CatalogHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5" style={{ background: "#EEF2FF", border: "1px solid #C7D2FE" }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" style={{ color: "#4F46E5" }}><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 7.5v3M8 5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      <p style={{ fontSize: "11px", lineHeight: 1.45, color: "#4338CA" }}>{children}</p>
    </div>
  );
}

// ─── ML catálogo: buscador + candidatos (matching) ─────────────────────────────
function CatalogMatcher({ selected, onSelect, suggested }: { selected: CatalogProduct | null; onSelect: (c: CatalogProduct) => void; suggested?: CatalogProduct }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const ordered = suggested ? [suggested, ...CATALOG_PRODUCTS.filter(c => c.id !== suggested.id)] : CATALOG_PRODUCTS;
  const results = ordered.filter(c => !q || c.name.toLowerCase().includes(q) || c.gtin.includes(q) || c.brand.toLowerCase().includes(q) || c.model.toLowerCase().includes(q));
  return (
    <div className="flex flex-col gap-2.5">
      <div className="relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" width="12" height="12" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="#CBD5E1" strokeWidth="1.4" /><path d="M9.5 9.5L12 12" stroke="#CBD5E1" strokeWidth="1.4" strokeLinecap="round" /></svg>
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por nombre o GTIN…"
          className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl outline-none transition-all"
          style={{ border: "1px solid #E2E8F0", color: "#0A1628", background: "white" }}
          onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"; }}
          onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
      </div>
      <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto">
        {results.map(c => {
          const isSel = selected?.id === c.id;
          const isSuggested = suggested?.id === c.id;
          return (
            <button key={c.id} onClick={() => onSelect(c)}
              className="w-full text-left rounded-xl px-3 py-2.5 transition-all"
              style={{ border: `1.5px solid ${isSel ? "#4F46E5" : "#E2E8F0"}`, background: isSel ? "#EEF2FF" : "white" }}
              onMouseEnter={e => { if (!isSel) e.currentTarget.style.borderColor = "#C7D2FE"; }}
              onMouseLeave={e => { if (!isSel) e.currentTarget.style.borderColor = "#E2E8F0"; }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-semibold" style={{ color: "#0A1628" }}>{c.name}</p>
                    {isSuggested && <span className="rounded-full px-1.5 py-px" style={{ fontSize: "9px", fontWeight: 700, color: "#4F46E5", background: "#E0E7FF" }}>Sugerido</span>}
                  </div>
                  <div className="flex items-center gap-x-2 gap-y-0.5 flex-wrap mt-1">
                    <span style={{ fontSize: "10px", color: "#64748B" }}>Marca: <b style={{ color: "#475569" }}>{c.brand}</b></span>
                    <span style={{ fontSize: "10px", color: "#64748B" }}>Modelo: <b style={{ color: "#475569" }}>{c.model}</b></span>
                    {c.color !== "—" && <span style={{ fontSize: "10px", color: "#64748B" }}>Color: <b style={{ color: "#475569" }}>{c.color}</b></span>}
                  </div>
                  <p className="font-mono mt-0.5" style={{ fontSize: "9.5px", color: "#94A3B8" }}>GTIN {c.gtin} · {c.id}</p>
                </div>
                <span className="flex items-center justify-center rounded-full flex-shrink-0 mt-0.5" style={{ width: 18, height: 18, border: `2px solid ${isSel ? "#4F46E5" : "#E2E8F0"}`, background: isSel ? "#4F46E5" : "white" }}>
                  {isSel && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
              </div>
            </button>
          );
        })}
        {results.length === 0 && (
          <div className="text-center py-8 text-xs" style={{ color: "#94A3B8" }}>No encontramos fichas de catálogo para esa búsqueda.</div>
        )}
      </div>
    </div>
  );
}

// ─── Paso "Tipo de publicación" (ML) ───────────────────────────────────────────
function MLPubTypeStep({ mode, setMode, match, setMatch, mandatory, suggested }: {
  mode: CatalogState; setMode: (m: CatalogState) => void;
  match: CatalogProduct | null; setMatch: (c: CatalogProduct) => void;
  mandatory: boolean; suggested: CatalogProduct;
}) {
  const options: { id: CatalogState; title: string; desc: string }[] = [
    { id: "catalog", title: "Catálogo", desc: "La ficha la pone MercadoLibre. Vos solo definís precio, stock y condiciones." },
    { id: "traditional", title: "Publicación tradicional", desc: "Vos controlás título, fotos y atributos, como hasta ahora." },
  ];
  return (
    <div className="flex flex-col gap-4">
      {mandatory && (
        <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5" style={{ background: "#FFFBEB", border: "1px solid #FDE68A" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" style={{ color: "#D97706" }}><path d="M8 2.5L14.5 14h-13L8 2.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M8 7v3M8 12h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          <p style={{ fontSize: "11px", lineHeight: 1.45, color: "#92400E" }}>Esta categoría exige vender en <b>catálogo</b>. La opción tradicional no está disponible.</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2.5">
        {options.map(o => {
          const active = mode === o.id;
          const disabled = mandatory && o.id === "traditional";
          return (
            <button key={o.id} disabled={disabled} onClick={() => setMode(o.id)}
              className="text-left rounded-2xl p-4 transition-all"
              style={{ border: `1.5px solid ${active ? "#4F46E5" : "#E2E8F0"}`, background: active ? "#EEF2FF" : "white", opacity: disabled ? 0.5 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
              <div className="flex items-center justify-between mb-2">
                <span className="flex items-center justify-center rounded-xl" style={{ width: 34, height: 34, color: active ? "#4F46E5" : "#94A3B8", background: active ? "#E0E7FF" : "#F1F5F9" }}>
                  {o.id === "catalog"
                    ? <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M10 2.5l6 3.2v8.6l-6 3.2-6-3.2V5.7l6-3.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M4 5.7l6 3.2 6-3.2M10 8.9v8.6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                    : <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M6 8h8M6 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>}
                </span>
                <span className="flex items-center justify-center rounded-full" style={{ width: 18, height: 18, border: `2px solid ${active ? "#4F46E5" : "#E2E8F0"}`, background: active ? "#4F46E5" : "white" }}>
                  {active && <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </span>
              </div>
              <p className="text-sm font-bold" style={{ color: "#0A1628" }}>{o.title}</p>
              <p className="mt-1" style={{ fontSize: "11px", lineHeight: 1.4, color: "#64748B" }}>{o.desc}</p>
            </button>
          );
        })}
      </div>

      {mode === "catalog" && (
        <div className="flex flex-col gap-2.5">
          <SectionLabel>Elegí el producto de catálogo</SectionLabel>
          <CatalogHint>Buscá la ficha estándar de MercadoLibre que corresponde a tu producto. Vas a competir con otros vendedores por la misma ficha.</CatalogHint>
          <CatalogMatcher selected={match} suggested={suggested} onSelect={setMatch} />
        </div>
      )}
    </div>
  );
}

// ─── Config simplificada para catálogo (solo precio/stock/tipo/envío) ──────────
function MLCatalogConfigStep({ cfg, set, accent, product, match }: {
  cfg: MLConfig; set: <K extends keyof MLConfig>(k: K, v: MLConfig[K]) => void; accent: string;
  product: Product; match: CatalogProduct;
}) {
  const [price, setPrice] = useState(String(product.ml_price ?? product.price));
  const [stock, setStock] = useState(String(Math.max(product.stock, 1)));
  const readonly: { label: string; value: string }[] = [
    { label: "Título", value: match.name },
    { label: "Marca", value: match.brand },
    { label: "Modelo", value: match.model },
    { label: "Color", value: match.color },
  ];
  return (
    <div className="flex flex-col gap-5">
      <CatalogHint><b>MercadoLibre define la ficha.</b> El título, las fotos y los atributos vienen del producto de catálogo. Vos configurás precio, stock y condiciones de venta.</CatalogHint>

      <div className="flex flex-col gap-3">
        <SectionLabel>Precio y stock</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: "white", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Precio</span>
            <div className="flex items-center gap-0.5">
              <span className="text-xs font-semibold" style={{ color: "#94A3B8" }}>$</span>
              <input value={price} onChange={e => setPrice(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
                className="text-xs font-semibold text-right outline-none bg-transparent tabular-nums" style={{ color: "#0A1628", width: "80px" }} />
            </div>
          </div>
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: "white", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Stock</span>
            <input value={stock} onChange={e => setStock(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric"
              className="text-xs font-semibold text-right outline-none bg-transparent tabular-nums" style={{ color: "#0A1628", width: "60px" }} />
          </div>
        </div>

        <SectionLabel>Publicación y envío</SectionLabel>
        <ListingTypePicker value={cfg.listing} onChange={v => set("listing", v)} accent={accent} />
        <div className="grid grid-cols-2 gap-2">
          <ValueCard label="Método de envío" value={cfg.envioMode} options={["me1","me2","not_specified","custom"]} onChange={v => set("envioMode", v)} />
          <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: "white", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Envío gratis</span>
            <Toggle value={cfg.freeShipping} onChange={v => set("freeShipping", v)} />
          </div>
        </div>

        <SectionLabel>Definido por MercadoLibre</SectionLabel>
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <div className="flex items-center gap-2 px-3 py-2" style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
            <div className="flex gap-1">
              {(product.images ?? []).slice(0, 3).map((src, i) => (
                <img key={i} src={src} alt="" className="rounded-md object-cover" style={{ width: 28, height: 28, border: "1px solid #E2E8F0" }} />
              ))}
              {(!product.images || product.images.length === 0) && (
                <div className="rounded-md flex items-center justify-center" style={{ width: 28, height: 28, background: "#EEF2FF", color: "#4F46E5" }}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><circle cx="5.5" cy="6.5" r="1" fill="currentColor" /><path d="M3 12l3.5-3 2.5 2 2-1.5 2 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>
                </div>
              )}
            </div>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Fotos gestionadas por MercadoLibre</span>
            <span className="ml-auto flex items-center gap-1" style={{ fontSize: "9.5px", color: "#94A3B8" }}>
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><rect x="2.5" y="5" width="7" height="5" rx="1" stroke="currentColor" strokeWidth="1.1" /><path d="M4 5V3.5a2 2 0 0 1 4 0V5" stroke="currentColor" strokeWidth="1.1" /></svg>
              Read-only
            </span>
          </div>
          {readonly.map((r, i) => (
            <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2" style={{ borderTop: i > 0 ? "1px solid #F8FAFC" : "none" }}>
              <span style={{ fontSize: "10px", color: "#94A3B8", flexShrink: 0 }}>{r.label}</span>
              <span className="text-xs text-right truncate" style={{ color: "#475569" }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TN Config step ──────────────────────────────────────────────────────────

function TNTextField({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all group"
      style={{ background: "white", border: "1px solid #E2E8F0" }}>
      <span style={{ fontSize: "10px", color: "#94A3B8", flexShrink: 0, marginRight: "8px" }}>{label}</span>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? "—"}
        className="text-xs font-semibold text-right outline-none bg-transparent flex-1 min-w-0"
        style={{ color: "#0A1628" }}
        onFocus={e => { const p = e.target.closest("[data-card]") as HTMLElement; if (p) { p.style.borderColor = "#818CF8"; p.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.08)"; } }}
        onBlur={e => { const p = e.target.closest("[data-card]") as HTMLElement; if (p) { p.style.borderColor = "#E2E8F0"; p.style.boxShadow = "none"; } }} />
    </div>
  );
}

function TNConfigStep({ cfg, set }: { cfg: TNConfig; set: <K extends keyof TNConfig>(k: K, v: TNConfig[K]) => void }) {
  const { gender, ageGroup, freeShipping, mpn, barcode, tags, promoPrice, videoUrl, seoTitle, seoDesc } = cfg;
  const setGender = (v: string) => set("gender", v);
  const setAgeGroup = (v: string) => set("ageGroup", v);
  const setFreeShipping = (v: boolean) => set("freeShipping", v);
  const setMpn = (v: string) => set("mpn", v);
  const setBarcode = (v: string) => set("barcode", v);
  const setTags = (v: string) => set("tags", v);
  const setPromoPrice = (v: string) => set("promoPrice", v);
  const setVideoUrl = (v: string) => set("videoUrl", v);
  const setSeoTitle = (v: string) => set("seoTitle", v);
  const setSeoDesc = (v: string) => set("seoDesc", v);

  return (
    <div className="flex flex-col gap-5">

      <div className="flex flex-col gap-2">
        <SectionLabel>Identificación</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <div data-card className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all" style={{ background: "white", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>MPN</span>
            <input value={mpn} onChange={e => setMpn(e.target.value)} placeholder="—"
              className="text-xs font-semibold text-right outline-none bg-transparent w-20" style={{ color: "#0A1628" }} />
          </div>
          <div data-card className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all" style={{ background: "white", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Código de barras</span>
            <input value={barcode} onChange={e => setBarcode(e.target.value)} placeholder="—"
              className="text-xs font-semibold text-right outline-none bg-transparent w-20" style={{ color: "#0A1628" }} />
          </div>
        </div>
        <div data-card className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <span style={{ fontSize: "10px", color: "#94A3B8", flexShrink: 0, marginRight: "8px" }}>Tags</span>
          <input value={tags} onChange={e => setTags(e.target.value)} placeholder="verano, promo, regalo…"
            className="text-xs font-medium text-right outline-none bg-transparent flex-1 min-w-0" style={{ color: "#0A1628" }} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Audiencia</SectionLabel>
        <div className="grid grid-cols-2 gap-2">
          <ValueCard label="Género" value={gender} options={["—","Hombre","Mujer","Unisex","Infantil"]} onChange={setGender} />
          <ValueCard label="Grupo etario" value={ageGroup} options={["—","Adultos","Niños","Bebés","Adolescentes"]} onChange={setAgeGroup} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>Comercial</SectionLabel>
        <div className="flex items-center justify-between px-3 py-2.5 rounded-xl" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <span style={{ fontSize: "10px", color: "#94A3B8" }}>Envío gratis</span>
          <Toggle value={freeShipping} onChange={setFreeShipping} />
        </div>
        <div data-card className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <span style={{ fontSize: "10px", color: "#94A3B8", flexShrink: 0, marginRight: "8px" }}>Precio promocional</span>
          <input value={promoPrice} onChange={e => setPromoPrice(e.target.value)} placeholder="—"
            className="text-xs font-semibold text-right outline-none bg-transparent w-20 tabular-nums" style={{ color: "#0A1628" }} />
        </div>
        <div data-card className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <span style={{ fontSize: "10px", color: "#94A3B8", flexShrink: 0, marginRight: "8px" }}>URL de video</span>
          <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="youtube.com/…"
            className="text-xs font-medium text-right outline-none bg-transparent flex-1 min-w-0" style={{ color: "#0A1628" }} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <SectionLabel>SEO</SectionLabel>
        <div data-card className="flex items-center justify-between px-3 py-2.5 rounded-xl transition-all" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <span style={{ fontSize: "10px", color: "#94A3B8", flexShrink: 0, marginRight: "8px" }}>Título SEO</span>
          <input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} placeholder="—"
            className="text-xs font-medium text-right outline-none bg-transparent flex-1 min-w-0" style={{ color: "#0A1628" }} />
        </div>
        <div className="px-3 py-2.5 rounded-xl" style={{ background: "white", border: "1px solid #E2E8F0" }}>
          <p style={{ fontSize: "10px", color: "#94A3B8", marginBottom: "6px" }}>Descripción SEO</p>
          <textarea value={seoDesc} onChange={e => setSeoDesc(e.target.value)} rows={2} placeholder="—"
            className="w-full text-xs outline-none bg-transparent resize-none leading-relaxed" style={{ color: "#0A1628" }} />
        </div>
      </div>

    </div>
  );
}

// ─── MercadoLibre performance panel ────────────────────────────────────────────

function ScoreRing({ score }: { score: number }) {
  const r = 26, c = 2 * Math.PI * r;
  const tone = score >= 80 ? "#16A34A" : score >= 50 ? "#F59E0B" : "#EF4444";
  return (
    <div className="relative flex-shrink-0" style={{ width: 64, height: 64 }}>
      <svg width="64" height="64" viewBox="0 0 64 64" style={{ transform: "rotate(-90deg)" }}>
        <circle cx="32" cy="32" r={r} fill="none" stroke="#F1F5F9" strokeWidth="6" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={tone} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} style={{ transition: "stroke-dashoffset 0.8s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tabular-nums font-bold" style={{ fontSize: "17px", color: "#0A1628", lineHeight: 1 }}>{score}</span>
        <span style={{ fontSize: "8px", color: "#94A3B8" }}>/ 100</span>
      </div>
    </div>
  );
}

// ── Published header — neutral hero, soft tinted bg (green active / amber paused) ──
function HeroChip({ paused }: { paused?: boolean }) {
  const tone = paused ? "#EA580C" : "#16A34A";
  const bg = paused ? "#FFF7ED" : "#F0FDF4";
  const border = paused ? "#FED7AA" : "#BBF7D0";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: bg, border: `1px solid ${border}` }}>
      <span className="rounded-full" style={{ width: 6, height: 6, background: tone }} />
      <span style={{ fontSize: "10.5px", fontWeight: 700, color: tone }}>{paused ? "Pausado" : "Activo"}</span>
    </span>
  );
}

function PublishedHeader({ verbDone, label, paused, subtitle, href, score }: {
  verbDone: string; label: string; paused?: boolean; subtitle?: string; href: string; score?: number;
}) {
  const title = paused ? `Pausado en ${label}` : `${verbDone} en ${label}`;
  return (
    <div className="flex items-center gap-4 px-4 py-4" style={{ background: paused ? "#FFF7ED" : "#F0FDF4", borderBottom: `1px solid ${paused ? "#FFEDD5" : "#DCFCE7"}` }}>
      {score != null && <ScoreRing score={score} />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold" style={{ color: "#0A1628" }}>{title}</p>
          <HeroChip paused={paused} />
        </div>
        {subtitle && <p style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>{subtitle}</p>}
        <a href={href} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 mt-1.5 transition-opacity hover:opacity-70" style={{ fontSize: "11px", fontWeight: 600, color: "#4F46E5" }}>
          Ver publicación
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M4 2h6v6M10 2L3 9" stroke="#4F46E5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </div>
    </div>
  );
}

// Shared performance helpers
function perfStats() {
  const all = PERFORMANCE.buckets.flatMap(b => b.variables);
  const doneCount = all.filter(v => v.status === "COMPLETED").length;
  const pending = all.filter(v => v.status === "PENDING");
  const s = PERFORMANCE.score;
  const tone = s >= 80 ? "#16A34A" : s >= 50 ? "#F59E0B" : "#EF4444";
  const toneBg = s >= 80 ? "#DCFCE7" : s >= 50 ? "#FEF3C7" : "#FEE2E2";
  return { all, doneCount, pending, tone, toneBg };
}

function PerfBuckets({ accent }: { accent: string }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-2.5">
      {PERFORMANCE.buckets.map(bucket => {
        const isOpen = open === bucket.key;
        const pend = bucket.variables.filter(v => v.status === "PENDING").length;
        const scoreColor = bucket.score >= 80 ? "#16A34A" : bucket.score >= 50 ? "#D97706" : "#DC2626";
        return (
          <div key={bucket.key} className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
            <button onClick={() => setOpen(isOpen ? null : bucket.key)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
              style={{ background: isOpen ? "#F8FAFC" : "white", borderBottom: isOpen ? "1px solid #F1F5F9" : "none" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="flex-shrink-0"
                style={{ color: "#94A3B8", transform: isOpen ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }}>
                <path d="M4 2.5l3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="flex-1 text-xs font-semibold" style={{ color: "#0A1628" }}>{bucket.title}</span>
              {pend > 0 && (
                <span className="tabular-nums px-1.5 py-0.5 rounded" style={{ fontSize: "10px", fontWeight: 600, color: "#D97706", background: "#FEF3C7" }}>{pend} pendiente{pend > 1 ? "s" : ""}</span>
              )}
              <span className="tabular-nums font-semibold" style={{ fontSize: "11px", color: scoreColor }}>{Math.round(bucket.score)}%</span>
            </button>
            {isOpen && [...bucket.variables].sort((a, b) => (a.status === b.status ? 0 : a.status === "PENDING" ? -1 : 1)).map((v, i) => {
              const done = v.status === "COMPLETED";
              return (
                <div key={v.key} className="flex items-start gap-2.5 px-3.5 py-2.5" style={{ borderTop: i > 0 ? "1px solid #F8FAFC" : "none" }}>
                  <div className="flex items-center justify-center flex-shrink-0 rounded-full mt-0.5" style={{ width: 16, height: 16, background: done ? "#DCFCE7" : "#FEF3C7" }}>
                    {done ? (
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" stroke="#16A34A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    ) : (
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M6 3v3.5M6 8.5h.01" stroke="#D97706" strokeWidth="1.6" strokeLinecap="round" /></svg>
                    )}
                  </div>
                  <p className="flex-1 min-w-0" style={{ fontSize: "11px", lineHeight: 1.35, color: done ? "#94A3B8" : "#334155" }}>{v.title}</p>
                  {!done && (
                    <a href={v.rule.link} target="_blank" rel="noreferrer"
                      className="flex-shrink-0 whitespace-nowrap px-2 py-1 rounded-lg font-semibold transition-all hover:brightness-95"
                      style={{ fontSize: "10px", color: "white", background: accent }}>
                      {v.rule.label}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── ML selling costs (mercadolibre_selling_costs) ───────────────────────────────
// Snapshot written by the backend on each publish/update. Derived here from price
// so the card mirrors the real stored breakdown (commission + fixed fee + shipping,
// plus 21% tax on the fee).

function mlSellingCost(price: number) {
  const pct = 14.5;                                                  // meli_percentage_fee
  const fixed = price >= 12000 ? 1330 : price >= 5000 ? 1390 : 1410; // sale_fixed_fee bracket
  const percPart = Math.round(price * pct) / 100;
  const financing = 0;                                               // financing_add_on_fee
  const shipping = 0;                                                // ship_list_cost
  const total = percPart + fixed + financing + shipping;            // total_selling_cost
  const feeTax = 21;                                                 // fee_tax
  const withTax = Math.round(total * (1 + feeTax / 100) * 100) / 100; // total_selling_cost_with_tax
  return { price, pct, fixed, percPart, financing, shipping, total, feeTax, withTax, tax: Math.round((withTax - total) * 100) / 100 };
}

function SellingCosts({ price, listingName }: { price: number; listingName: string }) {
  const [open, setOpen] = useState(false);
  const c = mlSellingCost(price);
  const net = Math.round((price - c.withTax) * 100) / 100;
  const netPct = Math.round((net / price) * 100);
  const rows = [
    { label: "Precio de venta", value: fmt(price), muted: true },
    { label: `Comisión por venta · ${c.pct}%`, value: fmt(c.percPart) },
    { label: "Costo fijo", value: fmt(c.fixed) },
    { label: "Cargo por financiación", value: fmt(c.financing) },
    { label: "Costo de envío", value: fmt(c.shipping) },
    { label: "Subtotal", value: fmt(c.total), strong: true },
    { label: `IVA sobre comisión · ${c.feeTax}%`, value: fmt(c.tax) },
    { label: "Costo total de venta", value: fmt(c.withTax), strong: true },
  ];
  return (
    <div className="flex flex-col gap-2.5">
      <SectionLabel>Costos de venta</SectionLabel>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-slate-50"
          style={{ background: open ? "#F8FAFC" : "white", borderBottom: open ? "1px solid #F1F5F9" : "none" }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="flex-shrink-0"
            style={{ color: "#94A3B8", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }}>
            <path d="M4 2.5l3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="flex-1 text-xs font-semibold" style={{ color: "#0A1628" }}>Detalle de costos</span>
        </button>
        {open && (
          <>
            <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: "#F0FDF4", borderBottom: "1px solid #DCFCE7" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#166534" }}>Ingreso neto est.</span>
              <div className="flex items-center gap-1.5">
                <span className="tabular-nums font-bold" style={{ fontSize: "13px", color: "#16A34A" }}>{fmt(net)}</span>
                <span className="tabular-nums px-1.5 py-0.5 rounded" style={{ fontSize: "10px", fontWeight: 600, color: "#16A34A", background: "#DCFCE7" }}>{netPct}%</span>
              </div>
            </div>
            <div className="flex flex-col">
              {rows.map((r, i) => (
                <div key={r.label} className="flex items-center justify-between px-3.5"
                  style={{ paddingTop: "8px", paddingBottom: "8px", borderTop: i > 0 ? "1px solid #F8FAFC" : "none", borderTopWidth: r.strong ? "1px" : undefined, borderTopColor: r.strong ? "#E2E8F0" : "#F8FAFC" }}>
                  <span style={{ fontSize: "12px", color: r.strong ? "#0A1628" : "#64748B", fontWeight: r.strong ? 600 : 400 }}>{r.label}</span>
                  <span className="tabular-nums" style={{ fontSize: "12px", color: r.muted ? "#94A3B8" : r.strong ? "#0A1628" : "#334155", fontWeight: r.strong ? 700 : 500 }}>{r.value}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 px-3.5 py-2.5" style={{ borderTop: "1px solid #F1F5F9", background: "#FAFBFC" }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ color: "#94A3B8", flexShrink: 0 }}><path d="M6 3.2v3.2M6 8.3h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1" /></svg>
              <span style={{ fontSize: "10.5px", color: "#94A3B8" }}>Publicación {listingName} · registrado al publicar/actualizar</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Frase humana por estado de competencia (sin jerga ni ids crudos).
function compSentence(comp: CatalogCompetition): string {
  switch (comp.status) {
    case "winning": return "Tu publicación es la que se lleva las ventas de esta ficha.";
    case "tied": return `Compartís el primer lugar con ${comp.tiedWith} vendedor${comp.tiedWith === 1 ? "" : "es"} más.`;
    case "losing": return "Otro vendedor está ganando esta ficha.";
    case "cannot": return `MercadoLibre dice: ${comp.cannotReason}`;
  }
}

// ─── ML catálogo: card de estado en el producto publicado (solo datos, sin acciones) ─
function MLCatalogCard({ catalog, pubMode, catalogMatch, justLinked }: {
  catalog: CatalogInfo; pubMode: CatalogState; catalogMatch: CatalogProduct | null; justLinked: boolean;
}) {
  const isCatalog = pubMode === "catalog";
  const cp = catalogMatch ?? catalog.product;
  const comp = isCatalog ? catalog.competition : null;
  // Mostramos números solo si hay competencia real y no está procesando.
  const hasData = !!comp && !justLinked && comp.status !== "cannot";
  const showBoosts = !!comp && !justLinked && comp.status !== "cannot";
  const missing = comp ? comp.boosts.filter(b => !b.done) : [];
  const delta = comp ? comp.myPrice - comp.priceToWin : 0;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${isCatalog ? "#C7D2FE" : "#E2E8F0"}` }}>
      {/* Header de estado */}
      <div className="flex items-start gap-3 px-4 py-3.5" style={{ background: isCatalog ? "#EEF2FF" : "#F8FAFC", borderBottom: `1px solid ${isCatalog ? "#E0E7FF" : "#F1F5F9"}` }}>
        <span className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 38, height: 38, background: isCatalog ? "#E0E7FF" : "#F1F5F9", color: isCatalog ? "#4F46E5" : "#64748B" }}>
          {isCatalog
            ? <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2.5l6 3.2v8.6l-6 3.2-6-3.2V5.7l6-3.2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M4 5.7l6 3.2 6-3.2M10 8.9v8.6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
            : <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="M6 8h8M6 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <CatalogTag state={pubMode} />
            {catalog.autoOptin && isCatalog && catalog.state === "catalog" && <span className="rounded-full px-1.5 py-px" style={{ fontSize: "9px", fontWeight: 700, color: "#D97706", background: "#FFFBEB", border: "1px solid #FDE68A" }}>Meli te sumó solo</span>}
          </div>
          {isCatalog ? (
            <a href={cp.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 mt-1.5 transition-colors hover:underline" style={{ color: "#4F46E5" }}>
              <span className="text-xs font-semibold truncate">{cp.name}</span>
              <svg width="9" height="9" viewBox="0 0 12 12" fill="none" className="flex-shrink-0"><path d="M4 2h6v6M10 2L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </a>
          ) : (
            <p className="text-xs mt-1.5" style={{ color: "#64748B" }}>Vos controlás título, fotos y atributos de esta publicación.</p>
          )}
        </div>
      </div>

      {/* Competencia (solo catálogo) */}
      {isCatalog && (
        justLinked ? (
          <div className="flex items-start gap-2 px-4 py-3.5">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5" style={{ color: "#4F46E5", animation: "spin 1s linear infinite" }}><circle cx="8" cy="8" r="6" stroke="#E2E8F0" strokeWidth="2" /><path d="M8 2a6 6 0 016 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            <p style={{ fontSize: "12px", lineHeight: 1.5, color: "#475569" }}>MercadoLibre está incorporando tu publicación al catálogo. En unos minutos vas a ver si estás ganando la ficha.</p>
          </div>
        ) : comp && (
          <div className="px-4 py-3.5 flex flex-col gap-3.5">
            {/* Frase humana + pill de estado */}
            <div className="flex items-start gap-2.5">
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 flex-shrink-0" style={{ fontSize: "11px", fontWeight: 700, color: COMP_META[comp.status].color, background: COMP_META[comp.status].bg, border: `1px solid ${COMP_META[comp.status].border}` }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: COMP_META[comp.status].color }} />
                {COMP_META[comp.status].label}
              </span>
              <p style={{ fontSize: "12px", lineHeight: 1.5, color: "#334155", fontWeight: 500 }}>{compSentence(comp)}</p>
            </div>

            {/* Números clave: tu precio vs precio para ganar (solo si hay datos y no ganás) */}
            {hasData && comp.status !== "winning" && (
              <div className="flex items-stretch rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
                <div className="flex-1 px-3 py-2">
                  <p style={{ fontSize: "9px", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Tu precio</p>
                  <p className="tabular-nums font-bold" style={{ fontSize: "14px", color: "#0A1628" }}>{fmt(comp.myPrice)}</p>
                </div>
                <div className="flex-1 px-3 py-2" style={{ borderLeft: "1px solid #F1F5F9" }}>
                  <p style={{ fontSize: "9px", color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Precio para ganar</p>
                  <p className="tabular-nums font-bold" style={{ fontSize: "14px", color: "#16A34A" }}>{fmt(comp.priceToWin)}</p>
                </div>
                {delta > 0 && (
                  <div className="flex flex-col items-center justify-center px-3" style={{ background: "#FEF2F2", borderLeft: "1px solid #FECACA" }}>
                    <p style={{ fontSize: "9px", color: "#B91C1C", textTransform: "uppercase", letterSpacing: "0.05em" }}>Bajar</p>
                    <p className="tabular-nums font-bold" style={{ fontSize: "13px", color: "#DC2626" }}>{fmt(delta)}</p>
                  </div>
                )}
              </div>
            )}

            {/* Qué podés mejorar: chips con "+" */}
            {showBoosts && missing.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span style={{ fontSize: "10px", fontWeight: 600, color: "#94A3B8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Qué podés mejorar</span>
                <div className="flex flex-wrap gap-1.5">
                  {missing.map(b => (
                    <span key={b.key} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1" style={{ fontSize: "11px", fontWeight: 500, color: "#4F46E5", background: "#EEF2FF", border: "1px solid #E0E7FF" }}>
                      <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M6 2.5v7M2.5 6h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
                      {b.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {showBoosts && missing.length === 0 && (
              <p className="flex items-center gap-1.5" style={{ fontSize: "11px", color: "#16A34A", fontWeight: 500 }}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Ya ofrecés todos los beneficios.
              </p>
            )}
          </div>
        )
      )}

      {/* Nota de publicación tradicional "sombra" */}
      {isCatalog && catalog.shadow?.active && (
        <div className="flex items-start gap-2 px-4 py-2.5" style={{ background: "#FFFBEB", borderTop: "1px solid #FDE68A" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" style={{ color: "#D97706" }}><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 7.5v3M8 5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          <p style={{ fontSize: "11px", lineHeight: 1.4, color: "#92400E" }}>{catalog.shadow.note}</p>
        </div>
      )}
    </div>
  );
}

// ─── ML published panel — hero unificado + toolbar + performance colapsable ──────

function MLPublished({ verbDone, label, accent, summaryRows, price, listingName, paused, catalog, pubMode, catalogMatch, onLink, onUnlink, onEdit, onUpdate, onPause, onReactivate }: {
  verbDone: string; label: string; accent: string;
  summaryRows: { label: string; value: string }[]; price: number; listingName: string;
  paused?: boolean;
  catalog: CatalogInfo; pubMode: CatalogState; catalogMatch: CatalogProduct | null;
  onLink: (c: CatalogProduct) => void; onUnlink: () => void;
  onEdit: () => void; onUpdate: () => void; onPause: () => void; onReactivate?: () => void;
}) {
  const green = "#16A34A";
  const { pending } = perfStats();

  // Catálogo: acción vive en el toolbar; la card es solo estado/datos.
  const isCatalog = pubMode === "catalog";
  const justLinked = isCatalog && catalog.state !== "catalog";
  const [linking, setLinking] = useState(false);        // buscador inline de fichas
  const [pick, setPick] = useState<CatalogProduct | null>(catalog.product);
  const [confirmOut, setConfirmOut] = useState(false);  // confirmación centrada

  // Estado del botón cuadrado de catálogo según modalidad y elegibilidad.
  const catalogAction = isCatalog
    ? (catalog.canOptOut
        ? { label: "Salir de catálogo", icon: ICONS_CATALOG.exit, color: "#EA580C", tint: "#FFF7ED", border: "#FED7AA", onClick: () => setConfirmOut(true), disabled: false, note: "" }
        : { label: "Salir de catálogo", icon: ICONS_CATALOG.exit, color: "#94A3B8", tint: "#F8FAFC", border: "#E2E8F0", onClick: undefined, disabled: true, note: catalog.optOutReason })
    : (catalog.eligible
        ? { label: "Linkear a catálogo", icon: ICONS_CATALOG.link, color: "#4F46E5", tint: "#EEF2FF", border: "#C7D2FE", onClick: () => { setPick(catalog.product); setLinking(true); }, disabled: false, note: "" }
        : { label: "Linkear a catálogo", icon: ICONS_CATALOG.link, color: "#94A3B8", tint: "#F8FAFC", border: "#E2E8F0", onClick: undefined, disabled: true, note: catalog.ineligibleReason });

  // mercadolibre.performance: permite pedir las métricas manualmente.
  const [perfLoading, setPerfLoading] = useState(false);
  const fetchPerf = () => {
    if (perfLoading) return;
    setPerfLoading(true);
    setTimeout(() => setPerfLoading(false), 1800);
  };
  const perfAction = {
    label: perfLoading ? "Obteniendo…" : "Performance",
    sub: "Actualizar métricas",
    icon: ICONS.gauge,
    color: "#2563EB", tint: "#EFF6FF", border: "#BFDBFE",
    onClick: fetchPerf,
  };

  // meli_pictures: descarga las fotos (mejoradas con IA por MercadoLibre) a nuestro bucket
  const [pics, setPics] = useState<"idle" | "loading" | "done">("idle");
  const downloadPics = () => {
    if (pics !== "idle") return;
    setPics("loading");
    setTimeout(() => {
      setPics("done");
      setTimeout(() => setPics("idle"), 2600);
    }, 1300);
  };
  const picsAction = {
    label: pics === "loading" ? "Descargando…" : pics === "done" ? "¡Guardadas!" : "Descargar fotos",
    sub: "Traer imágenes al bucket",
    icon: pics === "done"
      ? <path d="M5 12.5l4 4 10-11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      : ICONS.photos,
    color: pics === "done" ? green : "#7C3AED",
    tint: pics === "done" ? "#F0FDF4" : "#F5F3FF",
    border: pics === "done" ? "#BBF7D0" : "#DDD6FE",
    onClick: downloadPics,
  };

  const actions: { label: string; sub?: string; icon: React.ReactNode; color: string; tint: string; border: string; onClick?: () => void; disabled?: boolean; note?: string }[] = paused
    ? [
        { label: "Reactivar", sub: "Volver a publicar", icon: ICONS.play, color: "#4F46E5", tint: "#EEF2FF", border: "#C7D2FE", onClick: onReactivate },
        { label: "Actualizar", sub: "Sincronizar cambios", icon: ICONS.refresh, color: "#0A1628", tint: "#F1F5F9", border: "#E2E8F0", onClick: onUpdate },
        catalogAction,
        picsAction,
        perfAction,
        { label: "Eliminar", sub: "Dar de baja", icon: ICONS.trash, color: "#EF4444", tint: "#FEF2F2", border: "#FECACA", onClick: undefined },
      ]
    : [
        { label: "Actualizar", sub: "Sincronizar cambios", icon: ICONS.refresh, color: "#0A1628", tint: "#F1F5F9", border: "#E2E8F0", onClick: onUpdate },
        { label: "Pausar", sub: "Ocultar temporalmente", icon: ICONS.pause, color: "#EA580C", tint: "#FFF7ED", border: "#FED7AA", onClick: onPause },
        catalogAction,
        picsAction,
        perfAction,
        { label: "Eliminar", sub: "Dar de baja", icon: ICONS.trash, color: "#EF4444", tint: "#FEF2F2", border: "#FECACA", onClick: undefined },
      ];

  return (
    <div className="flex flex-col gap-4" style={{ animation: "fadeUp 0.4s ease both" }}>
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        <PublishedHeader verbDone={verbDone} label={label} paused={paused} score={PERFORMANCE.score}
          href="https://www.mercadolibre.com.ar"
          subtitle={paused ? "Publicación oculta temporalmente" : `Nivel ${PERFORMANCE.level_wording} · ${pending.length} oportunidades de mejora`} />
        {/* Toolbar de acciones */}
        <div className="grid" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0,1fr))` }}>
          {actions.map((a, i) => (
            <button key={a.label} onClick={a.disabled ? undefined : a.onClick} disabled={a.disabled}
              className="flex flex-col items-center gap-1.5 py-3 transition-colors"
              style={{ borderLeft: i > 0 ? "1px solid #F1F5F9" : "none", cursor: a.disabled ? "default" : "pointer", opacity: a.disabled ? 0.55 : 1 }}
              onMouseEnter={e => { if (!a.disabled) e.currentTarget.style.background = "#F8FAFC"; }}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: a.tint, border: `1px solid ${a.border}`, color: a.color }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">{a.icon}</svg>
              </div>
              <span style={{ fontSize: "11px", fontWeight: 600, color: a.color, textAlign: "center" }}>{a.label}</span>
            </button>
          ))}
        </div>
        {/* Nota cuando la acción de catálogo está deshabilitada */}
        {catalogAction.disabled && catalogAction.note && (
          <div className="flex items-start gap-2 px-4 py-2.5" style={{ background: "#F8FAFC", borderTop: "1px solid #F1F5F9" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px" style={{ color: "#94A3B8" }}><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 7.5v3M8 5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            <p style={{ fontSize: "11px", lineHeight: 1.4, color: "#64748B" }}>{catalogAction.note}</p>
          </div>
        )}
      </div>

      {/* Buscador de fichas inline (al tocar "Linkear a catálogo") */}
      {linking && (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #C7D2FE", animation: "fadeUp 0.2s ease both" }}>
          <div className="flex items-start justify-between gap-3 px-4 py-3.5" style={{ background: "#EEF2FF", borderBottom: "1px solid #E0E7FF" }}>
            <div>
              <h3 className="text-sm font-bold" style={{ color: "#0A1628" }}>Linkear a catálogo</h3>
              <p style={{ fontSize: "11px", color: "#64748B", marginTop: "2px" }}>Buscá la ficha por nombre o GTIN. Tu publicación tradicional queda como respaldo.</p>
            </div>
            <button onClick={() => setLinking(false)} className="flex items-center justify-center rounded-lg flex-shrink-0 transition-colors" style={{ width: 26, height: 26, color: "#64748B" }} onMouseEnter={e => (e.currentTarget.style.background = "#E0E7FF")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            </button>
          </div>
          <div className="px-4 py-4"><CatalogMatcher selected={pick} suggested={catalog.product} onSelect={setPick} /></div>
          <div className="px-4 py-3 flex items-center justify-end gap-2" style={{ borderTop: "1px solid #F1F5F9" }}>
            <button onClick={() => setLinking(false)} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Cancelar</button>
            <button onClick={() => { if (pick) { onLink(pick); setLinking(false); } }} disabled={!pick}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: pick ? "#4F46E5" : "#C7D2FE", cursor: pick ? "pointer" : "default" }}>Vincular</button>
          </div>
        </div>
      )}

      <MLCatalogCard catalog={catalog} pubMode={pubMode} catalogMatch={catalogMatch} justLinked={justLinked} />

      {/* Modal: confirmar salir de catálogo (acción irreversible → centrado) */}
      {confirmOut && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} onClick={() => setConfirmOut(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "fadeUp 0.18s ease both" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: "#FFF7ED" }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3L18 16H2L10 3z" stroke="#EA580C" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8v3.5M10 14h.01" stroke="#EA580C" strokeWidth="1.6" strokeLinecap="round" /></svg>
              </div>
              <h3 className="text-lg font-bold" style={{ color: "#0A1628" }}>Salir de catálogo</h3>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: "#475569" }}>
              Se cerrará la publicación de catálogo y se reactivará tu <b>publicación tradicional</b>. Vas a volver a controlar título, fotos y atributos, pero dejás de competir por la ficha estándar.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setConfirmOut(false)} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Cancelar</button>
              <button onClick={() => { onUnlink(); setConfirmOut(false); }} className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors" style={{ background: "#EA580C" }}>Salir de catálogo</button>
            </div>
          </div>
        </div>
      )}

      <SellingCosts price={price} listingName={listingName} />

      <div className="flex flex-col gap-2.5">
        <SectionLabel>Performance</SectionLabel>
        <PerfBuckets accent={accent} />
      </div>
      <ConfigSummary rows={summaryRows} onEdit={onEdit} />
    </div>
  );
}

// ─── TN published panel — hero unificado + toolbar (sin performance) ─────────────

function TNPublished({ verbDone, label, summaryRows, paused, onEdit, onUpdate, onPause, onReactivate }: {
  verbDone: string; label: string;
  summaryRows: { label: string; value: string }[];
  paused?: boolean; onEdit: () => void; onUpdate: () => void; onPause: () => void; onReactivate?: () => void;
}) {
  const actions = paused
    ? [
        { label: "Reactivar", icon: ICONS.play, color: "#4F46E5", tint: "#EEF2FF", border: "#C7D2FE", onClick: onReactivate },
        { label: "Actualizar", icon: ICONS.refresh, color: "#0A1628", tint: "#F1F5F9", border: "#E2E8F0", onClick: onUpdate },
        { label: "Eliminar", icon: ICONS.trash, color: "#EF4444", tint: "#FEF2F2", border: "#FECACA", onClick: undefined },
      ]
    : [
        { label: "Actualizar", icon: ICONS.refresh, color: "#0A1628", tint: "#F1F5F9", border: "#E2E8F0", onClick: onUpdate },
        { label: "Eliminar", icon: ICONS.trash, color: "#EF4444", tint: "#FEF2F2", border: "#FECACA", onClick: undefined },
      ];

  return (
    <div className="flex flex-col gap-4" style={{ animation: "fadeUp 0.4s ease both" }}>
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        <PublishedHeader verbDone={verbDone} label={label} paused={paused} href="https://www.tiendanube.com" />
        <div className="grid" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0,1fr))` }}>
          {actions.map((a, i) => (
            <button key={a.label} onClick={a.onClick}
              className="flex flex-col items-center gap-1.5 py-3 transition-colors hover:bg-slate-50"
              style={{ borderLeft: i > 0 ? "1px solid #F1F5F9" : "none" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: a.tint, border: `1px solid ${a.border}`, color: a.color }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none">{a.icon}</svg>
              </div>
              <span style={{ fontSize: "11px", fontWeight: 600, color: a.color }}>{a.label}</span>
            </button>
          ))}
        </div>
      </div>
      <ConfigSummary rows={summaryRows} onEdit={onEdit} />
    </div>
  );
}

// ─── Failed action panel ─────────────────────────────────────────────────────────
// The backend always leaves one human sentence in `reason` — we just show it kindly.

function FailedPanel({ verb, label, reason, remedy, retrying, onRetry, onEdit }: {
  verb: string; label: string; reason: string; remedy?: string;
  retrying: boolean; onRetry: () => void; onEdit?: () => void;
}) {
  const red = "#DC2626";
  return (
    <div className="flex flex-col gap-4" style={{ animation: "fadeUp 0.4s ease both" }}>
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #FECACA" }}>
        <div className="flex items-start gap-3 px-4 py-4" style={{ background: "#FEF2F2", borderBottom: "1px solid #FEE2E2" }}>
          <div className="flex items-center justify-center flex-shrink-0 rounded-full" style={{ width: 40, height: 40, background: "#FEE2E2" }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M12 3.5L22 20H2L12 3.5z" stroke={red} strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M12 10v4" stroke={red} strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="17" r="1" fill={red} />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#991B1B" }}>No se pudo {verb} en {label}</p>
            <p style={{ fontSize: "12px", lineHeight: 1.4, color: "#B91C1C", marginTop: "3px" }}>{reason}</p>
          </div>
        </div>
        <div className={onEdit ? "grid grid-cols-2" : "grid grid-cols-1"}>
          <button onClick={onRetry} disabled={retrying}
            className="flex items-center justify-center gap-1.5 py-3 transition-colors hover:bg-slate-50"
            style={{ color: "#4F46E5", opacity: retrying ? 0.6 : 1 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ animation: retrying ? "spin 0.7s linear infinite" : "none" }}>{ICONS.refresh}</svg>
            <span style={{ fontSize: "12px", fontWeight: 600 }}>{retrying ? "Reintentando…" : "Reintentar"}</span>
          </button>
          {onEdit && (
            <button onClick={onEdit}
              className="flex items-center justify-center gap-1.5 py-3 transition-colors hover:bg-slate-50"
              style={{ borderLeft: "1px solid #F1F5F9", color: "#0A1628" }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <span style={{ fontSize: "12px", fontWeight: 600 }}>Editar datos</span>
            </button>
          )}
        </div>
      </div>

      {/* Suggestion — only shown when the backend provides one */}
      {remedy && (
        <div className="flex items-start gap-2 rounded-xl px-3.5 py-3" style={{ border: "1px solid #E2E8F0", background: "#F8FAFC" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px"><circle cx="8" cy="8" r="6.5" stroke="#94A3B8" strokeWidth="1.3" /><path d="M8 7.5v3M8 5h.01" stroke="#94A3B8" strokeWidth="1.4" strokeLinecap="round" /></svg>
          <p style={{ fontSize: "11px", lineHeight: 1.4, color: "#475569" }}><span style={{ fontWeight: 600 }}>Sugerencia:</span> {remedy}</p>
        </div>
      )}
    </div>
  );
}

// ─── Success bubble — MercadoPago-style: green circle grows to cover, then collapses ──
type BubbleRect = { top: number; left: number; width: number; height: number };

// A calm inline confirmation card over a soft green backdrop, shown on publish.
function PublishSuccessCard({ verbDone, label, rect }: { verbDone: string; label: string; rect: BubbleRect }) {
  return (
    <div className="flex items-center justify-center" style={{
      position: "fixed", top: rect.top, left: rect.left, width: rect.width, height: rect.height,
      zIndex: 100, pointerEvents: "none", overflow: "hidden",
    }}>
      <div style={{
        position: "absolute", inset: 0, background: "rgba(240,253,244,0.85)",
        backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        animation: "backdropFade 1.6s ease forwards",
      }} />
      <div className="relative flex flex-col items-center gap-3.5 rounded-2xl" style={{
        background: "white", padding: "30px 44px",
        boxShadow: "0 16px 44px rgba(2,6,23,0.14)", border: "1px solid #DCFCE7",
        animation: "cardPop 1.6s ease forwards",
      }}>
        <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
          <span style={{ position: "absolute", inset: 0, borderRadius: "9999px", border: "2px solid #16A34A", animation: "ringPulse 1.1s ease 0.15s" }} />
          <div className="flex items-center justify-center rounded-full" style={{ width: 64, height: 64, background: "#16A34A" }}>
            <svg width="34" height="34" viewBox="0 0 96 96" fill="none">
              <path d="M28 49.5l13 13 27-30" stroke="white" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"
                strokeDasharray="70" style={{ animation: "checkDraw 0.45s ease 0.3s both" }} />
            </svg>
          </div>
        </div>
        <p className="text-center" style={{ color: "#0A1628", fontSize: "15px", fontWeight: 700 }}>{verbDone} en {label}</p>
      </div>
    </div>
  );
}

// ─── Config summary (shown in published/paused state) ──────────────────────────

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2" style={{ borderTop: "1px solid #F8FAFC" }}>
      <span style={{ fontSize: "11px", color: "#94A3B8" }}>{label}</span>
      <span className="text-xs font-medium text-right truncate" style={{ color: "#0A1628" }}>{value || "—"}</span>
    </div>
  );
}

function ConfigSummary({ rows, onEdit }: { rows: { label: string; value: string }[]; onEdit: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <SectionLabel>Configuración</SectionLabel>
        <button onClick={onEdit}
          className="flex items-center gap-1 flex-shrink-0 px-2 py-0.5 rounded-md text-xs font-medium transition-colors hover:bg-slate-100"
          style={{ color: "#4F46E5" }}>
          <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
            <path d="M9.5 2.5l2 2L5 11l-2.5.5L3 9l6.5-6.5z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Editar
        </button>
      </div>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
        {rows.map(r => (
          <SummaryRow key={r.label} label={r.label} value={r.value} />
        ))}
      </div>
    </div>
  );
}

// ─── Channel workflow ─────────────────────────────────────────────────────────

function ChannelPanel({ channel, status: init, product }: { channel: "ml" | "tn"; status: ChannelStatus; product: Product }) {
  const isML = channel === "ml";
  const accent = "#4F46E5";
  const label = isML ? "MercadoLibre" : "Tienda Nube";

  // Whether this publication already existed (re-publishing = "Actualizar")
  const [edited, setEdited] = useState(false);
  const verb = edited ? "Actualizar" : "Publicar";
  const verbDone = edited ? "Actualizado" : "Publicado";
  const steps = isML
    ? (edited ? ["Publicado", "Configurar", verb] : ["Categoría", "Tipo", "Configurar", verb])
    : ["Configurar", verb];
  // Step numbers by name (1-based; 0 when the step doesn't exist in this flow).
  const stepN = (name: string) => steps.indexOf(name) + 1;

  // Catálogo: modalidad elegida en el wizard + ficha de catálogo asociada.
  const baseCatalog = mlCatalog(product);
  const alreadyLive = init === "published" || init === "paused";
  // Publicaciones ya activas muestran su estado real; en el wizard, catálogo solo si la categoría lo obliga.
  const [pubMode, setPubMode] = useState<CatalogState>(
    alreadyLive ? baseCatalog.state : baseCatalog.mandatory ? "catalog" : "traditional");
  const [catalogMatch, setCatalogMatch] = useState<CatalogProduct | null>(
    (alreadyLive && baseCatalog.state === "catalog") || baseCatalog.mandatory ? baseCatalog.product : null);

  const settled = init === "published" || init === "paused";
  const [status, setStatus] = useState<ChannelStatus>(init);
  const [step, setStep] = useState(() => settled || init === "failed" ? steps.length : 1);
  const [loading, setLoading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [celebrate, setCelebrate] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [bubbleRect, setBubbleRect] = useState<BubbleRect | null>(null);
  const measureBox = () => {
    const box = rootRef.current?.closest("[data-panel-scroll]") as HTMLElement | null;
    if (box) {
      const r = box.getBoundingClientRect();
      setBubbleRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }
  };
  const [showTracker, setShowTracker] = useState(!settled);
  const reasonFor = (v: string) => FAIL_REASONS[channel][v] ?? "Ocurrió un error inesperado. Intentá de nuevo.";
  const [failInfo] = useState<{ verb: string; reason: string; retry: () => void; canEdit: boolean } | null>(
    () => init === "failed"
      ? { verb: "publicar", reason: reasonFor("publicar"), retry: () => advance("published", steps.length), canEdit: true }
      : null
  );

  const [mlCfg, setMlCfg] = useState<MLConfig>(ML_CONFIG_DEFAULT);
  const [tnCfg, setTnCfg] = useState<TNConfig>(TN_CONFIG_DEFAULT);
  const setMl = <K extends keyof MLConfig>(k: K, v: MLConfig[K]) => setMlCfg(c => ({ ...c, [k]: v }));
  const setTn = <K extends keyof TNConfig>(k: K, v: TNConfig[K]) => setTnCfg(c => ({ ...c, [k]: v }));
  const configStep = stepN("Configurar");
  const catStep = stepN("Categoría");
  const typeStep = stepN("Tipo");
  const listingName = LISTING_TYPES.find(l => l.id === mlCfg.listing)?.name ?? mlCfg.listing;
  const isCatalogMode = isML && pubMode === "catalog";

  const editConfig = () => { setEdited(true); setStatus("prepublished"); setStep(configStep); setShowTracker(true); };

  const mlSummaryRows = [
    { label: "Modalidad", value: isCatalogMode ? "Catálogo" : "Tradicional" },
    ...(isCatalogMode && catalogMatch ? [{ label: "Ficha de catálogo", value: catalogMatch.name }] : []),
    { label: "Tipo de publicación", value: listingName },
    { label: "IVA", value: mlCfg.iva },
    { label: "Impuesto interno", value: mlCfg.imp },
    { label: "Método de envío", value: mlCfg.envioMode },
    { label: "Logística", value: mlCfg.logistic },
    { label: "Envío gratis", value: mlCfg.freeShipping ? "Sí" : "No" },
    { label: "Buscar en local", value: mlCfg.localPickup ? "Sí" : "No" },
    { label: "Garantía", value: `${mlCfg.warrantyType} · ${mlCfg.warrantyTime}` },
    { label: "Es un kit", value: mlCfg.isKit ? "Sí" : "No" },
  ];
  const tnSummaryRows = [
    { label: "MPN", value: tnCfg.mpn },
    { label: "Código de barras", value: tnCfg.barcode },
    { label: "Tags", value: tnCfg.tags },
    { label: "Género", value: tnCfg.gender },
    { label: "Grupo etario", value: tnCfg.ageGroup },
    { label: "Envío gratis", value: tnCfg.freeShipping ? "Sí" : "No" },
    { label: "Precio promocional", value: tnCfg.promoPrice },
    { label: "URL de video", value: tnCfg.videoUrl },
    { label: "Título SEO", value: tnCfg.seoTitle },
  ];
  const summaryRows = isML ? mlSummaryRows : tnSummaryRows;

  const advance = (nextStatus: ChannelStatus, nextStep: number) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep(nextStep);
      if (nextStatus === "published") {
        // brief green-tracker beat, then a calm inline confirmation card
        setStatus("prepublished");
        setCompleting(true);
        setTimeout(() => { measureBox(); setCelebrate(true); }, 350);
        setTimeout(() => { setStatus(nextStatus); setShowTracker(false); setCompleting(false); }, 900);
        setTimeout(() => { setCelebrate(false); setBubbleRect(null); }, 1950);
      } else {
        setStatus(nextStatus);
      }
    }, 1100);
  };

  // Run a toolbar action (pausar/reactivar) with a brief async feel
  const runAction = (_v: string, onSuccess: () => void) => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onSuccess();
    }, 900);
  };

  const doPause = () => runAction("pausar", () => setStatus("paused"));
  const doReactivate = () => runAction("reactivar", () => setStatus("published"));
  // Toolbar "Actualizar": just push the current data to the channel — no config step.
  const doUpdate = () => runAction("actualizar", () => { setEdited(true); setStatus("published"); });

  const isActive = status !== "published" && status !== "paused" && status !== "failed";

  // On the "Tipo" step, catalog mode requires a chosen ficha before continuing.
  const typeBlocked = isML && step === typeStep && pubMode === "catalog" && !catalogMatch;

  const ctaAction = isML && step === catStep && catStep > 0
    ? () => setStep(catStep + 1)
    : isML && step === typeStep && typeStep > 0
    ? () => setStep(typeStep + 1)
    : () => advance("published", steps.length);

  const btnLabel = loading ? "…"
    : isML && step === catStep && catStep > 0 ? "Confirmar"
    : isML && step === typeStep && typeStep > 0 ? "Continuar"
    : verb;

  return (
    <div ref={rootRef} className="flex flex-col gap-5 relative">

      {celebrate && bubbleRect && <PublishSuccessCard verbDone={verbDone} label={label} rect={bubbleRect} />}

      {/* Step tracker — sticky, turns green then fades out on publish */}
      <div style={{
        overflow: "hidden",
        maxHeight: showTracker ? "120px" : "0",
        opacity: showTracker ? 1 : 0,
        transition: "max-height 0.6s ease, opacity 0.5s ease",
        position: "sticky", top: "-24px", zIndex: 10,
        background: "white",
        marginLeft: "-24px", marginRight: "-24px",
        paddingLeft: "24px", paddingRight: "24px",
        paddingBottom: "12px", paddingTop: "4px",
        borderBottom: showTracker ? "1px solid #F1F5F9" : "none",
      }}>
        <div className="flex items-start">
          {steps.map((s, i) => {
            const n = i + 1;
            const allGreen = completing;
            const failed = status === "failed";
            const isLast = i === steps.length - 1;
            const isFail = failed && isLast;
            const done = !isFail && (allGreen ? true : step > n);
            const active = !allGreen && !isFail && step === n;
            const showCta = isActive && !failed && active && !loading && !completing;
            const showLoading = isActive && active && loading;
            const nodeColor = isFail ? "#DC2626" : done ? "#16A34A" : active ? accent : "#CBD5E1";
            return (
              <div key={s} className="flex items-start flex-1">
                <div className="flex flex-col items-center gap-1">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: isFail ? "#FEE2E2" : done ? "#16A34A" : active ? "#EEF2FF" : "#F8FAFC", color: isFail ? "#DC2626" : done ? "white" : active ? accent : "#CBD5E1", border: `1.5px solid ${isFail ? "#DC2626" : done ? "#16A34A" : active ? accent : "#E2E8F0"}`, transition: "all 0.4s ease" }}>
                    {isFail ? "✕" : done ? "✓" : n}
                  </div>
                  <span style={{ fontSize: "9px", color: nodeColor, fontWeight: (active || done || isFail) ? 600 : 400, whiteSpace: "nowrap", transition: "color 0.4s ease" }}>
                    {isFail ? "Error" : allGreen && isLast ? verbDone : s}
                  </span>
                  {(showCta || showLoading) && (
                    <button disabled={loading || typeBlocked} onClick={ctaAction}
                      className="mt-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all hover:brightness-95 whitespace-nowrap"
                      style={{ background: accent, color: "white", opacity: (loading || typeBlocked) ? 0.5 : 1, cursor: typeBlocked ? "not-allowed" : "pointer", fontSize: "10px" }}>
                      {btnLabel}
                    </button>
                  )}
                </div>
                {i < steps.length - 1 && <div className="flex-1 h-px mx-2 mt-3" style={{ background: done ? "#16A34A" : "#E2E8F0", transition: "background 0.4s ease" }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step content — no CTA buttons, just fields */}
      {isActive && isML && catStep > 0 && step === catStep && (
        <MLCategoryStep onConfirm={() => setStep(catStep + 1)} accent={accent} />
      )}
      {isActive && isML && typeStep > 0 && step === typeStep && (
        <MLPubTypeStep mode={pubMode} setMode={setPubMode} match={catalogMatch} setMatch={setCatalogMatch}
          mandatory={baseCatalog.mandatory} suggested={baseCatalog.product} />
      )}
      {isActive && isML && step === configStep && (
        isCatalogMode && catalogMatch
          ? <MLCatalogConfigStep cfg={mlCfg} set={setMl} accent={accent} product={product} match={catalogMatch} />
          : <MLConfigStep cfg={mlCfg} set={setMl} accent={accent} />
      )}
      {isActive && !isML && step === 1 && (
        <TNConfigStep cfg={tnCfg} set={setTn} />
      )}


      {/* Published state */}
      {status === "published" && isML && (
        <MLPublished verbDone={verbDone} label={label} accent={accent} summaryRows={summaryRows}
          price={product.ml_price ?? product.price} listingName={listingName}
          catalog={baseCatalog} pubMode={pubMode} catalogMatch={catalogMatch}
          onLink={c => { setPubMode("catalog"); setCatalogMatch(c); }}
          onUnlink={() => { setPubMode("traditional"); }}
          onEdit={editConfig} onUpdate={doUpdate} onPause={doPause} />
      )}
      {status === "published" && !isML && (
        <TNPublished verbDone={verbDone} label={label} summaryRows={summaryRows}
          onEdit={editConfig} onUpdate={doUpdate} onPause={doPause} />
      )}

      {/* Failed state */}
      {status === "failed" && failInfo && (
        <FailedPanel verb={failInfo.verb} label={label} reason={failInfo.reason}
          retrying={loading} onRetry={failInfo.retry} onEdit={failInfo.canEdit ? editConfig : undefined} />
      )}

      {/* Paused state — same layout as published, amber-toned */}
      {status === "paused" && isML && (
        <MLPublished verbDone={verbDone} label={label} accent={accent} summaryRows={summaryRows}
          price={product.ml_price ?? product.price} listingName={listingName} paused
          catalog={baseCatalog} pubMode={pubMode} catalogMatch={catalogMatch}
          onLink={c => { setPubMode("catalog"); setCatalogMatch(c); }}
          onUnlink={() => { setPubMode("traditional"); }}
          onEdit={editConfig} onUpdate={doUpdate} onPause={doPause} onReactivate={doReactivate} />
      )}
      {status === "paused" && !isML && (
        <TNPublished verbDone={verbDone} label={label} summaryRows={summaryRows} paused
          onEdit={editConfig} onUpdate={doUpdate} onPause={doPause} onReactivate={doReactivate} />
      )}

    </div>
  );
}

// ─── Product fields ───────────────────────────────────────────────────────────

function AIButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} type="button" title="Generar con IA"
      className="flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-semibold transition-colors"
      style={{ color: "#4F46E5" }}
      onMouseEnter={e => (e.currentTarget.style.background = "#EEF2FF")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
        <path d="M8 1.5l1.4 3.6L13 6.5 9.4 7.9 8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z" fill="currentColor" />
        <path d="M12.8 10.5l.6 1.5 1.5.6-1.5.6-.6 1.5-.6-1.5-1.5-.6 1.5-.6.6-1.5z" fill="currentColor" opacity="0.7" />
      </svg>
      IA
    </button>
  );
}

function AIGenerateModal({ fieldLabel, onClose, onAccept }: { fieldLabel: string; onClose: () => void; onAccept: (v: string) => void }) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const isTitle = fieldLabel === "título";

  const generate = () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    window.setTimeout(() => {
      const base = prompt.trim();
      const generated = isTitle
        ? base.charAt(0).toUpperCase() + base.slice(1)
        : `${base.charAt(0).toUpperCase() + base.slice(1)}. Producto de calidad premium, ideal para uso diario. Envío rápido y garantía incluida.`;
      setResult(generated);
      setLoading(false);
    }, 900);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "fadeUp 0.18s ease both" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: "#E0E7FF" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 4.5h12v8H8l-3 3v-3H4v-8z" stroke="#4F46E5" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
          <h3 className="text-lg font-bold" style={{ color: "#0A1628" }}>Generar con IA</h3>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm" style={{ color: "#475569" }}>Ingresa el prompt para generar {isTitle ? "el título" : "la descripción"}:</label>
          <textarea autoFocus value={prompt} onChange={e => setPrompt(e.target.value)} rows={isTitle ? 2 : 3}
            placeholder="Escribe aquí…"
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); }}
            className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all resize-none"
            style={{ border: "1.5px solid #E2E8F0", color: "#0A1628" }}
            onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.12)"; }}
            onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs" style={{ color: "#64748B" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ animation: "spin 0.8s linear infinite" }}>
              <circle cx="7" cy="7" r="5.5" stroke="#E2E8F0" strokeWidth="2" />
              <path d="M7 1.5a5.5 5.5 0 015.5 5.5" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" />
            </svg>
            Generando…
          </div>
        )}

        {result && !loading && (
          <div className="rounded-xl p-3 flex flex-col gap-1" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>Sugerencia</span>
            <p className="text-sm leading-relaxed" style={{ color: "#0A1628" }}>{result}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
            onMouseLeave={e => (e.currentTarget.style.background = "white")}>
            Cancelar
          </button>
          {result && !loading ? (
            <button onClick={() => { onAccept(result); onClose(); }}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: "#4F46E5" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#4338CA")}
              onMouseLeave={e => (e.currentTarget.style.background = "#4F46E5")}>
              Usar sugerencia
            </button>
          ) : (
            <button onClick={generate} disabled={!prompt.trim() || loading}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: !prompt.trim() || loading ? "#C7D2FE" : "#4F46E5", cursor: !prompt.trim() || loading ? "default" : "pointer" }}
              onMouseEnter={e => { if (prompt.trim() && !loading) e.currentTarget.style.background = "#4338CA"; }}
              onMouseLeave={e => { if (prompt.trim() && !loading) e.currentTarget.style.background = "#4F46E5"; }}>
              Aceptar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProductFields({ product }: { product: Product }) {
  const inputCls = "w-full px-3 py-2 text-sm rounded-lg outline-none transition-all"
  const inputStyle = { border: "1px solid #E2E8F0", color: "#0A1628", background: "white" };
  const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = "#818CF8";
    e.target.style.boxShadow = "0 0 0 3px rgba(99,102,241,0.1)";
  };
  const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.target.style.borderColor = "#E2E8F0";
    e.target.style.boxShadow = "none";
  };

  const [title, setTitle] = useState(product.name_edited || product.name);
  const [description, setDescription] = useState(product.description);
  const [brand, setBrand] = useState(product.brand ?? "");
  const [model, setModel] = useState(product.model ?? "");
  const [aiField, setAiField] = useState<null | "título" | "descripción">(null);
  const [prepublishing, setPrepublishing] = useState(false);
  const [prepublished, setPrepublished] = useState(false);
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const missingCount = [!title.trim(), !description.trim(), !brand.trim(), !model.trim()].filter(Boolean).length;
  const explain = "La IA completa los campos faltantes (marca, modelo) y mejora el título y la descripción si están vacíos, dejando el producto listo para publicar.";

  const prepublish = () => {
    if (prepublishing || prepublished) return;
    setPrepublishing(true);
    window.setTimeout(() => {
      if (!brand.trim()) setBrand("Genérico");
      if (!model.trim()) setModel(`${product.internal_code}-STD`);
      if (!title.trim()) setTitle(`${product.name} ${product.brand ?? ""}`.trim());
      if (!description.trim()) setDescription(`${product.name}. Producto de ${product.category.toLowerCase()} de calidad premium, ideal para uso diario. Envío rápido y garantía incluida.`);
      setPrepublishing(false);
      setPrepublished(true);
    }, 1000);
  };

  return (
    <div className="flex flex-col gap-5">

      {/* Prepublicar */}
      {prepublished ? (
        <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: "#15803D" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.4" /><path d="M5 8l2 2 4-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Ya se ejecutó la prepublicación
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button onClick={prepublish} disabled={prepublishing} type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{ border: "1.5px solid #C7D2FE", color: "#4F46E5", background: "white", cursor: prepublishing ? "default" : "pointer" }}
            onMouseEnter={e => { if (!prepublishing) e.currentTarget.style.background = "#EEF2FF"; }}
            onMouseLeave={e => { if (!prepublishing) e.currentTarget.style.background = "white"; }}>
            {prepublishing ? (
              <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ animation: "spin 0.8s linear infinite" }}><circle cx="7" cy="7" r="5.5" stroke="#C7D2FE" strokeWidth="2" /><path d="M7 1.5a5.5 5.5 0 015.5 5.5" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" /></svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 1.5l1.4 3.6L13 6.5 9.4 7.9 8 11.5 6.6 7.9 3 6.5l3.6-1.4L8 1.5z" fill="currentColor" /></svg>
            )}
            {prepublishing ? "Procesando…" : "Prepublicar"}
          </button>
          {missingCount > 0 && <span className="text-xs" style={{ color: "#94A3B8" }}>faltan {missingCount} campos</span>}
          <span className="ml-auto flex items-center justify-center rounded-full cursor-help transition-colors hover:border-indigo-300"
            style={{ width: 16, height: 16, border: "1px solid #CBD5E1", color: "#94A3B8", fontSize: "10px", fontWeight: 700 }}
            onMouseEnter={e => { const r = e.currentTarget.getBoundingClientRect(); setTip({ x: r.right, y: r.bottom + 8 }); }}
            onMouseLeave={() => setTip(null)}>?</span>
        </div>
      )}

      {tip && (
        <div className="fixed z-[70] w-60 rounded-lg p-2.5 text-xs leading-relaxed pointer-events-none"
          style={{ top: tip.y, left: tip.x, transform: "translateX(-100%)", background: "#0F172A", color: "#E2E8F0", boxShadow: "0 8px 24px rgba(15,23,42,0.3)" }}>
          {explain}
        </div>
      )}

      {/* Title */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "#64748B" }}>Título</label>
        <div className="relative">
          <input value={title} onChange={e => setTitle(e.target.value)}
            className="w-full pl-3 pr-16 py-2 text-sm rounded-lg outline-none transition-all" style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
            <AIButton onClick={() => setAiField("título")} />
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "#64748B" }}>Descripción</label>
        <div className="relative">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} onFocus={onFocus} onBlur={onBlur}
            className="w-full px-3 pt-2 pb-9 text-sm rounded-lg outline-none transition-all resize-none leading-relaxed"
            style={{ ...inputStyle }} />
          <div className="absolute right-1.5 bottom-1.5">
            <AIButton onClick={() => setAiField("descripción")} />
          </div>
        </div>
      </div>

      {aiField && (
        <AIGenerateModal
          fieldLabel={aiField}
          onClose={() => setAiField(null)}
          onAccept={v => (aiField === "título" ? setTitle(v) : setDescription(v))}
        />
      )}

      {/* Dimensions */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium" style={{ color: "#64748B" }}>Dimensiones</label>
        <div className="grid grid-cols-4 gap-2">
          {[["Alto","15","cm"],["Ancho","20","cm"],["Largo","30","cm"],["Peso","1500","g"]].map(([label, val, unit]) => (
            <div key={label}>
              <div className="relative">
                <input defaultValue={val} onFocus={onFocus} onBlur={onBlur}
                  className="w-full pl-3 pr-7 py-2 text-sm rounded-lg outline-none transition-all text-right tabular-nums"
                  style={{ ...inputStyle }} />
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
                  style={{ color: "#CBD5E1" }}>{unit}</span>
              </div>
              <p className="text-xs mt-1 text-center" style={{ color: "#94A3B8" }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ─── Drawer ───────────────────────────────────────────────────────────────────

function Metrics({ product }: { product: Product }) {
  const m = margin(product.cost, product.price);
  const mColor = m > 40 ? "#16A34A" : m > 20 ? "#D97706" : "#DC2626";
  return (
    <div className="flex flex-col gap-2">
      {[
        { label: "Stock", value: `${product.stock} u.`, color: "#0A1628" },
        { label: "Costo", value: fmt(product.cost), color: "#64748B" },
        { label: "Precio", value: fmt(product.price), color: "#0A1628" },
      ].map(r => (
        <div key={r.label} className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "#94A3B8" }}>{r.label}</span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: r.color }}>{r.value}</span>
        </div>
      ))}
      <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid #E2E8F0" }}>
        <span className="text-xs" style={{ color: "#94A3B8" }}>Margen</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: mColor }}>{m}%</span>
      </div>
    </div>
  );
}

function DrawerModal({ product, initialTab = "producto", onClose }: { product: Product; initialTab?: "producto" | "ml" | "tn"; onClose: () => void }) {
  const [tab, setTab] = useState<"producto" | "ml" | "tn">(initialTab);
  const m = margin(product.cost, product.price);
  // Deterministic time-of-day derived from the product id (data stores date only).
  const pad = (n: number) => String(n).padStart(2, "0");
  const updatedTime = `${pad((product.id * 7 + 8) % 24)}:${pad((product.id * 13 + 5) % 60)}:${pad((product.id * 17 + 11) % 60)}`;

  const tabs = [
    { key: "producto" as const, label: "Datos generales" },
    { key: "ml"      as const, label: "MercadoLibre" },
    { key: "tn"      as const, label: "Tienda Nube" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      {/* Drawer shell — wider to support two-column layout */}
      <div className="w-[820px] flex flex-col bg-white shadow-2xl" style={{ borderLeft: "1px solid #E2E8F0" }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <span className="text-xs" style={{ color: "#94A3B8" }}>Actualizado {product.updated_at} · {updatedTime} hs</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" style={{ color: "#94A3B8" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Two-column body */}
        <div className="flex flex-1 min-h-0">

          {/* ── Left: product identity panel ── */}
          <div className="w-56 flex-shrink-0 flex flex-col gap-5 px-5 py-5 overflow-y-auto" style={{ borderRight: "1px solid #F1F5F9", background: "#FAFBFC" }}>

            {/* Image gallery */}
            <ImageGallery images={product.images} alt={product.name_edited || product.name} />

            {/* Product identity — title without label, the rest labeled */}
            <div className="flex flex-col gap-3">
              <p className="font-semibold text-sm leading-snug" style={{ color: "#0A1628" }}>{product.name_edited || product.name}</p>
              {[
                { label: "Marca", value: product.brand },
                { label: "Modelo", value: product.model },
                { label: "SKU", value: product.sku, mono: true },
                { label: "Código interno", value: product.internal_code, mono: true },
                { label: "Categoría", value: product.category },
              ].map(f => (
                <div key={f.label} className="flex flex-col gap-0.5">
                  <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#CBD5E1" }}>{f.label}</span>
                  <span className={f.mono ? "text-xs font-mono" : "text-xs"} style={{ color: "#475569" }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* Key metrics */}
            <Metrics product={product} />

            {/* Delete */}
            <div className="mt-auto pt-2">
              <button className="flex items-center gap-1.5 text-xs w-full" style={{ color: "#CBD5E1" }}
                onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                onMouseLeave={e => (e.currentTarget.style.color = "#CBD5E1")}>
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M3 4h10M6 4V2h4v2M5 4l.5 10h5L11 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Eliminar producto
              </button>
            </div>
          </div>

          {/* ── Right: tab content ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tab bar */}
            <div className="flex items-center gap-0 px-6 flex-shrink-0" style={{ borderBottom: "1px solid #E2E8F0" }}>
              {tabs.map(tb => (
                <button key={tb.key} onClick={() => setTab(tb.key)}
                  className="flex items-center gap-1.5 px-1 py-3 mr-5 text-xs font-semibold transition-all"
                  style={{
                    color: tab === tb.key ? "#0A1628" : "#94A3B8",
                    borderBottom: tab === tb.key ? "2px solid #4F46E5" : "2px solid transparent",
                    marginBottom: "-1px",
                    letterSpacing: "0.01em",
                  }}>
                  {tb.label}
                </button>
              ))}
            </div>

            {/* Content */}
            <div data-panel-scroll className="flex-1 overflow-y-auto px-6 py-6">
              {tab === "producto" && <ProductFields product={product} />}
              {tab === "ml"      && <ChannelPanel key="ml" channel="ml" status={product.ml_status} product={product} />}
              {tab === "tn"      && <ChannelPanel key="tn" channel="tn" status={product.tn_status} product={product} />}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: "1px solid #F1F5F9" }}>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors" style={{ color: "#64748B" }}>
                Cerrar
              </button>
              <button className="px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-95" style={{ background: "#4F46E5", color: "white" }}>
                Guardar cambios
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

type NavIconKey = "inventario" | "ml" | "tn" | "ventas" | "envios" | "competencia" | "prompts" | "preguntas" | "usuarios" | "configuracion" | "notificaciones";
type NavChild = { label: string; icon: NavIconKey; key?: string };
type NavItem = { label: string; icon: NavIconKey; children?: NavChild[] };
const NAV: NavItem[] = [
  { label: "Inventario", icon: "inventario", children: [
    { label: "MercadoLibre", icon: "ml" },
    { label: "Tienda Nube", icon: "tn" },
  ] },
  { label: "Ventas", icon: "ventas" },
  { label: "Envíos", icon: "envios" },
  { label: "Competencia", icon: "competencia" },
  { label: "Prompts AI", icon: "prompts" },
  { label: "Preguntas", icon: "preguntas" },
  { label: "Usuarios", icon: "usuarios" },
  { label: "Configuración", icon: "configuracion" },
];

function NavIcon({ name, size = 16 }: { name: NavIconKey; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "inventario": // boxes / stacked packages
      return (<svg {...p}><path d="M10 2.5l6 3.2v8.6l-6 3.2-6-3.2V5.7l6-3.2z" /><path d="M4 5.7l6 3.2 6-3.2M10 8.9v8.6" /></svg>);
    case "ml": // marketplace tag
      return (<svg {...p}><path d="M3.5 3.5h5l8 8-5 5-8-8v-5z" /><circle cx="6.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>);
    case "tn": // storefront
      return (<svg {...p}><path d="M3 7.5l1.2-4h11.6L17 7.5" /><path d="M3 7.5v9h14v-9" /><path d="M3 7.5a2 2 0 0 0 4 0 2 2 0 0 0 3 0 2 2 0 0 0 3 0 2 2 0 0 0 4 0" /><path d="M8 16.5v-4h4v4" /></svg>);
    case "ventas": // trending-up chart
      return (<svg {...p}><path d="M3 16.5h14" /><path d="M4.5 13l3.5-4 3 2.5L17 5.5" /><path d="M13.5 5.5H17V9" /></svg>);
    case "envios": // delivery truck
      return (<svg {...p}><path d="M2.5 5.5h9v8h-9z" /><path d="M11.5 8h3l2.5 2.5v3h-5.5" /><circle cx="6" cy="15" r="1.4" /><circle cx="14" cy="15" r="1.4" /></svg>);
    case "competencia": // target
      return (<svg {...p}><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="3" /><circle cx="10" cy="10" r="0.4" fill="currentColor" /></svg>);
    case "prompts": // sparkles / AI
      return (<svg {...p}><path d="M9 3l1.4 3.6L14 8l-3.6 1.4L9 13l-1.4-3.6L4 8l3.6-1.4L9 3z" /><path d="M15 12l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" /></svg>);
    case "preguntas": // chat bubble with question mark
      return (<svg {...p}><path d="M17 12.5a2 2 0 0 1-2 2H8l-3.5 3v-3H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /><path d="M8.6 7.6a1.6 1.6 0 1 1 2.2 1.5c-.5.2-.8.6-.8 1.1" /><path d="M10 12.2h.01" /></svg>);
    case "usuarios": // users
      return (<svg {...p}><circle cx="7.5" cy="7" r="2.8" /><path d="M2.5 16.5c0-2.8 2.2-4.5 5-4.5s5 1.7 5 4.5" /><path d="M13 4.6a2.8 2.8 0 010 4.8M14.5 12.4c1.9.5 3 2.1 3 4.1" /></svg>);
    case "notificaciones": // bell
      return (<svg {...p}><path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1 4.5-2 5.5h13c-1-1-2-2.5-2-5.5A4.5 4.5 0 0 0 10 3z" /><path d="M8.2 16a2 2 0 0 0 3.6 0" /></svg>);
    case "configuracion": // gear / cog (Lucide settings)
      return (<svg {...p} viewBox="0 0 24 24" strokeWidth={1.9}><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>);
  }
}

function Sidebar({ active, onActive }: { active: string; onActive: (s: string) => void }) {
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Inventario: true });

  // Keep only the group that owns the active page expanded; collapse the rest on navigation.
  useEffect(() => {
    const owner = NAV.find(item => item.children && (item.label === active || item.children.some(c => (c.key ?? c.label) === active)))?.label;
    setOpenGroups(prev => {
      const next: Record<string, boolean> = {};
      for (const item of NAV) if (item.children) next[item.label] = item.label === owner;
      return next;
    });
  }, [active]);
  return (
    <aside className={`w-52 flex-col flex-shrink-0 bg-white ${active === "Preguntas" ? "hidden md:flex" : "flex"}`} style={{ borderRight: "1px solid #E2E8F0" }}>
      <div className="flex items-center gap-2.5 px-4 py-4" style={{ borderBottom: "1px solid #F1F5F9" }}>
        <img src={omnipanelLogo} alt="Omnipanel" className="h-11 w-auto max-w-full" />
      </div>
      <nav className="flex flex-col gap-0.5 px-3 py-4 flex-1">
        {NAV.map(item => {
          const open = openGroups[item.label] ?? false;
          return (
          <div key={item.label}>
            <button onClick={() => { if (item.children) { onActive(item.label); setOpenGroups(g => ({ ...g, [item.label]: true })); } else onActive(item.label); }}
              className="flex items-center gap-2.5 w-full text-left text-sm px-3 py-2 rounded-lg transition-all"
              style={{ background: active === item.label ? "#EEF2FF" : "transparent", color: active === item.label ? "#4F46E5" : "#64748B", fontWeight: (active === item.label || (item.children && open)) ? 600 : 400, borderLeft: active === item.label ? "2px solid #4F46E5" : "2px solid transparent" }}>
              <span style={{ opacity: 0.75, display: "flex" }}><NavIcon name={item.icon} /></span>
              <span className="flex-1">{item.label}</span>
              {item.children && <span onClick={e => { e.stopPropagation(); setOpenGroups(g => ({ ...g, [item.label]: !open })); }} style={{ fontSize: "10px", opacity: 0.35, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>▾</span>}
            </button>
            {item.children && open && (
              <div className="ml-5 mt-0.5 mb-1 flex flex-col gap-0.5">
                {item.children.map(child => {
                  const cKey = child.key ?? child.label;
                  return (
                  <button key={cKey} onClick={() => onActive(cKey)}
                    className="flex items-center gap-2 w-full text-left text-xs px-3 py-1.5 rounded-lg transition-all"
                    style={{ background: active === cKey ? "#EEF2FF" : "transparent", color: active === cKey ? "#4F46E5" : "#94A3B8", fontWeight: active === cKey ? 600 : 400 }}>
                    <span style={{ display: "flex" }}><NavIcon name={child.icon} size={13} /></span>{child.label}
                  </button>
                  );
                })}
              </div>
            )}
          </div>
          );
        })}
      </nav>
      <div className="px-4 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: "#4F46E5" }}>N</div>
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "#0A1628" }}>Nicolas Gallucci</p>
            <button className="text-xs" style={{ color: "#94A3B8" }}>Cerrar Sesión</button>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ─── Edición inline en tablas ───────────────────────────────────────────────────
// Gesto separado: tocar la celda/lápiz edita (stopPropagation), tocar el resto de la
// fila abre el panel. Estados: idle → edit → saving → (idle | error→revierte).
//
// Modo de edición: un solo lápiz por fila (aparece al pasar el mouse). Al activarlo,
// TODAS las celdas editables de la fila pasan a inputs a la vez, con una barra
// Guardar / Cancelar. Solo una fila editable a la vez; cambiar de fila guarda la anterior.

// Coordina el modo edición por fila. Cada EditableCell escucha los ticks para hacer
// commit / cancel en conjunto cuando su fila está activa.
const RowEditContext = createContext<{ active: number | null; saveTick: number; cancelTick: number }>({ active: null, saveTick: 0, cancelTick: 0 });

// Acción de edición por fila: lápiz al pasar el mouse; en modo edición
// muestra la barra Guardar / Cancelar anclada a la fila.
function RowEditAction({ editing, onStart, onSave, onCancel }: { editing: boolean; onStart: () => void; onSave: () => void; onCancel: () => void }) {
  if (editing) {
    return (
      <div className="inline-flex items-center gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
        <button onClick={e => { e.stopPropagation(); onSave(); }} className="inline-flex items-center gap-1 rounded-md text-white px-2 py-1 transition-colors" style={{ fontSize: "11px", fontWeight: 600, background: "#4F46E5" }} onMouseEnter={e => (e.currentTarget.style.background = "#4338CA")} onMouseLeave={e => (e.currentTarget.style.background = "#4F46E5")}>
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5L13 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Guardar
        </button>
        <button onClick={e => { e.stopPropagation(); onCancel(); }} className="rounded-md px-2 py-1 transition-colors" style={{ fontSize: "11px", fontWeight: 600, border: "1px solid #E2E8F0", color: "#64748B" }} onMouseEnter={e => (e.currentTarget.style.background = "#F1F5F9")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
          Cancelar
        </button>
      </div>
    );
  }
  return (
    <button onClick={e => { e.stopPropagation(); onStart(); }} title="Editar fila"
      className="inline-flex items-center justify-center rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
      style={{ width: 26, height: 26, border: "1px solid #E2E8F0", color: "#4F46E5" }}
      onMouseEnter={e => (e.currentTarget.style.background = "#EEF2FF")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
      <PencilIcon size={13} />
    </button>
  );
}

function PencilIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M11 2.5l2.5 2.5M3 13l.7-2.6 6.6-6.6 2.5 2.5-6.6 6.6L3 13z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditableCell({ value, align, type = "text", prefix, format, leading, onSave, rowId }: {
  value: string;
  rowId?: number;
  align?: boolean;
  type?: "text" | "number";
  prefix?: string;                        // ej. "$" para precio
  format?: (v: string) => ReactNode;      // cómo mostrar el valor guardado
  leading?: ReactNode;                    // contenido antes del valor (ej. miniatura)
  onSave?: (v: string) => void;
}) {
  const [committed, setCommitted] = useState(value);
  const [mode, setMode] = useState<"idle" | "edit" | "saving" | "error">("idle");
  const [draft, setDraft] = useState(value);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const rowEdit = useContext(RowEditContext);
  const rowActive = rowId != null && rowEdit.active === rowId;
  const savedTick = useRef(rowEdit.saveTick);
  const cancelledTick = useRef(rowEdit.cancelTick);

  useEffect(() => { if (mode === "edit") inputRef.current?.focus(); }, [mode]);
  useEffect(() => { if (mode === "idle") { setCommitted(value); setDraft(value); } }, [value]); // eslint-disable-line

  // Entrar / salir del modo edición junto con la fila.
  useEffect(() => {
    if (rowActive) { setDraft(committed); setErr(""); setMode(m => (m === "saving" ? m : "edit")); }
    else { setMode(m => (m === "edit" || m === "error") ? "idle" : m); }
  }, [rowActive]); // eslint-disable-line
  // Commit / cancel en conjunto disparados por la barra de la fila.
  useEffect(() => {
    if (!rowActive) { savedTick.current = rowEdit.saveTick; return; }
    if (rowEdit.saveTick !== savedTick.current) { savedTick.current = rowEdit.saveTick; commit(); }
  }, [rowEdit.saveTick]); // eslint-disable-line
  useEffect(() => {
    if (!rowActive) { cancelledTick.current = rowEdit.cancelTick; return; }
    if (rowEdit.cancelTick !== cancelledTick.current) { cancelledTick.current = rowEdit.cancelTick; cancel(); }
  }, [rowEdit.cancelTick]); // eslint-disable-line

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const start = (e: React.MouseEvent) => { e.stopPropagation(); setDraft(committed); setErr(""); setMode("edit"); };
  const cancel = (e?: React.SyntheticEvent) => { e?.stopPropagation(); setMode("idle"); setErr(""); setDraft(committed); };
  const fail = (m: string) => { setErr(m); setMode("error"); setTimeout(() => { setMode("idle"); setDraft(committed); setErr(""); }, 2200); };
  const commit = (e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const v = draft.trim();
    if (!v) return fail("No puede quedar vacío");
    if (type === "number" && !/^\d+([.,]\d+)?$/.test(v)) return fail("Ingresá un número válido");
    setMode("saving");
    // Simula la sincronización con el canal.
    setTimeout(() => {
      setCommitted(v);
      onSave?.(v);
      setMode("idle");
    }, 700);
  };

  if (mode === "edit" || mode === "error") {
    // Editor en el lugar: sin botones ✓/✕ — Enter guarda, Esc cancela.
    return (
      <div className={`inline-flex flex-col gap-1 ${align ? "items-end" : "items-start"}`} onClick={stop}>
        <div className="inline-flex items-center rounded-lg overflow-hidden" style={{ border: `1px solid ${mode === "error" ? "#FCA5A5" : "#4F46E5"}`, boxShadow: mode === "error" ? "0 0 0 3px rgba(220,38,38,0.12)" : "0 0 0 3px rgba(79,70,229,0.14)" }}>
          {prefix && <span className="pl-2 text-xs" style={{ color: "#94A3B8" }}>{prefix}</span>}
          <input ref={inputRef} value={draft} inputMode={type === "number" ? "decimal" : "text"}
            onChange={e => setDraft(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === "Enter") commit(e); else if (e.key === "Escape") cancel(e); }}
            onBlur={() => { if (!rowActive && mode === "edit") commit(); }}
            className="px-2 py-1 text-xs outline-none bg-transparent"
            style={{ color: "#0A1628", width: type === "number" ? 96 : 160, textAlign: align ? "right" : "left" }} />
        </div>
        {mode === "error"
          ? <span style={{ fontSize: "10px", color: "#DC2626" }}>{err}</span>
          : !rowActive && <span style={{ fontSize: "9px", color: "#94A3B8" }}>Enter guarda · Esc cancela</span>}
      </div>
    );
  }

  // La edición se activa desde el lápiz de la fila; la celda en reposo solo muestra el
  // valor (y el spinner mientras guarda). No es un botón per se, pero permite click directo.
  const spinner = <svg width="11" height="11" viewBox="0 0 16 16" fill="none" className="flex-shrink-0" style={{ color: "#4F46E5", animation: "spin 1s linear infinite" }}><circle cx="8" cy="8" r="6" stroke="#E2E8F0" strokeWidth="2" /><path d="M8 2a6 6 0 016 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
  const affordance = mode === "saving" ? spinner : null;
  const baseCls = align ? "whitespace-nowrap" : "truncate"; // nunca truncar columnas numéricas
  const valueNode = <span className={baseCls}>{format ? format(committed) : committed}</span>;
  return (
    <button onClick={start} title="Editar"
      className="inline-flex items-center gap-1.5 rounded-lg px-1 -mx-1 py-0.5 transition-colors max-w-full"
      style={{ cursor: "text" }}
      onMouseEnter={e => (e.currentTarget.style.background = "#F1F5F9")} onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
      {leading}
      {align ? <>{affordance}{valueNode}</> : <>{valueNode}{affordance}</>}
    </button>
  );
}

// ─── Columns & filters model ────────────────────────────────────────────────────

type ColKey =
  | "producto" | "internal_code" | "sku" | "gtin" | "brand" | "model" | "category"
  | "stock" | "cost" | "price" | "ml_price" | "tn_price" | "dimensions"
  | "created_at" | "updated_at" | "ml_status" | "tn_status";

type ColDef = { key: ColKey; label: string; locked?: boolean; editable?: boolean; render: (p: Product) => ReactNode };

const COLUMNS: ColDef[] = [
  { key: "producto", label: "Producto", locked: true, editable: true, render: p => (
    <div className="flex items-center" style={{ color: "#0A1628" }}>
      <EditableCell rowId={p.id} value={p.name_edited || p.name} leading={<ImgPlaceholder size={32} />} onSave={v => { p.name_edited = v; }} format={v => <span className="font-medium">{v}</span>} />
    </div>
  ) },
  { key: "internal_code", label: "Código interno", render: p => <span style={{ color: "#475569" }}>{p.internal_code}</span> },
  { key: "sku", label: "SKU", render: p => <span className="font-mono" style={{ color: "#475569" }}>{p.sku}</span> },
  { key: "gtin", label: "GTIN", render: p => <span className="font-mono" style={{ color: "#94A3B8" }}>{p.gtin}</span> },
  { key: "brand", label: "Marca", editable: true, render: p => <span style={{ color: "#475569" }}><EditableCell rowId={p.id} value={p.brand} onSave={v => { p.brand = v; }} /></span> },
  { key: "model", label: "Modelo", editable: true, render: p => <span style={{ color: "#475569" }}><EditableCell rowId={p.id} value={p.model} onSave={v => { p.model = v; }} /></span> },
  { key: "category", label: "Categoría", render: p => <CategoryChip category={p.category} /> },
  { key: "stock", label: "Stock", render: p => <span className="tabular-nums" style={{ color: "#0A1628" }}>{p.stock}</span> },
  { key: "cost", label: "Costo", render: p => <span className="tabular-nums" style={{ color: "#475569" }}>{fmt(p.cost)}</span> },
  { key: "price", label: "Precio", editable: true, render: p => (
    <EditableCell rowId={p.id} value={String(p.price)} type="number" prefix="$" onSave={v => { p.price = Number(v.replace(",", ".")); }} format={v => <span className="tabular-nums font-semibold" style={{ color: "#0A1628" }}>{fmt(Number(v))}</span>} />
  ) },
  { key: "ml_price", label: "Precio ML", render: p => <span className="tabular-nums" style={{ color: p.ml_price ? "#475569" : "#CBD5E1" }}>{p.ml_price ? fmt(p.ml_price) : "—"}</span> },
  { key: "tn_price", label: "Precio TN", render: p => <span className="tabular-nums" style={{ color: p.tn_price ? "#475569" : "#CBD5E1" }}>{p.tn_price ? fmt(p.tn_price) : "—"}</span> },
  { key: "dimensions", label: "Dimensiones", render: p => <span style={{ color: "#475569" }}>{p.dimensions}</span> },
  { key: "created_at", label: "Creado", render: p => <span style={{ color: "#94A3B8" }}>{p.created_at}</span> },
  { key: "updated_at", label: "Actualizado", render: p => <span style={{ color: "#94A3B8" }}>{p.updated_at}</span> },
  { key: "ml_status", label: "MercadoLibre", render: p => <StatusBadge status={p.ml_status} /> },
  { key: "tn_status", label: "Tienda Nube", render: p => <StatusBadge status={p.tn_status} /> },
];
const COL_MAP = Object.fromEntries(COLUMNS.map(c => [c.key, c])) as Record<ColKey, ColDef>;
const DEFAULT_COLS: ColKey[] = ["producto", "category", "stock", "cost", "price", "ml_status", "tn_status"];

const COLS_KEY = "omnipanel.inventory.cols";
const loadCols = (): ColKey[] => {
  try {
    const arr = JSON.parse(localStorage.getItem(COLS_KEY) || "null") as ColKey[] | null;
    if (Array.isArray(arr)) {
      const valid = arr.filter(k => COL_MAP[k]);
      if (valid.includes("producto") && valid.length) return valid;
    }
  } catch { /* ignore */ }
  return DEFAULT_COLS;
};
const saveCols = (c: ColKey[]) => { try { localStorage.setItem(COLS_KEY, JSON.stringify(c)); } catch { /* ignore */ } };

type Filters = { category: string; ml: string; tn: string; stock: string };
const DEFAULT_FILTERS: Filters = { category: "all", ml: "all", tn: "all", stock: "all" };

const STATUS_FILTER = [
  { value: "all", label: "Todos" },
  { value: "published", label: "Publicado" },
  { value: "paused", label: "Pausado" },
  { value: "prepublished", label: "Pre-publicado" },
  { value: "unpublished", label: "Sin publicar" },
  { value: "failed", label: "Con error" },
];
const CATEGORIES = Array.from(new Set(products.map(p => p.category))).sort();
// Chip de categoría con color estable por nombre (paleta suave, sin chocar con los estados).
const CATEGORY_TONES = [
  { color: "#7C3AED", bg: "#F3EEFF" }, { color: "#0E7490", bg: "#E6F6FA" }, { color: "#BE185D", bg: "#FDECF4" },
  { color: "#B45309", bg: "#FEF5E7" }, { color: "#15803D", bg: "#EAF7EE" }, { color: "#1D4ED8", bg: "#EBF1FE" },
  { color: "#9A3412", bg: "#FDF0EA" }, { color: "#4D7C0F", bg: "#F1F8E6" },
];
const categoryTone = (c: string) => {
  const i = CATEGORIES.indexOf(c);
  const idx = i >= 0 ? i : [...c].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return CATEGORY_TONES[idx % CATEGORY_TONES.length];
};
function CategoryChip({ category }: { category: string }) {
  const t = categoryTone(category);
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap" style={{ background: t.bg, color: t.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />{category}
    </span>
  );
}


function filterProducts(search: string, f: Filters) {
  return products.filter(p => {
    if (!p) return false;
    if (!(p.name_edited || p.name).toLowerCase().includes(search.toLowerCase())) return false;
    if (f.category !== "all" && p.category !== f.category) return false;
    if (f.ml !== "all" && p.ml_status !== f.ml) return false;
    if (f.tn !== "all" && p.tn_status !== f.tn) return false;
    if (f.stock === "in" && p.stock <= 0) return false;
    if (f.stock === "out" && p.stock > 0) return false;
    return true;
  });
}
const activeFilterCount = (f: Filters) => Object.values(f).filter(v => v !== "all").length;

// ─── Popover primitive ──────────────────────────────────────────────────────────

function Popover({ trigger, width = 260, children }: { trigger: (open: boolean) => ReactNode; width?: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div onClick={() => setOpen(o => !o)}>{trigger(open)}</div>
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 z-30 rounded-xl bg-white" style={{ width, border: "1px solid #E2E8F0", boxShadow: "0 12px 32px rgba(15,23,42,0.12)", animation: "fadeUp 0.15s ease both" }}>
            {children(() => setOpen(false))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Filters panel ──────────────────────────────────────────────────────────────

function FilterField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value) ?? options[0];
  return (
    <div className="flex flex-col gap-1">
      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{label}</span>
      <div className="relative">
        <button onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-all"
          style={{ background: open ? "#EEF2FF" : "#F8FAFC", border: `1px solid ${open ? "#C7D2FE" : "#E2E8F0"}` }}>
          <span className="text-xs font-medium truncate" style={{ color: "#0A1628" }}>{current?.label}</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ color: "#94A3B8", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={e => { e.stopPropagation(); setOpen(false); }} />
            <div className="absolute left-0 right-0 mt-1 z-50 rounded-xl p-1.5 flex flex-col gap-0.5 max-h-56 overflow-y-auto"
              style={{ background: "white", border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15,23,42,0.14)" }}>
              {options.map(o => (
                <button key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                  className="flex items-center justify-between gap-2 text-left px-3 py-1.5 rounded-lg text-xs transition-colors hover:bg-slate-50"
                  style={{ color: o.value === value ? "#4F46E5" : "#0A1628", fontWeight: o.value === value ? 600 : 400 }}>
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M2.5 7.5l3 3 6-7" stroke="#4F46E5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FilterPanel({ filters, setFilters }: { filters: Filters; setFilters: (f: Filters) => void }) {
  const set = <K extends keyof Filters>(k: K, v: string) => setFilters({ ...filters, [k]: v });
  const count = activeFilterCount(filters);
  return (
    <Popover width={280} trigger={open => (
      <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
        style={{ border: `1.5px solid ${open || count ? "#4F46E5" : "#E2E8F0"}`, color: count ? "#4F46E5" : "#475569", background: count ? "#EEF2FF" : "white" }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 3.5h12M4 8h8M6 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        Filtros
        {count > 0 && <span className="ml-0.5 px-1.5 rounded-full text-white" style={{ fontSize: "9px", fontWeight: 700, background: "#4F46E5" }}>{count}</span>}
      </button>
    )}>
      {() => (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>Filtros</span>
            {count > 0 && (
              <button onClick={() => setFilters(DEFAULT_FILTERS)} className="text-xs font-medium transition-colors hover:underline" style={{ color: "#4F46E5" }}>Limpiar</button>
            )}
          </div>
          <FilterField label="Categoría" value={filters.category} onChange={v => set("category", v)}
            options={[{ value: "all", label: "Todas" }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} />
          <FilterField label="Stock" value={filters.stock} onChange={v => set("stock", v)}
            options={[{ value: "all", label: "Todos" }, { value: "in", label: "Con stock" }, { value: "out", label: "Sin stock" }]} />
          <FilterField label="Estado en MercadoLibre" value={filters.ml} onChange={v => set("ml", v)} options={STATUS_FILTER} />
          <FilterField label="Estado en Tienda Nube" value={filters.tn} onChange={v => set("tn", v)} options={STATUS_FILTER} />
        </div>
      )}
    </Popover>
  );
}

// ─── Column manager (show / hide / reorder) ──────────────────────────────────────

function ColumnManager({ cols, setCols }: { cols: ColKey[]; setCols: (c: ColKey[]) => void }) {
  const [dragKey, setDragKey] = useState<ColKey | null>(null);
  const hidden = COLUMNS.filter(c => !cols.includes(c.key));

  const reorder = (target: ColKey) => {
    if (!dragKey || dragKey === target) return;
    const next = [...cols];
    next.splice(next.indexOf(dragKey), 1);
    next.splice(next.indexOf(target), 0, dragKey);
    setCols(next);
  };

  return (
    <Popover width={272} trigger={open => (
      <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
        style={{ border: `1.5px solid ${open ? "#4F46E5" : "#E2E8F0"}`, color: "#475569", background: "white" }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 2.5v11M11 2.5v11" stroke="currentColor" strokeWidth="1.4" /></svg>
        Columnas
      </button>
    )}>
      {() => (
        <div className="flex flex-col p-3 gap-3 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>Columnas visibles</span>
            <button onClick={() => setCols(DEFAULT_COLS)} className="text-xs font-medium transition-colors hover:underline" style={{ color: "#4F46E5" }}>Restablecer</button>
          </div>

          <div className="flex flex-col gap-0.5">
            {cols.map(k => {
              const c = COL_MAP[k];
              return (
                <div key={k}
                  draggable={!c.locked}
                  onDragStart={() => setDragKey(k)}
                  onDragEnd={() => setDragKey(null)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => reorder(k)}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                  style={{ background: dragKey === k ? "#EEF2FF" : "transparent", cursor: c.locked ? "default" : "grab" }}
                  onMouseEnter={e => { if (dragKey === null) e.currentTarget.style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { if (dragKey !== k) e.currentTarget.style.background = "transparent"; }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: c.locked ? "#E2E8F0" : "#CBD5E1", flexShrink: 0 }}>
                    <circle cx="4" cy="3" r="1" fill="currentColor" /><circle cx="8" cy="3" r="1" fill="currentColor" />
                    <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="8" cy="6" r="1" fill="currentColor" />
                    <circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="9" r="1" fill="currentColor" />
                  </svg>
                  <span className="flex-1 text-xs" style={{ color: "#0A1628" }}>{c.label}</span>
                  {c.locked ? (
                    <span style={{ fontSize: "9px", color: "#CBD5E1" }}>Fijo</span>
                  ) : (
                    <button onClick={() => setCols(cols.filter(x => x !== k))}
                      className="flex-shrink-0 p-1 rounded-md transition-colors hover:bg-slate-100" style={{ color: "#94A3B8" }} title="Ocultar">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" /><path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {hidden.length > 0 && (
            <>
              <div className="h-px" style={{ background: "#F1F5F9" }} />
              <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>Ocultas</span>
              <div className="flex flex-col gap-0.5">
                {hidden.map(c => (
                  <button key={c.key} onClick={() => setCols([...cols, c.key])}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-50 text-left">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: "#4F46E5", flexShrink: 0 }}><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <span className="flex-1 text-xs" style={{ color: "#475569" }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────

function ProductTable({ search, filters, cols, setCols, onSelect }: { search: string; filters: Filters; cols: ColKey[]; setCols: (c: ColKey[]) => void; onSelect: (p: Product) => void }) {
  const filtered = filterProducts(search, filters);
  const defs = cols.map(k => COL_MAP[k]).filter(Boolean);
  const [dragKey, setDragKey] = useState<ColKey | null>(null);
  const [overKey, setOverKey] = useState<ColKey | null>(null);
  const [editRow, setEditRow] = useState<number | null>(null);
  const [saveTick, setSaveTick] = useState(0);
  const [cancelTick, setCancelTick] = useState(0);
  const saveRow = () => { setSaveTick(t => t + 1); setTimeout(() => setEditRow(null), 900); };
  const cancelRow = () => { setCancelTick(t => t + 1); setEditRow(null); };
  // Solo una fila en edición: cambiar de fila guarda la anterior automáticamente.
  const startRow = (id: number) => {
    if (editRow != null && editRow !== id) { setSaveTick(t => t + 1); setTimeout(() => setEditRow(id), 0); }
    else setEditRow(id);
  };

  const reorder = (target: ColKey) => {
    if (!dragKey || dragKey === target) return;
    const next = [...cols];
    next.splice(next.indexOf(dragKey), 1);
    next.splice(next.indexOf(target), 0, dragKey);
    setCols(next);
  };

  return (
    <RowEditContext.Provider value={{ active: editRow, saveTick, cancelTick }}>
    <div className="flex-1 overflow-auto rounded-2xl bg-white" style={{ border: "1px solid #E2E8F0" }}>
      <table className="w-full text-xs border-collapse" style={{ minWidth: "680px" }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
          <tr className="bg-white" style={{ borderBottom: "1px solid #F1F5F9" }}>
            <th className="w-10 pl-4 pr-1 py-3"><input type="checkbox" /></th>
            {defs.map(c => (
              <th key={c.key} className="px-2 py-3 font-semibold tracking-wider select-none"
                draggable={!c.locked}
                onDragStart={() => setDragKey(c.key)}
                onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                onDragOver={e => { if (dragKey && !c.locked) { e.preventDefault(); setOverKey(c.key); } }}
                onDragLeave={() => setOverKey(k => (k === c.key ? null : k))}
                onDrop={() => { reorder(c.key); setOverKey(null); }}
                style={{
                  color: "#94A3B8", fontSize: "10px", letterSpacing: "0.07em",
                  textAlign: "left",
                  cursor: c.locked ? "default" : "grab",
                  opacity: dragKey === c.key ? 0.4 : 1,
                  boxShadow: overKey === c.key && dragKey !== c.key ? "inset 2px 0 0 #4F46E5" : "none",
                  background: overKey === c.key && dragKey !== c.key ? "#EEF2FF" : "transparent",
                  transition: "background 0.12s",
                  whiteSpace: "nowrap",
                }}>
                <span className="inline-flex items-center gap-1" style={{ justifyContent: "flex-start" }}>
                  {!c.locked && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ color: "#CBD5E1", flexShrink: 0 }}>
                      <circle cx="4" cy="3" r="1" fill="currentColor" /><circle cx="8" cy="3" r="1" fill="currentColor" />
                      <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="8" cy="6" r="1" fill="currentColor" />
                      <circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="9" r="1" fill="currentColor" />
                    </svg>
                  )}
                  {c.label}
                  {c.editable && <span className="flex-shrink-0" style={{ color: "#4F46E5" }} title="Columna editable"><PencilIcon size={10} /></span>}
                </span>
              </th>
            ))}
            {/* Columna comodín: absorbe el ancho sobrante para que las reales queden justas */}
            <th style={{ width: "100%" }} />
          </tr>
        </thead>
        <tbody>
          {filtered.map(p => (
            <tr key={p.id} className="group cursor-pointer transition-colors hover:bg-slate-50" style={{ borderBottom: "1px solid #F8FAFC" }} onClick={() => { if (editRow === p.id) return; onSelect(p); }}>
              <td className="pl-4 pr-1 py-3" onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
              {defs.map(c => (
                <td key={c.key} className="px-2 py-3" style={{ textAlign: "left", whiteSpace: "nowrap" }}>{c.render(p)}</td>
              ))}
              <td className="pl-2 pr-4 py-3" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <RowEditAction editing={editRow === p.id} onStart={() => startRow(p.id)} onSave={saveRow} onCancel={cancelRow} />
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={defs.length + 2} className="px-4 py-16 text-center" style={{ color: "#94A3B8" }}>
                No hay productos que coincidan con la búsqueda o los filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
    </RowEditContext.Provider>
  );
}

// ─── Channel listing tables (mercadolibre / tiendanube product_listings) ──────────

const hasListing = (s: ChannelStatus) => s === "published" || s === "paused" || s === "prepublished";
const meliId = (p: Product) => `MLA${1000000000 + p.id * 137}`;
const tnubeId = (p: Product) => 100000 + p.id * 7;
const mlPermalink = (p: Product) => `https://articulo.mercadolibre.com.ar/${meliId(p)}`;
const tnPermalink = (p: Product) => `https://mitienda.com/productos/${p.internal_code}`;
const listingScore = (p: Product) => 45 + (p.id * 17) % 50;
const scoreLevel = (s: number) => (s >= 80 ? "Óptimo" : s >= 50 ? "Estándar" : "Básico");

const matchesSearch = (p: Product, search: string) => (p.name_edited || p.name).toLowerCase().includes(search.toLowerCase());

type ManagedCol = { key: string; label: string; locked?: boolean };
type ListingCol = { key: string; label: string; locked?: boolean; editable?: boolean; render: (p: Product) => ReactNode };

const ProductCell = (p: Product) => (
  <div className="flex flex-col items-start">
    <EditableCell rowId={p.id} value={p.name_edited || p.name} onSave={v => { p.name_edited = v; }} format={v => <span className="font-medium" style={{ color: "#0A1628" }}>{v}</span>} />
    <span className="font-mono px-1" style={{ fontSize: "10px", color: "#94A3B8" }}>{p.sku}</span>
  </div>
);

const CategoryCell = (p: Product) => <CategoryChip category={p.category} />;
const StockCell = (p: Product) => <span className="tabular-nums" style={{ color: p.stock > 0 ? "#0A1628" : "#DC2626" }}>{p.stock}</span>;

const LinkIcon = () => (
  <svg width="9" height="9" viewBox="0 0 12 12" fill="none"><path d="M4 2h6v6M10 2L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const PubCell = (id: string, href: string) => (
  <a href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
    className="inline-flex items-center gap-1 font-mono transition-colors hover:underline" style={{ color: "#4F46E5", fontSize: "11px" }}>
    {id}<LinkIcon />
  </a>
);

const PerfCell = (p: Product) => {
  if (p.ml_status !== "published" && p.ml_status !== "paused") return <span style={{ color: "#CBD5E1" }}>—</span>;
  const s = listingScore(p);
  const col = s >= 80 ? "#16A34A" : s >= 50 ? "#D97706" : "#DC2626";
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums font-semibold" style={{ color: col }}>{s}</span>
      <span style={{ fontSize: "10px", color: "#94A3B8" }}>{scoreLevel(s)}</span>
    </span>
  );
};

const ML_LISTING_COLS: ListingCol[] = [
  { key: "prod", label: "Producto", locked: true, editable: true, render: ProductCell },
  { key: "pub", label: "Publicación", render: p => PubCell(meliId(p), mlPermalink(p)) },
  { key: "price", label: "Precio", editable: true, render: p => <EditableCell rowId={p.id} value={String(p.ml_price ?? p.price)} type="number" prefix="$" onSave={v => { p.ml_price = Number(v.replace(",", ".")); }} format={v => <span className="tabular-nums font-semibold" style={{ color: "#0A1628" }}>{fmt(Number(v))}</span>} /> },
  { key: "status", label: "Estado", render: p => <StatusBadge status={p.ml_status} /> },
  { key: "catalog", label: "Tipo", render: p => <CatalogTag state={mlCatalog(p).state} size="xs" /> },
  { key: "perf", label: "Performance", render: PerfCell },
  { key: "cost", label: "Costo de venta", render: p => <span className="tabular-nums" style={{ color: "#475569" }}>{fmt(mlSellingCost(p.ml_price ?? p.price).withTax)}</span> },
  { key: "category", label: "Categoría", render: CategoryCell },
  { key: "stock", label: "Stock", render: StockCell },
  { key: "upd", label: "Actualizado", render: p => <span style={{ color: "#94A3B8" }}>{p.updated_at}</span> },
];

const TN_LISTING_COLS: ListingCol[] = [
  { key: "prod", label: "Producto", locked: true, editable: true, render: ProductCell },
  { key: "pub", label: "Publicación", render: p => PubCell(`#${tnubeId(p)}`, tnPermalink(p)) },
  { key: "price", label: "Precio", editable: true, render: p => <EditableCell rowId={p.id} value={String(p.tn_price ?? p.price)} type="number" prefix="$" onSave={v => { p.tn_price = Number(v.replace(",", ".")); }} format={v => <span className="tabular-nums font-semibold" style={{ color: "#0A1628" }}>{fmt(Number(v))}</span>} /> },
  { key: "status", label: "Estado", render: p => <StatusBadge status={p.tn_status} /> },
  { key: "cat", label: "Categoría", render: CategoryCell },
  { key: "stock", label: "Stock", render: StockCell },
  { key: "upd", label: "Actualizado", render: p => <span style={{ color: "#94A3B8" }}>{p.updated_at}</span> },
];

const ML_COL_MAP = Object.fromEntries(ML_LISTING_COLS.map(c => [c.key, c])) as Record<string, ListingCol>;
const TN_COL_MAP = Object.fromEntries(TN_LISTING_COLS.map(c => [c.key, c])) as Record<string, ListingCol>;
const ML_DEFAULT_COLS = ["prod", "pub", "price", "status", "catalog", "perf", "upd"];
const TN_DEFAULT_COLS = ["prod", "pub", "price", "status", "cat", "upd"];

const makeColLoader = (key: string, map: Record<string, ListingCol>, def: string[]) => ({
  load: (): string[] => {
    try {
      const arr = JSON.parse(localStorage.getItem(key) || "null") as string[] | null;
      if (Array.isArray(arr)) { const v = arr.filter(k => map[k]); if (v.includes("prod") && v.length) return v; }
    } catch { /* ignore */ }
    return def;
  },
  save: (c: string[]) => { try { localStorage.setItem(key, JSON.stringify(c)); } catch { /* ignore */ } },
});
const mlColStore = makeColLoader("omnipanel.ml.cols", ML_COL_MAP, ML_DEFAULT_COLS);
const tnColStore = makeColLoader("omnipanel.tn.cols", TN_COL_MAP, TN_DEFAULT_COLS);

// ─── Per-domain filters ───────────────────────────────────────────────────────
const LISTING_STATUS_FILTER = [
  { value: "all", label: "Todos" },
  { value: "published", label: "Publicado" },
  { value: "paused", label: "Pausado" },
  { value: "prepublished", label: "Pre-publicado" },
];
const PERF_FILTER = [
  { value: "all", label: "Todas" },
  { value: "high", label: "Óptimo (80+)" },
  { value: "mid", label: "Estándar (50–79)" },
  { value: "low", label: "Básico (<50)" },
];

const CATALOG_FILTER = [
  { value: "all", label: "Todas" },
  { value: "catalog", label: "Catálogo" },
  { value: "traditional", label: "Tradicional" },
];

type MlFilters = { status: string; perf: string; category: string; catalog: string };
type TnFilters = { status: string; category: string };
const DEFAULT_ML_FILTERS: MlFilters = { status: "all", perf: "all", category: "all", catalog: "all" };
const DEFAULT_TN_FILTERS: TnFilters = { status: "all", category: "all" };

const perfMatches = (p: Product, perf: string) => {
  if (perf === "all") return true;
  if (p.ml_status !== "published" && p.ml_status !== "paused") return false;
  const s = listingScore(p);
  return perf === "high" ? s >= 80 : perf === "mid" ? s >= 50 && s < 80 : s < 50;
};

const mlListingRows = (search: string, f: MlFilters) => products.filter(p =>
  hasListing(p.ml_status) && matchesSearch(p, search)
  && (f.status === "all" || p.ml_status === f.status)
  && (f.category === "all" || p.category === f.category)
  && (f.catalog === "all" || mlCatalog(p).state === f.catalog)
  && perfMatches(p, f.perf));

const tnListingRows = (search: string, f: TnFilters) => products.filter(p =>
  hasListing(p.tn_status) && matchesSearch(p, search)
  && (f.status === "all" || p.tn_status === f.status)
  && (f.category === "all" || p.category === f.category));

function ListingTable({ rows, cols, setCols, colMap, onSelect, empty }: { rows: Product[]; cols: string[]; setCols: (c: string[]) => void; colMap: Record<string, ListingCol>; onSelect: (p: Product) => void; empty: string }) {
  const columns = cols.map(k => colMap[k]).filter(Boolean);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<number | null>(null);
  const [saveTick, setSaveTick] = useState(0);
  const [cancelTick, setCancelTick] = useState(0);
  const saveRow = () => { setSaveTick(t => t + 1); setTimeout(() => setEditRow(null), 900); };
  const cancelRow = () => { setCancelTick(t => t + 1); setEditRow(null); };
  // Solo una fila en edición: cambiar de fila guarda la anterior automáticamente.
  const startRow = (id: number) => {
    if (editRow != null && editRow !== id) { setSaveTick(t => t + 1); setTimeout(() => setEditRow(id), 0); }
    else setEditRow(id);
  };

  const reorder = (target: string) => {
    if (!dragKey || dragKey === target) return;
    const next = [...cols];
    next.splice(next.indexOf(dragKey), 1);
    next.splice(next.indexOf(target), 0, dragKey);
    setCols(next);
  };

  return (
    <RowEditContext.Provider value={{ active: editRow, saveTick, cancelTick }}>
    <div className="flex-1 overflow-auto rounded-2xl bg-white" style={{ border: "1px solid #E2E8F0" }}>
      <table className="w-full text-xs border-collapse" style={{ minWidth: "680px" }}>
        <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
          <tr className="bg-white" style={{ borderBottom: "1px solid #F1F5F9" }}>
            {columns.map(c => (
              <th key={c.key} className="px-2 py-3 font-semibold tracking-wider first:pl-4 select-none"
                draggable={!c.locked}
                onDragStart={() => setDragKey(c.key)}
                onDragEnd={() => { setDragKey(null); setOverKey(null); }}
                onDragOver={e => { if (dragKey && !c.locked) { e.preventDefault(); setOverKey(c.key); } }}
                onDragLeave={() => setOverKey(k => (k === c.key ? null : k))}
                onDrop={() => { reorder(c.key); setOverKey(null); }}
                style={{
                  color: "#94A3B8", fontSize: "10px", letterSpacing: "0.07em",
                  textAlign: "left", whiteSpace: "nowrap",
                  cursor: c.locked ? "default" : "grab",
                  opacity: dragKey === c.key ? 0.4 : 1,
                  boxShadow: overKey === c.key && dragKey !== c.key ? "inset 2px 0 0 #4F46E5" : "none",
                  background: overKey === c.key && dragKey !== c.key ? "#EEF2FF" : "transparent",
                  transition: "background 0.12s",
                }}>
                <span className="inline-flex items-center gap-1" style={{ justifyContent: "flex-start" }}>
                  {!c.locked && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" style={{ color: "#CBD5E1", flexShrink: 0 }}>
                      <circle cx="4" cy="3" r="1" fill="currentColor" /><circle cx="8" cy="3" r="1" fill="currentColor" />
                      <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="8" cy="6" r="1" fill="currentColor" />
                      <circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="9" r="1" fill="currentColor" />
                    </svg>
                  )}
                  {c.label}
                  {c.editable && <span className="flex-shrink-0" style={{ color: "#4F46E5" }} title="Columna editable"><PencilIcon size={10} /></span>}
                </span>
              </th>
            ))}
            {/* Columna comodín: absorbe el ancho sobrante */}
            <th style={{ width: "100%" }} />
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.id} className="group cursor-pointer transition-colors hover:bg-slate-50" style={{ borderBottom: "1px solid #F8FAFC" }} onClick={() => { if (editRow === p.id) return; onSelect(p); }}>
              {columns.map(c => (
                <td key={c.key} className="px-2 py-3 first:pl-4" style={{ textAlign: "left", whiteSpace: "nowrap" }}>{c.render(p)}</td>
              ))}
              <td className="pl-2 pr-4 py-3" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <RowEditAction editing={editRow === p.id} onStart={() => startRow(p.id)} onSave={saveRow} onCancel={cancelRow} />
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={columns.length + 1} className="px-4 py-16 text-center" style={{ color: "#94A3B8" }}>{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
    </RowEditContext.Provider>
  );
}

// ─── Per-domain column manager (show / hide / reorder) ────────────────────────────

// ─── Exportar CSV ──────────────────────────────────────────────────────────────
// Backend: GET /api/inventory/products/export.csv?columns=a,b&limit=1000 (0 = todas) y equivalentes ML/TN.
type ExportScope = "inventario" | "ml" | "tn";
const EXPORT_META: Record<ExportScope, { file: string; label: string }> = {
  inventario: { file: "inventario", label: "Inventario" },
  ml: { file: "publicaciones-ml", label: "Publicaciones · MercadoLibre" },
  tn: { file: "publicaciones-tn", label: "Publicaciones · Tienda Nube" },
};

function csvValue(p: Product, key: string, scope: ExportScope): string | number {
  const name = p.name_edited || p.name;
  if (scope === "inventario") {
    switch (key) {
      case "producto": return name;
      case "ml_status": return STATUS[p.ml_status].label;
      case "tn_status": return STATUS[p.tn_status].label;
      case "ml_price": return p.ml_price ?? "";
      case "tn_price": return p.tn_price ?? "";
      default: return String((p as Record<string, unknown>)[key] ?? "");
    }
  }
  const isML = scope === "ml";
  switch (key) {
    case "prod": return name;
    case "pub": return isML ? meliId(p) : `#${tnubeId(p)}`;
    case "price": return isML ? p.ml_price ?? p.price : p.tn_price ?? p.price;
    case "status": return STATUS[isML ? p.ml_status : p.tn_status].label;
    case "catalog": return mlCatalog(p).state === "catalog" ? "Catálogo" : "Tradicional";
    case "perf": return p.ml_status === "published" || p.ml_status === "paused" ? listingScore(p) : "";
    case "cost": return Math.round(mlSellingCost(p.ml_price ?? p.price).withTax);
    case "category": case "cat": return p.category;
    case "stock": return p.stock;
    case "upd": return p.updated_at;
    default: return "";
  }
}

const csvCell = (v: string | number) => { const t = String(v); return /[",\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

const exportApi = {
  async csv(scope: ExportScope, rows: Product[], columns: { key: string; label: string }[], limit: number): Promise<Blob> {
    await new Promise(res => setTimeout(res, 1100));
    if (columns.length === 0) throw new Error("Elegí al menos una columna para exportar.");
    const data = limit > 0 ? rows.slice(0, limit) : rows;
    const lines = [columns.map(c => csvCell(c.label)).join(","), ...data.map(p => columns.map(c => csvCell(csvValue(p, c.key, scope))).join(","))];
    return new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  },
};

const EXPORT_LIMIT = 1000;
const fmtCount = (n: number) => n.toLocaleString("es-AR");

function ExportCsvButton({ scope, columns, rows }: { scope: ExportScope; columns: { key: string; label: string }[]; rows: Product[] }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; title: string; message: string } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  const openModal = () => { setSelected(columns.map(c => c.key)); setAll(false); setOpen(true); };
  const close = () => { if (!busy) setOpen(false); };
  const toggleCol = (k: string) => setSelected(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]);
  const exportCount = all ? rows.length : Math.min(EXPORT_LIMIT, rows.length);

  const run = async () => {
    if (busy || selected.length === 0) return;
    setBusy(true);
    try {
      const cols = columns.filter(c => selected.includes(c.key));
      const blob = await exportApi.csv(scope, rows, cols, all ? 0 : EXPORT_LIMIT);
      const d = new Date();
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
      const filename = `${EXPORT_META[scope].file}-${stamp}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setOpen(false);
      setToast({ tone: "ok", title: "CSV descargado", message: `${filename} · ${fmtCount(exportCount)} ${exportCount === 1 ? "fila" : "filas"}` });
    } catch (e) {
      setToast({ tone: "err", title: "No se pudo generar el CSV", message: e instanceof Error ? e.message : "Intentá de nuevo en unos minutos." });
    } finally { setBusy(false); }
  };

  const allChecked = selected.length === columns.length;

  return (
    <>
      <button onClick={openModal} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors hover:bg-slate-50"
        style={{ border: "1.5px solid #E2E8F0", color: "#475569", background: "white" }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M8 2.5v8M4.8 7.5 8 10.7l3.2-3.2M3 13.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        Descargar CSV
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} onClick={close}
          onKeyDown={e => { if (e.key === "Escape") close(); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="csv-title" className="w-full max-w-lg rounded-2xl bg-white flex flex-col max-h-[88vh]" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "fadeUp 0.18s ease both" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3 px-6 pt-6 pb-4">
              <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: "#EEF2FF", color: "#4F46E5" }}>
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M5 2.5h7l4 4v11H5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 2.5v4h4M7.5 11h6M7.5 14h6M10.5 9v7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 id="csv-title" className="text-lg font-bold" style={{ color: "#0A1628" }}>Descargar CSV</h3>
                <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>{EXPORT_META[scope].label} · respeta la búsqueda y los filtros activos</p>
              </div>
              <button onClick={close} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" style={{ color: "#94A3B8" }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>

            <div className="flex flex-col gap-5 px-6 pb-5 overflow-y-auto">
              {/* Columnas */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>Columnas</span>
                  <button onClick={() => setSelected(allChecked ? [] : columns.map(c => c.key))} className="text-xs font-medium hover:underline" style={{ color: "#4F46E5" }}>
                    {allChecked ? "Desmarcar todas" : "Marcar todas"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {columns.map(c => {
                    const on = selected.includes(c.key);
                    return (
                      <label key={c.key} className="flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors"
                        style={{ border: `1px solid ${on ? "#C7D2FE" : "#F1F5F9"}`, background: on ? "#F5F7FF" : "white" }}>
                        <input type="checkbox" checked={on} onChange={() => toggleCol(c.key)} className="sr-only" />
                        <span className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 transition-colors"
                          style={{ background: on ? "#4F46E5" : "white", border: `1.5px solid ${on ? "#4F46E5" : "#CBD5E1"}` }}>
                          {on && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M2 5.2 4 7.2 8 3" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </span>
                        <span className="text-xs truncate" style={{ color: on ? "#0A1628" : "#64748B", fontWeight: on ? 500 : 400 }}>{c.label}</span>
                      </label>
                    );
                  })}
                </div>
                <span className="text-xs" style={{ color: selected.length === 0 ? "#DC2626" : "#64748B" }}>
                  {selected.length === 0 ? "Elegí al menos una columna" : `${selected.length} ${selected.length === 1 ? "columna seleccionada" : "columnas seleccionadas"}`}
                </span>
              </div>

              {/* Alcance */}
              <div className="flex flex-col gap-2.5">
                <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>Alcance</span>
                <div className="flex flex-col gap-1.5" role="radiogroup">
                  {[{ v: false, label: `Primeras ${fmtCount(EXPORT_LIMIT)} filas`, sub: "Recomendado · más rápido" }, { v: true, label: "Todas las filas", sub: "Puede tardar más en archivos grandes" }].map(o => {
                    const on = all === o.v;
                    return (
                      <label key={String(o.v)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
                        style={{ border: `1px solid ${on ? "#C7D2FE" : "#F1F5F9"}`, background: on ? "#F5F7FF" : "white" }}>
                        <input type="radio" name="csv-scope" checked={on} onChange={() => setAll(o.v)} className="sr-only" />
                        <span className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0" style={{ border: `1.5px solid ${on ? "#4F46E5" : "#CBD5E1"}` }}>
                          {on && <span className="w-2 h-2 rounded-full" style={{ background: "#4F46E5" }} />}
                        </span>
                        <span className="flex flex-col">
                          <span className="text-xs font-medium" style={{ color: "#0A1628" }}>{o.label}</span>
                          <span style={{ fontSize: "11px", color: "#94A3B8" }}>{o.sub}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-baseline gap-1.5 px-3 py-2.5 rounded-lg" style={{ background: "#F8FAFC" }}>
                  <span className="text-sm font-bold tabular-nums" style={{ color: "#0A1628" }}>{fmtCount(exportCount)}</span>
                  <span className="text-xs" style={{ color: "#64748B" }}>{exportCount === 1 ? "fila se va a exportar" : "filas se van a exportar"}</span>
                  {!all && rows.length > EXPORT_LIMIT && <span className="text-xs ml-auto" style={{ color: "#94A3B8" }}>de {fmtCount(rows.length)}</span>}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4" style={{ borderTop: "1px solid #F1F5F9" }}>
              <button onClick={close} disabled={busy} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Cancelar</button>
              <button onClick={run} disabled={busy || selected.length === 0}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: busy ? "#818CF8" : selected.length === 0 ? "#C7D2FE" : "#4F46E5", cursor: busy ? "wait" : selected.length === 0 ? "default" : "pointer" }}>
                {busy && <svg width="13" height="13" viewBox="0 0 12 12" fill="none" className="animate-spin"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" /><path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>}
                {busy ? "Generando…" : "Descargar CSV"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-6 right-6 flex items-start gap-2.5 rounded-xl px-4 py-3 max-w-sm"
          style={{ zIndex: 80, background: "white", border: `1px solid ${toast.tone === "ok" ? "#BBF7D0" : "#FECACA"}`, boxShadow: "0 12px 32px rgba(10,22,40,0.12)" }}>
          <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-px" style={{ background: toast.tone === "ok" ? "#DCFCE7" : "#FEE2E2", color: toast.tone === "ok" ? "#16A34A" : "#DC2626" }}>
            {toast.tone === "ok"
              ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.2 4 7.2 8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2.5v3M5 7.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold" style={{ color: "#0A1628" }}>{toast.title}</div>
            <div style={{ fontSize: "12px", color: "#64748B", lineHeight: 1.4, marginTop: 2 }}>{toast.message}</div>
          </div>
          <button onClick={() => setToast(null)} aria-label="Cerrar" className="text-sm leading-none" style={{ color: "#94A3B8" }}>×</button>
        </div>
      )}
    </>
  );
}

function ListingColumnManager({ allCols, cols, setCols, defaultCols }: { allCols: ManagedCol[]; cols: string[]; setCols: (c: string[]) => void; defaultCols: string[] }) {
  const [dragKey, setDragKey] = useState<string | null>(null);
  const map = Object.fromEntries(allCols.map(c => [c.key, c])) as Record<string, ManagedCol>;
  const hidden = allCols.filter(c => !cols.includes(c.key));

  const reorder = (target: string) => {
    if (!dragKey || dragKey === target) return;
    const next = [...cols];
    next.splice(next.indexOf(dragKey), 1);
    next.splice(next.indexOf(target), 0, dragKey);
    setCols(next);
  };

  return (
    <Popover width={272} trigger={open => (
      <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
        style={{ border: `1.5px solid ${open ? "#4F46E5" : "#E2E8F0"}`, color: "#475569", background: "white" }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="2" y="2.5" width="12" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M7 2.5v11M11 2.5v11" stroke="currentColor" strokeWidth="1.4" /></svg>
        Columnas
      </button>
    )}>
      {() => (
        <div className="flex flex-col p-3 gap-3 max-h-[70vh] overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>Columnas visibles</span>
            <button onClick={() => setCols(defaultCols)} className="text-xs font-medium transition-colors hover:underline" style={{ color: "#4F46E5" }}>Restablecer</button>
          </div>
          <div className="flex flex-col gap-0.5">
            {cols.map(k => {
              const c = map[k];
              if (!c) return null;
              return (
                <div key={k} draggable={!c.locked} onDragStart={() => setDragKey(k)} onDragEnd={() => setDragKey(null)}
                  onDragOver={e => e.preventDefault()} onDrop={() => reorder(k)}
                  className="group flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors"
                  style={{ background: dragKey === k ? "#EEF2FF" : "transparent", cursor: c.locked ? "default" : "grab" }}
                  onMouseEnter={e => { if (dragKey === null) e.currentTarget.style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { if (dragKey !== k) e.currentTarget.style.background = "transparent"; }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ color: c.locked ? "#E2E8F0" : "#CBD5E1", flexShrink: 0 }}>
                    <circle cx="4" cy="3" r="1" fill="currentColor" /><circle cx="8" cy="3" r="1" fill="currentColor" />
                    <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="8" cy="6" r="1" fill="currentColor" />
                    <circle cx="4" cy="9" r="1" fill="currentColor" /><circle cx="8" cy="9" r="1" fill="currentColor" />
                  </svg>
                  <span className="flex-1 text-xs" style={{ color: "#0A1628" }}>{c.label}</span>
                  {c.locked ? <span style={{ fontSize: "9px", color: "#CBD5E1" }}>Fijo</span> : (
                    <button onClick={() => setCols(cols.filter(x => x !== k))} className="flex-shrink-0 p-1 rounded-md transition-colors hover:bg-slate-100" style={{ color: "#94A3B8" }} title="Ocultar">
                      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" /><path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {hidden.length > 0 && (
            <>
              <div className="h-px" style={{ background: "#F1F5F9" }} />
              <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>Ocultas</span>
              <div className="flex flex-col gap-0.5">
                {hidden.map(c => (
                  <button key={c.key} onClick={() => setCols([...cols, c.key])} className="flex items-center gap-2 px-2 py-1.5 rounded-lg transition-colors hover:bg-slate-50 text-left">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ color: "#4F46E5", flexShrink: 0 }}><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    <span className="flex-1 text-xs" style={{ color: "#475569" }}>{c.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </Popover>
  );
}

// ─── Per-domain filter panels ─────────────────────────────────────────────────

function DomainFilterButton({ count }: { count: number }) {
  return (open: boolean) => (
    <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
      style={{ border: `1.5px solid ${open || count ? "#4F46E5" : "#E2E8F0"}`, color: count ? "#4F46E5" : "#475569", background: count ? "#EEF2FF" : "white" }}>
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 3.5h12M4 8h8M6 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      Filtros
      {count > 0 && <span className="ml-0.5 px-1.5 rounded-full text-white" style={{ fontSize: "9px", fontWeight: 700, background: "#4F46E5" }}>{count}</span>}
    </button>
  );
}

function MlFilterPanel({ filters, setFilters }: { filters: MlFilters; setFilters: (f: MlFilters) => void }) {
  const set = <K extends keyof MlFilters>(k: K, v: string) => setFilters({ ...filters, [k]: v });
  const count = Object.values(filters).filter(v => v !== "all").length;
  return (
    <Popover width={280} trigger={DomainFilterButton({ count })}>
      {() => (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>Filtros · MercadoLibre</span>
            {count > 0 && <button onClick={() => setFilters(DEFAULT_ML_FILTERS)} className="text-xs font-medium transition-colors hover:underline" style={{ color: "#4F46E5" }}>Limpiar</button>}
          </div>
          <FilterField label="Estado" value={filters.status} onChange={v => set("status", v)} options={LISTING_STATUS_FILTER} />
          <FilterField label="Modalidad" value={filters.catalog} onChange={v => set("catalog", v)} options={CATALOG_FILTER} />
          <FilterField label="Performance" value={filters.perf} onChange={v => set("perf", v)} options={PERF_FILTER} />
          <FilterField label="Categoría" value={filters.category} onChange={v => set("category", v)} options={[{ value: "all", label: "Todas" }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} />
        </div>
      )}
    </Popover>
  );
}

function TnFilterPanel({ filters, setFilters }: { filters: TnFilters; setFilters: (f: TnFilters) => void }) {
  const set = <K extends keyof TnFilters>(k: K, v: string) => setFilters({ ...filters, [k]: v });
  const count = Object.values(filters).filter(v => v !== "all").length;
  return (
    <Popover width={280} trigger={DomainFilterButton({ count })}>
      {() => (
        <div className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>Filtros · Tienda Nube</span>
            {count > 0 && <button onClick={() => setFilters(DEFAULT_TN_FILTERS)} className="text-xs font-medium transition-colors hover:underline" style={{ color: "#4F46E5" }}>Limpiar</button>}
          </div>
          <FilterField label="Estado" value={filters.status} onChange={v => set("status", v)} options={LISTING_STATUS_FILTER} />
          <FilterField label="Categoría" value={filters.category} onChange={v => set("category", v)} options={[{ value: "all", label: "Todas" }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} />
        </div>
      )}
    </Popover>
  );
}

// ─── Summary stat cards ───────────────────────────────────────────────────────

type SummaryVariant = "strip" | "accent";
type Stat = { label: string; value: ReactNode; sub?: string; tone: string; icon: ReactNode };

const ICON_LIST = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5 8h6M5 5.5h6M5 10.5h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
const ICON_CHECK = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 8l1.7 1.7L10.5 6.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const ICON_PAUSE = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M6.5 6v4M9.5 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
const ICON_PERF = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 13h12M4.5 11V7M8 11V4M11.5 11V8.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;

function domainStats(domain: "ml" | "tn"): Stat[] {
  const statusOf = (p: Product) => (domain === "ml" ? p.ml_status : p.tn_status);
  const listed = products.filter(p => hasListing(statusOf(p)));
  const published = listed.filter(p => statusOf(p) === "published").length;
  const paused = listed.filter(p => statusOf(p) === "paused").length;
  const scored = listed.filter(p => statusOf(p) === "published" || statusOf(p) === "paused");
  const avgPerf = scored.length ? Math.round(scored.reduce((a, p) => a + listingScore(p), 0) / scored.length) : 0;
  const perfTone = avgPerf >= 80 ? "#16A34A" : avgPerf >= 50 ? "#D97706" : "#DC2626";
  const stats: Stat[] = [
    { label: "Publicaciones", value: listed.length, sub: "total", tone: domain === "ml" ? "#F59E0B" : "#4F46E5", icon: ICON_LIST },
    { label: "Publicadas", value: published, sub: "activas", tone: "#16A34A", icon: ICON_CHECK },
    { label: "Pausadas", value: paused, tone: "#D97706", icon: ICON_PAUSE },
  ];
  if (domain === "ml") stats.push({ label: "Performance prom.", value: avgPerf || "—", sub: avgPerf ? scoreLevel(avgPerf) : undefined, tone: perfTone, icon: ICON_PERF });
  return stats;
}

// Option A — single strip, stats divided by rules
function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="flex items-stretch rounded-2xl bg-white flex-shrink-0 overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
      {stats.map((s, i) => (
        <div key={s.label} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3" style={{ borderLeft: i === 0 ? "none" : "1px solid #F1F5F9" }}>
          <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ color: s.tone, background: `${s.tone}14` }}>{s.icon}</span>
          <div className="min-w-0">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-bold tabular-nums" style={{ color: "#0A1628" }}>{s.value}</span>
              {s.sub && <span style={{ fontSize: "10px", color: "#94A3B8" }}>{s.sub}</span>}
            </div>
            <span className="text-xs" style={{ color: "#64748B" }}>{s.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Option B — separate cards, colored accent bar on top
function StatAccentCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="flex gap-3 flex-shrink-0">
      {stats.map(s => (
        <div key={s.label} className="flex-1 min-w-0 rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <div style={{ height: 3, background: s.tone }} />
          <div className="px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94A3B8" }}>{s.label}</span>
              <span style={{ color: s.tone, display: "flex" }}>{s.icon}</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[26px] leading-none font-bold tabular-nums" style={{ color: s.tone }}>{s.value}</span>
              {s.sub && <span className="text-xs" style={{ color: "#94A3B8" }}>{s.sub}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DomainSummary({ domain, variant }: { domain: "ml" | "tn"; variant: SummaryVariant }) {
  const stats = domainStats(domain);
  return variant === "strip" ? <StatStrip stats={stats} /> : <StatAccentCards stats={stats} />;
}

// ─── Envíos (MercadoLibre + Tienda Nube) ────────────────────────────────────────────────────

type ShipStatus = "pending" | "handling" | "ready_to_ship" | "shipped" | "delivered" | "not_delivered" | "cancelled";
type Shipment = {
  id: number;
  channel: SalesChannelKey;
  shipping_method: string | null;   // TN: método de envío (ML usa logistic_type)
  tracking_url: string | null;
  external_id: string;
  order_id: string;
  status: ShipStatus;
  substatus: string | null;
  tracking_number: string | null;
  logistic_type: string;
  mode: string;
  receiver: { city: string; state: string; zip_code: string };
  items: { id: string; title: string; quantity: number }[];
  last_updated: string;
};

const SHIP_STATUS: Record<ShipStatus, { label: string; color: string; bg: string; icon: ReactNode }> = {
  pending:       { label: "Pendiente",     color: "#64748B", bg: "#F1F5F9", icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" /><path d="M6 3.6V6l1.7 1" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg> },
  handling:      { label: "En preparación", color: "#D97706", bg: "#FEF3C7", icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.5l4 2v5l-4 2-4-2v-5l4-2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M2 3.5l4 2 4-2M6 5.5V10" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /></svg> },
  ready_to_ship: { label: "Listo para enviar", color: "#4F46E5", bg: "#EEF2FF", icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 2.5h4l4 4-4 4-4-4v-4z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><circle cx="4" cy="4" r="0.7" fill="currentColor" /></svg> },
  shipped:       { label: "En camino",     color: "#0891B2", bg: "#CFFAFE", icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1 3h6v5H1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M7 4.5h2l1.5 1.5V8H7" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><circle cx="3.5" cy="9" r="0.9" stroke="currentColor" strokeWidth="1" /><circle cx="8.5" cy="9" r="0.9" stroke="currentColor" strokeWidth="1" /></svg> },
  delivered:     { label: "Entregado",     color: "#16A34A", bg: "#DCFCE7", icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" /><path d="M4 6l1.4 1.4L8.2 4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg> },
  not_delivered: { label: "No entregado",  color: "#DC2626", bg: "#FEE2E2", icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1.6l4.6 8H1.4l4.6-8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M6 5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="6" cy="8.4" r="0.5" fill="currentColor" /></svg> },
  cancelled:     { label: "Cancelado",     color: "#94A3B8", bg: "#F1F5F9", icon: <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.3" /><path d="M3.2 3.2l5.6 5.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg> },
};

const SUBSTATUS_LABEL: Record<string, string> = {
  ready_to_print: "Por imprimir", printed: "Etiqueta impresa", in_hub: "En centro de distribución",
  in_packing_list: "En lista de empaque", manufacturing: "En fabricación", picked_up: "Retirado",
  out_for_delivery: "En reparto", delivery_failed: "Entrega fallida", returning_to_sender: "En devolución",
};
const LOGISTIC_LABEL: Record<string, string> = {
  cross_docking: "Cross docking", drop_off: "Punto de despacho", fulfillment: "Full",
  self_service: "Flex", xd_drop_off: "Cross docking",
};
const subLabel = (s: string | null) => (s ? SUBSTATUS_LABEL[s] ?? s.replace(/_/g, " ") : null);
const logLabel = (s: string) => LOGISTIC_LABEL[s] ?? s.replace(/_/g, " ");

const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fmtShipDate(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${MES[d.getMonth()]} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const SHIPMENTS: Shipment[] = [
  // MercadoLibre — el identificador visible es el nº de envío
  { id: 43308302844, channel: "ml", external_id: "43308302844", order_id: "2000003508419013", status: "ready_to_ship", substatus: "ready_to_print", tracking_number: null, tracking_url: null, logistic_type: "cross_docking", mode: "me2", shipping_method: null, receiver: { city: "Palermo", state: "CABA", zip_code: "C1425" }, items: [{ id: "MLA123456789", title: "Set Tabla Gourmet", quantity: 1 }], last_updated: "2026-10-04T10:30:00" },
  { id: 28264263908, channel: "ml", external_id: "28264263908", order_id: "2000003508419014", status: "shipped", substatus: "out_for_delivery", tracking_number: "OP123456789AR", tracking_url: "https://www.correoargentino.com.ar/formularios/e-commerce?id=OP123456789AR", logistic_type: "drop_off", mode: "me1", shipping_method: null, receiver: { city: "Rosario", state: "Santa Fe", zip_code: "S2000" }, items: [{ id: "MLA987654321", title: "Quesera Plástico", quantity: 2 }], last_updated: "2026-10-04T08:00:00" },
  { id: 43120094551, channel: "ml", external_id: "43120094551", order_id: "2000003508420115", status: "delivered", substatus: null, tracking_number: "ML998877665AR", tracking_url: null, logistic_type: "fulfillment", mode: "me2", shipping_method: null, receiver: { city: "Córdoba", state: "Córdoba", zip_code: "X5000" }, items: [{ id: "MLA556677889", title: "Promo Caja Perfume Mujer", quantity: 1 }], last_updated: "2026-10-03T17:42:00" },
  { id: 43990010233, channel: "ml", external_id: "43990010233", order_id: "2000003508421220", status: "handling", substatus: "in_packing_list", tracking_number: null, tracking_url: null, logistic_type: "self_service", mode: "me2", shipping_method: null, receiver: { city: "Quilmes", state: "Buenos Aires", zip_code: "B1878" }, items: [{ id: "MLA111222333", title: "Promo Set Asado Completo", quantity: 1 }, { id: "MLA111222999", title: "Paño Decoración Estampado", quantity: 1 }], last_updated: "2026-10-04T09:20:00" },
  { id: 44001299877, channel: "ml", external_id: "44001299877", order_id: "2000003508422331", status: "pending", substatus: null, tracking_number: null, tracking_url: null, logistic_type: "cross_docking", mode: "me2", shipping_method: null, receiver: { city: "Mendoza", state: "Mendoza", zip_code: "M5500" }, items: [{ id: "MLA444555666", title: "Promo Mate Día del Padre", quantity: 3 }], last_updated: "2026-10-04T07:05:00" },
  { id: 42887654120, channel: "ml", external_id: "42887654120", order_id: "2000003508423442", status: "not_delivered", substatus: "delivery_failed", tracking_number: "OP334455112AR", tracking_url: "https://www.correoargentino.com.ar/formularios/e-commerce?id=OP334455112AR", logistic_type: "drop_off", mode: "me1", shipping_method: null, receiver: { city: "San Miguel de Tucumán", state: "Tucumán", zip_code: "T4000" }, items: [{ id: "MLA777888999", title: "Promo Taza + Perfume", quantity: 1 }], last_updated: "2026-10-03T14:10:00" },
  { id: 43550998741, channel: "ml", external_id: "43550998741", order_id: "2000003508424553", status: "delivered", substatus: null, tracking_number: "ML221100443AR", tracking_url: null, logistic_type: "fulfillment", mode: "me2", shipping_method: null, receiver: { city: "Mar del Plata", state: "Buenos Aires", zip_code: "B7600" }, items: [{ id: "MLA222333444", title: "Promo Bolsa Madera Natural", quantity: 1 }], last_updated: "2026-10-02T19:55:00" },
  { id: 44120557001, channel: "ml", external_id: "44120557001", order_id: "2000003508425664", status: "ready_to_ship", substatus: "printed", tracking_number: "ML556677889AR", tracking_url: null, logistic_type: "cross_docking", mode: "me2", shipping_method: null, receiver: { city: "La Plata", state: "Buenos Aires", zip_code: "B1900" }, items: [{ id: "MLA888999000", title: "Set Vaso + Perfume", quantity: 2 }], last_updated: "2026-10-04T06:40:00" },
  { id: 44130002210, channel: "ml", external_id: "44130002210", order_id: "2000003508426101", status: "cancelled", substatus: null, tracking_number: null, tracking_url: null, logistic_type: "self_service", mode: "me2", shipping_method: null, receiver: { city: "Caballito", state: "CABA", zip_code: "C1405" }, items: [{ id: "MLA123450000", title: "Quesera Plástico", quantity: 1 }], last_updated: "2026-10-02T11:12:00" },
  // Tienda Nube — el identificador visible es el nº de orden; sin subestado
  { id: 9010482, channel: "tn", external_id: "10482", order_id: "10482", status: "pending", substatus: null, tracking_number: null, tracking_url: null, logistic_type: "", mode: "", shipping_method: "Andreani a domicilio", receiver: { city: "Neuquén", state: "Neuquén", zip_code: "Q8300" }, items: [{ id: "TN-PSA-007", title: "Promo Set Asado Completo", quantity: 1 }], last_updated: "2026-10-04T11:02:00" },
  { id: 9010481, channel: "tn", external_id: "10481", order_id: "10481", status: "handling", substatus: null, tracking_number: null, tracking_url: null, logistic_type: "", mode: "", shipping_method: "Correo Argentino a sucursal", receiver: { city: "Salta", state: "Salta", zip_code: "A4400" }, items: [{ id: "TN-PTC-006", title: "Set Tabla Gourmet", quantity: 2 }], last_updated: "2026-10-04T09:48:00" },
  { id: 9010479, channel: "tn", external_id: "10479", order_id: "10479", status: "shipped", substatus: null, tracking_number: "360002184793", tracking_url: "https://www.andreani.com/#!/informacionEnvio/360002184793", logistic_type: "", mode: "", shipping_method: "Andreani a domicilio", receiver: { city: "Bahía Blanca", state: "Buenos Aires", zip_code: "B8000" }, items: [{ id: "TN-PCP-008", title: "Promo Caja Perfume Mujer", quantity: 1 }], last_updated: "2026-10-03T16:30:00" },
  { id: 9010476, channel: "tn", external_id: "10476", order_id: "10476", status: "delivered", substatus: null, tracking_number: "CP512334908AR", tracking_url: "https://www.correoargentino.com.ar/formularios/e-commerce?id=CP512334908AR", logistic_type: "", mode: "", shipping_method: "Correo Argentino a domicilio", receiver: { city: "Santa Fe", state: "Santa Fe", zip_code: "S3000" }, items: [{ id: "TN-PD-002", title: "Paño Decoración Estampado", quantity: 3 }], last_updated: "2026-10-02T13:05:00" },
  { id: 9010474, channel: "tn", external_id: "10474", order_id: "10474", status: "shipped", substatus: null, tracking_number: null, tracking_url: null, logistic_type: "", mode: "", shipping_method: "Moto mensajería (CABA)", receiver: { city: "Belgrano", state: "CABA", zip_code: "C1428" }, items: [{ id: "TN-QP-001", title: "Quesera Plástico", quantity: 1 }], last_updated: "2026-10-04T10:15:00" },
  { id: 9010471, channel: "tn", external_id: "10471", order_id: "10471", status: "not_delivered", substatus: null, tracking_number: "360002177120", tracking_url: "https://www.andreani.com/#!/informacionEnvio/360002177120", logistic_type: "", mode: "", shipping_method: "Andreani a sucursal", receiver: { city: "Posadas", state: "Misiones", zip_code: "N3300" }, items: [{ id: "TN-PM-004", title: "Promo Mate Día del Padre", quantity: 1 }], last_updated: "2026-10-01T18:40:00" },
  { id: 9010468, channel: "tn", external_id: "10468", order_id: "10468", status: "cancelled", substatus: null, tracking_number: null, tracking_url: null, logistic_type: "", mode: "", shipping_method: "Retiro en local", receiver: { city: "Lanús", state: "Buenos Aires", zip_code: "B1824" }, items: [{ id: "TN-PV-003", title: "Set Vaso + Perfume", quantity: 1 }], last_updated: "2026-10-01T10:20:00" },
];

function ShipStatusChip({ status }: { status: ShipStatus }) {
  const s = SHIP_STATUS[status];
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0" style={{ color: s.color, background: s.bg }}>{s.icon}</span>
      <span className="text-xs font-medium" style={{ color: "#334155" }}>{s.label}</span>
    </span>
  );
}

function LogisticTags({ mode, logistic_type }: { mode: string; logistic_type: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase" style={{ color: "#F59E0B", background: "#FEF3C7" }}>{mode.toUpperCase()}</span>
      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ color: "#475569", background: "#F1F5F9" }}>{logLabel(logistic_type)}</span>
    </span>
  );
}

function shipMatches(s: Shipment, q: string) {
  if (!q) return true;
  const t = q.toLowerCase();
  return [s.external_id, s.order_id, s.tracking_number ?? "", s.receiver.city, ...s.items.map(i => i.title)]
    .some(v => v.toLowerCase().includes(t));
}

function shipStats(rows: Shipment[]): Stat[] {
  const n = (fn: (s: Shipment) => boolean) => rows.filter(fn).length;
  return [
    { label: "Envíos", value: rows.length, sub: "total", tone: "#F59E0B", icon: ICON_LIST },
    { label: "Por preparar", value: n(s => s.status === "pending" || s.status === "handling"), tone: "#D97706", icon: SHIP_STATUS.handling.icon },
    { label: "En camino", value: n(s => s.status === "ready_to_ship" || s.status === "shipped"), tone: "#0891B2", icon: SHIP_STATUS.shipped.icon },
    { label: "Entregados", value: n(s => s.status === "delivered"), tone: "#16A34A", icon: SHIP_STATUS.delivered.icon },
    { label: "Incidencias", value: n(s => s.status === "not_delivered" || s.status === "cancelled"), tone: "#DC2626", icon: SHIP_STATUS.not_delivered.icon },
  ];
}

// GET /api/mercadolibre/shipments/{external_id}/label → PDF blob · errores {error, message}
const channelsApi = {
  async shipmentLabel(external_id: string): Promise<Blob> {
    await new Promise(res => setTimeout(res, 1200));
    const s = SHIPMENTS.find(x => x.external_id === external_id);
    if (!s) throw new Error("Envío no encontrado.");
    if (s.channel !== "ml") throw new Error("Las etiquetas solo están disponibles para MercadoLibre.");
    if (s.logistic_type === "fulfillment") throw new Error("No disponible para envíos Full.");
    if (s.status === "delivered") throw new Error("La etiqueta ya no está disponible (envío entregado).");
    if (s.status !== "ready_to_ship" && s.status !== "shipped") throw new Error("MercadoLibre todavía no generó la etiqueta — volvé a intentar en unos minutos.");
    const pdf = `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 288 432]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;
    return new Blob([pdf], { type: "application/pdf" });
  },
};

type LabelState = { kind: "enabled"; reprint: boolean } | { kind: "disabled"; reason: string } | { kind: "hidden" };
function labelState(status: ShipStatus): LabelState {
  switch (status) {
    case "ready_to_ship": return { kind: "enabled", reprint: false };
    case "shipped": return { kind: "enabled", reprint: true };
    case "pending": case "handling": return { kind: "disabled", reason: "La etiqueta se habilita cuando Meli procesa el pago" };
    case "delivered": return { kind: "disabled", reason: "Entregado — no se puede reimprimir" };
    default: return { kind: "hidden" };
  }
}

function LabelButton({ s, busy, onDownload }: { s: Shipment; busy: boolean; onDownload: () => void }) {
  const st = labelState(s.status);
  if (st.kind === "hidden") return <span style={{ color: "#CBD5E1" }}>—</span>;
  const disabled = st.kind === "disabled";
  const primary = st.kind === "enabled" && !st.reprint;
  return (
    <span className="relative inline-flex group">
      <button onClick={onDownload} disabled={disabled || busy} aria-label={`Descargar etiqueta del envío ${s.external_id}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors"
        style={disabled
          ? { color: "#CBD5E1", background: "#F8FAFC", border: "1px solid #F1F5F9", cursor: "not-allowed" }
          : primary
            ? { color: "white", background: busy ? "#818CF8" : "#4F46E5", border: "1px solid #4F46E5", cursor: busy ? "wait" : "pointer" }
            : { color: "#4F46E5", background: "white", border: "1px solid #C7D2FE", cursor: busy ? "wait" : "pointer" }}>
        {busy
          ? <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="animate-spin"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          : <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 1.5h4l2.5 2.5v6.5H3z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /><path d="M6 5v3.5M4.6 7.1 6 8.5l1.4-1.4" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>}
        {busy ? "Descargando…" : st.kind === "enabled" && st.reprint ? "Reimprimir" : "Etiqueta"}
      </button>
      {disabled && (
        <span role="tooltip" className="pointer-events-none absolute right-0 bottom-full mb-2 w-52 rounded-lg px-2.5 py-2 text-[11px] leading-snug opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "#0A1628", color: "white", zIndex: 20, boxShadow: "0 6px 20px rgba(10,22,40,0.18)" }}>{st.reason}</span>
      )}
    </span>
  );
}

// Estados agrupados para el filtro (y para las métricas).
type ShipGroup = "to_prepare" | "in_transit" | "delivered" | "not_delivered" | "cancelled";
const SHIP_GROUPS: Record<ShipGroup, { label: string; statuses: ShipStatus[] }> = {
  to_prepare:    { label: "Por preparar", statuses: ["pending", "handling"] },
  in_transit:    { label: "En camino",    statuses: ["ready_to_ship", "shipped"] },
  delivered:     { label: "Entregado",    statuses: ["delivered"] },
  not_delivered: { label: "No entregado", statuses: ["not_delivered"] },
  cancelled:     { label: "Cancelado",    statuses: ["cancelled"] },
};

// Mock de API: GET /api/shipments?channel&status_group&q&page&page_size
const shipmentsApi = {
  async list(p: { channel: SalesChannelKey | "all"; group: ShipGroup | "all"; q: string }) {
    await wait(450);
    const byChannel = SHIPMENTS.filter(s => (p.channel === "all" || s.channel === p.channel) && shipMatches(s, p.q));
    const rows = p.group === "all" ? byChannel : byChannel.filter(s => SHIP_GROUPS[p.group as ShipGroup].statuses.includes(s.status));
    return { rows: [...rows].sort((a, b) => b.last_updated.localeCompare(a.last_updated)), statsBase: byChannel, account_total: SHIPMENTS.length };
  },
};

function TrackingAction({ s }: { s: Shipment }) {
  if (!s.tracking_url) return <span style={{ color: "#CBD5E1" }}>—</span>;
  return (
    <a href={s.tracking_url} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-colors hover:bg-indigo-50"
      style={{ color: "#4F46E5", background: "white", border: "1px solid #C7D2FE" }}>
      Ver tracking
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h4v4M13 3 7 9M11 9.5V13H3V5h3.5" /></svg>
    </a>
  );
}

function ShipmentTable({ rows, busyId, onDownload, loading }: { rows: Shipment[]; busyId: string | null; onDownload: (s: Shipment) => void; loading: boolean }) {
  const cols = ["Envío", "Estado", "Destino", "Producto", "Método", "Tracking", "Actualizado", "Acciones"];
  return (
    <table className="w-full text-xs" style={{ minWidth: "1000px", borderCollapse: "separate", borderSpacing: 0 }}>
      <thead>
        <tr>
          {cols.map(c => (
            <th key={c} className="sticky top-0 bg-white px-3 py-3 font-semibold text-left" style={{ zIndex: 10, color: "#94A3B8", fontSize: "10px", letterSpacing: "0.07em", boxShadow: "inset 0 -1px 0 #F1F5F9" }}>{c.toUpperCase()}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {loading ? Array.from({ length: 8 }, (_, i) => (
          <tr key={i}>
            {cols.map((c, k) => (
              <td key={c} className="px-3 py-3.5" style={{ borderBottom: "1px solid #F8FAFC" }}>
                <span className="block h-3 rounded animate-pulse" style={{ background: "#F1F5F9", width: [96, 110, 90, 140, 100, 90, 80, 64][k] }} />
              </td>
            ))}
          </tr>
        )) : rows.map(s => {
          const first = s.items[0];
          const extra = s.items.reduce((a, i) => a + i.quantity, 0) - first.quantity;
          const td = "px-3 py-3 align-top";
          const b = { borderBottom: "1px solid #F8FAFC" };
          return (
            <tr key={s.id} className="transition-colors hover:bg-slate-50">
              <td className={td} style={b}>
                <div className="flex flex-col gap-1 items-start">
                  <div>
                    <div className="font-semibold tabular-nums" style={{ color: "#0A1628" }}>{s.channel === "ml" ? s.external_id : `#${s.order_id}`}</div>
                    {s.channel === "ml" && <div className="tabular-nums" style={{ fontSize: "10px", color: "#94A3B8" }}>Orden #{s.order_id}</div>}
                  </div>
                  <ChannelBadge channel={s.channel} />
                </div>
              </td>
              <td className={td} style={b}>
                <ShipStatusChip status={s.status} />
                {s.channel === "ml" && subLabel(s.substatus) && <div style={{ fontSize: "10px", color: "#94A3B8", marginLeft: 28, marginTop: 2 }}>{subLabel(s.substatus)}</div>}
              </td>
              <td className={td} style={b}>
                <div style={{ color: "#334155" }}>{s.receiver.city}, {s.receiver.state}</div>
                <div className="tabular-nums" style={{ fontSize: "10px", color: "#94A3B8" }}>CP {s.receiver.zip_code}</div>
              </td>
              <td className={td} style={b}>
                <div className="truncate" style={{ color: "#334155", maxWidth: 200 }}>{first.title}</div>
                <div style={{ fontSize: "10px", color: "#94A3B8" }}>{first.quantity} u.{extra > 0 ? ` · +${extra} más` : ""}</div>
              </td>
              <td className={td} style={b}>
                {s.channel === "ml"
                  ? <LogisticTags mode={s.mode} logistic_type={s.logistic_type} />
                  : <span style={{ color: "#334155" }}>{s.shipping_method ?? "—"}</span>}
              </td>
              <td className={td} style={b}>
                {!s.tracking_number ? <span style={{ color: "#CBD5E1" }}>—</span>
                  : s.tracking_url
                    ? <a href={s.tracking_url} target="_blank" rel="noopener noreferrer" className="font-mono tabular-nums hover:underline inline-flex items-center gap-1" style={{ color: "#4F46E5" }}>{s.tracking_number}<span aria-hidden>↗</span></a>
                    : <span className="font-mono tabular-nums" style={{ color: "#334155" }}>{s.tracking_number}</span>}
              </td>
              <td className={`${td} tabular-nums whitespace-nowrap`} style={{ ...b, color: "#64748B" }}>{fmtShipDate(s.last_updated)}</td>
              <td className={td} style={b}>
                {s.channel === "ml" ? <LabelButton s={s} busy={busyId === s.external_id} onDownload={() => onDownload(s)} /> : <TrackingAction s={s} />}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Shipments() {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<SalesChannelKey | "all">("all");
  const [group, setGroup] = useState<ShipGroup | "all">("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [data, setData] = useState<Awaited<ReturnType<typeof shipmentsApi.list>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const t = setTimeout(() => {
      shipmentsApi.list({ channel, group, q: search })
        .then(r => { if (alive) setData(r); })
        .catch(e => { if (alive) setError(e instanceof Error ? e.message : "No pudimos cargar los envíos."); })
        .finally(() => { if (alive) setLoading(false); });
    }, search ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [search, channel, group, reload]);
  useEffect(() => { setPage(0); }, [search, channel, group, pageSize]);

  const downloadLabel = async (s: Shipment) => {
    if (busyId) return;
    setBusyId(s.external_id); setToast(null);
    try {
      const blob = await channelsApi.shipmentLabel(s.external_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `etiqueta-${s.external_id}.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setToast({ tone: "ok", message: `Etiqueta del envío ${s.external_id} descargada.` });
    } catch (e) {
      setToast({ tone: "err", message: e instanceof Error ? e.message : "No se pudo descargar la etiqueta." });
    } finally { setBusyId(null); }
  };

  const rows = data?.rows ?? [];
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, pageCount - 1);
  const start = clampedPage * pageSize;
  const pageRows = rows.slice(start, start + pageSize);
  const filterCount = (channel !== "all" ? 1 : 0) + (group !== "all" ? 1 : 0);
  const clear = () => { setChannel("all"); setGroup("all"); };
  const accountEmpty = data?.account_total === 0;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">
      {toast && (
        <div role="status" className="fixed bottom-6 right-6 flex items-start gap-2.5 rounded-xl px-4 py-3 max-w-sm"
          style={{ zIndex: 60, background: "white", border: `1px solid ${toast.tone === "ok" ? "#BBF7D0" : "#FECACA"}`, boxShadow: "0 12px 32px rgba(10,22,40,0.12)" }}>
          <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-px" style={{ background: toast.tone === "ok" ? "#DCFCE7" : "#FEE2E2", color: toast.tone === "ok" ? "#16A34A" : "#DC2626" }}>
            {toast.tone === "ok"
              ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5.2 4 7.2 8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              : <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2.5v3M5 7.5h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold" style={{ color: "#0A1628" }}>{toast.tone === "ok" ? "Etiqueta descargada" : "No se pudo descargar la etiqueta"}</div>
            <div style={{ fontSize: "12px", color: "#64748B", lineHeight: 1.4, marginTop: 2 }}>{toast.message}</div>
          </div>
          <button onClick={() => setToast(null)} aria-label="Cerrar" className="text-sm leading-none" style={{ color: "#94A3B8" }}>×</button>
        </div>
      )}
      <header className="flex items-center gap-3 px-6 py-3 flex-shrink-0 bg-white" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#CBD5E1" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nº de envío, nº de orden, tracking, ciudad o producto…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
            style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0A1628" }}
            onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.08)"; }}
            onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col p-5 min-h-0 gap-3">
        <div className="flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-bold" style={{ color: "#0A1628" }}>Envíos</h1>
            <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>{data ? `${total} ${total === 1 ? "envío" : "envíos"}` : "—"}</span>
          </div>
          <Popover width={280} trigger={o => (
            <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
              style={{ border: `1.5px solid ${o || filterCount ? "#4F46E5" : "#E2E8F0"}`, color: filterCount ? "#4F46E5" : "#475569", background: filterCount ? "#EEF2FF" : "white" }}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 3.5h12M4 8h8M6 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
              Filtros
              {filterCount > 0 && <span className="ml-0.5 px-1.5 rounded-full text-white" style={{ fontSize: "9px", fontWeight: 700, background: "#4F46E5" }}>{filterCount}</span>}
            </button>
          )}>
            {() => (
              <div className="flex flex-col gap-3 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>Filtros</span>
                  {filterCount > 0 && <button onClick={clear} className="text-xs font-medium hover:underline" style={{ color: "#4F46E5" }}>Limpiar</button>}
                </div>
                <FilterField label="Canal" value={channel} onChange={v => setChannel(v as SalesChannelKey | "all")}
                  options={[{ value: "all", label: "Todos" }, { value: "ml", label: "MercadoLibre" }, { value: "tn", label: "Tienda Nube" }]} />
                <FilterField label="Estado" value={group} onChange={v => setGroup(v as ShipGroup | "all")}
                  options={[{ value: "all", label: "Todos" }, ...(Object.keys(SHIP_GROUPS) as ShipGroup[]).map(k => ({ value: k, label: SHIP_GROUPS[k].label }))]} />
              </div>
            )}
          </Popover>
        </div>

        <div className="overflow-x-auto flex-shrink-0"><div className="min-w-[720px]"><StatStrip stats={data ? shipStats(data.statsBase) : shipStats([]).map(s => ({ ...s, value: "—" }))} /></div></div>

        <div className="flex-1 flex flex-col min-h-0 rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <div className="flex-1 overflow-auto bg-white min-h-0">
            {error ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center mb-1" style={{ background: "#FEE2E2", color: "#DC2626" }}>{SHIP_STATUS.not_delivered.icon}</span>
                <p className="text-sm font-semibold" style={{ color: "#0A1628" }}>No pudimos cargar los envíos</p>
                <p className="text-xs max-w-sm" style={{ color: "#64748B" }}>{error}</p>
                <button onClick={() => setReload(n => n + 1)} className="mt-1 px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-slate-50" style={{ border: "1px solid #E2E8F0", color: "#4F46E5" }}>Reintentar</button>
              </div>
            ) : accountEmpty && !loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
                <svg width="120" height="84" viewBox="0 0 120 84" fill="none" aria-hidden>
                  <ellipse cx="60" cy="76" rx="44" ry="5" fill="#F1F5F9" />
                  <rect x="18" y="26" width="52" height="38" rx="4" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="1.5" />
                  <path d="M70 36h16l12 13v15H70z" fill="white" stroke="#C7D2FE" strokeWidth="1.5" strokeLinejoin="round" />
                  <path d="M76 40h8l7 8H76z" fill="#EEF2FF" />
                  <circle cx="34" cy="66" r="7" fill="white" stroke="#4F46E5" strokeWidth="2" />
                  <circle cx="84" cy="66" r="7" fill="white" stroke="#4F46E5" strokeWidth="2" />
                  <path d="M30 40h22M30 48h14" stroke="#A5B4FC" strokeWidth="2" strokeLinecap="round" />
                  <path d="M6 34h8M2 44h10M8 54h6" stroke="#E2E8F0" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p className="text-sm font-semibold mt-1" style={{ color: "#0A1628" }}>Todavía no hay envíos</p>
                <p className="text-xs max-w-sm" style={{ color: "#64748B" }}>Cuando vendas por MercadoLibre o Tienda Nube, los envíos van a aparecer acá para que los sigas y descargues etiquetas.</p>
              </div>
            ) : !loading && total === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
                <p className="text-sm" style={{ color: "#94A3B8" }}>No hay envíos que coincidan con la búsqueda o los filtros.</p>
                {filterCount > 0 && <button onClick={clear} className="text-xs font-semibold hover:underline" style={{ color: "#4F46E5" }}>Limpiar filtros</button>}
              </div>
            ) : (
              <ShipmentTable rows={pageRows} busyId={busyId} onDownload={downloadLabel} loading={loading} />
            )}
          </div>
          <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: "1px solid #E2E8F0" }}>
            <span className="text-xs" style={{ color: "#94A3B8" }}>{total} {total === 1 ? "envío" : "envíos"}</span>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs" style={{ color: "#94A3B8" }}>Mostrar</span>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="hidden sm:block text-xs px-2 py-1 rounded-lg outline-none" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
                <option>50</option><option>100</option><option>200</option>
              </select>
              <span className="text-xs font-medium" style={{ color: "#475569" }}>{total ? start + 1 : 0} – {Math.min(start + pageSize, total)}</span>
              {(["‹", "›"] as const).map(g => {
                const dis = g === "‹" ? clampedPage === 0 : clampedPage >= pageCount - 1;
                return <button key={g} disabled={dis} onClick={() => setPage(clampedPage + (g === "‹" ? -1 : 1))} aria-label={g === "‹" ? "Página anterior" : "Página siguiente"}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm"
                  style={{ color: "#94A3B8", border: "1px solid #E2E8F0", cursor: dis ? "default" : "pointer", opacity: dis ? 0.4 : 1 }}
                  onMouseEnter={e => { if (!dis) e.currentTarget.style.background = "#F1F5F9"; }}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{g}</button>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Soporte / Tickets ─────────────────────────────────────────────────────────

type TicketAttachment = { url: string; name: string };

function TicketImageDrop({ files, setFiles }: { files: TicketAttachment[]; setFiles: (f: TicketAttachment[]) => void }) {
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = Array.from(list).filter(f => f.type.startsWith("image/")).map(f => ({ url: URL.createObjectURL(f), name: f.name }));
    setFiles([...files, ...next]);
  };
  // Captura la pantalla actual del panel (sin el popup de soporte) y la adjunta.
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const capture = async () => {
    setCapturing(true); setCaptureError(null);
    try {
      const url = await toPng(document.body, {
        width: window.innerWidth, height: window.innerHeight, pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        filter: n => !(n instanceof HTMLElement && n.dataset.captureIgnore !== undefined),
      });
      const d = new Date();
      setFiles([...files, { url, name: `captura-${d.getHours()}${String(d.getMinutes()).padStart(2, "0")}.png` }]);
    } catch {
      setCaptureError("No pudimos tomar la captura. Probá adjuntándola manualmente.");
    } finally { setCapturing(false); }
  };
  // Pegar una imagen desde el portapapeles (Ctrl/Cmd + V)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const imgs = Array.from(e.clipboardData?.files ?? []).filter(f => f.type.startsWith("image/"));
      if (imgs.length) setFiles([...files, ...imgs.map(f => ({ url: URL.createObjectURL(f), name: f.name || "captura.png" }))]);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [files, setFiles]);
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={capture} disabled={capturing}
        className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition-colors"
        style={{ border: "1.5px solid #C7D2FE", background: "#EEF2FF", color: "#4F46E5", cursor: capturing ? "default" : "pointer", opacity: capturing ? 0.7 : 1 }}
        onMouseEnter={e => { if (!capturing) e.currentTarget.style.background = "#E0E7FF"; }}
        onMouseLeave={e => (e.currentTarget.style.background = "#EEF2FF")}>
        {capturing
          ? <span className="w-3.5 h-3.5 rounded-full border-2 animate-spin" style={{ borderColor: "#C7D2FE", borderTopColor: "#4F46E5" }} />
          : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 5.5V4a1.5 1.5 0 0 1 1.5-1.5H5M11 2.5h1.5A1.5 1.5 0 0 1 14 4v1.5M14 10.5V12a1.5 1.5 0 0 1-1.5 1.5H11M5 13.5H3.5A1.5 1.5 0 0 1 2 12v-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.5" /></svg>}
        {capturing ? "Capturando…" : "Capturar esta pantalla"}
      </button>
      {captureError && <p className="text-[11px]" style={{ color: "#DC2626" }}>{captureError}</p>}
      <label className="flex flex-col items-center justify-center gap-1.5 rounded-xl cursor-pointer transition-colors py-5 px-3 text-center"
        style={{ border: "1.5px dashed #CBD5E1", background: "#F8FAFC" }}
        onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); add(e.dataTransfer.files); }}
        onMouseEnter={e => (e.currentTarget.style.borderColor = "#4F46E5")} onMouseLeave={e => (e.currentTarget.style.borderColor = "#CBD5E1")}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" style={{ color: "#94A3B8" }}><path d="M10 13V4M6.5 7.5L10 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M3.5 13v2a1.5 1.5 0 0 0 1.5 1.5h10a1.5 1.5 0 0 0 1.5-1.5v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <span className="text-xs font-medium" style={{ color: "#475569" }}>Adjuntar captura del problema</span>
        <span style={{ fontSize: "10px", color: "#94A3B8" }}>Arrastrá, pegá (Ctrl+V) o hacé click · PNG, JPG</span>
        <input type="file" accept="image/*" multiple className="hidden" onChange={e => add(e.target.files)} />
      </label>
      {files.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {files.map((f, i) => (
            <div key={i} className="relative group" style={{ width: 56, height: 56 }}>
              <img src={f.url} alt={f.name} className="w-full h-full object-cover rounded-lg" style={{ border: "1px solid #E2E8F0" }} />
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-white transition-transform group-hover:scale-110"
                style={{ background: "#DC2626", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} title="Quitar">
                <TrashIcon size={10} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TicketForm({ onDone }: { onDone?: () => void }) {
  const [subject, setSubject] = useState("");
  const [detail, setDetail] = useState("");
  const [files, setFiles] = useState<TicketAttachment[]>([]);
  const [sent, setSent] = useState(false);
  const canSend = subject.trim().length > 0 && detail.trim().length > 0;

  if (sent) {
    return (
      <div className="flex flex-col items-center justify-center text-center gap-3 py-8 px-4">
        <span className="w-12 h-12 rounded-full flex items-center justify-center" style={{ color: "#16A34A", background: "#DCFCE7" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M6 12.5l3.5 3.5L18 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
        <div>
          <p className="text-sm font-bold" style={{ color: "#0A1628" }}>¡Ticket enviado!</p>
          <p className="text-xs mt-1" style={{ color: "#64748B" }}>Te responderemos por correo. N.º de seguimiento <span className="font-semibold tabular-nums" style={{ color: "#4F46E5" }}>#{Math.floor(1000 + Math.random() * 9000)}</span></p>
        </div>
        <button onClick={() => { setSent(false); setSubject(""); setDetail(""); setFiles([]); onDone?.(); }}
          className="text-xs font-semibold px-4 py-2 rounded-lg transition-colors" style={{ color: "#4F46E5", background: "#EEF2FF" }}>Listo</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94A3B8" }}>Asunto</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Resumí el problema en una línea"
          className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all" style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0A1628" }}
          onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.08)"; }}
          onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94A3B8" }}>Descripción</label>
        <textarea value={detail} onChange={e => setDetail(e.target.value)} rows={4} placeholder="Contanos qué pasó, qué esperabas y los pasos para reproducirlo…"
          className="w-full px-3 py-2 rounded-xl text-sm outline-none transition-all resize-none" style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0A1628" }}
          onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.08)"; }}
          onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
      </div>

      <TicketImageDrop files={files} setFiles={setFiles} />

      <button disabled={!canSend} onClick={() => setSent(true)}
        className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all"
        style={{ background: canSend ? "#4F46E5" : "#E2E8F0", color: canSend ? "white" : "#94A3B8", cursor: canSend ? "pointer" : "not-allowed" }}>
        Enviar ticket
      </button>
    </div>
  );
}

// ── Idea 1 — Floating support button + modal (available on every page) ──
function SupportFab() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-capture-ignore onClick={() => setOpen(true)} title="Soporte" aria-label="Soporte"
        className="group fixed bottom-16 right-6 z-40 flex items-center h-12 rounded-full text-sm font-semibold text-white transition-all duration-300 hover:scale-105 px-3.5"
        style={{ background: "#4F46E5", boxShadow: "0 8px 24px rgba(79,70,229,0.35)" }}>
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="flex-shrink-0"><circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" /><circle cx="10" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.5" /><path d="M12.2 7.8l2.6-2.6M5.2 14.8l2.6-2.6M12.2 12.2l2.6 2.6M5.2 5.2l2.6 2.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        <span className="overflow-hidden whitespace-nowrap transition-all duration-300 max-w-0 opacity-0 group-hover:max-w-[80px] group-hover:opacity-100 group-hover:ml-2">Soporte</span>
      </button>
      {open && (
        <div data-capture-ignore className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ fontFamily: "'Inter', sans-serif" }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="relative w-[440px] max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-2xl" style={{ border: "1px solid #E2E8F0" }}>
            <div className="flex items-start justify-between px-5 pt-5 pb-3">
              <div>
                <h2 className="text-base font-bold" style={{ color: "#0A1628" }}>¿En qué te ayudamos?</h2>
                <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>Contanos el problema y adjuntá una captura si querés.</p>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" style={{ color: "#94A3B8" }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
              </button>
            </div>
            <div className="px-5 pb-5"><TicketForm onDone={() => setOpen(false)} /></div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Ventas (órdenes de MercadoLibre + Tienda Nube) ─────────────────────────────
// Mismo patrón que Inventario/Envíos: header con buscador, strip de métricas, tabla
// con columnas gestionables, paginación al pie y drawer lateral con el detalle.

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

type SalesChannelKey = "ml" | "tn";
type OrderStatus = "pending_payment" | "paid" | "delivered" | "cancelled";
type StockSync = "synced" | "pending" | "error" | "not_applicable";
type StockTxType = "sale" | "return";
// Movimiento en el sistema de stock por ítem: venta (descuenta) o devolución (repone al cancelar).
interface StockTransaction { type: StockTxType; status: Exclude<StockSync, "not_applicable">; document_number: string | null }
interface SaleItem { title: string; sku: string; quantity: number; unit_price: number; stock_transactions: StockTransaction[] }
interface SaleStatusEvent { at: string; status: OrderStatus; raw_status: string }
interface SaleOrder {
  id: string; number: string; channel: SalesChannelKey; created_at: string; updated_at: string;
  buyer_name: string | null; items: SaleItem[]; total: number; currency: "ARS";
  status: OrderStatus; stock_sync: StockSync; history: SaleStatusEvent[]; url: string;
}

const SALES_CHANNELS: Record<SalesChannelKey, { name: string; text: string; bg: string; border: string }> = {
  ml: { name: "MercadoLibre", text: "#B45309", bg: "#FEF7E6", border: "#FDE68A" },
  tn: { name: "Tienda Nube", text: "#4F46E5", bg: "#EEF2FF", border: "#C7D2FE" },
};
const ORDER_STATUS: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  pending_payment: { label: "Pendiente de pago", color: "#B45309", bg: "#FEF3C7" },
  paid: { label: "Pagada", color: "#4F46E5", bg: "#EEF2FF" },
  delivered: { label: "Entregada", color: "#16A34A", bg: "#DCFCE7" },
  cancelled: { label: "Cancelada", color: "#DC2626", bg: "#FEE2E2" },
};
const STOCK_SYNC: Record<StockSync, { glyph: string; label: string; color: string; bg: string }> = {
  synced: { glyph: "✓", label: "Sincronizado", color: "#16A34A", bg: "#DCFCE7" },
  pending: { glyph: "⏳", label: "Pendiente", color: "#B45309", bg: "#FEF3C7" },
  error: { glyph: "⚠", label: "Con error", color: "#DC2626", bg: "#FEE2E2" },
  not_applicable: { glyph: "—", label: "No aplica", color: "#94A3B8", bg: "transparent" },
};
// Estado crudo que devuelve cada canal para cada estado normalizado.
const RAW_STATUS: Record<SalesChannelKey, Record<OrderStatus, string>> = {
  ml: { pending_payment: "payment_required", paid: "paid", delivered: "delivered", cancelled: "cancelled" },
  tn: { pending_payment: "pending", paid: "paid", delivered: "closed", cancelled: "cancelled" },
};

const SALE_ORDERS: SaleOrder[] = (() => {
  const rand = seeded(20261002);
  const buyers = ["Martina Ríos", "Julián Paz", "Lucía Fernández", "Diego Sosa", "Sofía Medina", "Tomás Giménez", "Valentina López", "Mateo Castro", "Camila Bravo", "Agustín Vera", "Florencia Núñez", "Nicolás Herrera"];
  const now = Date.now();
  const out: SaleOrder[] = [];
  let mlSeq = 2000018677825100, tnSeq = 10482, docSeq = 9420;
  for (let i = 0; i < 620; i++) {
    const channel: SalesChannelKey = rand() < 0.64 ? "ml" : "tn";
    const created = now - (i * 3.45 + rand() * 3) * 3600000;
    const nItems = rand() < 0.8 ? 1 : rand() < 0.7 ? 2 : 3;
    const picked = [...products].sort(() => rand() - 0.5).slice(0, nItems);
    const items: SaleItem[] = picked.map(p => ({ title: p.name_edited ?? p.name, sku: p.sku, quantity: rand() < 0.75 ? 1 : 2, unit_price: channel === "tn" ? Math.round(p.price * 0.95) : p.price, stock_transactions: [] }));
    const total = items.reduce((a, it) => a + it.quantity * it.unit_price, 0);
    const ageH = (now - created) / 3600000;
    const r = rand();
    const status: OrderStatus = r < 0.06 ? "cancelled" : ageH < 6 && r < 0.3 ? "pending_payment" : ageH < 72 ? "paid" : "delivered";
    // Línea de tiempo coherente con el estado final.
    const steps: OrderStatus[] = status === "pending_payment" ? ["pending_payment"]
      : status === "cancelled" ? (rand() < 0.5 ? ["pending_payment", "cancelled"] : ["pending_payment", "paid", "cancelled"])
      : status === "paid" ? ["pending_payment", "paid"] : ["pending_payment", "paid", "delivered"];
    let t = created;
    const history = steps.map((st, k) => { if (k) t += (st === "delivered" ? 40 + rand() * 50 : 0.1 + rand() * 2) * 3600000; return { at: new Date(Math.min(t, now)).toISOString(), status: st, raw_status: RAW_STATUS[channel][st] }; });
    const wasPaid = steps.includes("paid");
    if (wasPaid) items.forEach(it => {
      const saleStatus = ageH < 0.5 ? "pending" : rand() < 0.04 ? "error" : "synced";
      it.stock_transactions.push({ type: "sale", status: saleStatus, document_number: saleStatus === "synced" ? String(docSeq--) : null });
      if (status === "cancelled" && saleStatus === "synced") {
        const retStatus = rand() < 0.1 ? "pending" : "synced";
        it.stock_transactions.push({ type: "return", status: retStatus, document_number: retStatus === "synced" ? String(docSeq--) : null });
      }
    });
    const txs = items.flatMap(it => it.stock_transactions);
    const stock_sync: StockSync = !txs.length ? "not_applicable" : txs.some(t => t.status === "error") ? "error" : txs.some(t => t.status === "pending") ? "pending" : "synced";
    const number = channel === "ml" ? String(mlSeq -= 7 + Math.floor(rand() * 900)) : String(tnSeq--);
    out.push({
      id: `${channel}-${number}`, number, channel, created_at: new Date(created).toISOString(), updated_at: history[history.length - 1].at,
      buyer_name: channel === "tn" && rand() < 0.08 ? null : buyers[Math.floor(rand() * buyers.length)],
      items, total, currency: "ARS", status, stock_sync, history,
      url: channel === "ml" ? `https://www.mercadolibre.com.ar/ventas/${number}/detalle` : `https://mitienda.mitiendanube.com/admin/orders/${number}`,
    });
  }
  return out;
})();

// Mock de API: GET /orders?channel&status&q&page&page_size
const salesApi = {
  async list(p: { channel: SalesChannelKey | "all"; status: OrderStatus | "all"; q: string; page: number; page_size: number }) {
    await wait(450);
    const q = p.q.trim().toLowerCase();
    const base = SALE_ORDERS.filter(o => (p.channel === "all" || o.channel === p.channel)
      && (!q || o.number.includes(q) || (o.buyer_name ?? "").toLowerCase().includes(q) || o.items.some(it => it.title.toLowerCase().includes(q) || it.sku.toLowerCase().includes(q))));
    const counts = { total: base.length, pending_payment: 0, paid: 0, delivered: 0, cancelled: 0 } as Record<OrderStatus | "total", number>;
    base.forEach(o => { counts[o.status]++; });
    const rows = p.status === "all" ? base : base.filter(o => o.status === p.status);
    return { items: rows.slice(p.page * p.page_size, (p.page + 1) * p.page_size), total: rows.length, counts };
  },
};

const fmtSaleDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// Chip de canal con los colores oficiales de cada marca.
const CHANNEL_BRAND: Record<SalesChannelKey, { solid: string; ink: string }> = {
  ml: { solid: "#FFE600", ink: "#2D3277" },
  tn: { solid: "#2C3357", ink: "#FFFFFF" },
};
function ChannelBadge({ channel }: { channel: SalesChannelKey }) {
  const b = CHANNEL_BRAND[channel];
  return <span className="inline-flex items-center rounded-md px-1.5 py-0.5 whitespace-nowrap" style={{ fontSize: "10px", fontWeight: 700, color: b.ink, background: b.solid, letterSpacing: "0.01em" }}>{SALES_CHANNELS[channel].name}</span>;
}
function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const m = ORDER_STATUS[status];
  return <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 whitespace-nowrap font-semibold" style={{ fontSize: "10.5px", color: m.color, background: m.bg }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: m.color }} />{m.label}</span>;
}
function StockSyncBadge({ sync }: { sync: StockSync }) {
  const m = STOCK_SYNC[sync];
  if (sync === "not_applicable") return <span title="No aplica: la orden no llegó a pagarse" style={{ color: "#CBD5E1" }}>— No aplica</span>;
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 whitespace-nowrap font-semibold" style={{ fontSize: "10.5px", color: m.color, background: m.bg }}><span aria-hidden>{m.glyph}</span>{m.label}</span>;
}

const ICON_CLOCK = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M8 4.8V8l2.2 1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;
const ICON_BOX = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2.5 5 8 2.2 13.5 5v6L8 13.8 2.5 11V5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M2.5 5 8 7.8 13.5 5M8 7.8v6" stroke="currentColor" strokeWidth="1.4" /></svg>;
const ICON_X = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.4" /><path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;

type SaleCol = ManagedCol & { render: (o: SaleOrder) => ReactNode; align?: "right" };
const SALE_COLS: SaleCol[] = [
  { key: "order", label: "Orden", locked: true, render: o => (
    <div className="flex flex-col gap-1 items-start">
      <span className="font-semibold tabular-nums" style={{ color: "#0A1628" }}>#{o.number}</span>
      <ChannelBadge channel={o.channel} />
    </div>) },
  { key: "created", label: "Fecha", render: o => <span className="tabular-nums whitespace-nowrap" style={{ color: "#64748B" }}>{fmtSaleDate(o.created_at)}</span> },
  { key: "buyer", label: "Comprador", render: o => o.buyer_name ? <span style={{ color: "#334155" }}>{o.buyer_name}</span> : <span style={{ color: "#CBD5E1" }}>—</span> },
  { key: "items", label: "Productos", render: o => (
    <div className="min-w-0">
      <div className="truncate" style={{ color: "#334155", maxWidth: 240 }}>{o.items[0].title}</div>
      <div style={{ fontSize: "10px", color: "#94A3B8" }}>{o.items.length} {o.items.length === 1 ? "ítem" : "ítems"}</div>
    </div>) },
  { key: "total", label: "Total", align: "right", render: o => <span className="font-semibold tabular-nums whitespace-nowrap" style={{ color: "#0A1628" }}>{fmt(o.total)}</span> },
  { key: "status", label: "Estado", render: o => <OrderStatusBadge status={o.status} /> },
  { key: "sync", label: "Sync stock", render: o => <StockSyncBadge sync={o.stock_sync} /> },
  { key: "channel", label: "Canal", render: o => <span style={{ color: "#334155" }}>{SALES_CHANNELS[o.channel].name}</span> },
  { key: "currency", label: "Moneda", render: o => <span className="font-mono" style={{ color: "#64748B" }}>{o.currency}</span> },
  { key: "updated", label: "Actualizado", render: o => <span className="tabular-nums whitespace-nowrap" style={{ color: "#64748B" }}>{fmtSaleDate(o.updated_at)}</span> },
  { key: "link", label: "Enlace", render: o => (
    <a href={o.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="font-semibold hover:underline whitespace-nowrap" style={{ color: "#4F46E5" }}>Abrir ↗</a>) },
];
const SALE_DEFAULT_COLS = ["order", "created", "buyer", "items", "total", "status", "sync"];
const SALE_COLS_KEY = "omnipanel.ventas.cols";

// Drawer de orden — mismo shell que el de Inventario (820px, rail de identidad a la
// izquierda en #FAFBFC, contenido a la derecha, footer con acciones).
// Historial en el rail; productos y sync de stock a la vista en el panel derecho.
const railLabel = (t: string) => <span style={{ fontSize: "9px", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#CBD5E1" }}>{t}</span>;
const sectionLabel = (t: string) => <h3 style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "#94A3B8" }}>{t}</h3>;

function SaleIdentity({ order }: { order: SaleOrder }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5 items-start">
        <p className="font-semibold text-sm tabular-nums" style={{ color: "#0A1628" }}>Orden #{order.number}</p>
        <ChannelBadge channel={order.channel} />
      </div>
      <div className="flex flex-col gap-1">{railLabel("Estado")}<div><OrderStatusBadge status={order.status} /></div></div>
      <div className="flex flex-col gap-0.5">{railLabel("Total")}<span className="text-lg font-bold tabular-nums" style={{ color: "#0A1628" }}>{fmt(order.total)} <span className="text-[10px] font-medium" style={{ color: "#94A3B8" }}>{order.currency}</span></span></div>
      {[
        { label: "Comprador", value: order.buyer_name ?? "—" },
        { label: "Fecha", value: `${fmtSaleDate(order.created_at)} hs` },
        { label: "Ítems", value: `${order.items.reduce((a, it) => a + it.quantity, 0)} unidades · ${order.items.length} ${order.items.length === 1 ? "producto" : "productos"}` },
      ].map(f => (
        <div key={f.label} className="flex flex-col gap-0.5">{railLabel(f.label)}<span className="text-xs" style={{ color: "#475569" }}>{f.value}</span></div>
      ))}
    </div>
  );
}

function SaleHistory({ order, compact }: { order: SaleOrder; compact?: boolean }) {
  return (
    <ol className="flex flex-col">
      {[...order.history].reverse().map((ev, i, arr) => {
        const current = i === 0; const m = ORDER_STATUS[ev.status];
        return (
          <li key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="rounded-full flex-shrink-0 mt-1" style={{ width: 10, height: 10, background: current ? m.color : "white", border: `2px solid ${current ? m.color : "#CBD5E1"}`, boxShadow: current ? `0 0 0 4px ${m.bg}` : "none" }} />
              {i < arr.length - 1 && <span className="flex-1 w-px my-1" style={{ background: "#E2E8F0", minHeight: 20 }} />}
            </div>
            <div className={compact ? "pb-3 min-w-0" : "pb-5 min-w-0"}>
              <p className={compact ? "text-xs" : "text-[13px]"} style={{ color: current ? "#0A1628" : "#475569", fontWeight: current ? 700 : 500 }}>{m.label}</p>
              <p className="tabular-nums" style={{ fontSize: "10.5px", color: "#94A3B8" }}>
                {fmtSaleDate(ev.at)} <span className="font-mono">({ev.raw_status})</span>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SaleProducts({ order }: { order: SaleOrder }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
      {order.items.map((it, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-3" style={{ borderTop: i ? "1px solid #F1F5F9" : "none" }}>
          <span className="tabular-nums font-bold text-xs mt-px" style={{ color: "#4F46E5" }}>{it.quantity}×</span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium truncate" style={{ color: "#0A1628" }}>{it.title}</p>
            <p className="font-mono" style={{ fontSize: "10.5px", color: "#94A3B8" }}>{it.sku} · {fmt(it.unit_price)} c/u</p>
          </div>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: "#0A1628" }}>{fmt(it.quantity * it.unit_price)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ background: "#F8FAFC", borderTop: "1px solid #F1F5F9" }}>
        <span className="text-xs font-semibold" style={{ color: "#64748B" }}>Subtotal</span>
        <span className="text-sm font-bold tabular-nums" style={{ color: "#0A1628" }}>{fmt(order.items.reduce((a, it) => a + it.quantity * it.unit_price, 0))}</span>
      </div>
    </div>
  );
}

const STOCK_TX_TYPE: Record<StockTxType, string> = { sale: "Venta", return: "Devolución de stock" };

function SaleStock({ order }: { order: SaleOrder }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl px-4 py-3" style={{ border: "1px solid #E2E8F0" }}>
        <span className="text-xs font-medium" style={{ color: "#475569" }}>Estado general</span>
        <StockSyncBadge sync={order.stock_sync} />
      </div>

      {/* Transacciones por ítem, apiladas */}
      <div className="flex flex-col gap-3">
        {order.items.map((it, i) => (
          <div key={i} className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5" style={{ background: "#F8FAFC", borderBottom: "1px solid #F1F5F9" }}>
              <span className="text-xs font-semibold truncate" style={{ color: "#0A1628" }}>{it.title}</span>
              <span className="font-mono flex-shrink-0" style={{ fontSize: "10.5px", color: "#94A3B8" }}>{it.quantity}× · {it.sku}</span>
            </div>
            {it.stock_transactions.length === 0 ? (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-xs" style={{ color: "#94A3B8" }}>Sin movimientos de stock</span>
                <StockSyncBadge sync="not_applicable" />
              </div>
            ) : it.stock_transactions.map((tx, k) => (
              <div key={k} className="px-4 py-3" style={{ borderTop: k ? "1px solid #F1F5F9" : "none" }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "#0A1628" }}>
                    <span className="w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold" style={{ background: tx.type === "sale" ? "#EEF2FF" : "#F1F5F9", color: tx.type === "sale" ? "#4F46E5" : "#475569" }}>{tx.type === "sale" ? "−" : "+"}</span>
                    {STOCK_TX_TYPE[tx.type]}
                  </span>
                  <StockSyncBadge sync={tx.status} />
                </div>
                <p className="mt-1 pl-7 text-xs" style={{ color: tx.document_number ? "#475569" : "#94A3B8" }}>
                  {tx.document_number ? <>Comprobante Nº <span className="font-semibold tabular-nums" style={{ color: "#0A1628" }}>{tx.document_number}</span></>
                    : tx.status === "error" ? "Sin comprobante · el sistema rechazó el movimiento, se reintenta automáticamente"
                    : "Sin comprobante · se genera al sincronizar"}
                </p>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Leyenda */}
      <div className="rounded-xl px-4 py-3 flex flex-col gap-2" style={{ background: "#F8FAFC" }}>
        <p className="text-[11px] font-semibold" style={{ color: "#475569" }}>Cómo leer esta sección</p>
        <ul className="flex flex-col gap-1 text-[11px]" style={{ color: "#64748B" }}>
          <li><b style={{ color: "#334155" }}>Venta</b>: descuenta las unidades vendidas en tu sistema de stock. <b style={{ color: "#334155" }}>Devolución de stock</b>: las vuelve a sumar cuando la orden se cancela.</li>
          <li><b style={{ color: "#334155" }}>Comprobante Nº</b>: número del documento que generó tu sistema de stock para ese movimiento.</li>
          <li><b style={{ color: "#16A34A" }}>✓ Sincronizado</b> registrado en el sistema · <b style={{ color: "#B45309" }}>⏳ Pendiente</b> en cola · <b style={{ color: "#DC2626" }}>⚠ Con error</b> rechazado, se reintenta · <b style={{ color: "#94A3B8" }}>— No aplica</b> la orden todavía no mueve stock.</li>
        </ul>
      </div>
    </div>
  );
}

function SaleDrawer({ order, onClose }: { order: SaleOrder; onClose: () => void }) {
  const ch = SALES_CHANNELS[order.channel];
  return (
    <div className="fixed inset-0 z-50 flex" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="w-[820px] max-w-full flex flex-col bg-white shadow-2xl" style={{ borderLeft: "1px solid #E2E8F0" }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <span className="text-xs" style={{ color: "#94A3B8" }}>Actualizado {fmtSaleDate(order.updated_at)} hs</span>
          <button onClick={onClose} aria-label="Cerrar" className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors" style={{ color: "#94A3B8" }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            </button>
        </div>

        <div className="flex flex-1 min-h-0">
          {/* Rail izquierdo */}
          <div className={`w-64 flex-shrink-0 flex flex-col gap-5 px-5 py-5 overflow-y-auto`} style={{ borderRight: "1px solid #F1F5F9", background: "#FAFBFC" }}>
            <SaleIdentity order={order} />
            <div className="flex flex-col gap-3 pt-4" style={{ borderTop: "1px solid #EEF2F6" }}>
                {railLabel("Historial de estados")}
                <SaleHistory order={order} compact />
            </div>
          </div>

          {/* Contenido */}
          <div className="flex-1 flex flex-col min-w-0">
              <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-7">
                <section className="flex flex-col gap-3">{sectionLabel("Productos")}<SaleProducts order={order} /></section>
                <section className="flex flex-col gap-3">{sectionLabel("Sincronización de stock")}<SaleStock order={order} /></section>
              </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: "1px solid #F1F5F9" }}>
              <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-100 transition-colors" style={{ color: "#64748B" }}>Cerrar</button>
              <a href={order.url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold transition-all hover:brightness-95"
                style={{ background: "#4F46E5", color: "white" }}>
                Ver en {ch.name}
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h4v4M13 3 7 9M11 9.5V13H3V5h3.5" /></svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VentasOrdenes({ tabs }: { tabs: ReactNode }) {
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState<SalesChannelKey | "all">("all");
  const [status, setStatus] = useState<OrderStatus | "all">("all");
  const [pageSize, setPageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [cols, setColsState] = useState<string[]>(() => { try { const v = JSON.parse(localStorage.getItem(SALE_COLS_KEY) ?? "null"); return Array.isArray(v) ? v : SALE_DEFAULT_COLS; } catch { return SALE_DEFAULT_COLS; } });
  const setCols = (c: string[]) => { setColsState(c); try { localStorage.setItem(SALE_COLS_KEY, JSON.stringify(c)); } catch { /* sin storage */ } };
  const [data, setData] = useState<Awaited<ReturnType<typeof salesApi.list>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [open, setOpen] = useState<SaleOrder | null>(null);

  useEffect(() => { setPage(0); }, [search, channel, status, pageSize]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    const t = setTimeout(() => {
      salesApi.list({ channel, status, q: search, page, page_size: pageSize })
        .then(r => { if (alive) setData(r); })
        .catch(e => { if (alive) setError(e instanceof Error ? e.message : "No pudimos cargar las órdenes."); })
        .finally(() => { if (alive) setLoading(false); });
    }, search ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [search, channel, status, page, pageSize, reload]);

  const counts = data?.counts;
  const stats: Stat[] = [
    { label: "Ventas", value: counts?.total ?? "—", sub: "total", tone: "#4F46E5", icon: ICON_LIST },
    { label: "Pendientes de pago", value: counts?.pending_payment ?? "—", tone: "#F59E0B", icon: ICON_CLOCK },
    { label: "Pagadas", value: counts?.paid ?? "—", tone: "#4F46E5", icon: ICON_CHECK },
    { label: "Entregadas", value: counts?.delivered ?? "—", tone: "#16A34A", icon: ICON_BOX },
    { label: "Canceladas", value: counts?.cancelled ?? "—", tone: "#DC2626", icon: ICON_X },
  ];
  const visible = cols.map(k => SALE_COLS.find(c => c.key === k)).filter(Boolean) as SaleCol[];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const filterCount = (channel !== "all" ? 1 : 0) + (status !== "all" ? 1 : 0);

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <header className="flex items-center gap-3 px-6 py-3 flex-shrink-0 bg-white" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#CBD5E1" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por orden, comprador, producto o SKU…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
            style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0A1628" }}
            onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.08)"; }}
            onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col p-5 min-h-0 gap-3">
        <div className="flex items-center justify-between gap-3 flex-shrink-0 flex-wrap">
          <div className="flex items-center gap-4">
            <h1 className="text-base font-bold" style={{ color: "#0A1628" }}>Ventas</h1>
            {tabs}
          </div>
          <div className="flex items-center gap-2">
            <Popover width={280} trigger={o => (
              <button className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                style={{ border: `1.5px solid ${o || filterCount ? "#4F46E5" : "#E2E8F0"}`, color: filterCount ? "#4F46E5" : "#475569", background: filterCount ? "#EEF2FF" : "white" }}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 3.5h12M4 8h8M6 12.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                Filtros
                {filterCount > 0 && <span className="ml-0.5 px-1.5 rounded-full text-white" style={{ fontSize: "9px", fontWeight: 700, background: "#4F46E5" }}>{filterCount}</span>}
              </button>
            )}>
              {() => (
                <div className="flex flex-col gap-3 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold" style={{ color: "#0A1628" }}>Filtros</span>
                    {filterCount > 0 && <button onClick={() => { setChannel("all"); setStatus("all"); }} className="text-xs font-medium hover:underline" style={{ color: "#4F46E5" }}>Limpiar</button>}
                  </div>
                  <FilterField label="Canal" value={channel} onChange={v => setChannel(v as SalesChannelKey | "all")}
                    options={[{ value: "all", label: "Todos" }, { value: "ml", label: "MercadoLibre" }, { value: "tn", label: "Tienda Nube" }]} />
                  <FilterField label="Estado" value={status} onChange={v => setStatus(v as OrderStatus | "all")}
                    options={[{ value: "all", label: "Todos" }, ...(Object.keys(ORDER_STATUS) as OrderStatus[]).map(k => ({ value: k, label: ORDER_STATUS[k].label }))]} />
                </div>
              )}
            </Popover>
            <ListingColumnManager allCols={SALE_COLS} cols={cols} setCols={setCols} defaultCols={SALE_DEFAULT_COLS} />
          </div>
        </div>

        <div className="overflow-x-auto flex-shrink-0"><div className="min-w-[720px]"><StatStrip stats={stats} /></div></div>

        <div className="flex-1 flex flex-col min-h-0 rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <div className="flex-1 overflow-auto bg-white min-h-0">
            {error ? (
              <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
                <p className="text-sm font-semibold" style={{ color: "#0A1628" }}>No pudimos cargar las órdenes</p>
                <p className="text-xs" style={{ color: "#64748B" }}>{error}</p>
                <button onClick={() => setReload(n => n + 1)} className="mt-1 px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ border: "1px solid #E2E8F0", color: "#4F46E5" }}>Reintentar</button>
              </div>
            ) : loading && !data ? <SpinnerText children="Cargando órdenes…" /> : (
              <table className="w-full text-xs border-collapse" style={{ minWidth: 900, opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}>
                <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
                  <tr className="bg-white" style={{ borderBottom: "1px solid #F1F5F9" }}>
                    {visible.map(c => (
                      <th key={c.key} className="px-3 py-3 font-semibold bg-white" style={{ color: "#94A3B8", fontSize: "10px", letterSpacing: "0.07em", textAlign: c.align ?? "left" }}>{c.label.toUpperCase()}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data && data.items.length === 0 ? (
                    <tr><td colSpan={visible.length} className="px-4 py-14 text-center text-sm" style={{ color: "#94A3B8" }}>No hay órdenes que coincidan con la búsqueda o los filtros.</td></tr>
                  ) : data?.items.map(o => (
                    <tr key={o.id} onClick={() => setOpen(o)} className="cursor-pointer transition-colors hover:bg-slate-50" style={{ borderBottom: "1px solid #F8FAFC" }}>
                      {visible.map(c => <td key={c.key} className="px-3 py-3" style={{ textAlign: c.align ?? "left" }}>{c.render(o)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: "1px solid #E2E8F0" }}>
            <span className="text-xs" style={{ color: "#94A3B8" }}>{total} {total === 1 ? "orden" : "órdenes"}</span>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs" style={{ color: "#94A3B8" }}>Mostrar</span>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="hidden sm:block text-xs px-2 py-1 rounded-lg outline-none" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
                <option>50</option><option>100</option><option>200</option>
              </select>
              <span className="text-xs font-medium" style={{ color: "#475569" }}>{total ? page * pageSize + 1 : 0} – {Math.min((page + 1) * pageSize, total)}</span>
              {(["‹", "›"] as const).map(g => {
                const dis = g === "‹" ? page === 0 : page >= pageCount - 1;
                return <button key={g} disabled={dis} onClick={() => setPage(page + (g === "‹" ? -1 : 1))} aria-label={g === "‹" ? "Página anterior" : "Página siguiente"}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm"
                  style={{ color: "#94A3B8", border: "1px solid #E2E8F0", cursor: dis ? "default" : "pointer", opacity: dis ? 0.4 : 1 }}
                  onMouseEnter={e => { if (!dis) e.currentTarget.style.background = "#F1F5F9"; }}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{g}</button>;
              })}
            </div>
          </div>
        </div>
      </div>
      {open && <SaleDrawer order={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

// ─── Ventas › Reportes ──────────────────────────────────────────────────────────
// Mock de API: GET /orders/report?days=7|30|90&channel=all|ml|tn
// Neto = suma de órdenes no canceladas. % de cancelación sobre el total de órdenes creadas.
type ReportDay = { date: string; orders: number; net: number; by_channel: Record<SalesChannelKey, { orders: number; net: number }> };
const salesReportApi = {
  async get(p: { days: 7 | 30 | 90; channel: SalesChannelKey | "all" }) {
    await wait(500);
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (p.days - 1));
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const days: ReportDay[] = Array.from({ length: p.days }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return { date: key(d), orders: 0, net: 0, by_channel: { ml: { orders: 0, net: 0 }, tn: { orders: 0, net: 0 } } }; });
    const idx = new Map(days.map((d, i) => [d.date, i]));
    let cancelledCount = 0, cancelledAmount = 0;
    SALE_ORDERS.forEach(o => {
      if (p.channel !== "all" && o.channel !== p.channel) return;
      const i = idx.get(key(new Date(o.created_at))); if (i === undefined) return;
      if (o.status === "cancelled") { cancelledCount++; cancelledAmount += o.total; return; }
      days[i].orders++; days[i].net += o.total;
      days[i].by_channel[o.channel].orders++; days[i].by_channel[o.channel].net += o.total;
    });
    const net = days.reduce((a, d) => a + d.net, 0), orders = days.reduce((a, d) => a + d.orders, 0);
    const all = orders + cancelledCount;
    const by_channel = (["ml", "tn"] as const).reduce((acc, c) => {
      acc[c] = { net: days.reduce((a, d) => a + d.by_channel[c].net, 0), orders: days.reduce((a, d) => a + d.by_channel[c].orders, 0) };
      return acc;
    }, {} as Record<SalesChannelKey, { net: number; orders: number }>);
    return {
      days, by_channel, net, orders, orders_per_day: orders / p.days, avg_ticket: orders ? net / orders : 0,
      cancelled: { count: cancelledCount, amount: cancelledAmount, pct: all ? (cancelledCount / all) * 100 : 0 },
    };
  },
};

const fmtCompact = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(1).replace(".", ",")} M` : n >= 1e3 ? `$${Math.round(n / 1e3)} k` : `$${Math.round(n)}`;
const dayLabel = (iso: string, long = false) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return long ? dt.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" }) : `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
};

const CHANNEL_LINE: Record<SalesChannelKey, string> = { ml: "#F59E0B", tn: "#4F46E5" };

function RevenueLineChart({ days, compare }: { days: ReportDay[]; compare?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  const H = 280, pl = 56, pr = 16, pt = 16, pb = 28;
  const iw = Math.max(10, w - pl - pr), ih = H - pt - pb;
  const series = compare
    ? (["ml", "tn"] as const).map(c => ({ key: c, color: CHANNEL_LINE[c], label: SALES_CHANNELS[c].name, net: days.map(d => d.by_channel[c].net), orders: days.map(d => d.by_channel[c].orders) }))
    : [{ key: "all", color: "#4F46E5", label: "Total", net: days.map(d => d.net), orders: days.map(d => d.orders) }];
  const rawMax = Math.max(1, ...series.flatMap(sr => sr.net));
  const step = Math.pow(10, Math.floor(Math.log10(rawMax / 4)));
  const tick = [1, 2, 2.5, 5, 10].map(m => m * step).find(s => s * 4 >= rawMax) ?? step * 10;
  const max = tick * 4;
  const x = (i: number) => pl + (days.length === 1 ? iw / 2 : (i / (days.length - 1)) * iw);
  const y = (v: number) => pt + ih - (v / max) * ih;
  const pathOf = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const area = `${pathOf(series[0].net)}L${x(days.length - 1)},${pt + ih}L${x(0)},${pt + ih}Z`;
  const every = Math.ceil(days.length / Math.max(2, Math.floor(iw / 70)));
  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pl) / iw) * (days.length - 1));
    setHover(Math.max(0, Math.min(days.length - 1, i)));
  };
  const hd = hover !== null ? days[hover] : null;
  return (
    <div ref={ref} className="relative w-full" style={{ height: H }}>
      <svg width={w} height={H} onMouseMove={onMove} onMouseLeave={() => setHover(null)} className="block">
        <defs>
          <linearGradient id="rev-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#4F46E5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map(k => (
          <g key={k}>
            <line x1={pl} x2={w - pr} y1={y(tick * k)} y2={y(tick * k)} stroke={k ? "#F1F5F9" : "#E2E8F0"} />
            <text x={pl - 10} y={y(tick * k)} dy="0.32em" textAnchor="end" fontSize="10.5" fill="#94A3B8" style={{ fontVariantNumeric: "tabular-nums" }}>{fmtCompact(tick * k)}</text>
          </g>
        ))}
        {days.map((d, i) => (i % every === 0 || i === days.length - 1) && (days.length - 1 - i >= every / 2 || i === days.length - 1) ? (
          <text key={d.date} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#94A3B8">{dayLabel(d.date)}</text>
        ) : null)}
        {!compare && <path d={area} fill="url(#rev-fill)" />}
        {series.map(sr => <path key={sr.key} d={pathOf(sr.net)} fill="none" stroke={sr.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />)}
        {hd && hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pt} y2={pt + ih} stroke="#CBD5E1" strokeDasharray="3 3" />
            {series.map(sr => <circle key={sr.key} cx={x(hover)} cy={y(sr.net[hover])} r="4.5" fill="white" stroke={sr.color} strokeWidth="2" />)}
          </g>
        )}
      </svg>
      {hd && hover !== null && (
        <div className="absolute pointer-events-none rounded-xl bg-white px-3 py-2 shadow-lg" style={{
          border: "1px solid #E2E8F0", top: Math.max(0, y(Math.max(...series.map(sr => sr.net[hover]))) - (compare ? 110 : 72)),
          left: Math.min(Math.max(x(hover) - 90, 0), w - 180), width: 180,
        }}>
          <p className="text-[11px] font-semibold capitalize" style={{ color: "#64748B" }}>{dayLabel(hd.date, true)}</p>
          {compare ? (
            <div className="flex flex-col gap-1 mt-1">
              {series.map(sr => (
                <div key={sr.key} className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sr.color }} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] font-bold tabular-nums" style={{ color: "#0A1628" }}>{fmt(sr.net[hover])}</span>
                    <span className="block text-[10.5px]" style={{ color: "#94A3B8" }}>{sr.label} · {sr.orders[hover]} {sr.orders[hover] === 1 ? "orden" : "órdenes"}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : (<>
            <p className="text-sm font-bold tabular-nums" style={{ color: "#0A1628" }}>{fmt(hd.net)}</p>
            <p className="text-[11px]" style={{ color: "#94A3B8" }}>{hd.orders} {hd.orders === 1 ? "orden" : "órdenes"}</p>
          </>)}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string | number>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="flex items-center p-0.5 rounded-xl" style={{ background: "#F1F5F9" }}>
      {options.map(o => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} onClick={() => onChange(o.value)} className="px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all whitespace-nowrap"
            style={{ background: on ? "white" : "transparent", color: on ? "#0A1628" : "#64748B", boxShadow: on ? "0 1px 2px rgba(15,23,42,0.08)" : "none" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const ICON_TICKET = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2.5 4.5h11v2a1.5 1.5 0 0 0 0 3v2h-11v-2a1.5 1.5 0 0 0 0-3v-2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /><path d="M9.5 4.5v7" stroke="currentColor" strokeWidth="1.3" strokeDasharray="1.5 1.5" /></svg>;
const ICON_MONEY = <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1.8" y="4" width="12.4" height="8" rx="1.8" stroke="currentColor" strokeWidth="1.4" /><circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.4" /></svg>;

function VentasReportes({ tabs }: { tabs: ReactNode }) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [channel, setChannel] = useState<SalesChannelKey | "all">("all");
  const [compare, setCompare] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof salesReportApi.get>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    salesReportApi.get({ days, channel })
      .then(r => { if (alive) setData(r); })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "No pudimos cargar el reporte."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [days, channel, reload]);

  const pct = (n: number) => `${n.toFixed(1).replace(".", ",")}%`;
  const stats: Stat[] = [
    { label: "Total facturado", value: data ? fmt(data.net) : "—", sub: "neto", tone: "#4F46E5", icon: ICON_MONEY },
    { label: "Órdenes", value: data ? data.orders.toLocaleString("es-AR") : "—", sub: data ? `${data.orders_per_day.toFixed(1).replace(".", ",")}/día` : undefined, tone: "#0EA5E9", icon: ICON_LIST },
    { label: "Ticket promedio", value: data ? fmt(Math.round(data.avg_ticket)) : "—", tone: "#16A34A", icon: ICON_TICKET },
    { label: "Cancelaciones", value: data ? data.cancelled.count : "—", sub: data ? `${fmt(data.cancelled.amount)} · ${pct(data.cancelled.pct)}` : undefined, tone: "#DC2626", icon: ICON_X },
  ];
  const empty = data && data.orders === 0 && data.cancelled.count === 0;

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0">
      <header className="flex items-center justify-between gap-3 px-6 py-3 flex-shrink-0 bg-white flex-wrap" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <Segmented value={days} onChange={setDays} options={[{ value: 7, label: "7 días" }, { value: 30, label: "30 días" }, { value: 90, label: "90 días" }]} />
        <div className="flex items-center gap-3">
          <Segmented value={channel} onChange={v => { setChannel(v); if (v !== "all") setCompare(false); }} options={[{ value: "all", label: "Todos" }, { value: "ml", label: "MercadoLibre" }, { value: "tn", label: "Tienda Nube" }]} />
          <button role="switch" aria-checked={compare} onClick={() => { setCompare(c => !c); setChannel("all"); }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors"
            style={{ border: `1.5px solid ${compare ? "#4F46E5" : "#E2E8F0"}`, background: compare ? "#EEF2FF" : "white", color: compare ? "#4F46E5" : "#475569" }}>
            <span className="relative w-6 h-3.5 rounded-full transition-colors" style={{ background: compare ? "#4F46E5" : "#CBD5E1" }}>
              <span className="absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all" style={{ left: compare ? 12 : 2 }} />
            </span>
            Comparar canales
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto flex flex-col p-5 min-h-0 gap-3">
        <div className="flex items-center gap-4 flex-shrink-0">
          <h1 className="text-base font-bold" style={{ color: "#0A1628" }}>Ventas</h1>
          {tabs}
        </div>

        {error ? (
          <div className="rounded-2xl bg-white" style={{ border: "1px solid #E2E8F0" }}>
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center px-6">
              <p className="text-sm font-semibold" style={{ color: "#0A1628" }}>No pudimos cargar el reporte</p>
              <p className="text-xs" style={{ color: "#64748B" }}>{error}</p>
              <button onClick={() => setReload(n => n + 1)} className="mt-1 px-3 py-1.5 rounded-xl text-xs font-semibold" style={{ border: "1px solid #E2E8F0", color: "#4F46E5" }}>Reintentar</button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto flex-shrink-0">
              <div className="min-w-[680px]" style={{ opacity: loading && data ? 0.55 : 1, transition: "opacity .15s" }}>
                {loading && !data ? (
                  <div className="flex rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="flex-1 flex items-center gap-3 px-4 py-3" style={{ borderLeft: i ? "1px solid #F1F5F9" : "none" }}>
                        <span className="w-9 h-9 rounded-xl animate-pulse" style={{ background: "#F1F5F9" }} />
                        <div className="flex flex-col gap-1.5"><span className="h-4 w-20 rounded animate-pulse" style={{ background: "#F1F5F9" }} /><span className="h-3 w-14 rounded animate-pulse" style={{ background: "#F1F5F9" }} /></div>
                      </div>
                    ))}
                  </div>
                ) : <StatStrip stats={stats} />}
              </div>
            </div>

            <div className="rounded-2xl bg-white flex-shrink-0" style={{ border: "1px solid #E2E8F0" }}>
              <div className="flex items-baseline justify-between gap-3 px-5 pt-4 pb-2">
                <div>
                  <h2 className="text-sm font-semibold" style={{ color: "#0A1628" }}>Ingresos por día</h2>
                  <p className="text-xs" style={{ color: "#94A3B8" }}>Monto neto · últimos {days} días{compare ? " · por canal" : channel !== "all" ? ` · ${SALES_CHANNELS[channel].name}` : ""}</p>
                </div>
                {compare && data && (
                  <div className="flex items-center gap-5">
                    {(["ml", "tn"] as const).map(c => (
                      <div key={c} className="flex items-start gap-2">
                        <span className="w-2.5 h-2.5 rounded-full mt-1" style={{ background: CHANNEL_LINE[c] }} />
                        <div>
                          <p className="text-[11px] font-medium" style={{ color: "#64748B" }}>{SALES_CHANNELS[c].name}</p>
                          <p className="text-sm font-bold tabular-nums" style={{ color: "#0A1628" }}>
                            {fmt(data.by_channel[c].net)}{" "}
                            <span className="text-[11px] font-medium" style={{ color: "#94A3B8" }}>{data.net ? Math.round((data.by_channel[c].net / data.net) * 100) : 0}% · {data.by_channel[c].orders} órd.</span>
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-3 pb-3">
                {loading && !data ? <div style={{ height: 280 }} className="flex items-center justify-center"><SpinnerText children="Cargando reporte…" /></div>
                  : empty ? (
                    <div style={{ height: 280 }} className="flex flex-col items-center justify-center gap-1 text-center">
                      <p className="text-sm font-semibold" style={{ color: "#0A1628" }}>Sin datos en el rango</p>
                      <p className="text-xs" style={{ color: "#94A3B8" }}>Probá con un rango más amplio u otro canal.</p>
                    </div>
                  ) : data && <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }}><RevenueLineChart days={data.days} compare={compare} /></div>}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Ventas() {
  const [tab, setTab] = useState<"ordenes" | "reportes">("ordenes");
  const tabs = (
    <div className="flex items-center gap-5" role="tablist">
      {([["ordenes", "Órdenes"], ["reportes", "Reportes"]] as const).map(([k, l]) => (
        <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="py-1 text-xs font-semibold transition-colors"
          style={{ color: tab === k ? "#0A1628" : "#94A3B8", borderBottom: `2px solid ${tab === k ? "#4F46E5" : "transparent"}` }}>
          {l}
        </button>
      ))}
    </div>
  );
  return tab === "ordenes" ? <VentasOrdenes tabs={tabs} /> : <VentasReportes tabs={tabs} />;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard() {
  // Deep link: /preguntas?open={id} entra directo a la conversación.
  const [active, setActive] = useState(() => (/\/preguntas/i.test(window.location.pathname) || readOpenParam()) ? "Preguntas" : "Inventario");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedTab, setSelectedTab] = useState<"producto" | "ml" | "tn">("producto");
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [cols, setColsState] = useState<ColKey[]>(loadCols);
  const setCols = (c: ColKey[]) => { setColsState(c); saveCols(c); };
  const [mlFilters, setMlFilters] = useState<MlFilters>(DEFAULT_ML_FILTERS);
  const [tnFilters, setTnFilters] = useState<TnFilters>(DEFAULT_TN_FILTERS);
  const [mlCols, setMlColsState] = useState<string[]>(mlColStore.load);
  const setMlCols = (c: string[]) => { setMlColsState(c); mlColStore.save(c); };
  const [tnCols, setTnColsState] = useState<string[]>(tnColStore.load);
  const setTnCols = (c: string[]) => { setTnColsState(c); tnColStore.save(c); };

  const isML = active === "MercadoLibre";
  const isTN = active === "Tienda Nube";
  const mlRows = mlListingRows(search, mlFilters);
  const tnRows = tnListingRows(search, tnFilters);
  const resultCount = isML ? mlRows.length : isTN ? tnRows.length : filterProducts(search, filters).length;
  const noun = isML || isTN ? "publicación" : "producto";
  const nounPl = isML || isTN ? "publicaciones" : "productos";
  const pageTitle = isML ? "MercadoLibre" : isTN ? "Tienda Nube" : "Inventario";
  const openProduct = (p: Product, tab: "producto" | "ml" | "tn") => { setSelectedTab(tab); setSelected(p); };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "#F1F5F9", fontFamily: "'Inter', sans-serif" }}>
      <Sidebar active={active} onActive={setActive} />
      {active === "Configuración" ? (
        <div className="flex flex-col flex-1 min-w-0">
          <Configuracion />
        </div>
      ) : active === "Usuarios" ? (
        <div className="flex flex-col flex-1 min-w-0">
          <Usuarios />
        </div>
      ) : active === "Ventas" ? (
        <Ventas />
      ) : active === "Envíos" ? (
        <Shipments />
      ) : active === "Competencia" ? (
        <div className="flex flex-col flex-1 min-w-0"><ComingSoon title="Competencia" icon="competencia" /></div>
      ) : active === "Prompts AI" ? (
        <div className="flex flex-col flex-1 min-w-0"><PromptsAI /></div>
      ) : active === "Preguntas" ? (
        <Preguntas onOpenProduct={p => openProduct(p, "producto")} onNavigate={setActive} />
      ) : (
      <div className="flex flex-col flex-1 min-w-0">
        <header className="flex items-center gap-3 px-6 py-3 flex-shrink-0 bg-white" style={{ borderBottom: "1px solid #E2E8F0" }}>
          <div className="flex-1 relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#CBD5E1" }}>
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                <path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto…"
              className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all"
              style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0A1628" }}
              onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.08)"; }}
              onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
          </div>
        </header>

        <div className="flex-1 overflow-hidden flex flex-col p-5 min-h-0 gap-3">
          <div className="flex items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-baseline gap-2.5">
              <h1 className="text-base font-bold" style={{ color: "#0A1628" }}>{pageTitle}</h1>
              <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>
                {resultCount} {resultCount === 1 ? noun : nounPl}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isML ? (
                <>
                  <MlFilterPanel filters={mlFilters} setFilters={setMlFilters} />
                  <ListingColumnManager allCols={ML_LISTING_COLS} cols={mlCols} setCols={setMlCols} defaultCols={ML_DEFAULT_COLS} />
                  <ExportCsvButton scope="ml" columns={ML_LISTING_COLS} rows={mlRows} />
                </>
              ) : isTN ? (
                <>
                  <TnFilterPanel filters={tnFilters} setFilters={setTnFilters} />
                  <ListingColumnManager allCols={TN_LISTING_COLS} cols={tnCols} setCols={setTnCols} defaultCols={TN_DEFAULT_COLS} />
                  <ExportCsvButton scope="tn" columns={TN_LISTING_COLS} rows={tnRows} />
                </>
              ) : (
                <>
                  <FilterPanel filters={filters} setFilters={setFilters} />
                  <ColumnManager cols={cols} setCols={setCols} />
                  <ExportCsvButton scope="inventario" columns={COLUMNS} rows={filterProducts(search, filters)} />
                </>
              )}
            </div>
          </div>

          {(isML || isTN) && (
            <DomainSummary domain={isML ? "ml" : "tn"} variant="strip" />
          )}

          <StatusVariantContext.Provider value="chip">
            {isML ? (
              <ListingTable rows={mlRows} cols={mlCols} setCols={setMlCols} colMap={ML_COL_MAP} onSelect={p => openProduct(p, "ml")}
                empty="No hay publicaciones de MercadoLibre que coincidan con los filtros." />
            ) : isTN ? (
              <ListingTable rows={tnRows} cols={tnCols} setCols={setTnCols} colMap={TN_COL_MAP} onSelect={p => openProduct(p, "tn")}
                empty="No hay publicaciones de Tienda Nube que coincidan con los filtros." />
            ) : (
              <ProductTable search={search} filters={filters} cols={cols} setCols={setCols} onSelect={p => openProduct(p, "producto")} />
            )}
          </StatusVariantContext.Provider>
        </div>

        <div className="flex items-center justify-between px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: "1px solid #E2E8F0" }}>
          <span className="text-xs" style={{ color: "#94A3B8" }}>{resultCount} resultados · Click en un producto para ver detalles</span>
          <div className="flex items-center gap-3">
            <span className="text-xs" style={{ color: "#94A3B8" }}>Mostrar</span>
            <select className="text-xs px-2 py-1 rounded-lg outline-none" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
              <option>50</option><option>100</option><option>200</option>
            </select>
            <span className="text-xs font-medium" style={{ color: "#475569" }}>1 – 50</span>
            {["‹", "›"].map(ch => (
              <button key={ch} className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm"
                style={{ color: "#94A3B8", border: "1px solid #E2E8F0" }}
                onMouseEnter={e => e.currentTarget.style.background = "#F1F5F9"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {ch}
              </button>
            ))}
          </div>
        </div>
      </div>
      )}

      {selected && <DrawerModal product={selected} initialTab={selectedTab} onClose={() => setSelected(null)} />}

      <SupportFab />
    </div>
  );
}

// ─── Configuración ──────────────────────────────────────────────────────────────

function SettingsCard({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-white p-6" style={{ border: "1px solid #E2E8F0" }}>{children}</div>;
}

function CardHeader({ icon, title, color = "#4F46E5" }: { icon: ReactNode; title: string; color?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <span style={{ color, display: "flex" }}>{icon}</span>
      <h2 className="text-base font-bold" style={{ color: "#0A1628" }}>{title}</h2>
    </div>
  );
}

function SettingsInput({ label, type = "text", defaultValue, placeholder }: { label: string; type?: string; defaultValue?: string; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{label}</span>
      <input type={type} defaultValue={defaultValue} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
        style={{ border: "1px solid #E2E8F0", color: "#0A1628", background: "white" }}
        onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"; }}
        onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
    </div>
  );
}

// Input with optional secret reveal (eye) and read-only copy button — for OAuth credentials
function CredWarningModal({ label, onCancel, onConfirm }: { label: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(10,22,40,0.45)" }} onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl overflow-hidden shadow-xl" style={{ background: "white" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 px-6 pt-6">
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#FEF3C7", color: "#D97706" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></svg>
          </span>
          <div>
            <h3 className="text-base font-bold" style={{ color: "#0A1628" }}>Vas a editar una credencial</h3>
            <p className="text-sm mt-1" style={{ color: "#64748B" }}>Modificar <b style={{ color: "#0A1628" }}>{label}</b> puede romper la conexión con la plataforma y detener la sincronización de productos, ventas y envíos.</p>
            <p className="text-sm mt-2" style={{ color: "#64748B" }}>Editá solo si sabés lo que estás haciendo.</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-5 mt-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Cancelar</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors" style={{ background: "#D97706" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#B45309")} onMouseLeave={e => (e.currentTarget.style.background = "#D97706")}>
            Sí, quiero editar
          </button>
        </div>
      </div>
    </div>
  );
}

function CredField({ label, defaultValue, placeholder, secret = false, readOnly = false, mono = false, hint, lockable = false }: {
  label: string; defaultValue?: string; placeholder?: string; secret?: boolean; readOnly?: boolean; mono?: boolean; hint?: string; lockable?: boolean;
}) {
  const [show, setShow] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const [locked, setLocked] = useState(lockable);
  const [warn, setWarn] = useState(false);
  const copy = () => {
    if (!defaultValue) return;
    navigator.clipboard?.writeText(defaultValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  const inputReadOnly = readOnly || locked;
  const trailing = (secret ? 1 : 0) + (readOnly ? 1 : 0) + (lockable ? 1 : 0);
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{label}</span>
      <div className="relative">
        <input type={secret && !show ? "password" : "text"} defaultValue={defaultValue} placeholder={placeholder} readOnly={inputReadOnly}
          onMouseDown={locked ? e => { e.preventDefault(); setWarn(true); } : undefined}
          className="w-full pl-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
          style={{ paddingRight: 12 + trailing * 30, border: "1px solid #E2E8F0", color: inputReadOnly ? "#475569" : "#0A1628", background: inputReadOnly ? "#F8FAFC" : "white", fontFamily: mono ? "ui-monospace, monospace" : undefined, cursor: locked ? "pointer" : undefined }}
          onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"; }}
          onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
          {secret && (
            <button onClick={() => setShow(s => !s)} title={show ? "Ocultar" : "Mostrar"} className="p-1.5 rounded-md transition-colors hover:bg-slate-100" style={{ color: "#94A3B8" }}>
              {show
                ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" /></svg>
                : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4z" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" /><path d="M3 3l10 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>}
            </button>
          )}
          {lockable && (
            <button onClick={() => { if (locked) setWarn(true); else setLocked(true); }} title={locked ? "Editar (con advertencia)" : "Bloquear edición"} className="p-1.5 rounded-md transition-colors hover:bg-slate-100" style={{ color: locked ? "#94A3B8" : "#D97706" }}>
              {locked
                ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.3" /></svg>
                : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="3.5" y="7" width="9" height="6.5" rx="1.3" stroke="currentColor" strokeWidth="1.3" /><path d="M5.5 7V5a2.5 2.5 0 0 1 4.9-.7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>}
            </button>
          )}
          {readOnly && (
            <button onClick={copy} title="Copiar" className="p-1.5 rounded-md transition-colors hover:bg-slate-100" style={{ color: copied ? "#16A34A" : "#94A3B8" }}>
              {copied
                ? <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                : <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M3 10V4a1 1 0 0 1 1-1h6" stroke="currentColor" strokeWidth="1.3" /></svg>}
            </button>
          )}
        </div>
      </div>
      {hint && <span style={{ fontSize: "10px", color: "#94A3B8" }}>{hint}</span>}
      {warn && <CredWarningModal label={label} onCancel={() => setWarn(false)} onConfirm={() => { setLocked(false); setWarn(false); }} />}
    </div>
  );
}

function PrimaryBtn({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors" style={{ background: "#4F46E5" }}
      onMouseEnter={e => (e.currentTarget.style.background = "#4338CA")} onMouseLeave={e => (e.currentTarget.style.background = "#4F46E5")}>
      {children}
    </button>
  );
}

// ── Guía paso a paso para crear la app de MercadoLibre ──
function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return (
    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
      <code className="flex-1 text-xs break-all" style={{ color: "#0A1628", fontFamily: "ui-monospace, monospace" }}>{value}</code>
      <button onClick={copy} className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-md flex-shrink-0 transition-colors"
        style={{ color: copied ? "#16A34A" : "#4F46E5", background: copied ? "#DCFCE7" : "#EEF2FF" }}>
        {copied
          ? <><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>Copiado</>
          : <><svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M3 10V4a1 1 0 0 1 1-1h6" stroke="currentColor" strokeWidth="1.3" /></svg>Copiar</>}
      </button>
    </div>
  );
}

function CheckList({ title, items }: { title?: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      {title && <p className="text-xs font-semibold" style={{ color: "#334155" }}>{title}</p>}
      <div className="flex flex-col gap-1">
        {items.map(it => (
          <div key={it} className="flex items-start gap-2 text-xs" style={{ color: "#475569" }}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px"><rect x="1.5" y="1.5" width="13" height="13" rx="3.5" fill="#DCFCE7" /><path d="M4.5 8l2.2 2.2L11.5 5.5" stroke="#16A34A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {it}
          </div>
        ))}
      </div>
    </div>
  );
}

function InfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E" }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-px"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 7.2v3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="5.2" r="0.6" fill="currentColor" /></svg>
      <div>{children}</div>
    </div>
  );
}

const OAUTH_FLOWS = ["Authorization Code", "Client Credentials", "Refresh Token"];
const MELI_SCOPES = ["Usuarios", "Comunicaciones pre y post ventas", "Publicación y sincronización", "Publicidad de un producto", "Facturación de una venta", "Métricas del negocio", "Promociones, cupones y descuentos de una venta", "Venta y envíos de un producto"];
const WEBHOOK_TOPICS = ["orders", "messages", "prices", "items", "catalog", "shipments", "promotions", "Post Purchase", "others"];

const GUIDE_STEPS: { title: string; body: ReactNode }[] = [
  {
    title: "Accedé al DevCenter",
    body: (
      <>
        <p className="text-xs" style={{ color: "#475569" }}>Entrá al portal de desarrolladores de MercadoLibre e iniciá sesión con tu cuenta.</p>
        <a href="https://developers.mercadolibre.com.ar/devcenter" target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 w-fit text-xs font-semibold px-3 py-2 rounded-lg transition-colors" style={{ color: "#2D3277", background: "#FFE600" }}>
          Abrir DevCenter
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M5 2h7v7M12 2L5.5 8.5M9 11.5H3.5A1.5 1.5 0 0 1 2 10V4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </>
    ),
  },
  {
    title: "Creá una nueva aplicación",
    body: <p className="text-xs" style={{ color: "#475569" }}>Buscá la opción <b>“Crear nueva aplicación”</b> o <b>“Mis aplicaciones”</b> y empezá una nueva.</p>,
  },
  {
    title: "Completá la información básica",
    body: (
      <>
        <p className="text-xs" style={{ color: "#475569" }}>Vas a tener que cargar estos datos:</p>
        <CheckList items={["Nombre (debe ser único)", "Nombre corto (Short Name)", "Descripción (hasta 150 caracteres)", "Logo (opcional)"]} />
        <CheckList title="¿Cuál es el propósito de tu solución? — elegí:" items={["Negocios"]} />
        <CheckList title="Rango de usuarios — seleccioná:" items={["1-10"]} />
      </>
    ),
  },
  {
    title: "Configurá autenticación y permisos",
    body: (
      <>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold" style={{ color: "#334155" }}>Redirect URI — copiá y pegá esta:</p>
          <CopyValue value="https://httpbin.org/get" />
          <InfoNote>Solo pegá la URL en el campo. <b>No toques “Agregar Redirect URI”</b>, porque agrega campos de más que no vas a necesitar.</InfoNote>
        </div>
        <CheckList title="Flujos OAuth — seleccioná todos:" items={OAUTH_FLOWS} />
        <InfoNote><b>Requiere PKCE:</b> dejalo en blanco.</InfoNote>
        <CheckList title="Negocios — elegí solo:" items={["Mercado Libre"]} />
        <CheckList title="Scopes (permisos) — activalos todos:" items={MELI_SCOPES} />
        <InfoNote>En cada permiso activá <b>lectura y escritura</b> siempre que esté disponible. Algunos no tienen las dos opciones: en ese caso, dejá la que ofrezca.</InfoNote>
      </>
    ),
  },
  {
    title: "Configurá los webhooks (notificaciones)",
    body: (
      <>
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-semibold" style={{ color: "#334155" }}>URL del webhook — pegá exactamente esta:</p>
          <CopyValue value="https://test-wallet.guiaslocales.cloud/webhooks/meli" />
        </div>
        <CheckList title="Tópicos — suscribite a todos los ítems de estos:" items={WEBHOOK_TOPICS} />
      </>
    ),
  },
  {
    title: "Traé tus credenciales",
    body: (
      <>
        <p className="text-xs" style={{ color: "#475569" }}>Ya creaste la aplicación. Ahora, en la lista de tus aplicaciones:</p>
        <CheckList items={["Tocá los 3 puntos (⋯) de tu aplicación", "Elegí “Editar”", "Ahí vas a ver y poder copiar el App ID y el Client Secret"]} />
        <InfoNote>Copiá el <b>App ID</b> y el <b>Client Secret</b> y pegalos en los campos de abajo al finalizar.</InfoNote>
      </>
    ),
  },
];

type MeliCreds = { appId: string; secret: string; userId: string; code: string };

function OnbInput({ label, value, onChange, placeholder, secret = false, mono = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; secret?: boolean; mono?: boolean }) {
  const [show, setShow] = useState(!secret);
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{label}</span>
      <div className="relative">
        <input type={secret && !show ? "password" : "text"} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className="w-full pl-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
          style={{ paddingRight: secret ? 42 : 12, border: "1px solid #E2E8F0", color: "#0A1628", background: "white", fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}
          onFocus={e => { e.currentTarget.style.borderColor = "#4F46E5"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }} />
        {secret && (
          <button onClick={() => setShow(x => !x)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors hover:bg-slate-100" style={{ color: "#94A3B8" }} aria-label="Mostrar / ocultar">
            {show
              ? <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" /><circle cx="10" cy="10" r="2.5" /></svg>
              : <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l12 12M8.5 8.6A2.5 2.5 0 0 0 11.4 11.5M6 6.2C3.6 7.6 2 10 2 10s3 5.5 8 5.5c1.3 0 2.5-.3 3.5-.8M11 4.6C10.7 4.5 10.3 4.5 10 4.5 5 4.5 2 10 2 10" /></svg>}
          </button>
        )}
      </div>
    </div>
  );
}

function MeliOnboarding({ onFinish, onExit }: { onFinish: (c: MeliCreds) => void; onExit?: () => void }) {
  const [i, setI] = useState(0);
  const [appId, setAppId] = useState("");
  const [secret, setSecret] = useState("");
  const [userId, setUserId] = useState("");
  const [code, setCode] = useState("");

  const CREDS_STEP = GUIDE_STEPS.length - 1;  // last guide step: traé + cargá credenciales
  const AUTH_STEP = GUIDE_STEPS.length;       // authorize + paste code
  const TOTAL = GUIDE_STEPS.length + 1;
  const last = i === TOTAL - 1;

  const authUrl = `https://auth.mercadolibre.com.ar/authorization?response_type=code&client_id=${encodeURIComponent(appId.trim())}&redirect_uri=https://httpbin.org/get`;

  const title = i === AUTH_STEP ? "Autorizá la conexión" : GUIDE_STEPS[i]?.title ?? "";
  const canNext = i === CREDS_STEP ? Boolean(appId.trim() && secret.trim() && userId.trim()) : i === AUTH_STEP ? Boolean(code.trim()) : true;

  let body: ReactNode;
  if (i === CREDS_STEP) {
    body = (
      <>
        {GUIDE_STEPS[CREDS_STEP].body}
        <div className="pt-1 flex flex-col gap-3">
          <OnbInput label="App ID (Client ID)" value={appId} onChange={setAppId} placeholder="Ej. 1234567890123456" mono />
          <OnbInput label="Client Secret" value={secret} onChange={setSecret} placeholder="Clave secreta de la aplicación" secret mono />
        </div>
        <div className="pt-1 flex flex-col gap-2.5">
          <p className="text-xs" style={{ color: "#475569" }}>Por último, necesitamos el <b>ID de usuario</b>. En la misma lista de aplicaciones:</p>
          <CheckList items={["Tocá los 3 puntos (⋯) de tu aplicación", "Elegí “Administrar permisos”", "Copiá el ID del usuario y traelo acá"]} />
          <OnbInput label="ID de usuario" value={userId} onChange={setUserId} placeholder="Ej. 307027338" mono />
        </div>
      </>
    );
  } else if (i === AUTH_STEP) {
    body = (
      <>
        <p className="text-xs" style={{ color: "#475569" }}>Ahora vamos a autorizar la conexión con tu cuenta de MercadoLibre usando el App ID que cargaste.</p>
        <a href={authUrl} target="_blank" rel="noreferrer"
          className="w-fit inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-transform hover:scale-[1.02]" style={{ background: "#FFE600", color: "#2D3277" }}>
          Ir a autorizar en MercadoLibre
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h7v7M13 3 6.5 9.5M11 9v4H3V5h4" /></svg>
        </a>
        <CheckList title="Qué va a pasar" items={[
          "Se abre MercadoLibre con el aviso: “Autorizá la conexión de la app … con tu cuenta de Mercado Libre”.",
          "Tocá Autorizar con tu cuenta.",
          "Vas a llegar a una página con un texto (JSON). Buscá el valor de \"code\".",
        ]} />
        <div className="rounded-lg p-3 text-xs leading-5 overflow-x-auto" style={{ background: "#0A1628", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          <div style={{ color: "#94A3B8" }}>{"{"}</div>
          <div style={{ color: "#94A3B8" }}>&nbsp;&nbsp;"args": {"{"}</div>
          <div style={{ color: "#94A3B8" }}>&nbsp;&nbsp;&nbsp;&nbsp;"code": <span style={{ color: "#4ADE80" }}>"TG-6ab9a8051961120001a3589c-307027338"</span></div>
          <div style={{ color: "#94A3B8" }}>&nbsp;&nbsp;{"}"},</div>
          <div style={{ color: "#475569" }}>&nbsp;&nbsp;...</div>
          <div style={{ color: "#94A3B8" }}>{"}"}</div>
        </div>
        <InfoNote>Copiá <b>solo el valor</b>, sin las comillas. Ejemplo: <span style={{ fontFamily: "ui-monospace, monospace" }}>TG-6ab9a8051961120001a3589c-307027338</span></InfoNote>
        <OnbInput label="Código de autorización (code)" value={code} onChange={setCode} placeholder="TG-..." mono />
      </>
    );
  } else {
    body = GUIDE_STEPS[i].body;
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #C7D2FE", background: "white" }}>
      <div className="flex items-center gap-3 px-6 py-5" style={{ background: "#EEF2FF" }}>
        <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#FFF7D6", color: "#F59E0B" }}>
          <NavIcon name="ml" size={22} />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-bold" style={{ color: "#0A1628" }}>Conectá tu cuenta de MercadoLibre</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>Creá tu aplicación, cargá tus credenciales y autorizá la conexión siguiendo esta guía.</p>
        </div>
        {onExit && (
          <button onClick={onExit} title="Salir de la guía" className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:bg-white" style={{ color: "#64748B" }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5 5 15" /></svg>
          </button>
        )}
      </div>

      <div className="px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL }).map((_, j) => (
            <button key={j} onClick={() => { if (j <= i) setI(j); }} className="h-1.5 rounded-full transition-all" style={{ flex: 1, background: j <= i ? "#4F46E5" : "#E2E8F0", cursor: j <= i ? "pointer" : "default" }} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: "#EEF2FF", color: "#4F46E5" }}>{i + 1}</span>
          <div>
            <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94A3B8" }}>Paso {i + 1} de {TOTAL}</p>
            <h3 className="text-sm font-bold" style={{ color: "#0A1628" }}>{title}</h3>
          </div>
        </div>
        <div className="flex flex-col gap-3 min-h-[140px]">{body}</div>
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ border: "1px solid #E2E8F0", color: i === 0 ? "#CBD5E1" : "#475569", background: "white", cursor: i === 0 ? "default" : "pointer" }}>
            Anterior
          </button>
          {last
            ? <button onClick={() => canNext && onFinish({ appId: appId.trim(), secret: secret.trim(), userId: userId.trim(), code: code.trim() })} disabled={!canNext}
                className="px-5 py-2 rounded-xl text-sm font-bold transition-transform hover:scale-[1.02]"
                style={{ background: canNext ? "#16A34A" : "#E2E8F0", color: canNext ? "white" : "#94A3B8", cursor: canNext ? "pointer" : "default" }}>
                Finalizar conexión
              </button>
            : <button onClick={() => canNext && setI(x => Math.min(TOTAL - 1, x + 1))} disabled={!canNext}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: canNext ? "#4F46E5" : "#E2E8F0", color: canNext ? "white" : "#94A3B8", cursor: canNext ? "pointer" : "default" }}
                onMouseEnter={e => { if (canNext) e.currentTarget.style.background = "#4338CA"; }} onMouseLeave={e => { if (canNext) e.currentTarget.style.background = "#4F46E5"; }}>
                Siguiente
              </button>}
        </div>
      </div>
    </div>
  );
}

// ── MercadoLibre integration settings ──
const MELI_CREDS_KEY = "omnipanel.meli.creds";
function MeliSettings() {
  const [creds, setCreds] = useState<MeliCreds | null>(() => { try { const r = localStorage.getItem(MELI_CREDS_KEY); return r ? JSON.parse(r) as MeliCreds : null; } catch { return null; } });
  const [showGuide, setShowGuide] = useState(false);
  const finish = (c: MeliCreds) => { try { localStorage.setItem(MELI_CREDS_KEY, JSON.stringify(c)); } catch { /* ignore */ } setCreds(c); setShowGuide(false); };
  const reopenGuide = () => setShowGuide(true);

  if (!creds || showGuide) return <MeliOnboarding onFinish={finish} onExit={creds ? () => setShowGuide(false) : undefined} />;

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs" style={{ color: "#64748B" }}>¿Necesitás volver a crear la aplicación?</p>
        <button onClick={reopenGuide} className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:underline" style={{ color: "#4F46E5" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 5v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Ver la guía otra vez
        </button>
      </div>

      {/* App credentials — editable */}
      <SettingsCard>
        <CardHeader title="Credenciales de la aplicación" icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 8.5a3 3 0 1 0-3 3l1 1 1-1 1 1 1-1 2.5-2.5" /><circle cx="12.5" cy="7.5" r="4.5" transform="rotate(45 12.5 7.5)" /></svg>
        } />
        <p className="text-xs -mt-3 mb-4" style={{ color: "#64748B" }}>Obtené estos valores creando una aplicación en el panel de desarrolladores de MercadoLibre.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <CredField label="Client ID (App ID)" defaultValue={creds.appId} placeholder="Ej. 1234567890123456" mono lockable />
          <CredField label="Client Secret" defaultValue={creds.secret} placeholder="Clave secreta de la aplicación" secret mono lockable />
          <CredField label="ID de usuario" defaultValue={creds.userId} placeholder="Ej. 307027338" mono lockable />
          <div className="md:col-span-2">
            <CredField label="Redirect URL" defaultValue="https://httpbin.org/get" mono lockable hint="Debe coincidir exactamente con la Redirect URI configurada en tu aplicación de ML." />
          </div>
        </div>
      </SettingsCard>

      {/* OAuth tokens — read-only, generated by the flow */}
      <SettingsCard>
        <CardHeader title="Tokens de acceso (OAuth)" icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="7" cy="10" r="3.5" /><path d="M10 8.5l6.5-6.5M13.5 5l2 2M11.5 7l1.5 1.5" /></svg>
        } />
        <p className="text-xs -mt-3 mb-4" style={{ color: "#64748B" }}>Se generan automáticamente al conectar la cuenta. Se renuevan solos con el refresh token.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <div className="md:col-span-2">
            <CredField label="Access Token" defaultValue="APP_USR-1234567890123456-092719-abcdef0123456789abcdef0123456789-1" placeholder="—" secret readOnly mono />
          </div>
          <div className="md:col-span-2">
            <CredField label="Refresh Token" defaultValue="TG-66f7a1b2c3d4e5f60718293a-1" placeholder="—" secret readOnly mono />
          </div>
          <CredField label="Código de autorización" defaultValue={creds.code} placeholder="—" readOnly mono />
          <CredField label="Expira" defaultValue="2026-09-27 22:57:19" placeholder="—" readOnly mono hint="Vence en 5 h 59 m — se renovará automáticamente." />
        </div>
      </SettingsCard>
    </>
  );
}

// ── Tienda Nube integration settings ──
type TnCreds = { storeUrl: string };

const TN_APP_ID = "29440";

function normalizeStoreUrl(raw: string): string {
  let u = raw.trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  return u.replace(/\/+$/, "");
}

function TnOnboarding({ onFinish, onExit }: { onFinish: (c: TnCreds) => void; onExit?: () => void }) {
  const [i, setI] = useState(0);
  const [store, setStore] = useState("");
  const TOTAL = 2;
  const last = i === TOTAL - 1;
  const base = normalizeStoreUrl(store);
  const authUrl = base ? `${base}/admin/apps/${TN_APP_ID}/authorize` : "";
  const canNext = i === 0 ? Boolean(base) : true;

  const title = i === 0 ? "Ingresá la URL de tu tienda" : "Autorizá la conexión";
  const body = i === 0 ? (
    <>
      <p className="text-xs" style={{ color: "#475569" }}>Escribí la dirección de tu Tienda Nube. La encontrás en la barra del navegador cuando entrás a tu tienda.</p>
      <OnbInput label="URL de tu tienda" value={store} onChange={setStore} placeholder="https://mitienda.mitiendanube.com" mono />
      <InfoNote>Ejemplo: <span style={{ fontFamily: "ui-monospace, monospace" }}>https://nicolasgall.mitiendanube.com</span></InfoNote>
    </>
  ) : (
    <>
      <p className="text-xs" style={{ color: "#475569" }}>Vamos a llevarte al panel de tu tienda para autorizar la conexión de la app.</p>
      <a href={authUrl} target="_blank" rel="noreferrer"
        className="w-fit inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition-transform hover:scale-[1.02]" style={{ background: "#2563EB" }}>
        Ir a autorizar en Tienda Nube
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h7v7M13 3 6.5 9.5M11 9v4H3V5h4" /></svg>
      </a>
      <CheckList title="Qué va a pasar" items={[
        "Se abre el panel de administración de tu Tienda Nube.",
        "Bajá hasta el final de la página.",
        "Tocá el botón “Aceptar” para autorizar la app.",
      ]} />
      <InfoNote>Si te pide iniciar sesión, ingresá con tu usuario de Tienda Nube y volvé a intentar.</InfoNote>
    </>
  );

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #BFDBFE", background: "white" }}>
      <div className="flex items-center gap-3 px-6 py-5" style={{ background: "#EFF6FF" }}>
        <span className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#DBEAFE", color: "#2563EB" }}>
          <NavIcon name="tn" size={22} />
        </span>
        <div className="flex-1">
          <h2 className="text-base font-bold" style={{ color: "#0A1628" }}>Conectá tu Tienda Nube</h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748B" }}>Ingresá la URL de tu tienda y autorizá la conexión en dos pasos.</p>
        </div>
        {onExit && (
          <button onClick={onExit} title="Salir de la guía" className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors hover:bg-white" style={{ color: "#64748B" }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 5l10 10M15 5 5 15" /></svg>
          </button>
        )}
      </div>

      <div className="px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center gap-1.5">
          {Array.from({ length: TOTAL }).map((_, j) => (
            <button key={j} onClick={() => { if (j <= i) setI(j); }} className="h-1.5 rounded-full transition-all" style={{ flex: 1, background: j <= i ? "#2563EB" : "#E2E8F0", cursor: j <= i ? "pointer" : "default" }} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0" style={{ background: "#DBEAFE", color: "#2563EB" }}>{i + 1}</span>
          <div>
            <p style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94A3B8" }}>Paso {i + 1} de {TOTAL}</p>
            <h3 className="text-sm font-bold" style={{ color: "#0A1628" }}>{title}</h3>
          </div>
        </div>
        <div className="flex flex-col gap-3 min-h-[120px]">{body}</div>
        <div className="flex items-center justify-between pt-1">
          <button onClick={() => setI(x => Math.max(0, x - 1))} disabled={i === 0}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ border: "1px solid #E2E8F0", color: i === 0 ? "#CBD5E1" : "#475569", background: "white", cursor: i === 0 ? "default" : "pointer" }}>
            Anterior
          </button>
          {last
            ? <button onClick={() => canNext && onFinish({ storeUrl: base })} disabled={!canNext}
                className="px-5 py-2 rounded-xl text-sm font-bold transition-transform hover:scale-[1.02]"
                style={{ background: canNext ? "#16A34A" : "#E2E8F0", color: canNext ? "white" : "#94A3B8", cursor: canNext ? "pointer" : "default" }}>
                Finalizar conexión
              </button>
            : <button onClick={() => canNext && setI(x => Math.min(TOTAL - 1, x + 1))} disabled={!canNext}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: canNext ? "#2563EB" : "#E2E8F0", color: canNext ? "white" : "#94A3B8", cursor: canNext ? "pointer" : "default" }}
                onMouseEnter={e => { if (canNext) e.currentTarget.style.background = "#1D4ED8"; }} onMouseLeave={e => { if (canNext) e.currentTarget.style.background = "#2563EB"; }}>
                Siguiente
              </button>}
        </div>
      </div>
    </div>
  );
}

const TN_CREDS_KEY = "omnipanel.tn.creds";
function TiendaNubeSettings() {
  const [creds, setCreds] = useState<TnCreds | null>(() => { try { const r = localStorage.getItem(TN_CREDS_KEY); return r ? JSON.parse(r) as TnCreds : null; } catch { return null; } });
  const [showGuide, setShowGuide] = useState(false);
  const finish = (c: TnCreds) => { try { localStorage.setItem(TN_CREDS_KEY, JSON.stringify(c)); } catch { /* ignore */ } setCreds(c); setShowGuide(false); };
  const reopenGuide = () => setShowGuide(true);

  if (!creds || showGuide) return <TnOnboarding onFinish={finish} onExit={creds ? () => setShowGuide(false) : undefined} />;

  return (
    <>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs" style={{ color: "#64748B" }}>¿Necesitás volver a conectar tu tienda?</p>
        <button onClick={reopenGuide} className="flex items-center gap-1.5 text-xs font-semibold transition-colors hover:underline" style={{ color: "#2563EB" }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 5v3.2l2 1.3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Ver la guía otra vez
        </button>
      </div>

      <SettingsCard>
        <CardHeader title="Conexión de la tienda" color="#2563EB" icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7h14l-1 2.5a2 2 0 0 1-2 1.5H6a2 2 0 0 1-2-1.5L3 7Z" /><path d="M4.5 7 6 3.5h8L15.5 7M6.5 11v5.5h7V11" /></svg>
        } />
        <div className="grid grid-cols-1 gap-y-4">
          <CredField label="URL de tu tienda" defaultValue={creds.storeUrl} placeholder="https://mitienda.mitiendanube.com" mono lockable />
          <CredField label="Token de acceso" defaultValue="a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" placeholder="—" secret readOnly mono hint="Se genera automáticamente al autorizar la app." />
        </div>
      </SettingsCard>
    </>
  );
}

function IntegrationPlaceholder({ title, note }: { title: string; note: string }) {
  return (
    <SettingsCard>
      <div className="flex flex-col items-center text-center gap-2 py-10 px-4">
        <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#EEF2FF", color: "#4F46E5" }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l3 3M16 16l3 3M19 5l-3 3M8 16l-3 3" /></svg>
        </span>
        <h2 className="text-base font-bold" style={{ color: "#0A1628" }}>{title}</h2>
        <p className="text-sm max-w-md" style={{ color: "#64748B" }}>{note}</p>
        <span className="mt-1 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: "#4F46E5", background: "#EEF2FF" }}>Próximamente</span>
      </div>
    </SettingsCard>
  );
}

function GeneralSettings() {
  return (
    <>
      {/* Credenciales de Acceso */}
      <SettingsCard>
        <CardHeader title="Credenciales de Acceso" icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="6.5" r="3" /><path d="M4 16.5c0-3 2.7-5 6-5s6 2 6 5" /></svg>
        } />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <SettingsInput label="Usuario" defaultValue="admin" />
          <SettingsInput label="Contraseña actual" type="password" placeholder="••••••••" />
          <SettingsInput label="Nueva contraseña" type="password" placeholder="••••••••" />
          <SettingsInput label="Confirmar nueva" type="password" placeholder="••••••••" />
        </div>
        <div className="flex justify-end mt-5"><PrimaryBtn>Guardar cambios</PrimaryBtn></div>
      </SettingsCard>

      {/* Personalización de Logo */}
      <SettingsCard>
        <CardHeader title="Personalización de Logo" icon={
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><circle cx="7" cy="8" r="1.5" /><path d="M3 14l4-4 3 3 3-3 4 4" /></svg>
        } />
        <div className="flex items-center gap-4">
          <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 72, height: 72, background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
            <span className="text-xs font-bold tracking-wide" style={{ color: "#CBD5E1" }}>LOGO</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <button className="w-fit px-4 py-2 rounded-xl text-sm font-medium transition-colors"
              style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")} onMouseLeave={e => (e.currentTarget.style.background = "white")}>
              Subir
            </button>
            <p className="text-xs" style={{ color: "#94A3B8" }}>PNG o SVG con fondo transparente. Se usará en toda la aplicación.</p>
          </div>
        </div>
      </SettingsCard>
    </>
  );
}

// ─── Notificaciones + Scrapfly (settings) ───────────────────────────────────────
// Backend no existe todavía: mock en memoria contra el contrato de la API.

type NotificationEventKey = "order_confirmed" | "order_cancelled" | "order_delivered" | "scraping_finished" | "label_ready" | "message_needs_review";
interface NotificationEventSetting { whatsapp: boolean; telegram: boolean }
interface NotifContact { id: string; label: string; destination: string; enabled: boolean }
type NotifChannel = "whatsapp" | "telegram";
interface NotificationSettings {
  whatsapp_contacts: NotifContact[];
  telegram_contacts: NotifContact[];
  events: Record<NotificationEventKey, NotificationEventSetting>;
}
interface ScrapflySettings { api_key: string | null }

const settleMs = (ms = 450) => new Promise<void>(r => setTimeout(r, ms));
const NOTIF_CONTACT_LIMIT = 10;

// In-memory stores seeded with the contract defaults.
let notifStore: NotificationSettings = {
  whatsapp_contacts: [
    { id: "wa-1", label: "Nico", destination: "+54 9 11 2345 6789", enabled: true },
    { id: "wa-2", label: "Depósito", destination: "+54 9 11 5555 0100", enabled: false },
  ],
  telegram_contacts: [],
  events: {
    order_confirmed: { whatsapp: true, telegram: true },
    order_cancelled: { whatsapp: true, telegram: true },
    order_delivered: { whatsapp: false, telegram: false },
    scraping_finished: { whatsapp: false, telegram: true },
    label_ready: { whatsapp: true, telegram: true },
    message_needs_review: { whatsapp: true, telegram: true },
  },
};
let scrapflyStore: ScrapflySettings = { api_key: null };

const notificationsApi = {
  async settings(): Promise<NotificationSettings> { await settleMs(); return structuredClone(notifStore); },
  async saveSettings(s: NotificationSettings): Promise<{ status: "ok" }> { await settleMs(500); notifStore = structuredClone(s); return { status: "ok" }; },
  // Mock: los destinos terminados en "00" simulan un rechazo del proveedor.
  async test(channel: NotifChannel, contact: Pick<NotifContact, "destination">): Promise<{ status: "ok" }> {
    await settleMs(900);
    if (contact.destination.replace(/\D/g, "").endsWith("00")) {
      throw new Error(channel === "whatsapp"
        ? "WhatsApp rechazó el envío: el número no tiene una cuenta activa."
        : "Telegram rechazó el envío: este chat todavía no le escribió al bot.");
    }
    return { status: "ok" };
  },
};

const scrapflyApi = {
  async settings(): Promise<ScrapflySettings> { await settleMs(); return structuredClone(scrapflyStore); },
  async save(apiKey: string): Promise<{ status: "ok" }> {
    await settleMs(600);
    if (!apiKey.trim()) throw new Error("El token de Scrapfly es obligatorio");
    scrapflyStore = { api_key: apiKey };
    return { status: "ok" };
  },
};

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg px-3 py-2.5" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5"><circle cx="8" cy="8" r="6.5" stroke="#DC2626" strokeWidth="1.3" /><path d="M8 5v3.5M8 10.5h.01" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <span style={{ fontSize: "12.5px", color: "#B91C1C", lineHeight: 1.4 }}>{children}</span>
    </div>
  );
}

function SpinnerText({ children = "Cargando…" }: { children?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-8 justify-center" style={{ color: "#94A3B8" }}>
      <span className="rounded-full" style={{ width: 16, height: 16, border: "2px solid #E2E8F0", borderTopColor: "#4F46E5", animation: "spin 0.8s linear infinite" }} />
      <span className="text-sm">{children}</span>
    </div>
  );
}

function SuccessPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ background: "#DCFCE7" }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l2.5 2.5L12 5" stroke="#16A34A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
      <span style={{ fontSize: "11.5px", fontWeight: 700, color: "#16A34A" }}>{children}</span>
    </span>
  );
}

function PlatformPill({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full px-2.5 py-1" style={{ fontSize: "10.5px", fontWeight: 700, color: "#4F46E5", background: "#EEF2FF" }}>{children}</span>;
}

const NOTIF_EVENTS: { key: NotificationEventKey; label: string; desc: string; hint?: string }[] = [
  { key: "order_confirmed", label: "Venta confirmada", desc: "Cuando entra una venta nueva y pagada." },
  { key: "order_cancelled", label: "Orden cancelada", desc: "Cuando se cancela una venta y se revierte el stock." },
  { key: "order_delivered", label: "Orden entregada", desc: "Cuando el envío llega al comprador." },
  { key: "scraping_finished", label: "Scraping finalizado", desc: "Cuando termina una corrida de búsqueda de competencia." },
  { key: "label_ready", label: "Etiqueta lista para despachar", desc: "Cuando un envío de MercadoLibre pasa a 'Listo para enviar': mandamos la etiqueta en PDF. Si MercadoLibre todavía no la generó, avisamos por texto con el número de orden para descargarla desde la app.", hint: "El PDF viaja como documento adjunto en WhatsApp y Telegram." },
  { key: "message_needs_review", label: "Pregunta sin responder por la IA", desc: "Cuando una pregunta o mensaje de MercadoLibre queda Para revisar (reclamo, devolución, baja confianza, fallo de envío) o la IA está en Off. Un solo aviso por conversación hasta que el comprador vuelva a escribir.", hint: "Incluye un link directo que abre la conversación en Preguntas." },
];

// ── Contactos de notificación: validación ──
const normDest = (ch: NotifChannel, v: string) => ch === "whatsapp" ? v.replace(/\D/g, "") : v.trim();

function validateContact(ch: NotifChannel, label: string, dest: string, others: NotifContact[]): { label?: string; destination?: string } {
  const err: { label?: string; destination?: string } = {};
  if (!label.trim()) err.label = "Poné una etiqueta corta (ej. Nico, Depósito).";
  else if (label.trim().length > 24) err.label = "Máximo 24 caracteres.";
  const d = dest.trim();
  if (!d) err.destination = ch === "whatsapp" ? "Ingresá un número de WhatsApp." : "Ingresá un chat id.";
  else if (ch === "whatsapp" && (!/^\+?[\d\s\-()]+$/.test(d) || normDest(ch, d).length < 10 || normDest(ch, d).length > 15))
    err.destination = "Número inválido. Usá formato internacional con código de país, ej. +54 9 11 2345 6789.";
  else if (ch === "telegram" && !/^-?\d+$/.test(d))
    err.destination = "El chat id tiene que ser numérico (ej. 123456789).";
  else {
    const dup = others.find(o => normDest(ch, o.destination) === normDest(ch, d));
    if (dup) err.destination = `Este destino ya está cargado para "${dup.label}".`;
  }
  return err;
}

const CHANNEL_META: Record<NotifChannel, { name: string; color: string; bg: string; destLabel: string; placeholder: string; icon: ReactNode }> = {
  whatsapp: {
    name: "WhatsApp", color: "#16A34A", bg: "#DCFCE7", destLabel: "Número", placeholder: "+54 9 11 2345 6789",
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1.8a6.2 6.2 0 0 0-5.3 9.4L2 14l2.9-.7A6.2 6.2 0 1 0 8 1.8z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M6 5.6c.2 1.9 1.6 3.7 3.9 4.6l.9-1-1.1-.6-.6.5c-.8-.4-1.4-1-1.8-1.8l.5-.6-.6-1.1-1.2 0z" fill="currentColor" /></svg>,
  },
  telegram: {
    name: "Telegram", color: "#0284C7", bg: "#E0F2FE", destLabel: "Chat ID", placeholder: "123456789",
    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 7.5 14 3l-2 10-3.5-2.5L6.5 12l-.3-2.7L11 5.5 5.6 8.8 2 7.5z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" /></svg>,
  },
};

type SaveState = "idle" | "saving" | "saved" | "error";

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "idle") return <span className="text-[11px]" style={{ color: "#CBD5E1" }}>Se guarda automáticamente</span>;
  if (state === "saving") return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "#64748B" }} aria-live="polite">
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="animate-spin"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      Guardando…
    </span>
  );
  if (state === "saved") return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: "#16A34A", animation: "fadeUp 0.2s ease both" }} aria-live="polite">
      Guardado
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium" style={{ color: "#DC2626" }} aria-live="assertive">
      No se pudo guardar
      <button onClick={onRetry} className="font-semibold underline">Reintentar</button>
    </span>
  );
}

function ContactInput({ value, onChange, onCommit, onCancel, placeholder, invalid, mono, dim, ariaLabel, autoFocus }: {
  value: string; onChange: (v: string) => void; onCommit: () => void; onCancel?: () => void; placeholder: string; invalid?: boolean; mono?: boolean; dim?: boolean; ariaLabel: string; autoFocus?: boolean;
}) {
  const base = invalid ? "#FCA5A5" : "#E2E8F0";
  return (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} aria-label={ariaLabel} aria-invalid={invalid} autoFocus={autoFocus}
      onBlur={e => { e.target.style.borderColor = base; e.target.style.boxShadow = "none"; onCommit(); }}
      onFocus={e => { e.target.style.borderColor = invalid ? "#DC2626" : "#4F46E5"; e.target.style.boxShadow = `0 0 0 3px ${invalid ? "rgba(220,38,38,0.1)" : "rgba(79,70,229,0.1)"}`; }}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); onCommit(); } if (e.key === "Escape") onCancel?.(); }}
      className={`w-full px-3 py-2 text-[13px] rounded-lg outline-none transition-all ${mono ? "font-mono tabular-nums" : ""}`}
      style={{ border: `1px solid ${base}`, color: dim ? "#94A3B8" : "#0A1628", background: invalid ? "#FEF2F2" : "white" }} />
  );
}

type TestState = { kind: "sending" } | { kind: "ok" } | { kind: "err"; message: string };

function ContactRow({ ch, contact, others, onUpdate, onRemove }: {
  ch: NotifChannel; contact: NotifContact; others: NotifContact[]; onUpdate: (c: NotifContact) => void; onRemove: () => void;
}) {
  const meta = CHANNEL_META[ch];
  const [label, setLabel] = useState(contact.label);
  const [dest, setDest] = useState(contact.destination);
  const [errors, setErrors] = useState<{ label?: string; destination?: string }>({});
  const [test, setTest] = useState<TestState | null>(null);
  const muted = !contact.enabled;

  useEffect(() => { if (test?.kind !== "ok") return; const t = setTimeout(() => setTest(null), 4000); return () => clearTimeout(t); }, [test]);

  const commit = () => {
    if (label === contact.label && dest === contact.destination) { setErrors({}); return; }
    const err = validateContact(ch, label, dest, others);
    setErrors(err);
    if (!err.label && !err.destination) onUpdate({ ...contact, label: label.trim(), destination: dest.trim() });
  };
  const revert = () => { setLabel(contact.label); setDest(contact.destination); setErrors({}); };
  const dirtyInvalid = (errors.label || errors.destination) && (label !== contact.label || dest !== contact.destination);

  const runTest = async () => {
    setTest({ kind: "sending" });
    try { await notificationsApi.test(ch, contact); setTest({ kind: "ok" }); }
    catch (e) { setTest({ kind: "err", message: e instanceof Error ? e.message : "No se pudo enviar el mensaje de prueba." }); }
  };

  return (
    <div className="px-4 py-3 transition-colors" style={{ background: muted ? "#FAFBFC" : "white", borderTop: "1px solid #F1F5F9" }}>
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: "150px minmax(0,1fr) auto 36px 28px" }}>
        <div className="relative">
          <ContactInput value={label} onChange={setLabel} onCommit={commit} onCancel={revert} placeholder="Etiqueta" invalid={!!errors.label} dim={muted} ariaLabel="Etiqueta del contacto" />
        </div>
        <div className="flex items-center gap-2 min-w-0">
          <ContactInput value={dest} onChange={setDest} onCommit={commit} onCancel={revert} placeholder={meta.placeholder} invalid={!!errors.destination} mono dim={muted} ariaLabel={`${meta.destLabel} de ${contact.label}`} />
          {muted && <span className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: "#F1F5F9", color: "#64748B" }}>
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M6.5 3.6A4.5 4.5 0 0 1 12.5 7.5c0 2 .6 3.2 1.2 4M3.8 6.4c-.1.4-.3.8-.3 1.1 0 3-1 4.5-2 5.5h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            Silenciado</span>}
        </div>
        <button onClick={runTest} disabled={test?.kind === "sending" || !!dirtyInvalid}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors hover:bg-slate-50"
          style={{ border: "1px solid #E2E8F0", color: test?.kind === "sending" ? "#94A3B8" : "#475569", background: "white", cursor: test?.kind === "sending" ? "wait" : "pointer", opacity: dirtyInvalid ? 0.5 : 1 }}>
          {test?.kind === "sending"
            ? <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="animate-spin"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
            : <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M2 8 14 2l-4 12-2.5-4.5L2 8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>}
          {test?.kind === "sending" ? "Enviando…" : "Enviar mensaje de prueba"}
        </button>
        <div className="flex justify-center" title={muted ? "Activar contacto" : "Silenciar contacto"}>
          <Toggle value={contact.enabled} onChange={v => onUpdate({ ...contact, enabled: v })} />
        </div>
        <button onClick={onRemove} aria-label={`Eliminar ${contact.label}`} title="Eliminar contacto"
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors" style={{ color: "#CBD5E1" }}
          onMouseEnter={e => { e.currentTarget.style.color = "#DC2626"; e.currentTarget.style.background = "#FEF2F2"; }}
          onMouseLeave={e => { e.currentTarget.style.color = "#CBD5E1"; e.currentTarget.style.background = "transparent"; }}>
          <TrashIcon size={13} />
        </button>
      </div>

      {(errors.label || errors.destination) && (
        <div className="flex flex-col gap-0.5 mt-1.5 pl-0.5">
          {errors.label && <FieldError>{errors.label}</FieldError>}
          {errors.destination && <FieldError>{errors.destination}</FieldError>}
          <span className="text-[10.5px]" style={{ color: "#94A3B8" }}>Sin guardar · corregilo o presioná Esc para descartar.</span>
        </div>
      )}
      {test?.kind === "ok" && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: "#16A34A", animation: "fadeUp 0.18s ease both" }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Mensaje de prueba enviado a {contact.label} por {meta.name}.
        </div>
      )}
      {test?.kind === "err" && (
        <div className="mt-1.5 flex items-center gap-2 text-[11.5px]" style={{ color: "#B91C1C" }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 5v3.5M8 10.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span>{test.message}</span>
          <button onClick={runTest} className="font-semibold underline">Reintentar</button>
        </div>
      )}
    </div>
  );
}

function FieldError({ children }: { children: ReactNode }) {
  return <span className="text-[11.5px] font-medium" style={{ color: "#DC2626" }}>{children}</span>;
}

function NewContactRow({ ch, existing, onAdd, onCancel }: { ch: NotifChannel; existing: NotifContact[]; onAdd: (c: NotifContact) => void; onCancel: () => void }) {
  const meta = CHANNEL_META[ch];
  const [label, setLabel] = useState("");
  const [dest, setDest] = useState("");
  const [errors, setErrors] = useState<{ label?: string; destination?: string }>({});
  const submit = () => {
    const err = validateContact(ch, label, dest, existing);
    setErrors(err);
    if (!err.label && !err.destination) onAdd({ id: `${ch}-${Date.now()}`, label: label.trim(), destination: dest.trim(), enabled: true });
  };
  return (
    <div className="px-4 py-3" style={{ background: "#F5F7FF", borderTop: "1px solid #E0E7FF" }}>
      <div className="grid items-center gap-3" style={{ gridTemplateColumns: "150px minmax(0,1fr) auto" }}>
        <ContactInput value={label} onChange={setLabel} onCommit={() => {}} onCancel={onCancel} placeholder="Etiqueta (ej. Depósito)" invalid={!!errors.label} ariaLabel="Etiqueta del nuevo contacto" autoFocus />
        <ContactInput value={dest} onChange={setDest} onCommit={() => {}} onCancel={onCancel} placeholder={meta.placeholder} invalid={!!errors.destination} mono ariaLabel={`${meta.destLabel} del nuevo contacto`} />
        <div className="flex items-center gap-1.5">
          <button onClick={onCancel} className="px-3 py-2 rounded-lg text-xs font-medium" style={{ color: "#64748B" }}>Cancelar</button>
          <button onMouseDown={e => e.preventDefault()} onClick={submit} className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white" style={{ background: "#4F46E5" }}>Agregar</button>
        </div>
      </div>
      <div className="flex flex-col gap-0.5 mt-1.5 pl-0.5">
        {errors.label && <FieldError>{errors.label}</FieldError>}
        {errors.destination && <FieldError>{errors.destination}</FieldError>}
        {!errors.label && !errors.destination && <span className="text-[10.5px]" style={{ color: "#94A3B8" }}>Enter para agregar · Esc para cancelar</span>}
      </div>
      <KeySubmit onEnter={submit} />
    </div>
  );
}

// Enter dentro de la fila nueva agrega el contacto.
function KeySubmit({ onEnter }: { onEnter: () => void }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const row = ref.current?.parentElement;
    if (!row) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") onEnter(); };
    row.addEventListener("keydown", h);
    return () => row.removeEventListener("keydown", h);
  }, [onEnter]);
  return <span ref={ref} className="hidden" />;
}

function ChannelContactsCard({ ch, contacts, onChange, save, onRetry }: { ch: NotifChannel; contacts: NotifContact[]; onChange: (c: NotifContact[]) => void; save: SaveState; onRetry: () => void }) {
  const meta = CHANNEL_META[ch];
  const [adding, setAdding] = useState(false);
  const atLimit = contacts.length >= NOTIF_CONTACT_LIMIT;
  const active = contacts.filter(c => c.enabled).length;

  const addBtn = (
    <button onClick={() => setAdding(true)} disabled={atLimit || adding}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-colors"
      style={atLimit
        ? { border: "1px solid #F1F5F9", color: "#CBD5E1", background: "#F8FAFC", cursor: "not-allowed" }
        : { border: "1px solid #C7D2FE", color: "#4F46E5", background: "white", opacity: adding ? 0.5 : 1 }}>
      <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
      Agregar contacto
      <span className="tabular-nums px-1.5 py-px rounded-md text-[10.5px]" style={{ background: atLimit ? "#F1F5F9" : "#EEF2FF" }}>{contacts.length}/{NOTIF_CONTACT_LIMIT}</span>
    </button>
  );

  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
          <div>
            <h2 className="text-base font-bold" style={{ color: "#0A1628" }}>Contactos de {meta.name}</h2>
            <p className="text-xs" style={{ color: "#94A3B8" }}>
              {contacts.length === 0 ? "Sin contactos todavía" : `${active} ${active === 1 ? "activo" : "activos"}${contacts.length - active > 0 ? ` · ${contacts.length - active} ${contacts.length - active === 1 ? "silenciado" : "silenciados"}` : ""}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={save} onRetry={onRetry} />
          {contacts.length > 0 && addBtn}
        </div>
      </div>

      {contacts.length === 0 && !adding ? (
        <div className="flex flex-col items-center text-center gap-3 rounded-xl px-6 py-9" style={{ border: "1.5px dashed #E2E8F0", background: "#FAFBFC" }}>
          <span className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: meta.bg, color: meta.color }}>{meta.icon}</span>
          <div>
            <p className="text-sm font-semibold" style={{ color: "#0A1628" }}>Agregá tu primer contacto de {meta.name}</p>
            <p className="text-xs mt-1 max-w-sm" style={{ color: "#64748B" }}>Sumá a quien tenga que enterarse de las ventas, cancelaciones y etiquetas: vos, tu socio o el depósito. Hasta {NOTIF_CONTACT_LIMIT} contactos.</p>
          </div>
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "#4F46E5" }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Agregar contacto
          </button>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <div className="grid items-center gap-3 px-4 py-2" style={{ gridTemplateColumns: "150px minmax(0,1fr) auto 36px 28px", background: "#F8FAFC" }}>
            {["Etiqueta", meta.destLabel, "", "Activo", ""].map((h, i) => (
              <span key={i} style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8", textAlign: i === 3 ? "center" : "left" }}>{h}</span>
            ))}
          </div>
          {contacts.map(c => (
            <ContactRow key={c.id} ch={ch} contact={c} others={contacts.filter(o => o.id !== c.id)}
              onUpdate={u => onChange(contacts.map(o => o.id === u.id ? u : o))}
              onRemove={() => onChange(contacts.filter(o => o.id !== c.id))} />
          ))}
          {adding && <NewContactRow ch={ch} existing={contacts} onCancel={() => setAdding(false)} onAdd={c => { onChange([...contacts, c]); setAdding(false); }} />}
        </div>
      )}

      {ch === "telegram" && (
        <p className="flex items-start gap-1.5 mt-3 text-[11.5px] leading-relaxed" style={{ color: "#64748B" }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5"><circle cx="8" cy="8" r="6.5" stroke="#94A3B8" strokeWidth="1.3" /><path d="M8 7v4M8 5h.01" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" /></svg>
          <span>Para obtener tu id, hablale a <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="font-semibold hover:underline" style={{ color: "#0284C7" }}>@userinfobot</a> en Telegram: te responde tu id al instante y lo pegás acá.</span>
        </p>
      )}
      {atLimit && (
        <p className="flex items-center gap-1.5 mt-3 text-[11.5px] font-medium" style={{ color: "#B45309" }}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M8 2.5 14.5 13.5h-13L8 2.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M8 6.5v3M8 11.5h.01" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          Límite de {NOTIF_CONTACT_LIMIT} contactos alcanzado. Eliminá uno para sumar otro.
        </p>
      )}
    </SettingsCard>
  );
}

function NotificationsSettings() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [save, setSave] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fade = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    let alive = true;
    notificationsApi.settings().then(s => { if (alive) setSettings(s); });
    return () => { alive = false; };
  }, []);

  const flush = async (next: NotificationSettings) => {
    const id = ++seq.current;
    setSave("saving");
    try {
      await notificationsApi.saveSettings(next);
      if (id !== seq.current) return;
      setSave("saved");
      if (fade.current) clearTimeout(fade.current);
      fade.current = setTimeout(() => setSave(s => s === "saved" ? "idle" : s), 2200);
    } catch { if (id === seq.current) setSave("error"); }
  };

  // Autosave con debounce corto para agrupar cambios seguidos.
  const persist = (next: NotificationSettings) => {
    setSettings(next);
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(next), 400);
  };

  if (!settings) return <SettingsCard><SpinnerText children="Cargando notificaciones…" /></SettingsCard>;

  const retry = () => flush(settings);
  const toggleEvent = (key: NotificationEventKey, ch: NotifChannel) =>
    persist({ ...settings, events: { ...settings.events, [key]: { ...settings.events[key], [ch]: !settings.events[key][ch] } } });

  const noActive = (ch: NotifChannel) => {
    const list = ch === "whatsapp" ? settings.whatsapp_contacts : settings.telegram_contacts;
    return NOTIF_EVENTS.some(e => settings.events[e.key][ch]) && !list.some(c => c.enabled);
  };

  return (
    <>
      <ChannelContactsCard ch="whatsapp" contacts={settings.whatsapp_contacts} save={save} onRetry={retry}
        onChange={c => persist({ ...settings, whatsapp_contacts: c })} />
      <ChannelContactsCard ch="telegram" contacts={settings.telegram_contacts} save={save} onRetry={retry}
        onChange={c => persist({ ...settings, telegram_contacts: c })} />

      <SettingsCard>
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2.5">
            <span style={{ color: "#4F46E5", display: "flex" }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="14" height="14" rx="3" /><path d="M6.5 10l2 2 4.5-4.5" /></svg>
            </span>
            <h2 className="text-base font-bold" style={{ color: "#0A1628" }}>Qué querés recibir</h2>
          </div>
          <SaveIndicator state={save} onRetry={retry} />
        </div>

        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid #F1F5F9" }}>
          <div className="grid items-center px-4 py-2.5" style={{ gridTemplateColumns: "1.4fr 2fr 90px 90px", background: "#F8FAFC" }}>
            {["Evento", "Descripción", "WhatsApp", "Telegram"].map((h, i) => (
              <span key={h} style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "#94A3B8", textAlign: i >= 2 ? "center" : "left" }}>{h}</span>
            ))}
          </div>
          {NOTIF_EVENTS.map((ev, i) => (
            <div key={ev.key} className="grid items-center px-4 py-3" style={{ gridTemplateColumns: "1.4fr 2fr 90px 90px", borderTop: i === 0 ? "none" : "1px solid #F8FAFC" }}>
              <span className="text-sm font-semibold" style={{ color: "#0A1628" }}>{ev.label}</span>
              <div className="flex flex-col gap-1 pr-4">
                <span style={{ fontSize: "12px", color: "#64748B" }}>{ev.desc}</span>
                {ev.hint && (
                  <span className="inline-flex items-center gap-1.5" style={{ fontSize: "11px", color: "#94A3B8" }}>
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><path d="M7.5 3.5 4 7a1.1 1.1 0 0 0 1.5 1.5L9.3 4.7a2.2 2.2 0 0 0-3.1-3.1L2.4 5.4a3.3 3.3 0 0 0 4.7 4.7L10 7.2" stroke="currentColor" strokeWidth="1" strokeLinecap="round" /></svg>
                    {ev.hint}
                  </span>
                )}
              </div>
              <div className="flex justify-center"><Toggle value={settings.events[ev.key].whatsapp} onChange={() => toggleEvent(ev.key, "whatsapp")} /></div>
              <div className="flex justify-center"><Toggle value={settings.events[ev.key].telegram} onChange={() => toggleEvent(ev.key, "telegram")} /></div>
            </div>
          ))}
        </div>

        {(noActive("whatsapp") || noActive("telegram")) && (
          <div className="flex flex-col gap-2 mt-4">
            {noActive("whatsapp") && <InfoNote>No hay contactos de WhatsApp activos: los eventos marcados no se van a enviar por ese canal.</InfoNote>}
            {noActive("telegram") && <InfoNote>No hay contactos de Telegram activos: los eventos marcados no se van a enviar por ese canal.</InfoNote>}
          </div>
        )}
      </SettingsCard>
    </>
  );
}

function ScrapflySettings() {
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [initial, setInitial] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let alive = true;
    scrapflyApi.settings().then(s => {
      if (!alive) return;
      setApiKey(s.api_key ?? "");
      setInitial(s.api_key ?? "");
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const dirty = !loading && apiKey !== initial;

  const save = async () => {
    if (saving) return;
    setSaving(true); setErr(null); setSaved(false);
    try { await scrapflyApi.save(apiKey); setInitial(apiKey); setSaved(true); }
    catch (e) { setErr(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setSaving(false); }
  };

  return (
    <SettingsCard>
      <CardHeader title="Token de Scrapfly" color="#4F46E5" icon={
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="10" cy="10" r="6.5" /><circle cx="10" cy="10" r="3" /><circle cx="10" cy="10" r="0.4" /></svg>
      } />
      {loading ? <SpinnerText children="Cargando token…" /> : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <OnbInput label="API key de Scrapfly" value={apiKey} onChange={v => { setApiKey(v); setSaved(false); }} placeholder="Pegá tu API key de Scrapfly" secret mono />
            <span style={{ fontSize: "10px", color: "#94A3B8" }}>Se usa para las búsquedas de precios de la competencia. Es tu token: lo cargás y lo podés cambiar cuando quieras.</span>
          </div>
          {err && <ErrorBox>{err}</ErrorBox>}
          <div className="flex items-center justify-end gap-3">
            {saved && !dirty && <SuccessPill>Token guardado</SuccessPill>}
            <PrimaryBtn onClick={save}>{saving ? "Guardando…" : "Guardar cambios"}</PrimaryBtn>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

// ─── IMS (sistemas de inventario, diseño genérico multi-proveedor) ───────────────

type ImsProviderKey = "bitcram";

type ImsField = {
  key: string;
  label: string;
  kind: "text" | "url" | "password" | "select";
  required?: boolean;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  options?: { value: string; label: string }[];
  default?: string;
};

type ImsProvider = {
  key: ImsProviderKey;
  name: string;
  tagline: string;
  initials: string;
  accent: string;
  accentBg: string;
  fields: ImsField[];
  // Campos que el backend ya tolera pero que todavía no exponemos en el front.
  futureFields: string[];
};

const IMS_PROVIDERS: ImsProvider[] = [
  {
    key: "bitcram",
    name: "Bitcram",
    tagline: "POS y control de stock",
    initials: "B",
    accent: "#4F46E5",
    accentBg: "#EEF2FF",
    fields: [
      { key: "base_url", label: "URL de Bitcram", kind: "url", required: true, placeholder: "https://demo.pos.bitcram.com", hint: "Sin barra final: la normalizamos automáticamente.", mono: true },
      { key: "checkout_number", label: "Nº de caja", kind: "text", required: true, placeholder: "Ej: 1", hint: "El número del checkout en Bitcram." },
      { key: "token", label: "Token", kind: "password", required: true, placeholder: "Bearer token de la API", mono: true },
      { key: "payment_type", label: "Tipo de pago", kind: "text", required: true, placeholder: "Id del tipo de pago", hint: "Se envía como payment_type.id del comprobante." },
      { key: "iva_condition", label: "Condición de IVA", kind: "select", required: true, default: "CF", options: [
        { value: "CF", label: "Consumidor Final (CF)" },
        { value: "RI", label: "Responsable Inscripto (RI)" },
      ] },
    ],
    futureFields: ["payment_account_index", "warehouse_id", "reversal_payment_type"],
  },
];

function ImsSelectField({ field, value, onChange }: { field: ImsField; value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = field.options!.find(o => o.value === value) ?? field.options![0];
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{field.label}</span>
      <div className="relative">
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left text-sm transition-all"
          style={{ background: "white", border: `1px solid ${open ? "#4F46E5" : "#E2E8F0"}`, boxShadow: open ? "0 0 0 3px rgba(79,70,229,0.1)" : "none", color: "#0A1628" }}>
          <span className="truncate">{current?.label}</span>
          <svg width="12" height="12" viewBox="0 0 10 10" fill="none" style={{ color: "#94A3B8", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute left-0 right-0 mt-1 z-50 rounded-xl p-1.5 flex flex-col gap-0.5 max-h-56 overflow-y-auto"
              style={{ background: "white", border: "1px solid #E2E8F0", boxShadow: "0 8px 24px rgba(15,23,42,0.14)" }}>
              {field.options!.map(o => (
                <button type="button" key={o.value} onClick={() => { onChange(o.value); setOpen(false); }}
                  className="flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-sm transition-colors hover:bg-slate-50"
                  style={{ color: o.value === value ? "#4F46E5" : "#0A1628", fontWeight: o.value === value ? 600 : 400 }}>
                  <span className="truncate">{o.label}</span>
                  {o.value === value && (
                    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}><path d="M2.5 7.5l3 3 6-7" stroke="#4F46E5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {field.hint && <span style={{ fontSize: "10px", color: "#94A3B8" }}>{field.hint}</span>}
    </div>
  );
}

function ImsTextField({ field, value, onChange }: { field: ImsField; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(field.kind !== "password");
  const secret = field.kind === "password";
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{field.label}</span>
      <div className="relative">
        <input type={secret && !show ? "password" : "text"} value={value} placeholder={field.placeholder} onChange={e => onChange(e.target.value)}
          className="w-full pl-3.5 py-2.5 text-sm rounded-xl outline-none transition-all"
          style={{ paddingRight: secret ? 42 : 12, border: "1px solid #E2E8F0", color: "#0A1628", background: "white", fontFamily: field.mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined }}
          onFocus={e => { e.currentTarget.style.borderColor = "#4F46E5"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }} />
        {secret && (
          <button onClick={() => setShow(x => !x)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-colors hover:bg-slate-100" style={{ color: "#94A3B8" }} aria-label="Mostrar / ocultar">
            {show
              ? <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z" /><circle cx="10" cy="10" r="2.5" /></svg>
              : <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l12 12M8.5 8.6A2.5 2.5 0 0 0 11.4 11.5M6 6.2C3.6 7.6 2 10 2 10s3 5.5 8 5.5c1.3 0 2.5-.3 3.5-.8M11 4.6C10.7 4.5 10.3 4.5 10 4.5 5 4.5 2 10 2 10" /></svg>}
          </button>
        )}
      </div>
      {field.hint && <span style={{ fontSize: "10px", color: "#94A3B8" }}>{field.hint}</span>}
    </div>
  );
}

function SecondaryBtn({ children, onClick, disabled }: { children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors"
      style={{ border: "1px solid #E2E8F0", color: disabled ? "#CBD5E1" : "#475569", background: "white", cursor: disabled ? "default" : "pointer" }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "#F8FAFC"; }}
      onMouseLeave={e => (e.currentTarget.style.background = "white")}>
      {children}
    </button>
  );
}

function ProviderBadge({ provider, size = 40 }: { provider: ImsProvider; size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-xl flex-shrink-0 font-bold"
      style={{ width: size, height: size, background: provider.accentBg, color: provider.accent, fontSize: size * 0.4 }}>
      {provider.initials}
    </span>
  );
}

function ImsProviderForm({ provider, initialValues, onSave, onDisconnect }: { provider: ImsProvider; initialValues?: Record<string, string>; onSave: (values: Record<string, string>) => void; onDisconnect: () => void }) {
  const initial = () => {
    const o: Record<string, string> = {};
    for (const f of provider.fields) o[f.key] = initialValues?.[f.key] ?? f.default ?? "";
    return o;
  };
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const setField = (k: string, v: string) => { setValues(vs => ({ ...vs, [k]: v })); setTestResult(null); };
  const complete = provider.fields.filter(f => f.required).every(f => values[f.key]?.trim());

  const save = () => {
    if (!complete || saving) return;
    setSaving(true); setErr(null); setTestResult(null);
    // El endpoint real se cablea cuando construyamos el backend del IMS.
    setTimeout(() => {
      setSaving(false); setSavedFlash(true);
      onSave(values);
      // Tras confirmar, volvemos al menú de sistemas.
      setTimeout(() => onDisconnect(), 1300);
    }, 650);
  };
  const test = () => {
    if (!complete || testing) return;
    setTesting(true); setTestResult(null); setErr(null);
    // El endpoint de test (caja abierta → sesión con cuenta, sin postear) se arma más adelante.
    setTimeout(() => { setTesting(false); setTestResult("ok"); }, 900);
  };

  return (
    <SettingsCard>
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <ProviderBadge provider={provider} />
          <div>
            <h2 className="text-base font-bold" style={{ color: "#0A1628" }}>{provider.name}</h2>
            <p className="text-xs" style={{ color: "#64748B" }}>{provider.tagline}</p>
          </div>
        </div>
        <button onClick={onDisconnect} aria-label="Cerrar" className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ color: "#94A3B8" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#F1F5F9"; e.currentTarget.style.color = "#475569"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94A3B8"; }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
        {provider.fields.map(f => (
          f.kind === "select"
            ? <ImsSelectField key={f.key} field={f} value={values[f.key]} onChange={v => setField(f.key, v)} />
            : <ImsTextField key={f.key} field={f} value={values[f.key]} onChange={v => setField(f.key, v)} />
        ))}
      </div>

      {err && <div className="mt-4"><ErrorBox>{err}</ErrorBox></div>}

      {/* Feedback: banner inline dentro del card */}
      {(testing || testResult === "ok" || saving || savedFlash) && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl px-4 py-3"
          style={{
            background: (savedFlash || testResult === "ok") ? "#F0FDF4" : "#EEF2FF",
            border: `1px solid ${(savedFlash || testResult === "ok") ? "#BBF7D0" : "#C7D2FE"}`,
          }}>
          {(testing || saving) ? (
            <span className="rounded-full flex-shrink-0" style={{ width: 16, height: 16, border: "2px solid #C7D2FE", borderTopColor: "#4F46E5", animation: "spin 0.8s linear infinite" }} />
          ) : (
            <span className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "#16A34A" }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M4 8.5l2.5 2.5L12 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
          )}
          <div className="min-w-0">
            <p style={{ fontSize: "13px", fontWeight: 600, color: (savedFlash || testResult === "ok") ? "#15803D" : "#4338CA" }}>
              {saving ? "Guardando configuración…" : savedFlash ? "Configuración guardada" : testing ? "Probando conexión…" : "Conexión verificada"}
            </p>
            <p style={{ fontSize: "11.5px", color: "#64748B" }}>
              {saving ? "Estamos guardando los datos de " + provider.name : savedFlash ? "Volviendo al menú de sistemas…" : testing ? "Consultando la caja en " + provider.name : "La caja está abierta y la sesión responde correctamente."}
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-3 mt-5">
        <SecondaryBtn onClick={test} disabled={!complete || testing || saving}>{testing ? "Probando…" : "Probar conexión"}</SecondaryBtn>
        <button onClick={save} disabled={!complete || saving}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
          style={{ background: (complete && !saving) ? "#4F46E5" : "#C7D2FE", cursor: (complete && !saving) ? "pointer" : "default" }}
          onMouseEnter={e => { if (complete && !saving) e.currentTarget.style.background = "#4338CA"; }}
          onMouseLeave={e => { if (complete && !saving) e.currentTarget.style.background = "#4F46E5"; }}>
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </SettingsCard>
  );
}

const IMS_CONFIG_KEY = "omnipanel.ims.configs";
type ImsConfigs = Partial<Record<ImsProviderKey, Record<string, string>>>;
const loadImsConfigs = (): ImsConfigs => {
  try { return JSON.parse(localStorage.getItem(IMS_CONFIG_KEY) || "{}") as ImsConfigs; }
  catch { return {}; }
};
// Momento en que una venta descuenta stock en el IMS (aplica a cualquier sistema conectado).
type StockSyncTrigger = "confirmed" | "paid";
const IMS_TRIGGER_KEY = "omnipanel.ims.sync_trigger";
const STOCK_SYNC_TRIGGERS: { key: StockSyncTrigger; title: string; desc: string; note: string }[] = [
  { key: "paid", title: "Cuando la orden se paga", desc: "Descuenta stock recién con el pago acreditado.", note: "Recomendado · evita mover stock por órdenes que nunca se pagan." },
  { key: "confirmed", title: "Cuando la orden se confirma", desc: "Reserva el stock apenas entra la orden, antes del pago.", note: "Evita sobreventas. Si la orden se cancela, el stock se revierte automáticamente." },
];

function StockSyncTriggerPicker() {
  const [value, setValue] = useState<StockSyncTrigger>(() => (localStorage.getItem(IMS_TRIGGER_KEY) as StockSyncTrigger) || "paid");
  const pick = (v: StockSyncTrigger) => { setValue(v); try { localStorage.setItem(IMS_TRIGGER_KEY, v); } catch { /* ignore */ } };
  return (
    <div className="mb-6">
      <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }} className="mb-1">Sincronización de ventas</p>
      <p className="text-xs mb-2.5" style={{ color: "#64748B" }}>Elegí en qué momento una venta de MercadoLibre o Tienda Nube descuenta stock. Aplica a cualquier sistema conectado.</p>
      <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2">
        {STOCK_SYNC_TRIGGERS.map(t => {
          const on = value === t.key;
          return (
            <button key={t.key} role="radio" aria-checked={on} onClick={() => pick(t.key)}
              className="text-left flex gap-3 rounded-xl px-4 py-3 transition-colors"
              style={{ border: `1.5px solid ${on ? "#4F46E5" : "#E2E8F0"}`, background: on ? "#FBFBFF" : "white", boxShadow: on ? "0 0 0 3px rgba(79,70,229,0.08)" : "none" }}>
              <span className="mt-0.5 w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center" style={{ border: `1.5px solid ${on ? "#4F46E5" : "#CBD5E1"}` }}>
                {on && <span className="w-2 h-2 rounded-full" style={{ background: "#4F46E5" }} />}
              </span>
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-semibold" style={{ color: "#0A1628" }}>{t.title}</span>
                <span className="text-xs" style={{ color: "#475569" }}>{t.desc}</span>
                <span className="text-[11px] mt-1" style={{ color: "#94A3B8" }}>{t.note}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const saveImsConfigs = (c: ImsConfigs) => { try { localStorage.setItem(IMS_CONFIG_KEY, JSON.stringify(c)); } catch { /* ignore */ } };

function ImsSettings() {
  const [configs, setConfigs] = useState<ImsConfigs>(loadImsConfigs);
  const [provider, setProvider] = useState<ImsProviderKey | null>(null);
  const active = IMS_PROVIDERS.find(p => p.key === provider) ?? null;
  const anyConnected = IMS_PROVIDERS.some(p => configs[p.key]);

  if (active) return (
    <ImsProviderForm
      provider={active}
      initialValues={configs[active.key]}
      onSave={values => { const next = { ...configs, [active.key]: values }; setConfigs(next); saveImsConfigs(next); }}
      onDisconnect={() => setProvider(null)}
    />
  );

  return (
    <SettingsCard>
      <CardHeader title="Sistema de inventario (IMS)" icon={
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6l7-3.5L17 6v8l-7 3.5L3 14V6Z" /><path d="M3 6l7 3.5L17 6M10 9.5V17" /></svg>
      } />

      {/* Estado vacío (solo si no hay ningún sistema conectado) */}
      {!anyConnected && (
        <div className="flex flex-col items-center text-center gap-1.5 py-6 mb-4">
          <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#F1F5F9", color: "#94A3B8" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7l8-4 8 4v10l-8 4-8-4V7Z" /><path d="M4 7l8 4 8-4M12 11v10" /></svg>
          </span>
          <h3 className="text-base font-bold" style={{ color: "#0A1628" }}>Sin sistema conectado</h3>
          <p className="text-sm max-w-md" style={{ color: "#64748B" }}>Conectá tu sistema de gestión de stock para que las ventas de tus canales actualicen el inventario automáticamente.</p>
        </div>
      )}

      <StockSyncTriggerPicker />

      {/* Catálogo de sistemas disponibles */}
      <p style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }} className="mb-2">Sistemas disponibles</p>
      <div className="flex flex-col gap-2.5">
        {IMS_PROVIDERS.map(p => {
          const cfg = configs[p.key];
          const connected = Boolean(cfg);
          const summary = cfg?.base_url;
          return (
            <div key={p.key} className="flex items-center gap-3 rounded-xl px-4 py-3 transition-colors" style={{ border: `1px solid ${connected ? "#C7D2FE" : "#E2E8F0"}`, background: connected ? "#FBFBFF" : "white" }}>
              <ProviderBadge provider={p} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold" style={{ fontSize: "14px", color: "#0A1628" }}>{p.name}</p>
                  {connected && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: "#DCFCE7" }}>
                      <span className="rounded-full" style={{ width: 5, height: 5, background: "#16A34A" }} />
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#15803D" }}>Conectado</span>
                    </span>
                  )}
                </div>
                <p className="truncate" style={{ fontSize: "12px", color: "#94A3B8" }}>{connected && summary ? summary : p.tagline}</p>
              </div>
              <button onClick={() => setProvider(p.key)} className="px-4 py-2 rounded-xl text-sm font-semibold transition-colors flex-shrink-0"
                style={{ background: connected ? "white" : "#4F46E5", color: connected ? "#4F46E5" : "white", border: connected ? "1px solid #C7D2FE" : "none" }}
                onMouseEnter={e => (e.currentTarget.style.background = connected ? "#EEF2FF" : "#4338CA")}
                onMouseLeave={e => (e.currentTarget.style.background = connected ? "white" : "#4F46E5")}>
                {connected ? "Editar" : "Conectar"}
              </button>
            </div>
          );
        })}
        <div className="flex items-center gap-3 rounded-xl px-4 py-3" style={{ border: "1px dashed #E2E8F0" }}>
          <span className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#F8FAFC", color: "#CBD5E1" }}>
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M8 3.5v9M3.5 8h9" /></svg>
          </span>
          <p style={{ fontSize: "12.5px", color: "#94A3B8" }}>Vamos a ir sumando más sistemas de inventario.</p>
        </div>
      </div>
    </SettingsCard>
  );
}

type SettingsTab = "general" | "meli" | "tn" | "ims" | "notificaciones" | "scrapfly";
const SETTINGS_TABS: { key: SettingsTab; label: string; icon: NavIconKey }[] = [
  { key: "general", label: "General", icon: "configuracion" },
  { key: "meli", label: "MercadoLibre", icon: "ml" },
  { key: "tn", label: "Tienda Nube", icon: "tn" },
  { key: "notificaciones", label: "Notificaciones", icon: "notificaciones" },
  { key: "scrapfly", label: "Scrapfly", icon: "competencia" },
  { key: "ims", label: "Integración inventario", icon: "inventario" },
];

function Configuracion() {
  const [tab, setTab] = useState<SettingsTab>("general");
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8 flex flex-col gap-5">
        <h1 className="text-2xl font-bold" style={{ color: "#0A1628" }}>Configuración</h1>

        {/* Subtab bar */}
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "#F1F5F9" }}>
          {SETTINGS_TABS.map(t => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => setTab(t.key)}
                className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all"
                style={{ background: on ? "white" : "transparent", color: on ? "#4F46E5" : "#64748B", boxShadow: on ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
                <span style={{ display: "flex", opacity: on ? 1 : 0.7 }}><NavIcon name={t.icon} size={15} /></span>
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "general" && <GeneralSettings />}
        {tab === "meli" && <MeliSettings />}
        {tab === "tn" && <TiendaNubeSettings />}
        {tab === "notificaciones" && <NotificationsSettings />}
        {tab === "scrapfly" && <ScrapflySettings />}
        {tab === "ims" && <ImsSettings />}
      </div>
    </div>
  );
}

// ─── Usuarios ─────────────────────────────────────────────────────────────────

type AppUser = { id: number; full_name: string; email: string; active: boolean; created_at: string };
const INITIAL_USERS: AppUser[] = [
  { id: 1, full_name: "Empleado Test 1", email: "employee1@test.com", active: true, created_at: "2026-09-25" },
  { id: 2, full_name: "María González", email: "maria@importfull.com", active: true, created_at: "2026-08-14" },
  { id: 3, full_name: "Javier Torres", email: "javier@importfull.com", active: true, created_at: "2026-07-02" },
  { id: 4, full_name: "Lucía Fernández", email: "lucia@importfull.com", active: false, created_at: "2026-06-19" },
];

const initials = (name: string) => name.split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();

function AddUserModal({ onClose, onAdd }: { onClose: () => void; onAdd: (u: { full_name: string; email: string; password: string }) => void }) {
  const [full_name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const valid = full_name.trim() && /.+@.+\..+/.test(email) && password.length >= 6;

  const fieldStyle = { border: "1.5px solid #E2E8F0", color: "#0A1628" } as const;
  const focus = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.12)"; };
  const blur = (e: React.FocusEvent<HTMLInputElement>) => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "fadeUp 0.18s ease both" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: "#E0E7FF" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#4F46E5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="7" r="2.8" /><path d="M2.5 16.5c0-2.8 2.4-4.5 5.5-4.5M14 6v5M16.5 8.5h-5" /></svg>
          </div>
          <h3 className="text-lg font-bold" style={{ color: "#0A1628" }}>Agregar usuario</h3>
        </div>

        {[
          { label: "Nombre completo", value: full_name, set: setName, type: "text", ph: "Nombre y apellido" },
          { label: "Email", value: email, set: setEmail, type: "email", ph: "usuario@empresa.com" },
          { label: "Contraseña", value: password, set: setPassword, type: "password", ph: "Mínimo 6 caracteres" },
        ].map(f => (
          <div key={f.label} className="flex flex-col gap-1.5">
            <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{f.label}</span>
            <input type={f.type} value={f.value} placeholder={f.ph} onChange={e => f.set(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all" style={fieldStyle} onFocus={focus} onBlur={blur} />
          </div>
        ))}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")}
            onMouseLeave={e => (e.currentTarget.style.background = "white")}>
            Cancelar
          </button>
          <button onClick={() => { onAdd({ full_name: full_name.trim(), email: email.trim(), password }); onClose(); }} disabled={!valid}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: valid ? "#4F46E5" : "#C7D2FE", cursor: valid ? "pointer" : "default" }}
            onMouseEnter={e => { if (valid) e.currentTarget.style.background = "#4338CA"; }}
            onMouseLeave={e => { if (valid) e.currentTarget.style.background = "#4F46E5"; }}>
            Agregar
          </button>
        </div>
      </div>
    </div>
  );
}

function Usuarios() {
  const [users, setUsers] = useState<AppUser[]>(INITIAL_USERS);
  const [adding, setAdding] = useState(false);

  const toggleActive = (id: number) => setUsers(us => us.map(u => (u.id === id ? { ...u, active: !u.active } : u)));
  const addUser = (u: { full_name: string; email: string; password: string }) =>
    setUsers(us => [...us, { id: Math.max(0, ...us.map(x => x.id)) + 1, full_name: u.full_name, email: u.email, active: true, created_at: new Date().toISOString().slice(0, 10) }]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-8 flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "#0A1628" }}>Usuarios</h1>
            <p className="text-sm mt-0.5" style={{ color: "#64748B" }}>{users.filter(u => u.active).length} activos · {users.length} en total</p>
          </div>
          <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: "#4F46E5" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#4338CA")}
            onMouseLeave={e => (e.currentTarget.style.background = "#4F46E5")}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3.5v9M3.5 8h9" /></svg>
            Agregar usuario
          </button>
        </div>

        <div className="rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                {["Usuario", "Estado", "Fecha de alta", "Acceso"].map((h, i) => (
                  <th key={h || i} className="px-5 py-3 font-semibold tracking-wider"
                    style={{ color: "#94A3B8", fontSize: "10px", letterSpacing: "0.07em", textAlign: i === 3 ? "right" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="transition-colors hover:bg-slate-50" style={{ borderBottom: "1px solid #F8FAFC", opacity: u.active ? 1 : 0.6 }}>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{ background: u.active ? "#4F46E5" : "#94A3B8" }}>
                        {initials(u.full_name)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate" style={{ color: "#0A1628" }}>{u.full_name}</p>
                        <p className="text-xs truncate" style={{ color: "#94A3B8" }}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: u.active ? "#16A34A" : "#94A3B8" }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: u.active ? "#16A34A" : "#CBD5E1" }} />
                      {u.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-xs" style={{ color: "#64748B" }}>{u.created_at}</td>
                  <td className="px-5 py-3.5 text-right">
                    <button onClick={() => toggleActive(u.id)}
                      className="relative rounded-full transition-colors flex-shrink-0 align-middle"
                      style={{ width: 34, height: 20, background: u.active ? "#16A34A" : "#CBD5E1" }}
                      title={u.active ? "Desactivar usuario" : "Activar usuario"}
                      aria-label="Activar / desactivar usuario" aria-pressed={u.active}>
                      <span className="absolute rounded-full bg-white transition-all" style={{ width: 14, height: 14, top: 3, left: u.active ? 17 : 3, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {adding && <AddUserModal onClose={() => setAdding(false)} onAdd={addUser} />}
    </div>
  );
}

// ─── Work-in-progress placeholder ───────────────────────────────────────────────

// ─── Preguntas · Atención al cliente MercadoLibre ──────────────────────────────
// Mock en memoria contra el contrato /api/mercadolibre/messages. Mismas formas de
// respuesta y mismos errores {error, message} que el backend.

type MsgKind = "question" | "post_sale";
type ReplyStatus = "new" | "ai_suggested" | "needs_review" | "answered" | "closed";
type AiMode = "off" | "suggest" | "autopilot";

interface MsgListItem {
  id: string; kind: MsgKind; buyer_name: string; product_title: string; last_text: string;
  reply_status: ReplyStatus; assigned_to: string | null; ai_confidence: number | null;
  created_at: string; last_activity: string; listing_id: string;
  last_reply_mode?: "ai" | "human" | null; // opcional: origen de la última respuesta (badge IA/Humano)
}
interface MsgReply {
  author: "buyer" | "seller"; mode: "ai" | "human" | null; text: string;
  status: "received" | "sent" | "failed" | "draft";
  audit_verdict: "approved" | "corrected" | null; audit_score: number | null; audit_issues: string[];
  created_at: string;
  cited_products?: { title: string; price: number; stock: number }[];
}
interface MsgDetail {
  message: MsgListItem & { listing_id: string; product_id: number; answered_externally?: boolean; closed_reason?: string; review_reason?: string; ai_error?: string };
  replies: MsgReply[];
  product: { title: string; price: number; stock: number; listing_status: ChannelStatus };
}

const ME = "me";
const minsAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();

const REPLY_STATUS: Record<ReplyStatus, { label: string; glyph: string; color: string; bg: string }> = {
  new:          { label: "Nueva",        glyph: "●", color: "#4F46E5", bg: "#EEF2FF" },
  ai_suggested: { label: "IA sugerida",  glyph: "✨", color: "#7C3AED", bg: "#F5F3FF" },
  needs_review: { label: "Para revisar", glyph: "⚠", color: "#B45309", bg: "#FEF3C7" },
  answered:     { label: "Respondida",   glyph: "✓", color: "#16A34A", bg: "#DCFCE7" },
  closed:       { label: "Cerrada",      glyph: "",  color: "#64748B", bg: "#F1F5F9" },
};
const STATUS_ORDER: ReplyStatus[] = ["new", "ai_suggested", "needs_review", "answered", "closed"];

// Estado compartido de la demo (rol de sesión, modo IA, simulación de fallas).
type CsConfig = { mode: AiMode; min_confidence: number; audit: boolean };
const csStore = {
  role: "owner" as "owner" | "employee",
  config: { mode: "suggest", min_confidence: 75, audit: true } as CsConfig,
  offline: false,
  subs: new Set<() => void>(),
  set(patch: Partial<{ role: "owner" | "employee"; config: CsConfig; offline: boolean }>) { Object.assign(this, patch); this.subs.forEach(f => f()); },
};
function useCsStore() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(n => n + 1); csStore.subs.add(f); return () => { csStore.subs.delete(f); }; }, []);
  return csStore;
}

const r = (p: Partial<MsgReply> & Pick<MsgReply, "author" | "text" | "created_at">): MsgReply =>
  ({ mode: null, status: p.author === "buyer" ? "received" : "sent", audit_verdict: null, audit_score: null, audit_issues: [], ...p });

let MSG_DB: MsgDetail[] = [
  {
    message: { id: "Q-9012", kind: "question", buyer_name: "Martina R.", product_title: "Set Tabla Gourmet", last_text: "Hola! La tabla viene con los chocolates incluidos o se compran aparte? Hacen factura A?", reply_status: "ai_suggested", assigned_to: null, ai_confidence: 0.91, created_at: minsAgo(6), last_activity: minsAgo(6), last_reply_mode: null, listing_id: "MLA1000000822", product_id: 6 },
    replies: [
      r({ author: "buyer", text: "Hola! La tabla viene con los chocolates incluidos o se compran aparte? Hacen factura A?", created_at: minsAgo(6) }),
      r({ author: "seller", mode: "ai", status: "draft", text: "¡Hola Martina! Sí, la tabla incluye la selección de chocolates artesanales, no tenés que comprar nada aparte. Hacemos factura A: cuando confirmes la compra, mandanos tu CUIT por la mensajería de MercadoLibre. ¡Saludos!", audit_verdict: "approved", audit_score: 0.91, created_at: minsAgo(5),
        cited_products: [{ title: "Set Tabla Gourmet", price: 31000, stock: 1 }] }),
    ],
    product: { title: "Set Tabla Gourmet", price: 31000, stock: 1, listing_status: "published" },
  },
  {
    message: { id: "M-4410", kind: "post_sale", buyer_name: "Julián P.", product_title: "Paño Decoración Estampado", last_text: "Me llegó con una mancha, quiero hacer la devolución.", reply_status: "needs_review", assigned_to: null, ai_confidence: null, created_at: minsAgo(38), last_activity: minsAgo(14), last_reply_mode: "human", listing_id: "MLA1000000274", product_id: 2, review_reason: "Devolución: la IA no responde reclamos ni devoluciones.", ai_error: "La IA no pudo responder: el mensaje es una devolución y requiere una persona." },
    replies: [
      r({ author: "buyer", text: "Hola, ya me llegó el paño.", created_at: minsAgo(38) }),
      r({ author: "seller", mode: "human", text: "¡Genial Julián! Cualquier cosa nos escribís.", created_at: minsAgo(30) }),
      r({ author: "buyer", text: "Me llegó con una mancha, quiero hacer la devolución.", created_at: minsAgo(14) }),
    ],
    product: { title: "Paño Decoración Estampado", price: 3200, stock: 0, listing_status: "published" },
  },
  {
    message: { id: "Q-9008", kind: "question", buyer_name: "Lucía F.", product_title: "Promo Mate Día del Padre", last_text: "Cuánto tarda en llegar a Córdoba capital?", reply_status: "needs_review", assigned_to: ME, ai_confidence: 0.42, created_at: minsAgo(52), last_activity: minsAgo(20), last_reply_mode: "ai", listing_id: "MLA1000000548", product_id: 4, review_reason: "No se pudo enviar la respuesta a MercadoLibre." },
    replies: [
      r({ author: "buyer", text: "Cuánto tarda en llegar a Córdoba capital?", created_at: minsAgo(52) }),
      r({ author: "seller", mode: "ai", status: "failed", text: "¡Hola Lucía! A Córdoba capital llega en 3 a 5 días hábiles con MercadoEnvíos. ¡Saludos!", audit_verdict: "corrected", audit_score: 0.42, audit_issues: ["Se quitó una promesa de envío gratis que no está configurada."], created_at: minsAgo(20) }),
    ],
    product: { title: "Promo Mate Día del Padre", price: 10500, stock: 0, listing_status: "paused" },
  },
  {
    message: { id: "Q-9015", kind: "question", buyer_name: "Diego S.", product_title: "Quesera Plástico", last_text: "Es apta lavavajillas? Tienen en otro color?", reply_status: "new", assigned_to: null, ai_confidence: null, created_at: minsAgo(2), last_activity: minsAgo(2), last_reply_mode: null, listing_id: "MLA1000000137", product_id: 1 },
    replies: [r({ author: "buyer", text: "Es apta lavavajillas? Tienen en otro color?", created_at: minsAgo(2) })],
    product: { title: "Quesera Plástico", price: 2500, stock: 0, listing_status: "failed" },
  },
  {
    message: { id: "Q-9001", kind: "question", buyer_name: "Sofía M.", product_title: "Set Vaso + Perfume", last_text: "Viene en caja de regalo?", reply_status: "answered", assigned_to: null, ai_confidence: 0.95, created_at: minsAgo(180), last_activity: minsAgo(172), last_reply_mode: "ai", listing_id: "MLA1000000411", product_id: 3 },
    replies: [
      r({ author: "buyer", text: "Viene en caja de regalo?", created_at: minsAgo(180) }),
      r({ author: "seller", mode: "ai", text: "¡Hola Sofía! Sí, viene en caja de regalo lista para entregar. ¡Saludos!", audit_verdict: "approved", audit_score: 0.95, created_at: minsAgo(172) }),
    ],
    product: { title: "Set Vaso + Perfume", price: 15500, stock: 0, listing_status: "unpublished" },
  },
  {
    message: { id: "Q-8994", kind: "question", buyer_name: "Ramiro G.", product_title: "Set Tabla Gourmet", last_text: "Hacen envíos a Rosario?", reply_status: "answered", assigned_to: null, ai_confidence: null, created_at: minsAgo(400), last_activity: minsAgo(390), last_reply_mode: "human", listing_id: "MLA1000000822", product_id: 6, answered_externally: true },
    replies: [r({ author: "buyer", text: "Hacen envíos a Rosario?", created_at: minsAgo(400) })],
    product: { title: "Set Tabla Gourmet", price: 31000, stock: 1, listing_status: "published" },
  },
  {
    message: { id: "M-4398", kind: "post_sale", buyer_name: "Carla V.", product_title: "Set Tabla Gourmet", last_text: "Necesito cambiar la dirección de entrega.", reply_status: "ai_suggested", assigned_to: ME, ai_confidence: 0.78, created_at: minsAgo(95), last_activity: minsAgo(95), last_reply_mode: null, listing_id: "MLA1000000822", product_id: 6 },
    replies: [
      r({ author: "buyer", text: "Necesito cambiar la dirección de entrega.", created_at: minsAgo(95) }),
      r({ author: "seller", mode: "ai", status: "draft", text: "¡Hola Carla! Todavía no despachamos tu pedido, así que podemos cambiar la dirección. Pasanos la nueva dirección completa por acá y la actualizamos.", audit_verdict: "corrected", audit_score: 0.78, audit_issues: ["Se quitó un pedido de número de teléfono (dato personal fuera de la mensajería).", "Se reemplazó \"mañana sale\" por un plazo no comprometido."], created_at: minsAgo(94) }),
    ],
    product: { title: "Set Tabla Gourmet", price: 31000, stock: 1, listing_status: "published" },
  },
  {
    message: { id: "Q-8970", kind: "question", buyer_name: "Usuario eliminado", product_title: "Promo Taza + Perfume", last_text: "Tienen stock?", reply_status: "closed", assigned_to: null, ai_confidence: null, created_at: minsAgo(2900), last_activity: minsAgo(2880), last_reply_mode: null, listing_id: "MLA1000000685", product_id: 5, closed_reason: "MercadoLibre eliminó esta pregunta (el comprador cerró su cuenta)." },
    replies: [r({ author: "buyer", text: "Tienen stock?", created_at: minsAgo(2900) })],
    product: { title: "Promo Taza + Perfume", price: 15000, stock: 0, listing_status: "unpublished" },
  },
];
const sendFailOnce = new Set(["Q-9008"]);
const suggestFailOnce = new Set(["Q-9015"]);

// Historial de demo: conversaciones ya resueltas para que la bandeja tenga volumen real y se pagine.
(() => {
  const buyers = ["Sofía M.", "Tomás G.", "Valentina L.", "Mateo C.", "Camila B.", "Agustín V.", "Florencia N.", "Nicolás H.", "Paula D.", "Federico A.", "Carla T.", "Ignacio O."];
  const prods = [
    { title: "Set Tabla Gourmet", price: 31000, stock: 1, listing_id: "MLA1000000822", product_id: 6 },
    { title: "Quesera Plástico", price: 2500, stock: 0, listing_id: "MLA1000000137", product_id: 1 },
    { title: "Promo Mate Día del Padre", price: 10500, stock: 0, listing_id: "MLA1000000548", product_id: 4 },
    { title: "Paño Decoración Estampado", price: 3200, stock: 0, listing_id: "MLA1000000274", product_id: 2 },
  ];
  const qs = [["¿Hacen envíos a Rosario?", "¡Hola! Sí, enviamos a todo el país con MercadoEnvíos. ¡Saludos!"], ["¿Tienen stock para comprar 3?", "¡Hola! Por ahora tenemos stock limitado, consultanos antes de ofertar."], ["¿Aceptan cuotas sin interés?", "¡Hola! Sí, MercadoLibre ofrece cuotas según tu banco."], ["¿Se puede retirar en persona?", "¡Hola! Por ahora solo hacemos envíos. ¡Gracias!"]];
  const ps = [["¿Cuándo despachan mi compra?", "¡Hola! Sale hoy por la tarde, te llega el código de seguimiento."], ["Ya me llegó, muchas gracias!", "¡Gracias a vos! Que lo disfrutes."], ["¿Me pueden mandar la factura?", "¡Hola! Ya la adjuntamos en el detalle de la compra."]];
  for (let i = 0; i < 52; i++) {
    const kind: MsgKind = i % 3 === 2 ? "post_sale" : "question";
    const [q, a] = (kind === "question" ? qs : ps)[i % (kind === "question" ? qs.length : ps.length)];
    const pr = prods[i % prods.length]; const t = 180 + i * 97;
    const status: ReplyStatus = i % 9 === 4 ? "closed" : "answered";
    const mode: "human" | "ai" = i % 4 === 0 ? "human" : "ai";
    MSG_DB.push({
      message: { id: `${kind === "question" ? "Q" : "M"}-${8000 + i}`, kind, buyer_name: buyers[i % buyers.length], product_title: pr.title, last_text: q, reply_status: status, assigned_to: null, ai_confidence: null, created_at: minsAgo(t + 10), last_activity: minsAgo(t), last_reply_mode: mode, listing_id: pr.listing_id, product_id: pr.product_id, ...(status === "closed" ? { closed_reason: "La publicación se pausó." } : {}) },
      replies: [r({ author: "buyer", text: q, created_at: minsAgo(t + 10) }), r({ author: "seller", mode, text: a, created_at: minsAgo(t) })],
      product: { title: pr.title, price: pr.price, stock: pr.stock, listing_status: "published" },
    });
  }
})();

const toItem = (d: MsgDetail): MsgListItem => {
  const { id, kind, buyer_name, product_title, last_text, reply_status, assigned_to, ai_confidence, created_at, last_activity, last_reply_mode, listing_id } = d.message;
  return { id, kind, buyer_name, product_title, last_text, reply_status, assigned_to, ai_confidence, created_at, last_activity, last_reply_mode, listing_id };
};
const csGuard = () => { if (csStore.offline) throw new ApiError(502, "network", "Sin conexión con el servidor. Revisá tu internet y volvé a intentar."); };
const findMsg = (id: string) => { const d = MSG_DB.find(m => m.message.id === id); if (!d) throw new ApiError(404, "not_found", "No encontramos esta conversación. Puede que MercadoLibre la haya eliminado."); return d; };
const lockedMsg = (d: MsgDetail) => {
  if (d.message.reply_status === "closed") throw new ApiError(409, "closed", "La conversación está cerrada en MercadoLibre.");
  if (d.message.answered_externally) throw new ApiError(409, "already_answered", "Esta pregunta ya se respondió desde MercadoLibre.");
};

const messagesApi = {
  async list(p: { kind: MsgKind; reply_status: ReplyStatus[]; q: string; page: number; page_size: number }): Promise<{ items: MsgListItem[]; page: number; total: number }> {
    await wait(550); csGuard();
    const q = p.q.trim().toLowerCase();
    const items = MSG_DB.map(toItem)
      .filter(m => m.kind === p.kind && (p.reply_status.length === 0 || p.reply_status.includes(m.reply_status)))
      .filter(m => !q || m.buyer_name.toLowerCase().includes(q) || m.product_title.toLowerCase().includes(q))
      .sort((a, b) => b.last_activity.localeCompare(a.last_activity));
    return { items: items.slice((p.page - 1) * p.page_size, p.page * p.page_size), page: p.page, total: items.length };
  },
  async get(id: string): Promise<MsgDetail> { await wait(450); csGuard(); return structuredClone(findMsg(id)); },
  async aiSuggest(id: string): Promise<{ reply: MsgReply; audit: { verdict: "approved" | "corrected"; score: number; issues: string[] } }> {
    await wait(1400); csGuard();
    const d = findMsg(id); lockedMsg(d);
    if (suggestFailOnce.has(id)) { suggestFailOnce.delete(id); throw new ApiError(502, "ai_unavailable", "El servicio de IA no respondió a tiempo."); }
    if (/devoluci|reclamo|mancha|roto/i.test(d.message.last_text)) {
      d.message.reply_status = "needs_review";
      throw new ApiError(400, "needs_human", "La IA no pudo responder: el mensaje es un reclamo o una devolución y requiere una persona.");
    }
    const score = 0.86;
    const reply = r({ author: "seller", mode: "ai", status: "draft", text: `¡Hola ${d.message.buyer_name.split(" ")[0]}! Gracias por tu consulta. ${d.product.stock > 0 ? `Tenemos ${d.product.stock} unidad${d.product.stock > 1 ? "es" : ""} disponible${d.product.stock > 1 ? "s" : ""} para envío inmediato.` : "En este momento estamos reponiendo stock; te avisamos apenas ingrese."} Cualquier otra duda, escribinos. ¡Saludos!`, audit_verdict: csStore.config.audit ? "approved" : null, audit_score: score, created_at: new Date().toISOString(), cited_products: [{ title: d.product.title, price: d.product.price, stock: d.product.stock }] });
    d.replies = d.replies.filter(x => x.status !== "draft").concat(reply);
    d.message.reply_status = "ai_suggested"; d.message.ai_confidence = score; d.message.ai_error = undefined; d.message.review_reason = undefined;
    return { reply, audit: { verdict: "approved", score, issues: [] } };
  },
  async improve(id: string, text: string): Promise<{ text: string }> {
    await wait(1000); csGuard();
    const d = findMsg(id);
    if (!text.trim()) throw new ApiError(400, "empty", "Escribí algo para que la IA lo pueda mejorar.");
    let t = text.trim().replace(/\s+/g, " ");
    t = t.charAt(0).toUpperCase() + t.slice(1);
    if (!/[.!?]$/.test(t)) t += ".";
    if (!/^(¡?hola)/i.test(t)) t = `¡Hola ${d.message.buyer_name.split(" ")[0]}! ${t}`;
    if (!/saludos/i.test(t)) t += " ¡Saludos!";
    return { text: t };
  },
  async reply(id: string, text: string): Promise<{ reply: MsgReply }> {
    await wait(1100); csGuard();
    const d = findMsg(id); lockedMsg(d);
    if (!text.trim()) throw new ApiError(400, "empty", "La respuesta está vacía.");
    if (text.length > 2000) throw new ApiError(400, "too_long", "MercadoLibre acepta hasta 2000 caracteres por respuesta.");
    const draft = d.replies.find(x => x.status === "draft");
    const mode: "ai" | "human" = draft && draft.text === text ? "ai" : "human";
    if (sendFailOnce.has(id)) { sendFailOnce.delete(id); throw new ApiError(502, "ml_unavailable", "MercadoLibre no respondió (error 502). Tu respuesta no se envió."); }
    const reply = r({ author: "seller", mode, text, audit_verdict: draft?.audit_verdict ?? null, audit_score: draft?.audit_score ?? null, audit_issues: draft?.audit_issues ?? [], created_at: new Date().toISOString() });
    d.replies = d.replies.filter(x => x.status !== "draft" && x.status !== "failed").concat(reply);
    Object.assign(d.message, { reply_status: "answered", last_reply_mode: mode, last_activity: reply.created_at, review_reason: undefined, ai_error: undefined });
    return { reply };
  },
  async discardSuggestion(id: string): Promise<{ ok: true }> {
    await wait(400); csGuard();
    const d = findMsg(id);
    d.replies = d.replies.filter(x => x.status !== "draft");
    if (d.message.reply_status === "ai_suggested") d.message.reply_status = "new";
    return { ok: true };
  },
  async assign(id: string): Promise<{ assigned_to: string | null }> {
    await wait(400); csGuard();
    const d = findMsg(id);
    d.message.assigned_to = d.message.assigned_to === ME ? null : ME;
    return { assigned_to: d.message.assigned_to };
  },
};

const QUICK_REPLIES = [
  { label: "Stock disponible", text: "¡Hola! Sí, tenemos stock disponible para envío inmediato. ¡Saludos!" },
  { label: "Plazo de envío", text: "¡Hola! El envío demora entre 3 y 5 días hábiles con MercadoEnvíos. ¡Saludos!" },
  { label: "Factura A", text: "¡Hola! Sí, hacemos factura A. Cuando confirmes la compra, mandanos tu CUIT por la mensajería. ¡Saludos!" },
  { label: "Gracias por tu compra", text: "¡Gracias por tu compra! Cualquier duda, escribinos por acá." },
];

// Enlace a la conversación en MercadoLibre (preventa: pregunta de la publicación · postventa: mensajería de la venta).
const mlConversationUrl = (m: { id: string; kind: MsgKind; listing_id: string }) =>
  m.kind === "question"
    ? `https://www.mercadolibre.com.ar/preguntas/vendedor?item=${m.listing_id}&question=${m.id}`
    : `https://www.mercadolibre.com.ar/mensajes/${m.id}`;
function ExtLinkIcon({ size = 12 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3h4v4M13 3 7 9M11 9.5V13H3V5h3.5" /></svg>;
}

function fmtWhen(iso: string) {
  const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 60000;
  if (diff < 1) return "ahora";
  if (diff < 60) return `hace ${Math.round(diff)} min`;
  const today = new Date(); const sameDay = d.toDateString() === today.toDateString();
  const hm = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }).replace(/\s*([ap])\.\s*m\./i, " $1.m.").replace(/\s/g, "\u00a0");
  if (sameDay) return hm;
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `ayer ${hm}`;
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "short" });
}

const SpinIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className="animate-spin flex-shrink-0"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeOpacity="0.3" strokeWidth="1.5" /><path d="M10.5 6A4.5 4.5 0 0 0 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
);
const SparkIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className="flex-shrink-0"><path d="M8 1.5l1.4 4.1 4.1 1.4-4.1 1.4L8 12.5 6.6 8.4 2.5 7l4.1-1.4L8 1.5zM13 11l.6 1.4 1.4.6-1.4.6L13 15l-.6-1.4L11 13l1.4-.6L13 11z" fill="currentColor" /></svg>
);

function ReplyStatusChip({ status, compact }: { status: ReplyStatus; compact?: boolean }) {
  const s = REPLY_STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap ${compact ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`} style={{ color: s.color, background: s.bg }}>
      {s.glyph && <span aria-hidden style={{ fontSize: compact ? 8 : 9 }}>{s.glyph}</span>}{s.label}
    </span>
  );
}
function ModeBadge({ mode }: { mode: "ai" | "human" }) {
  return mode === "ai"
    ? <span className="inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[10px] font-bold" style={{ color: "#7C3AED", background: "#F5F3FF" }}><SparkIcon size={9} />IA</span>
    : <span className="inline-flex items-center px-1.5 py-px rounded text-[10px] font-bold" style={{ color: "#0369A1", background: "#E0F2FE" }}>Humano</span>;
}
function MineBadge() {
  return <span className="inline-flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-semibold" style={{ color: "#0A1628", background: "#F1F5F9" }}>
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="5.5" r="2.8" stroke="currentColor" strokeWidth="1.6" /><path d="M2.5 14c.8-2.8 3-4.2 5.5-4.2s4.7 1.4 5.5 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
    Asignada a mí</span>;
}

function CsErrorState({ title, message, onRetry, busy }: { title: string; message: string; onRetry: () => void; busy?: boolean }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-6 py-12">
      <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: "#FEF2F2", color: "#DC2626" }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M2 8.8a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 9-2.6M8.5 16a5 5 0 0 1 5-1M12 20h.01M3 3l18 18" /></svg>
      </span>
      <div>
        <p className="text-sm font-bold" style={{ color: "#0A1628" }}>{title}</p>
        <p className="text-xs mt-1 max-w-xs" style={{ color: "#64748B" }}>{message}</p>
      </div>
      <button onClick={onRetry} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white" style={{ background: "#4F46E5" }}>
        {busy && <SpinIcon />} Reintentar
      </button>
    </div>
  );
}

// ── Lista ──
function ConversationItem({ m, selected, onClick }: { m: MsgListItem; selected: boolean; onClick: () => void }) {
  const unread = m.reply_status === "new" || m.reply_status === "needs_review";
  return (
    <button onClick={onClick} aria-current={selected}
      className="w-full text-left px-4 py-3 flex flex-col gap-1.5 transition-colors"
      style={{ background: selected ? "#EEF2FF" : "white", borderLeft: `3px solid ${selected ? "#4F46E5" : "transparent"}`, borderBottom: "1px solid #F1F5F9" }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "#F8FAFC"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = "white"; }}>
      <div className="flex items-center gap-2">
        {unread && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: REPLY_STATUS[m.reply_status].color }} aria-hidden />}
        <span className={`text-sm truncate ${unread ? "font-bold" : "font-semibold"}`} style={{ color: "#0A1628" }}>{m.buyer_name}</span>
        <span className="ml-auto text-[11px] tabular-nums flex-shrink-0" style={{ color: unread ? "#4F46E5" : "#94A3B8", fontWeight: unread ? 600 : 400 }}>{fmtWhen(m.last_activity)}</span>
      </div>
      <span className="text-[11px] truncate" style={{ color: "#64748B" }}>{m.product_title}</span>
      <span className="text-xs line-clamp-2" style={{ color: unread ? "#334155" : "#94A3B8" }}>{m.last_text}</span>
      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
        <ReplyStatusChip status={m.reply_status} compact />
        {m.last_reply_mode && <ModeBadge mode={m.last_reply_mode} />}
        {m.assigned_to === ME && <MineBadge />}
      </div>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando conversaciones">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="px-4 py-3.5 flex flex-col gap-2 animate-pulse" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="flex justify-between"><div className="h-3 w-28 rounded bg-slate-200" /><div className="h-2.5 w-10 rounded bg-slate-100" /></div>
          <div className="h-2.5 w-40 rounded bg-slate-100" />
          <div className="h-2.5 w-full rounded bg-slate-100" />
          <div className="flex gap-1.5"><div className="h-4 w-16 rounded-full bg-slate-100" /><div className="h-4 w-8 rounded bg-slate-100" /></div>
        </div>
      ))}
    </div>
  );
}

// ── Detalle ──
function ThreadBubble({ rep }: { rep: MsgReply }) {
  const out = rep.author === "seller";
  const failed = rep.status === "failed";
  return (
    <div className={`flex flex-col gap-1 max-w-[86%] ${out ? "self-end items-end" : "self-start items-start"}`}>
      <div className="px-3.5 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap"
        style={out
          ? { background: failed ? "#FEF2F2" : "#4F46E5", color: failed ? "#7F1D1D" : "white", border: failed ? "1px dashed #FCA5A5" : "none", borderRadius: "16px 16px 4px 16px" }
          : { background: "white", color: "#0A1628", border: "1px solid #E2E8F0", borderRadius: "16px 16px 16px 4px" }}>
        {rep.text}
      </div>
      <div className="flex items-center gap-1.5 text-[10.5px]" style={{ color: "#94A3B8" }}>
        {out && rep.mode && <ModeBadge mode={rep.mode} />}
        <span className="tabular-nums">{fmtWhen(rep.created_at)}</span>
        {out && (failed
          ? <span className="font-semibold" style={{ color: "#DC2626" }}>· No enviada</span>
          : <span className="inline-flex items-center gap-0.5">· Enviada
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l2.5 2.5L11 5.5M7.5 11l.5.5L13.5 5.5" stroke="#16A34A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>)}
      </div>
    </div>
  );
}

function Notice({ tone, title, children, action }: { tone: "info" | "warn" | "error" | "lock"; title: string; children?: ReactNode; action?: ReactNode }) {
  const t = { info: ["#EFF6FF", "#BFDBFE", "#1D4ED8"], warn: ["#FFFBEB", "#FDE68A", "#B45309"], error: ["#FEF2F2", "#FECACA", "#B91C1C"], lock: ["#F8FAFC", "#E2E8F0", "#475569"] }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className="flex items-start gap-2.5 rounded-xl px-3.5 py-3" style={{ background: t[0], border: `1px solid ${t[1]}` }}>
      <span className="mt-0.5 flex-shrink-0" style={{ color: t[2] }}>
        {tone === "lock"
          ? <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" /></svg>
          : <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" /><path d="M8 4.8v3.7M8 10.8h.01" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold" style={{ color: t[2] }}>{title}</p>
        {children && <div className="text-xs mt-0.5 leading-relaxed" style={{ color: "#475569" }}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

function SuggestionBlock({ draft, aiError, mode, busy, regenerating, sendError, onSend, onDiscard, onRetry, textRef }: {
  draft: MsgReply | null; aiError: string | null; mode: AiMode; busy: "send" | "discard" | null; regenerating: boolean; sendError: string | null;
  onSend: (t: string) => void; onDiscard: () => void; onRetry: () => void; textRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState(draft?.text ?? "");
  useEffect(() => { setText(draft?.text ?? ""); }, [draft]);
  if (mode === "off" && !draft && !aiError) return null;
  const conf = draft?.audit_score != null ? Math.round(draft.audit_score * 100) : null;
  const low = conf != null && conf < csStore.config.min_confidence;

  return (
    <section aria-label="Sugerencia de IA" className="rounded-2xl overflow-hidden" style={{ border: "1px solid #DDD6FE", background: "#FDFCFF" }}>
      <header className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: "1px solid #EDE9FE", background: "#F5F3FF" }}>
        <span style={{ color: "#7C3AED" }}><SparkIcon size={13} /></span>
        <span className="text-xs font-bold" style={{ color: "#5B21B6" }}>Sugerencia de IA</span>
        {draft && !regenerating && conf != null && (
          <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: low ? "#B45309" : "#475569" }} title={`Umbral mínimo: ${csStore.config.min_confidence}%`}>
            <span className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "#EDE9FE" }}>
              <span className="block h-full rounded-full" style={{ width: `${conf}%`, background: low ? "#F59E0B" : "#7C3AED" }} />
            </span>
            Confianza {conf}%
          </span>
        )}
      </header>

      <div className="p-4 flex flex-col gap-3">
        {regenerating ? (
          <div className="flex flex-col gap-2 py-2" aria-busy="true">
            <span className="inline-flex items-center gap-2 text-xs font-medium" style={{ color: "#7C3AED" }}><SpinIcon /> Generando borrador y auditoría…</span>
            <div className="h-2.5 rounded bg-violet-100 animate-pulse w-full" />
            <div className="h-2.5 rounded bg-violet-100 animate-pulse w-11/12" />
            <div className="h-2.5 rounded bg-violet-100 animate-pulse w-2/3" />
          </div>
        ) : !draft ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm font-semibold" style={{ color: "#0A1628" }}>No pudimos generar una sugerencia</p>
            <p className="text-xs" style={{ color: "#64748B" }}>{aiError ?? "La IA todavía no procesó este mensaje."}</p>
            <button onClick={onRetry} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold" style={{ color: "#6D28D9", border: "1px solid #DDD6FE", background: "white" }}>
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              Reintentar IA
            </button>
          </div>
        ) : (
          <>
            {draft.audit_verdict && (
              <div className="flex items-start gap-2 flex-wrap">
                {draft.audit_verdict === "approved"
                  ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: "#16A34A", background: "#DCFCE7" }}>✓ Aprobada por el auditor</span>
                  : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: "#B45309", background: "#FEF3C7" }}>✎ Corregida por el auditor</span>}
                {low && <span className="text-[11px] font-medium" style={{ color: "#B45309" }}>Debajo del umbral de {csStore.config.min_confidence}%: revisala antes de enviar.</span>}
              </div>
            )}
            {draft.audit_issues.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-lg px-3 py-2" style={{ background: "#FFFBEB" }}>
                {draft.audit_issues.map((iss, i) => (
                  <li key={i} className="flex gap-1.5 text-[11.5px]" style={{ color: "#78350F" }}><span aria-hidden>•</span>{iss}</li>
                ))}
              </ul>
            )}
            <textarea ref={textRef} value={text} onChange={e => setText(e.target.value)} rows={4} aria-label="Texto de la respuesta sugerida"
              className="w-full px-3.5 py-3 text-[13px] rounded-xl outline-none resize-y leading-relaxed"
              style={{ border: "1px solid #E2E8F0", background: "white", color: "#0A1628" }}
              onFocus={e => { e.target.style.borderColor = "#7C3AED"; e.target.style.boxShadow = "0 0 0 3px rgba(124,58,237,0.12)"; }}
              onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
            {draft.cited_products && draft.cited_products.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#94A3B8" }}>Productos citados</span>
                <div className="flex gap-1.5 flex-wrap">
                  {draft.cited_products.map(cp => (
                    <span key={cp.title} className="inline-flex items-center gap-1.5 pl-2.5 pr-2 py-1 rounded-full text-[11px]" style={{ border: "1px solid #E2E8F0", background: "white" }}>
                      <span className="font-semibold" style={{ color: "#0A1628" }}>{cp.title}</span>
                      <span className="tabular-nums" style={{ color: "#475569" }}>{fmt(cp.price)}</span>
                      <span className="tabular-nums px-1.5 rounded-full text-[10px] font-semibold" style={{ color: cp.stock > 0 ? "#16A34A" : "#DC2626", background: cp.stock > 0 ? "#DCFCE7" : "#FEE2E2" }}>{cp.stock > 0 ? `${cp.stock} en stock` : "Sin stock"}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {sendError && <Notice tone="error" title="No se pudo enviar la respuesta">{sendError} Tocá Enviar para reintentar.</Notice>}
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => onSend(text)} disabled={!!busy || !text.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: busy === "send" ? "#818CF8" : "#4F46E5", cursor: busy ? "wait" : "pointer" }}>
                {busy === "send" ? <><SpinIcon /> Enviando…</> : sendError ? "Reintentar envío" : "Enviar"}
              </button>
              <button onClick={onDiscard} disabled={!!busy} className="px-3.5 py-2.5 rounded-xl text-sm font-medium" style={{ color: "#475569", border: "1px solid #E2E8F0", background: "white" }}>
                {busy === "discard" ? "Descartando…" : "Descartar"}
              </button>
              <button onClick={onRetry} disabled={!!busy} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold" style={{ color: "#6D28D9" }}>
                <svg width="11" height="11" viewBox="0 0 16 16" fill="none"><path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Reintentar IA
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function Composer({ locked, lockMsg, busy, onSend, onImprove, sendError, inputRef }: {
  locked: boolean; lockMsg: string; busy: "send" | "improve" | null; sendError: string | null;
  onSend: (t: string, clear: () => void) => void; onImprove: (t: string, set: (v: string) => void) => void; inputRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [text, setText] = useState("");
  if (locked) return (
    <div className="px-4 py-3 bg-white" style={{ borderTop: "1px solid #E2E8F0" }}>
      <Notice tone="lock" title="Solo lectura">{lockMsg}</Notice>
    </div>
  );
  return (
    <div className="flex flex-col gap-2 px-3 md:px-4 pt-2.5 pb-3 bg-white" style={{ borderTop: "1px solid #E2E8F0", paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
      {sendError && <Notice tone="error" title="No se pudo enviar la respuesta" action={<button onClick={() => onSend(text, () => setText(""))} className="text-xs font-bold underline flex-shrink-0" style={{ color: "#B91C1C" }}>Reintentar</button>}>{sendError}</Notice>}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5" style={{ scrollbarWidth: "none" }} aria-label="Respuestas rápidas">
        {QUICK_REPLIES.map(q => (
          <button key={q.label} onClick={() => { setText(q.text); inputRef.current?.focus(); }}
            className="flex-shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors hover:bg-slate-100" style={{ border: "1px solid #E2E8F0", color: "#475569" }}>
            {q.label}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea ref={inputRef} value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Escribí tu respuesta…" aria-label="Respuesta manual"
            disabled={busy === "improve"}
            onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSend(text, () => setText("")); }}
            className="w-full px-3.5 py-2.5 text-[13px] rounded-xl outline-none resize-none leading-relaxed"
            style={{ border: "1px solid #E2E8F0", background: busy === "improve" ? "#F8FAFC" : "white", color: "#0A1628", maxHeight: 160 }}
            onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"; }}
            onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
          {busy === "improve" && <span className="absolute inset-0 flex items-center justify-center gap-2 text-xs font-medium rounded-xl" style={{ color: "#7C3AED", background: "rgba(255,255,255,0.7)" }}><SpinIcon /> Mejorando con IA…</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => onImprove(text, setText)} disabled={!text.trim() || !!busy}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-opacity"
          style={{ color: "#6D28D9", border: "1px solid #DDD6FE", background: "#FDFCFF", opacity: !text.trim() ? 0.5 : 1 }}>
          <SparkIcon size={11} /> Mejorar con IA
        </button>
        <span className="hidden md:inline text-[10.5px]" style={{ color: "#CBD5E1" }}>⌘/Ctrl + Enter para enviar</span>
        <button onClick={() => onSend(text, () => setText(""))} disabled={!text.trim() || !!busy}
          className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: !text.trim() ? "#C7D2FE" : busy === "send" ? "#818CF8" : "#4F46E5" }}>
          {busy === "send" ? <><SpinIcon /> Enviando…</> : <>Enviar <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2 8 14 2l-4 12-2.5-4.5L2 8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg></>}
        </button>
      </div>
    </div>
  );
}

function ConversationDetail({ id, focusOnOpen, onBack, onChanged, onOpenProduct, toast }: {
  id: string; focusOnOpen: boolean;  onBack: () => void; onChanged: (patch: Partial<MsgListItem> & { id: string }) => void;
  onOpenProduct: (p: Product) => void; toast: (t: { tone: "ok" | "err"; message: string }) => void;
}) {
  const store = useCsStore();
  const [data, setData] = useState<MsgDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [sugBusy, setSugBusy] = useState<"send" | "discard" | null>(null);
  const [sugErr, setSugErr] = useState<string | null>(null);
  const [compBusy, setCompBusy] = useState<"send" | "improve" | null>(null);
  const [compErr, setCompErr] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);
  const sugRef = useRef<HTMLTextAreaElement>(null);
  const compRef = useRef<HTMLTextAreaElement>(null);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setData(null); setLoadErr(null); setAiError(null); setSugErr(null); setCompErr(null);
    messagesApi.get(id).then(d => { if (alive) { setData(d); setAiError(d.message.ai_error ?? null); } })
      .catch(e => { if (alive) setLoadErr(e instanceof Error ? e.message : "Error del servidor."); });
    return () => { alive = false; };
  }, [id, reload]);

  // Entrada desde el link de WhatsApp/Telegram: foco directo en la respuesta.
  useEffect(() => {
    if (!data) return;
    threadEnd.current?.scrollIntoView({ block: "end" });
    if (focusOnOpen) setTimeout(() => (sugRef.current ?? compRef.current)?.focus(), 60);
  }, [data, focusOnOpen]);

  if (loadErr) return <CsErrorState title="No pudimos abrir la conversación" message={loadErr} onRetry={() => setReload(n => n + 1)} />;
  if (!data) return (
    <div className="flex-1 flex flex-col gap-4 p-5 animate-pulse" aria-busy="true">
      <div className="h-4 w-40 rounded bg-slate-200" /><div className="h-20 rounded-2xl bg-slate-100" />
      <div className="h-12 w-2/3 rounded-2xl bg-slate-100" /><div className="h-12 w-1/2 self-end rounded-2xl bg-slate-100" />
    </div>
  );

  const m = data.message;
  const product = products.find(p => p.id === m.product_id);
  const draft = data.replies.find(x => x.status === "draft") ?? null;
  const failed = data.replies.find(x => x.status === "failed") ?? null;
  const thread = data.replies.filter(x => x.status !== "draft");
  const closed = m.reply_status === "closed";
  const locked = closed || !!m.answered_externally;
  const lockMsg = closed ? (m.closed_reason ?? "La conversación está cerrada en MercadoLibre.") + " Ya no se puede responder." : "Esta pregunta ya se respondió desde MercadoLibre. Para cambiar la respuesta, entrá a tu cuenta de MercadoLibre.";
  const showSuggestion = !locked && m.reply_status !== "answered" && (draft || aiError || regenerating || (store.config.mode !== "off" && m.reply_status !== "needs_review"));

  const renderSuggestion = () => (
    <SuggestionBlock draft={draft} aiError={aiError} mode={store.config.mode} busy={sugBusy} regenerating={regenerating} sendError={sugErr}
      onSend={t => send(t, "suggestion")} onDiscard={discard} onRetry={regenerate} textRef={sugRef} />
  );
  const apply = (d: MsgDetail) => { setData(d); onChanged({ ...toItem(d) }); };
  const errMsg = (e: unknown) => e instanceof Error ? e.message : "Error inesperado.";

  const regenerate = async () => {
    setRegenerating(true); setAiError(null); setSugErr(null);
    try { await messagesApi.aiSuggest(id); apply(await messagesApi.get(id)); }
    catch (e) {
      setAiError(errMsg(e));
      if (e instanceof ApiError && e.code === "needs_human") { onChanged({ id, reply_status: "needs_review" }); setData(d => d && { ...d, message: { ...d.message, reply_status: "needs_review" } }); }
    } finally { setRegenerating(false); }
  };
  const send = async (text: string, from: "suggestion" | "composer", clear?: () => void) => {
    if (!text.trim()) return;
    const setBusy = from === "suggestion" ? (v: "send" | null) => setSugBusy(v) : (v: "send" | null) => setCompBusy(v);
    const setErr = from === "suggestion" ? setSugErr : setCompErr;
    setBusy("send"); setErr(null);
    try {
      await messagesApi.reply(id, text);
      apply(await messagesApi.get(id)); clear?.();
      toast({ tone: "ok", message: "Respuesta enviada" });
    } catch (e) {
      setErr(errMsg(e));
      if (e instanceof ApiError && e.code === "already_answered") setData(d => d && { ...d, message: { ...d.message, answered_externally: true } });
    } finally { setBusy(null); }
  };
  const discard = async () => {
    setSugBusy("discard");
    try { await messagesApi.discardSuggestion(id); apply(await messagesApi.get(id)); setAiError(null); toast({ tone: "ok", message: "Sugerencia descartada" }); }
    catch (e) { toast({ tone: "err", message: errMsg(e) }); }
    finally { setSugBusy(null); }
  };
  const improve = async (text: string, set: (v: string) => void) => {
    setCompBusy("improve");
    try { const res = await messagesApi.improve(id, text); set(res.text); compRef.current?.focus(); }
    catch (e) { toast({ tone: "err", message: `No se pudo mejorar el texto: ${errMsg(e)}` }); }
    finally { setCompBusy(null); }
  };
  const assign = async () => {
    setAssigning(true);
    try {
      const res = await messagesApi.assign(id);
      setData(d => d && { ...d, message: { ...d.message, assigned_to: res.assigned_to } });
      onChanged({ id, assigned_to: res.assigned_to });
      toast({ tone: "ok", message: res.assigned_to ? "Conversación asignada a vos" : "Conversación liberada" });
    } catch (e) { toast({ tone: "err", message: errMsg(e) }); }
    finally { setAssigning(false); }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0">
      {/* Encabezado */}
      <header className="flex items-center gap-3 px-3 md:px-5 py-3 bg-white flex-shrink-0" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[15px] font-bold truncate" style={{ color: "#0A1628" }}>{m.buyer_name}</h2>
            <ReplyStatusChip status={m.reply_status} />
            {m.answered_externally && <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold" style={{ color: "#475569", background: "#F1F5F9" }}>Respondida desde MercadoLibre</span>}
          </div>
          <p className="text-[11px] truncate mt-0.5" style={{ color: "#94A3B8" }}>
            {m.kind === "question" ? "Pregunta" : "Mensaje post-venta"} · {m.product_title} · <span className="font-mono">{m.listing_id}</span>
          </p>
        </div>
        {!closed && (
          <button onClick={assign} disabled={assigning}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold"
            style={m.assigned_to === ME ? { color: "#475569", border: "1px solid #E2E8F0", background: "white" } : { color: "#4F46E5", border: "1px solid #C7D2FE", background: "#EEF2FF" }}>
            {assigning ? <SpinIcon /> : null}
            {m.assigned_to === ME ? "Liberar" : "Asignarme"}
          </button>
        )}
        <button onClick={onBack} aria-label="Cerrar conversación" className="flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100" style={{ color: "#94A3B8" }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0" style={{ background: "#F8FAFC" }}>
        <div className="max-w-3xl mx-auto flex flex-col gap-4 px-3 md:px-6 py-4">
          {/* Tarjeta de producto */}
          <div className="flex items-center gap-3 rounded-2xl bg-white p-3" style={{ border: "1px solid #E2E8F0" }}>
            {product?.images?.[0]
              ? <img src={product.images[0]} alt="" className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              : <div className="flex-shrink-0"><ImgPlaceholder size={56} /></div>}
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold truncate" style={{ color: "#0A1628" }}>{data.product.title}</p>
            </div>
            {product && (
              <button onClick={() => onOpenProduct(product)} className="flex-shrink-0 text-xs font-semibold hover:underline" style={{ color: "#4F46E5" }}>Ver producto</button>
            )}
          </div>

          {closed && <Notice tone="lock" title="Conversación cerrada por MercadoLibre">{m.closed_reason} Se muestra solo como registro y quedó fuera de las colas activas.</Notice>}
          {m.reply_status === "needs_review" && m.review_reason && <Notice tone="warn" title="Para revisar · la IA no respondió">{m.review_reason} Te avisamos por WhatsApp/Telegram.</Notice>}

          {/* Hilo */}
          <div className="flex flex-col gap-3" aria-label="Hilo de mensajes">
            {thread.map((rep, i) => <ThreadBubble key={i} rep={rep} />)}
          </div>

          {failed && !locked && (
            <Notice tone="error" title="No se pudo enviar la respuesta"
              action={<button onClick={() => send(failed.text, "composer")} disabled={compBusy === "send"} className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold text-white" style={{ background: "#DC2626" }}>{compBusy === "send" ? <SpinIcon size={11} /> : null}Reintentar</button>}>
              MercadoLibre rechazó el envío por un error temporal. No se reintenta solo: tocá Reintentar cuando quieras volver a mandarla.
            </Notice>
          )}

          {showSuggestion && renderSuggestion()}
          <div ref={threadEnd} />
        </div>
      </div>

      <Composer locked={locked} lockMsg={lockMsg} busy={compBusy} sendError={compErr} inputRef={compRef}
        onSend={(t, clear) => send(t, "composer", clear)} onImprove={improve} />
    </div>
  );
}

function readOpenParam() {
  try { return new URLSearchParams(window.location.search).get("open"); } catch { return null; }
}
function writeOpenParam(id: string | null) {
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("open", id); else url.searchParams.delete("open");
    window.history.replaceState(null, "", url);
  } catch { /* entorno sin history */ }
}

// Estado compartido de la bandeja (lista, filtros, selección, toast) para ambas propuestas.
function useInbox() {
  const store = useCsStore();
  const deepLink = useRef(readOpenParam());
  const [kind, setKindState] = useState<MsgKind>(() => deepLink.current?.startsWith("M-") ? "post_sale" : "question");
  const [statuses, setStatuses] = useState<ReplyStatus[]>([]);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<MsgListItem[] | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  useEffect(() => { setPage(1); }, [kind, statuses, q, pageSize]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(deepLink.current);
  const [toast, setToast] = useState<{ tone: "ok" | "err"; message: string } | null>(null);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  useEffect(() => {
    let alive = true;
    setItems(null); setListErr(null);
    const t = setTimeout(() => {
      messagesApi.list({ kind, reply_status: statuses, q, page, page_size: pageSize })
        .then(res => { if (alive) { setItems(res.items); setTotal(res.total); } })
        .catch(e => { if (alive) setListErr(e instanceof Error ? e.message : "Error del servidor."); });
    }, q ? 250 : 0);
    return () => { alive = false; clearTimeout(t); };
  }, [kind, statuses, q, page, pageSize, reload, store.offline]);

  const select = (id: string | null) => { setSelectedId(id); writeOpenParam(id); };
  const setKind = (k: MsgKind) => { setKindState(k); select(null); };
  const patchItem = (p: Partial<MsgListItem> & { id: string }) => setItems(list => list && list.map(it => it.id === p.id ? { ...it, ...p } : it));
  const toggleStatus = (s: ReplyStatus) => setStatuses(cur => cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s]);
  const counts = STATUS_ORDER.reduce((acc, s) => ({ ...acc, [s]: MSG_DB.filter(d => d.message.kind === kind && d.message.reply_status === s).length }), {} as Record<ReplyStatus, number>);
  const pendingTotal = (k: MsgKind) => MSG_DB.filter(d => d.message.kind === k && ["new", "ai_suggested", "needs_review"].includes(d.message.reply_status)).length;
  const kindTotal = (k: MsgKind) => MSG_DB.filter(d => d.message.kind === k).length;
  return { store, deepLinkId: deepLink.current, kind, setKind, statuses, setStatuses, toggleStatus, q, setQ, items, listErr, retry: () => setReload(n => n + 1), selectedId, select, patchItem, toast, setToast, counts, pendingTotal, kindTotal, page, setPage, pageSize, setPageSize, total };
}
type Inbox = ReturnType<typeof useInbox>;

function InboxSearch({ ib, className = "" }: { ib: Inbox; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#CBD5E1" }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
      </span>
      <input value={ib.q} onChange={e => ib.setQ(e.target.value)} placeholder="Buscar comprador o producto…" aria-label="Buscar conversaciones"
        className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none" style={{ background: "#F8FAFC", border: "1.5px solid #E2E8F0", color: "#0A1628" }}
        onFocus={e => { e.target.style.borderColor = "#4F46E5"; }} onBlur={e => { e.target.style.borderColor = "#E2E8F0"; }} />
    </div>
  );
}

function InboxEmpty({ ib }: { ib: Inbox }) {
  const filtered = !!ib.q || ib.statuses.length > 0;
  return (
    <div className="flex flex-col items-center text-center gap-1.5 px-8 py-14">
      <p className="text-sm font-semibold" style={{ color: "#0A1628" }}>{filtered ? "Sin resultados" : `Todavía no tenés ${ib.kind === "question" ? "preguntas" : "mensajes"}`}</p>
      <p className="text-xs max-w-[260px]" style={{ color: "#64748B" }}>{filtered ? "No hay conversaciones con esos filtros." : "Cuando un comprador escriba, aparece acá."}</p>
      {filtered && <button onClick={() => { ib.setQ(""); ib.setStatuses([]); }} className="text-xs font-semibold hover:underline mt-1" style={{ color: "#4F46E5" }}>Limpiar filtros</button>}
    </div>
  );
}

function InboxToast({ ib }: { ib: Inbox }) {
  if (!ib.toast) return null;
  return (
    <div role="status" className="fixed left-1/2 -translate-x-1/2 md:left-auto md:translate-x-0 md:right-6 bottom-24 md:bottom-6 flex items-center gap-2.5 rounded-xl px-4 py-3 max-w-[calc(100vw-32px)]"
      style={{ zIndex: 90, background: "#0A1628", color: "white", boxShadow: "0 12px 32px rgba(10,22,40,0.25)", animation: "fadeUp 0.18s ease both" }}>
      <span style={{ color: ib.toast.tone === "ok" ? "#4ADE80" : "#F87171" }}>{ib.toast.tone === "ok" ? "✓" : "!"}</span>
      <span className="text-[13px] font-medium">{ib.toast.message}</span>
    </div>
  );
}

// ══ Propuesta A — Bandeja en tabla + conversación en panel lateral ══
// Toda la pantalla es la lista (densa, tipo Stripe). La conversación se abre en un
// panel lateral sobre la tabla: nunca hay un panel vacío esperando selección.
function PreguntasA({ ib, onOpenProduct, onNavigate }: { ib: Inbox; onOpenProduct: (p: Product) => void; onNavigate: (p: string) => void }) {
  const cols = "minmax(150px,1.1fr) minmax(140px,1fr) minmax(200px,2.2fr) 130px 70px 112px 44px";
  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 relative">
      <header className="flex items-center gap-3 px-4 md:px-6 py-3 bg-white flex-shrink-0 flex-wrap" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <h1 className="text-base font-bold" style={{ color: "#0A1628" }}>Preguntas</h1>
        <InboxSearch ib={ib} className="order-last md:order-none w-full md:w-auto md:flex-1 md:max-w-md md:ml-4" />
        <div className="ml-auto flex items-center gap-3">
          {ib.store.role === "owner" && <button onClick={() => onNavigate("Prompts AI")} className="text-xs font-semibold hover:underline" style={{ color: "#4F46E5" }}>Configurar IA</button>}
        </div>
      </header>

      <div className="flex items-center gap-4 px-4 md:px-6 bg-white flex-shrink-0 overflow-x-auto" style={{ borderBottom: "1px solid #E2E8F0", scrollbarWidth: "none" }}>
        {([["question", "Preguntas"], ["post_sale", "Mensajes"]] as [MsgKind, string][]).map(([k, label]) => (
          <button key={k} role="tab" aria-selected={ib.kind === k} onClick={() => ib.setKind(k)}
            className="flex-shrink-0 flex items-center gap-1.5 py-3 text-xs font-semibold transition-colors"
            style={{ color: ib.kind === k ? "#0A1628" : "#94A3B8", borderBottom: `2px solid ${ib.kind === k ? "#4F46E5" : "transparent"}`, marginBottom: -1 }}>
            {label}
            <span className="tabular-nums px-1.5 rounded-full text-[10px]" style={{ background: ib.kind === k ? "#EEF2FF" : "#F1F5F9", color: ib.kind === k ? "#4F46E5" : "#94A3B8" }}>{ib.kindTotal(k)}</span>
          </button>
        ))}
        <span className="w-px h-4 flex-shrink-0" style={{ background: "#E2E8F0" }} />
        {STATUS_ORDER.map(s => {
          const on = ib.statuses.includes(s); const meta = REPLY_STATUS[s];
          return (
            <button key={s} onClick={() => ib.toggleStatus(s)} aria-pressed={on}
              className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
              style={{ background: on ? meta.bg : "transparent", color: on ? meta.color : "#64748B", boxShadow: on ? `inset 0 0 0 1px ${meta.color}33` : "none" }}>
              {meta.glyph && <span aria-hidden style={{ fontSize: 9 }}>{meta.glyph}</span>}{meta.label}
              <span className="tabular-nums" style={{ color: on ? meta.color : "#CBD5E1" }}>{ib.counts[s]}</span>
            </button>
          );
        })}
        {ib.statuses.length > 0 && <button onClick={() => ib.setStatuses([])} className="flex-shrink-0 text-[11px] hover:underline" style={{ color: "#94A3B8" }}>Limpiar</button>}
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-3 md:p-5 gap-3">
        <p className="text-xs px-1 flex-shrink-0" style={{ color: "#64748B" }}>
          {ib.kind === "question"
            ? <><b style={{ color: "#0A1628" }}>Preventa</b> · Consultas públicas que hacen los compradores en tus publicaciones antes de comprar.</>
            : <><b style={{ color: "#0A1628" }}>Postventa</b> · Mensajes privados con compradores después de una venta: envíos, facturas, reclamos y devoluciones.</>}
        </p>
        <div className="flex-1 flex flex-col min-h-0 rounded-2xl bg-white overflow-hidden" style={{ border: "1px solid #E2E8F0" }}>
         <div className="flex-1 overflow-auto bg-white min-h-0">
          <div className="hidden md:grid z-10 items-center gap-4 px-4 py-2.5 sticky top-0 bg-white" style={{ gridTemplateColumns: cols, borderBottom: "1px solid #F1F5F9" }}>
            {["Comprador", "Producto", "Último mensaje", "Estado", "Resp.", "Actividad", "ML"].map(h => (
              <span key={h} style={{ fontSize: "10px", fontWeight: 600, letterSpacing: "0.07em", color: "#94A3B8" }}>{h.toUpperCase()}</span>
            ))}
          </div>
          {ib.listErr ? <CsErrorState title="No pudimos cargar las conversaciones" message={ib.listErr} onRetry={ib.retry} />
            : !ib.items ? <ListSkeleton />
            : ib.items.length === 0 ? <InboxEmpty ib={ib} />
            : ib.items.map(m => {
              const sel = m.id === ib.selectedId;
              const unread = m.reply_status === "new" || m.reply_status === "needs_review";
              return (
                <div role="button" tabIndex={0} key={m.id} onClick={() => ib.select(m.id)} aria-current={sel}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ib.select(m.id); } }}
                  className="w-full text-left cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 grid md:items-center gap-x-4 gap-y-1 px-4 py-3 transition-colors grid-cols-[1fr_auto] md:[grid-template-columns:var(--cols)]"
                  style={{ ["--cols" as string]: cols, background: sel ? "#EEF2FF" : "white", borderBottom: "1px solid #F8FAFC", boxShadow: sel ? "inset 3px 0 0 #4F46E5" : "none" }}
                  onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "#F8FAFC"; }}
                  onMouseLeave={e => { if (!sel) e.currentTarget.style.background = "white"; }}>
                  <span className="flex items-center gap-2 min-w-0">
                    {unread && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: REPLY_STATUS[m.reply_status].color }} />}
                    <span className={`text-[13px] truncate ${unread ? "font-bold" : "font-medium"}`} style={{ color: "#0A1628" }}>{m.buyer_name}</span>
                    {m.assigned_to === ME && <span title="Asignada a mí" className="flex-shrink-0"><MineBadge /></span>}
                  </span>
                  <span className="md:hidden text-[11px] tabular-nums text-right whitespace-nowrap" style={{ color: "#94A3B8" }}>{fmtWhen(m.last_activity)}</span>
                  <span className="text-xs truncate col-span-2 md:col-span-1" style={{ color: "#64748B" }}>{m.product_title}</span>
                  <span className="text-xs truncate col-span-2 md:col-span-1" style={{ color: unread ? "#334155" : "#94A3B8" }}>{m.last_text}</span>
                  <span className="flex items-center gap-1.5 col-span-2 md:col-span-1"><ReplyStatusChip status={m.reply_status} compact />
                    <span className="md:hidden">{m.last_reply_mode && <ModeBadge mode={m.last_reply_mode} />}</span></span>
                  <span className="hidden md:block">{m.last_reply_mode ? <ModeBadge mode={m.last_reply_mode} /> : <span style={{ color: "#CBD5E1" }}>—</span>}</span>
                  <span className="hidden md:block text-xs tabular-nums whitespace-nowrap" style={{ color: unread ? "#4F46E5" : "#94A3B8", fontWeight: unread ? 600 : 400 }}>{fmtWhen(m.last_activity)}</span>
                  <a href={mlConversationUrl(m)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    title="Abrir en MercadoLibre" aria-label={`Abrir conversación con ${m.buyer_name} en MercadoLibre`}
                    className="hidden md:flex w-7 h-7 rounded-lg items-center justify-center transition-colors hover:bg-amber-50" style={{ color: "#94A3B8", border: "1px solid #E2E8F0" }}
                    onMouseEnter={e => { e.currentTarget.style.color = "#B45309"; e.currentTarget.style.borderColor = "#FDE68A"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "#94A3B8"; e.currentTarget.style.borderColor = "#E2E8F0"; }}>
                    <ExtLinkIcon />
                  </a>
                </div>
              );
            })}
         </div>
          <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 flex-shrink-0 bg-white" style={{ borderTop: "1px solid #E2E8F0" }}>
            <span className="text-xs" style={{ color: "#94A3B8" }}>{ib.total} {ib.total === 1 ? "conversación" : "conversaciones"}</span>
            <div className="flex items-center gap-3">
              <span className="hidden sm:inline text-xs" style={{ color: "#94A3B8" }}>Mostrar</span>
              <select value={ib.pageSize} onChange={e => ib.setPageSize(Number(e.target.value))} className="hidden sm:block text-xs px-2 py-1 rounded-lg outline-none" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#475569" }}>
                <option>50</option><option>100</option><option>200</option>
              </select>
              <span className="text-xs font-medium tabular-nums" style={{ color: "#475569" }}>{ib.total ? (ib.page - 1) * ib.pageSize + 1 : 0} – {Math.min(ib.page * ib.pageSize, ib.total)}</span>
              {(["‹", "›"] as const).map(g => {
                const to = g === "‹" ? ib.page - 1 : ib.page + 1;
                const dis = to < 1 || to > Math.max(1, Math.ceil(ib.total / ib.pageSize));
                return <button key={g} disabled={dis} onClick={() => ib.setPage(to)} aria-label={g === "‹" ? "Página anterior" : "Página siguiente"}
                  className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-sm"
                  style={{ color: "#94A3B8", border: "1px solid #E2E8F0", cursor: dis ? "default" : "pointer", opacity: dis ? 0.4 : 1 }}
                  onMouseEnter={e => { if (!dis) e.currentTarget.style.background = "#F1F5F9"; }}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{g}</button>;
              })}
            </div>
          </div>
        </div>
      </div>

      {ib.selectedId && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="hidden md:block flex-1 bg-black/30 backdrop-blur-[1px]" onClick={() => ib.select(null)} />
          <div className="w-full md:w-[820px] md:max-w-[92vw] flex flex-col bg-white shadow-2xl" style={{ borderLeft: "1px solid #E2E8F0", animation: "fadeUp 0.2s ease both" }}>
            <ConversationDetail key={ib.selectedId + String(ib.store.offline)} id={ib.selectedId} focusOnOpen={ib.selectedId === ib.deepLinkId}
              onBack={() => ib.select(null)} onChanged={ib.patchItem} onOpenProduct={onOpenProduct} toast={ib.setToast} />
          </div>
        </div>
      )}
      <InboxToast ib={ib} />
    </div>
  );
}

function Preguntas({ onOpenProduct, onNavigate }: { onOpenProduct: (p: Product) => void; onNavigate: (page: string) => void }) {
  const ib = useInbox();
  return <PreguntasA ib={ib} onOpenProduct={onOpenProduct} onNavigate={onNavigate} />;
}

// ── Prompts AI · Atención al cliente (solo dueño) ──
function CsAiSettings() {
  const store = useCsStore();
  const [save, setSave] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cfg = store.config;
  const update = (patch: Partial<CsConfig>) => {
    store.set({ config: { ...cfg, ...patch } });
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setSave("saved"); setTimeout(() => setSave(s => s === "saved" ? "idle" : s), 2000); }, 500);
  };
  const modes: { key: AiMode; label: string; desc: string }[] = [
    { key: "off", label: "Off", desc: "La IA no interviene. Todas las conversaciones te llegan para responder a mano y te avisamos por WhatsApp/Telegram." },
    { key: "suggest", label: "Sugerir", desc: "La IA prepara un borrador auditado y vos decidís si enviarlo." },
    { key: "autopilot", label: "Piloto automático", desc: "La IA responde sola cuando supera el umbral de confianza. El resto queda Para revisar." },
  ];
  return (
    <div className="rounded-xl bg-white p-4 flex flex-col gap-4" style={{ border: "1px solid #E2E8F0" }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold" style={{ color: "#0A1628" }}>Modo de IA</span>
        <SaveIndicator state={save} onRetry={() => update({})} />
      </div>
      <div role="radiogroup" className="grid grid-cols-3 p-1 rounded-xl" style={{ background: "#F1F5F9" }}>
        {modes.map(mo => (
          <button key={mo.key} role="radio" aria-checked={cfg.mode === mo.key} onClick={() => update({ mode: mo.key })}
            className="py-2 rounded-lg text-xs font-semibold transition-all"
            style={{ background: cfg.mode === mo.key ? "white" : "transparent", color: cfg.mode === mo.key ? "#0A1628" : "#64748B", boxShadow: cfg.mode === mo.key ? "0 1px 2px rgba(15,23,42,0.08)" : "none" }}>
            {mo.label}
          </button>
        ))}
      </div>
      <p className="text-xs -mt-2" style={{ color: "#64748B" }}>{modes.find(mo => mo.key === cfg.mode)!.desc}</p>

      <div className="flex flex-col gap-2" style={{ opacity: cfg.mode === "off" ? 0.45 : 1 }}>
        <div className="flex items-center justify-between">
          <label htmlFor="cs-threshold" className="text-xs font-semibold" style={{ color: "#334155" }}>Confianza mínima</label>
          <span className="text-xs font-bold tabular-nums" style={{ color: "#4F46E5" }}>{cfg.min_confidence}%</span>
        </div>
        <input id="cs-threshold" type="range" min={50} max={99} value={cfg.min_confidence} disabled={cfg.mode === "off"}
          onChange={e => update({ min_confidence: Number(e.target.value) })} className="w-full accent-indigo-600" />
        <span className="text-[11px]" style={{ color: "#94A3B8" }}>Por debajo de este valor la respuesta no se envía sola y queda Para revisar.</span>
      </div>

      <div className="flex items-center justify-between gap-4 pt-3" style={{ borderTop: "1px solid #F1F5F9", opacity: cfg.mode === "off" ? 0.45 : 1 }}>
        <div>
          <p className="text-xs font-semibold" style={{ color: "#334155" }}>Auditoría de respuestas</p>
          <p className="text-[11px]" style={{ color: "#94A3B8" }}>Un segundo modelo revisa cada borrador antes de mostrarlo o enviarlo.</p>
        </div>
        <Toggle value={cfg.audit} onChange={v => cfg.mode !== "off" && update({ audit: v })} />
      </div>
    </div>
  );
}

// ─── Prompts AI ─────────────────────────────────────────────────────────────────
// Plain-text editor over the `prompts` table. Each row is one key the backend reads.

type PromptDef = { key: string; label: string; desc: string; group: string; text: string };

const PROMPT_DEFS: PromptDef[] = [
  { key: "ai_generate_title", group: "Generación de contenido", label: "Generar título", desc: "Redacta el título de la publicación a partir de los datos del producto.",
    text: "Sos un experto en marketplaces argentinos. Generá un título de venta claro y optimizado para SEO (máximo 60 caracteres) usando marca, modelo y características principales del producto. No uses mayúsculas sostenidas ni signos de exclamación." },
  { key: "ai_generate_description", group: "Generación de contenido", label: "Generar descripción", desc: "Escribe la descripción completa de la publicación.",
    text: "Redactá una descripción de producto persuasiva y estructurada en párrafos cortos. Incluí beneficios, características técnicas y condiciones de uso. Tono profesional y cercano, en español rioplatense." },
  { key: "ai_generate_brand", group: "Generación de contenido", label: "Detectar marca", desc: "Infiere la marca cuando el campo está vacío.",
    text: "A partir del nombre y la descripción del producto, indicá únicamente la marca. Si no podés determinarla con certeza, respondé \"Genérico\"." },
  { key: "ai_generate_model", group: "Generación de contenido", label: "Detectar modelo", desc: "Infiere el modelo cuando el campo está vacío.",
    text: "A partir del nombre y la descripción del producto, indicá únicamente el modelo o versión. Si no existe, generá un código de modelo corto basado en el nombre." },
  { key: "ai_category", group: "Publicación", label: "Sugerir categoría", desc: "Elige la categoría del marketplace más adecuada.",
    text: "Dada la información del producto, seleccioná la categoría de MercadoLibre más específica y correcta. Devolvé el id de categoría y su ruta completa." },
  { key: "ai_auditor", group: "Publicación", label: "Auditor de publicación", desc: "Revisa la calidad de la publicación antes de publicar.",
    text: "Actuá como auditor de calidad. Revisá título, descripción, fotos y atributos, y devolvé una lista de mejoras concretas priorizadas por impacto en las ventas." },
  { key: "cs_tone", group: "Atención al cliente · Mensajes de MercadoLibre", label: "Tono base", desc: "Cómo suena la marca al responder preguntas y mensajes.",
    text: "Respondé con tono cercano y profesional, en español rioplatense (voseo). Saludá por el nombre del comprador, andá al punto y cerrá con un saludo breve." },
  { key: "cs_rules", group: "Atención al cliente · Mensajes de MercadoLibre", label: "Reglas", desc: "Lo que la IA nunca debe hacer al responder compradores.",
    text: "No compartas datos de contacto ni pidas datos personales fuera de la mensajería. No prometas plazos ni envíos gratis que no estén configurados. No respondas reclamos, devoluciones ni temas legales: derivalos a una persona." },
  { key: "cs_classifier", group: "Atención al cliente · Mensajes de MercadoLibre", label: "Clasificador", desc: "Decide si el mensaje lo puede responder la IA o requiere una persona.",
    text: "Clasificá el mensaje en: consulta_producto, envio, facturacion, post_venta, reclamo, devolucion, datos_personales u otro. Devolvé la categoría y si requiere humano (true/false) con un motivo corto." },
  { key: "cs_writer", group: "Atención al cliente · Mensajes de MercadoLibre", label: "Redactor de respuestas", desc: "Escribe el borrador usando datos reales del producto y del catálogo.",
    text: "Redactá una respuesta de máximo 350 caracteres usando solo datos del producto (precio, stock, atributos) y del catálogo del vendedor. Si citás otro producto, incluí nombre, precio y stock. Si te falta un dato, decí que lo consultás." },
  { key: "cs_auditor", group: "Atención al cliente · Mensajes de MercadoLibre", label: "Auditor de respuestas", desc: "Valida el borrador antes de mostrarlo o enviarlo.",
    text: "Revisá el borrador contra las reglas y los datos del producto. Devolvé verdict (approved | corrected), score de 0 a 1 y la lista de objeciones. Si corregís, devolvé el texto corregido." },
  { key: "ai_improving_human_reply", group: "Atención al cliente · Mensajes de MercadoLibre", label: "Mejorar respuesta humana", desc: "Pulir la respuesta escrita por un operador antes de enviarla.",
    text: "Mejorá la redacción de la respuesta del vendedor manteniendo el sentido original. Corregí ortografía, hacela clara y amable, y conservá los datos concretos (precios, plazos, stock)." },
  { key: "ai_inventory_search", group: "Búsqueda e inventario", label: "Búsqueda de inventario", desc: "Interpreta búsquedas en lenguaje natural sobre el inventario.",
    text: "Convertí la consulta del usuario en filtros de inventario (marca, categoría, rango de precio, stock). Devolvé un JSON con los filtros detectados." },
  { key: "ai_general", group: "General", label: "Prompt general", desc: "Contexto base que se antepone a todas las tareas de IA.",
    text: "Sos el asistente de Omnipanel para un vendedor de e-commerce en Argentina. Respondé siempre en español rioplatense, de forma concisa y accionable. No inventes datos que no estén disponibles." },
  { key: "rules", group: "General", label: "Reglas", desc: "Restricciones y políticas que la IA debe respetar siempre.",
    text: "Nunca prometas envíos gratis salvo que esté configurado. No uses lenguaje discriminatorio. Respetá las políticas de cada marketplace. Ante datos faltantes, pedí aclaración en lugar de inventar." },
];

function PromptCard({ def, value, dirty, onChange, onSave, onReset }: {
  def: PromptDef; value: string; dirty: boolean;
  onChange: (v: string) => void; onSave: () => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden bg-white" style={{ border: "1px solid #E2E8F0" }}>
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
        style={{ background: open ? "#F8FAFC" : "white", borderBottom: open ? "1px solid #F1F5F9" : "none" }}>
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="flex-shrink-0"
          style={{ color: "#94A3B8", transform: open ? "rotate(90deg)" : "none", transition: "transform 0.2s ease" }}>
          <path d="M4 2.5l3.5 3.5L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold" style={{ color: "#0A1628" }}>{def.label}</span>
            {dirty && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#F59E0B" }} title="Cambios sin guardar" />}
          </div>
          {!open && <p className="truncate mt-0.5" style={{ fontSize: "11px", color: "#94A3B8" }}>{def.desc}</p>}
        </div>
        <span className="font-mono px-2 py-0.5 rounded flex-shrink-0" style={{ fontSize: "10px", color: "#6366F1", background: "#EEF2FF" }}>{def.key}</span>
      </button>
      {open && (
        <div className="px-4 py-3.5 flex flex-col gap-3">
          <p style={{ fontSize: "12px", color: "#64748B" }}>{def.desc}</p>
          <textarea value={value} onChange={e => onChange(e.target.value)} rows={6}
            className="w-full px-3.5 py-3 text-sm rounded-xl outline-none transition-all resize-y"
            style={{ border: "1px solid #E2E8F0", color: "#0A1628", background: "#FCFCFD", lineHeight: 1.55, fontFamily: "'Inter', sans-serif" }}
            onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.1)"; }}
            onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
          <div className="flex items-center gap-3">
            <span style={{ fontSize: "11px", color: "#CBD5E1" }}>{value.length} caracteres</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={onReset} disabled={!dirty}
                className="px-3.5 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{ border: "1px solid #E2E8F0", color: dirty ? "#475569" : "#CBD5E1", background: "white", cursor: dirty ? "pointer" : "default" }}
                onMouseEnter={e => { if (dirty) e.currentTarget.style.background = "#F8FAFC"; }}
                onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                Restaurar
              </button>
              <button onClick={onSave} disabled={!dirty}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
                style={{ background: dirty ? "#4F46E5" : "#C7D2FE", cursor: dirty ? "pointer" : "default" }}
                onMouseEnter={e => { if (dirty) e.currentTarget.style.background = "#4338CA"; }}
                onMouseLeave={e => { if (dirty) e.currentTarget.style.background = "#4F46E5"; }}>
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const CS_PROMPT_GROUP = "Atención al cliente · Mensajes de MercadoLibre";

function PromptsAI() {
  // `saved` = persisted values, `draft` = in-progress edits.
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(PROMPT_DEFS.map(d => [d.key, d.text])));
  const [draft, setDraft] = useState<Record<string, string>>(saved);

  const store = useCsStore();
  const isOwner = store.role === "owner";
  const groups = [...new Set(PROMPT_DEFS.map(d => d.group))].filter(g => isOwner || g !== CS_PROMPT_GROUP);
  const dirtyCount = PROMPT_DEFS.filter(d => draft[d.key] !== saved[d.key]).length;

  const saveOne = (k: string) => setSaved(s => ({ ...s, [k]: draft[k] }));
  const resetOne = (k: string) => setDraft(d => ({ ...d, [k]: saved[k] }));
  const saveAll = () => setSaved({ ...draft });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-8 py-8 flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold" style={{ color: "#0A1628" }}>Prompts AI</h1>
            <p className="text-sm" style={{ color: "#64748B" }}>Editá las instrucciones que usa la IA. Cada bloque corresponde a un registro de la tabla <span className="font-mono" style={{ color: "#6366F1" }}>prompts</span>.</p>
          </div>
          {dirtyCount > 0 && (
            <button onClick={saveAll}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors"
              style={{ background: "#4F46E5" }}
              onMouseEnter={e => (e.currentTarget.style.background = "#4338CA")}
              onMouseLeave={e => (e.currentTarget.style.background = "#4F46E5")}>
              Guardar todo ({dirtyCount})
            </button>
          )}
        </div>

        {!isOwner && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3 text-xs" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", color: "#64748B" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke="currentColor" strokeWidth="1.4" /></svg>
            La configuración de IA para atención al cliente la ve solo el dueño del negocio.
          </div>
        )}
        {groups.map(group => (
          <div key={group} className="flex flex-col gap-2.5">
            <SectionLabel>{group}</SectionLabel>
            {group === CS_PROMPT_GROUP && <CsAiSettings />}
            {PROMPT_DEFS.filter(d => d.group === group).map(def => (
              <PromptCard key={def.key} def={def} value={draft[def.key]} dirty={draft[def.key] !== saved[def.key]}
                onChange={v => setDraft(d => ({ ...d, [def.key]: v }))}
                onSave={() => saveOne(def.key)} onReset={() => resetOne(def.key)} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ComingSoon({ title, icon }: { title: string; icon: NavIconKey }) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center text-center gap-4 max-w-sm">
        <div className="flex items-center justify-center rounded-2xl" style={{ width: 64, height: 64, background: "#EEF2FF", color: "#4F46E5" }}>
          <NavIcon name={icon} size={30} />
        </div>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-xl font-bold" style={{ color: "#0A1628" }}>{title}</h1>
          <span className="inline-flex items-center gap-1.5 mx-auto px-2.5 py-1 rounded-full text-xs font-semibold" style={{ color: "#D97706", background: "#FEF3C7" }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: "#D97706" }} />
            En construcción
          </span>
          <p className="text-sm mt-1" style={{ color: "#64748B" }}>
            Estamos trabajando en esta sección. Muy pronto vas a poder usarla desde acá.
          </p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Platform Admin — mock in-memory implementation of the /api/platform HTTP contract.
// Each function mirrors an endpoint: same success shapes and same typed errors
// (401/403/400/409/404). Swap these for real fetch() calls to the backend.
// ═══════════════════════════════════════════════════════════════════════════════

type AdminPlatform = "mercadolibre" | "tiendanube";
type AdminAccount = {
  id: string;
  platform: AdminPlatform;
  name: string | null;
  external_account_id: string | null;
  has_credentials: boolean;
  has_access_token: boolean;
  token_expires_at: string | null;
};
type AdminBusiness = { id: string; email: string; full_name: string; active: boolean; accounts_count: number; created_at: string };
type BizRecord = Omit<AdminBusiness, "accounts_count"> & { accounts: AdminAccount[] };

class ApiError extends Error {
  status: number; code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

const ADMIN_LOGIN = { email: "admin@omnipanel.com", password: "admin123" };
const ADMIN_ME = { id: "adm_1", email: ADMIN_LOGIN.email, full_name: "Admin Omnipanel" };

const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 10)}`;
const wait = (ms = 450) => new Promise<void>(r => setTimeout(r, ms));

let ADMIN_BIZ: BizRecord[] = [
  {
    id: "biz_nicolasgall", email: "nicolas@gallshop.com", full_name: "Gall Shop", active: true, created_at: "2025-06-11",
    accounts: [
      { id: "acc_1", platform: "mercadolibre", name: "Gall Shop ML", external_account_id: "307027338", has_credentials: true, has_access_token: true, token_expires_at: "2026-10-14" },
      { id: "acc_2", platform: "tiendanube", name: "Gall Shop TN", external_account_id: "https://gallshop.mitiendanube.com", has_credentials: true, has_access_token: false, token_expires_at: null },
    ],
  },
  {
    id: "biz_homedeco", email: "ventas@homedeco.com.ar", full_name: "HomeDeco Argentina", active: true, created_at: "2025-05-22",
    accounts: [
      { id: "acc_3", platform: "mercadolibre", name: "HomeDeco", external_account_id: "298114552", has_credentials: false, has_access_token: false, token_expires_at: null },
    ],
  },
  {
    id: "biz_gourmet", email: "hola@gourmet.ar", full_name: "Gourmet AR", active: false, created_at: "2025-03-30",
    accounts: [],
  },
  {
    id: "biz_belle", email: "contacto@belle.com", full_name: "Belle Cosméticos", active: true, created_at: "2025-02-14",
    accounts: [
      { id: "acc_4", platform: "tiendanube", name: "Belle Store", external_account_id: "https://belle.mitiendanube.com", has_credentials: true, has_access_token: true, token_expires_at: "2026-11-02" },
    ],
  },
];

const toBizDTO = (b: BizRecord): AdminBusiness => ({ id: b.id, email: b.email, full_name: b.full_name, active: b.active, accounts_count: b.accounts.length, created_at: b.created_at });

async function apiLogin(email: string, password: string) {
  await wait(600);
  const e = email.trim().toLowerCase();
  if (e === "inactive@omnipanel.com" && password === ADMIN_LOGIN.password) throw new ApiError(403, "admin_inactive", "Tu usuario de administrador está inactivo.");
  if (e !== ADMIN_LOGIN.email || password !== ADMIN_LOGIN.password) throw new ApiError(401, "invalid_credentials", "Email o contraseña incorrectos.");
  return { token: uid("tok"), admin: ADMIN_ME };
}

async function apiListBusinesses(q: string, page: number, page_size: number) {
  await wait(350);
  const needle = q.trim().toLowerCase();
  const filtered = ADMIN_BIZ.filter(b => !needle || b.email.toLowerCase().includes(needle) || b.full_name.toLowerCase().includes(needle));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / page_size));
  const p = Math.min(Math.max(1, page), pages);
  const start = (p - 1) * page_size;
  return { items: filtered.slice(start, start + page_size).map(toBizDTO), total, page: p, page_size, pages };
}

async function apiCreateBusiness(input: { email: string; full_name: string; password: string }) {
  await wait(600);
  const email = input.email.trim().toLowerCase();
  const full_name = input.full_name.trim();
  if (!/.+@.+\..+/.test(email)) throw new ApiError(400, "invalid_email", "Ingresá un email válido.");
  if (!full_name) throw new ApiError(400, "invalid_name", "El nombre es obligatorio.");
  if (input.password.length < 6) throw new ApiError(400, "invalid_password", "La contraseña debe tener al menos 6 caracteres.");
  if (ADMIN_BIZ.some(b => b.email.toLowerCase() === email)) throw new ApiError(409, "email_exists", "Ya existe un negocio con ese email.");
  const biz: BizRecord = { id: uid("biz"), email, full_name, active: true, accounts: [], created_at: new Date().toISOString().slice(0, 10) };
  ADMIN_BIZ = [biz, ...ADMIN_BIZ];
  return toBizDTO(biz);
}

async function apiSetActive(id: string, active: boolean) {
  await wait(500);
  const biz = ADMIN_BIZ.find(b => b.id === id);
  if (!biz) throw new ApiError(404, "not_found", "Negocio no encontrado.");
  biz.active = active;
  return toBizDTO(biz);
}

async function apiListAccounts(id: string) {
  await wait(350);
  const biz = ADMIN_BIZ.find(b => b.id === id);
  if (!biz) throw new ApiError(404, "not_found", "Negocio no encontrado.");
  return { items: biz.accounts.slice() };
}

async function apiCreateAccount(id: string, input: { platform: AdminPlatform; name?: string; client_id?: string; client_secret?: string; external_account_id?: string }) {
  await wait(600);
  const biz = ADMIN_BIZ.find(b => b.id === id);
  if (!biz) throw new ApiError(404, "not_found", "Negocio no encontrado.");
  if (input.platform !== "mercadolibre" && input.platform !== "tiendanube") throw new ApiError(400, "invalid_platform", "Seleccioná una plataforma válida.");
  const ext = (input.external_account_id ?? "").trim();
  if (ext && biz.accounts.some(a => a.platform === input.platform && a.external_account_id === ext)) throw new ApiError(409, "duplicate_account", "Ya existe una cuenta de esa plataforma con ese identificador.");
  const has_credentials = Boolean((input.client_id ?? "").trim() && (input.client_secret ?? "").trim());
  const acc: AdminAccount = {
    id: uid("acc"), platform: input.platform, name: (input.name ?? "").trim() || null,
    external_account_id: ext || null, has_credentials, has_access_token: false, token_expires_at: null,
  };
  biz.accounts = [...biz.accounts, acc];
  return acc;
}

const errMsg = (e: unknown) => e instanceof ApiError ? e.message : "Ocurrió un error inesperado. Intentá de nuevo.";

// ── Shared admin UI atoms ──
const ADMIN_PLATFORM: Record<AdminPlatform, { label: string; color: string; bg: string }> = {
  mercadolibre: { label: "MercadoLibre", color: "#F59E0B", bg: "#FFF7ED" },
  tiendanube: { label: "Tienda Nube", color: "#4F46E5", bg: "#EEF2FF" },
};

function accountConn(a: AdminAccount): { label: string; color: string; bg: string; border: string; expires?: string | null } {
  if (!a.has_credentials) return { label: "Pendiente de conexión", color: "#64748B", bg: "#F1F5F9", border: "#E2E8F0" };
  if (a.has_access_token) return { label: "Conectada", color: "#16A34A", bg: "#DCFCE7", border: "#BBF7D0", expires: a.token_expires_at };
  return { label: "Credenciales cargadas", color: "#D97706", bg: "#FEF3C7", border: "#FDE68A" };
}

function AdminField({ label, value, onChange, type = "text", placeholder, hint, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; hint?: string; autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>{label}</span>
      <input type={type} value={value} placeholder={placeholder} autoFocus={autoFocus} onChange={e => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 text-sm rounded-xl outline-none transition-all" style={{ border: "1.5px solid #E2E8F0", color: "#0A1628" }}
        onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.12)"; }}
        onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
      {hint && <span style={{ fontSize: "10.5px", color: "#94A3B8" }}>{hint}</span>}
    </div>
  );
}

function AdminErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 mt-0.5"><circle cx="8" cy="8" r="6.5" stroke="#DC2626" strokeWidth="1.3" /><path d="M8 5v3.5M8 10.5h.01" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" /></svg>
      <span style={{ fontSize: "12px", color: "#B91C1C", lineHeight: 1.4 }}>{children}</span>
    </div>
  );
}

function AdminConfirm({ title, body, confirmLabel, loading, onCancel, onConfirm }: {
  title: string; body: string; confirmLabel: string; loading?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(10,22,40,0.45)", backdropFilter: "blur(2px)" }} onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 flex flex-col gap-4" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "fadeUp 0.18s ease both" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: "#FEF2F2" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 3.5L2.5 16.5h15L10 3.5Z" stroke="#DC2626" strokeWidth="1.6" strokeLinejoin="round" /><path d="M10 8.5v3M10 13.5h.01" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" /></svg>
          </div>
          <h3 className="text-base font-bold" style={{ color: "#0A1628" }}>{title}</h3>
        </div>
        <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.5 }}>{body}</p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onCancel} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Cancelar</button>
          <button onClick={onConfirm} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-bold text-white transition-colors" style={{ background: "#DC2626", opacity: loading ? 0.7 : 1 }}>
            {loading ? "Procesando…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin login ──
function AdminLogin({ onLogin }: { onLogin: (s: { token: string; admin: typeof ADMIN_ME }) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /.+@.+\..+/.test(email.trim()) && password.length > 0;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true); setError(null);
    try { onLogin(await apiLogin(email, password)); }
    catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center h-screen" style={{ background: "#F1F5F9", fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 flex flex-col gap-5" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.12)" }}>
        <div className="flex flex-col items-center gap-2 text-center">
          <img src={omnipanelLogo} alt="Omnipanel" className="h-11 w-auto mb-3" />
          <h1 className="text-lg font-bold" style={{ color: "#0A1628" }}>Panel de administración</h1>
          <p style={{ fontSize: "12px", color: "#64748B" }}>Ingresá con tu cuenta de administrador de la plataforma.</p>
        </div>
        {error && <AdminErrorNote>{error}</AdminErrorNote>}
        <div className="flex flex-col gap-3.5" onKeyDown={e => { if (e.key === "Enter") submit(); }}>
          <AdminField label="Email" value={email} onChange={setEmail} type="email" placeholder="admin@empresa.com" autoFocus />
          <AdminField label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="••••••••" />
        </div>
        <button onClick={submit} disabled={!valid || loading}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
          style={{ background: valid && !loading ? "#4F46E5" : "#C7D2FE", cursor: valid && !loading ? "pointer" : "default" }}>
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="text-center" style={{ fontSize: "10.5px", color: "#CBD5E1" }}>Demo: admin@omnipanel.com · admin123</p>
      </div>
    </div>
  );
}

// ── Create business modal ──
function CreateBusinessModal({ onClose, onCreated }: { onClose: () => void; onCreated: (b: AdminBusiness) => void }) {
  const [email, setEmail] = useState("");
  const [full_name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /.+@.+\..+/.test(email.trim()) && full_name.trim().length > 0 && password.length >= 6;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true); setError(null);
    try { const b = await apiCreateBusiness({ email, full_name, password }); onCreated(b); onClose(); }
    catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "fadeUp 0.18s ease both" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center rounded-xl" style={{ width: 40, height: 40, background: "#E0E7FF" }}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#4F46E5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="14" height="12" rx="2" /><path d="M3 8h14M7 12h2" /></svg>
          </div>
          <h3 className="text-lg font-bold" style={{ color: "#0A1628" }}>Crear negocio</h3>
        </div>
        {error && <AdminErrorNote>{error}</AdminErrorNote>}
        <AdminField label="Email" value={email} onChange={setEmail} type="email" placeholder="dueño@negocio.com" autoFocus />
        <AdminField label="Nombre" value={full_name} onChange={setName} placeholder="Nombre del negocio" />
        <AdminField label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="Mínimo 6 caracteres" hint="La contraseña debe tener al menos 6 caracteres." />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Cancelar</button>
          <button onClick={submit} disabled={!valid || loading} className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: valid && !loading ? "#4F46E5" : "#C7D2FE", cursor: valid && !loading ? "pointer" : "default" }}>
            {loading ? "Creando…" : "Crear negocio"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Add account modal ──
function AddAccountModal({ businessId, onClose, onCreated }: { businessId: string; onClose: () => void; onCreated: (a: AdminAccount) => void }) {
  const [platform, setPlatform] = useState<AdminPlatform | "">("");
  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [externalId, setExternalId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const extLabel = platform === "tiendanube" ? "URL de la tienda Tienda Nube" : platform === "mercadolibre" ? "ID de usuario de MercadoLibre" : "Identificador externo";
  const extPlaceholder = platform === "tiendanube" ? "https://mitienda.mitiendanube.com" : platform === "mercadolibre" ? "Ej. 307027338" : "";

  const submit = async () => {
    if (!platform || loading) return;
    setLoading(true); setError(null);
    try {
      const a = await apiCreateAccount(businessId, { platform, name, client_id: clientId, client_secret: clientSecret, external_account_id: externalId });
      onCreated(a); onClose();
    } catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(2px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.28)", animation: "fadeUp 0.18s ease both" }} onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold" style={{ color: "#0A1628" }}>Agregar cuenta</h3>
        {error && <AdminErrorNote>{error}</AdminErrorNote>}

        <div className="flex flex-col gap-1.5">
          <span style={{ fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8" }}>Plataforma *</span>
          <div className="grid grid-cols-2 gap-2">
            {(["mercadolibre", "tiendanube"] as AdminPlatform[]).map(p => {
              const m = ADMIN_PLATFORM[p]; const on = platform === p;
              return (
                <button key={p} onClick={() => setPlatform(p)} type="button"
                  className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: on ? m.bg : "white", color: on ? m.color : "#64748B", border: `1.5px solid ${on ? m.color : "#E2E8F0"}` }}>
                  <span className="rounded-full" style={{ width: 8, height: 8, background: m.color }} />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <AdminField label="Nombre (opcional)" value={name} onChange={setName} placeholder="Ej. Tienda principal" />
        <AdminField label="Client ID (opcional)" value={clientId} onChange={setClientId} placeholder="Client ID de la aplicación" />
        <AdminField label="Client Secret (opcional)" value={clientSecret} onChange={setClientSecret} type="password" placeholder="Client Secret de la aplicación" />
        <AdminField label={`${extLabel} (opcional)`} value={externalId} onChange={setExternalId} placeholder={extPlaceholder} />

        <div className="flex items-start gap-2 rounded-xl px-3 py-2.5" style={{ background: "#F8FAFC", border: "1px solid #E2E8F0" }}>
          <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 mt-0.5"><circle cx="7" cy="7" r="5.5" stroke="#94A3B8" strokeWidth="1.2" /><path d="M7 6.2v3.3M7 4.6h.01" stroke="#94A3B8" strokeWidth="1.3" strokeLinecap="round" /></svg>
          <span style={{ fontSize: "11.5px", color: "#64748B", lineHeight: 1.45 }}>La cuenta queda pendiente de conexión hasta que se complete la autorización OAuth.</span>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 rounded-xl text-sm font-medium transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Cancelar</button>
          <button onClick={submit} disabled={!platform || loading} className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors"
            style={{ background: platform && !loading ? "#4F46E5" : "#C7D2FE", cursor: platform && !loading ? "pointer" : "default" }}>
            {loading ? "Agregando…" : "Agregar cuenta"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Accounts drawer ──
function AccountsDrawer({ business, onClose }: { business: AdminBusiness; onClose: () => void }) {
  const [items, setItems] = useState<AdminAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setError(null);
    try { const r = await apiListAccounts(business.id); setItems(r.items); }
    catch (e) { setError(errMsg(e)); setItems([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [business.id]);

  return (
    <div className="fixed inset-0 z-[60] flex justify-end" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="flex-1" style={{ background: "rgba(10,22,40,0.35)" }} onClick={onClose} />
      <div className="w-[520px] max-w-full flex flex-col bg-white shadow-2xl" style={{ animation: "fadeUp 0.2s ease both" }}>
        <div className="flex items-start justify-between gap-3 px-6 py-5 flex-shrink-0" style={{ borderBottom: "1px solid #F1F5F9" }}>
          <div className="min-w-0">
            <p className="text-base font-bold truncate" style={{ color: "#0A1628" }}>{business.full_name}</p>
            <p className="truncate" style={{ fontSize: "12px", color: "#64748B" }}>{business.email}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0" style={{ color: "#94A3B8" }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
        </div>

        <div className="flex items-center justify-between px-6 py-3 flex-shrink-0" style={{ borderBottom: "1px solid #F8FAFC" }}>
          <span className="text-xs font-semibold" style={{ color: "#64748B" }}>Cuentas conectadas ({items?.length ?? 0})</span>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-colors" style={{ background: "#4F46E5" }}>
            <svg width="12" height="12" viewBox="0 0 14 14" fill="none"><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Agregar cuenta
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-3">
          {error && <AdminErrorNote>{error}</AdminErrorNote>}
          {items === null ? (
            <div className="flex items-center gap-2 py-8 justify-center" style={{ color: "#94A3B8" }}>
              <span className="rounded-full" style={{ width: 16, height: 16, border: "2px solid #E2E8F0", borderTopColor: "#4F46E5", animation: "spin 0.8s linear infinite" }} />
              <span className="text-sm">Cargando cuentas…</span>
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="flex items-center justify-center rounded-2xl" style={{ width: 48, height: 48, background: "#F1F5F9" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="1.6"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18" /></svg>
              </div>
              <p className="text-sm font-semibold" style={{ color: "#475569" }}>Sin cuentas todavía</p>
              <p style={{ fontSize: "12px", color: "#94A3B8" }}>Agregá una cuenta de MercadoLibre o Tienda Nube.</p>
            </div>
          ) : (
            items.map(a => {
              const m = ADMIN_PLATFORM[a.platform]; const conn = accountConn(a);
              return (
                <div key={a.id} className="rounded-xl p-3.5 flex flex-col gap-2.5" style={{ border: "1px solid #E2E8F0" }}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: m.bg }}>
                      <span className="rounded-full" style={{ width: 6, height: 6, background: m.color }} />
                      <span style={{ fontSize: "10.5px", fontWeight: 700, color: m.color }}>{m.label}</span>
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: conn.bg, border: `1px solid ${conn.border}` }}>
                      <span className="rounded-full" style={{ width: 6, height: 6, background: conn.color }} />
                      <span style={{ fontSize: "10.5px", fontWeight: 700, color: conn.color }}>{conn.label}</span>
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold" style={{ color: "#0A1628" }}>{a.name || "Sin nombre"}</span>
                    <span className="font-mono" style={{ fontSize: "11px", color: "#64748B" }}>{a.external_account_id || "—"}</span>
                  </div>
                  {conn.expires && (
                    <span style={{ fontSize: "11px", color: "#16A34A" }}>Token válido hasta {conn.expires}</span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {adding && <AddAccountModal businessId={business.id} onClose={() => setAdding(false)} onCreated={() => load()} />}
    </div>
  );
}

// ── Businesses list (main admin screen) ──
const ADMIN_PAGE_SIZE = 8;
function AdminBusinesses({ admin, onLogout }: { admin: typeof ADMIN_ME; onLogout: () => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ items: AdminBusiness[]; total: number; pages: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [drawerBiz, setDrawerBiz] = useState<AdminBusiness | null>(null);
  const [confirm, setConfirm] = useState<AdminBusiness | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try { setData(await apiListBusinesses(q, page, ADMIN_PAGE_SIZE)); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [q, page]);
  useEffect(() => { setPage(1); }, [q]);

  const activate = async (b: AdminBusiness) => {
    setTogglingId(b.id);
    try { await apiSetActive(b.id, true); await load(); }
    finally { setTogglingId(null); }
  };
  const confirmDeactivate = async () => {
    if (!confirm) return;
    setConfirmLoading(true);
    try { await apiSetActive(confirm.id, false); setConfirm(null); await load(); }
    finally { setConfirmLoading(false); }
  };

  const items = data?.items ?? [];
  const pages = data?.pages ?? 1;

  return (
    <div className="h-screen flex flex-col" style={{ background: "#F1F5F9", fontFamily: "'Inter', sans-serif" }}>
      {/* Top bar */}
      <header className="flex items-center justify-between gap-3 px-6 py-3 flex-shrink-0 bg-white" style={{ borderBottom: "1px solid #E2E8F0" }}>
        <div className="flex items-center gap-2.5">
          <img src={omnipanelLogo} alt="Omnipanel" className="h-8 w-auto" />
          <span className="w-px h-6" style={{ background: "#E2E8F0" }} />
          <p className="text-sm font-semibold" style={{ color: "#475569" }}>Panel de administración</p>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontSize: "12px", color: "#64748B" }}>{admin.email}</span>
          <button onClick={onLogout} className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{ border: "1px solid #E2E8F0", color: "#475569", background: "white" }}>Salir</button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex flex-col p-5 gap-3 min-h-0">
        <div className="flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-base font-bold" style={{ color: "#0A1628" }}>Negocios</h1>
            <span className="text-xs font-medium" style={{ color: "#94A3B8" }}>{data?.total ?? 0} en total</span>
          </div>
          <button onClick={() => setCreating(true)} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white transition-colors" style={{ background: "#4F46E5" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
            Crear negocio
          </button>
        </div>

        <div className="relative flex-shrink-0" style={{ maxWidth: 360 }}>
          <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#CBD5E1" }}>
            <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4" /><path d="M9.5 9.5L12 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
          </span>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por email o nombre…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-sm outline-none transition-all" style={{ background: "white", border: "1.5px solid #E2E8F0", color: "#0A1628" }}
            onFocus={e => { e.target.style.borderColor = "#4F46E5"; e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.08)"; }}
            onBlur={e => { e.target.style.borderColor = "#E2E8F0"; e.target.style.boxShadow = "none"; }} />
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-2xl bg-white min-h-0" style={{ border: "1px solid #E2E8F0" }}>
          <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #F1F5F9" }}>
                {["Negocio", "Cuentas", "Estado", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3" style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#94A3B8", textAlign: i === 1 ? "center" : "left" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && items.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center">
                  <span className="inline-flex items-center gap-2" style={{ color: "#94A3B8" }}>
                    <span className="rounded-full" style={{ width: 16, height: 16, border: "2px solid #E2E8F0", borderTopColor: "#4F46E5", animation: "spin 0.8s linear infinite" }} />
                    <span className="text-sm">Cargando…</span>
                  </span>
                </td></tr>
              ) : items.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-sm" style={{ color: "#94A3B8" }}>No hay negocios que coincidan con la búsqueda.</td></tr>
              ) : items.map(b => (
                <tr key={b.id} style={{ borderBottom: "1px solid #F8FAFC" }} className="transition-colors hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-sm font-semibold" style={{ color: "#0A1628" }}>{b.full_name}</span>
                      <span style={{ fontSize: "11.5px", color: "#64748B" }}>{b.email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="tabular-nums inline-flex items-center justify-center rounded-lg px-2 py-0.5" style={{ fontSize: "12px", fontWeight: 600, color: "#475569", background: "#F1F5F9" }}>{b.accounts_count}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <button onClick={() => (b.active ? setConfirm(b) : activate(b))} disabled={togglingId === b.id}
                        className="relative rounded-full transition-colors flex-shrink-0" style={{ width: 34, height: 20, background: b.active ? "#16A34A" : "#CBD5E1", opacity: togglingId === b.id ? 0.6 : 1 }}
                        aria-label="Activar / desactivar">
                        <span className="absolute rounded-full bg-white transition-all" style={{ width: 14, height: 14, top: 3, left: b.active ? 17 : 3, boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                      </button>
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5" style={{ background: b.active ? "#DCFCE7" : "#F1F5F9", border: `1px solid ${b.active ? "#BBF7D0" : "#E2E8F0"}` }}>
                        <span className="rounded-full" style={{ width: 6, height: 6, background: b.active ? "#16A34A" : "#94A3B8" }} />
                        <span style={{ fontSize: "10.5px", fontWeight: 700, color: b.active ? "#16A34A" : "#64748B" }}>{b.active ? "Activo" : "Inactivo"}</span>
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => setDrawerBiz(b)} className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{ border: "1px solid #E2E8F0", color: "#4F46E5", background: "white" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "#F8FAFC")} onMouseLeave={e => (e.currentTarget.style.background = "white")}>
                      Ver cuentas
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between flex-shrink-0">
          <span style={{ fontSize: "12px", color: "#94A3B8" }}>Página {data?.pages ? page : 1} de {pages}</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1 || loading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{ border: "1px solid #E2E8F0", color: page <= 1 ? "#CBD5E1" : "#475569", background: "white", cursor: page <= 1 ? "default" : "pointer" }}>Anterior</button>
            <button onClick={() => setPage(p => Math.min(pages, p + 1))} disabled={page >= pages || loading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors" style={{ border: "1px solid #E2E8F0", color: page >= pages ? "#CBD5E1" : "#475569", background: "white", cursor: page >= pages ? "default" : "pointer" }}>Siguiente</button>
          </div>
        </div>
      </div>

      {creating && <CreateBusinessModal onClose={() => setCreating(false)} onCreated={() => { setPage(1); load(); }} />}
      {drawerBiz && <AccountsDrawer business={drawerBiz} onClose={() => { setDrawerBiz(null); load(); }} />}
      {confirm && <AdminConfirm title="Desactivar negocio" body="¿Desactivar este negocio? Bloqueará su acceso y sus webhooks de inmediato." confirmLabel="Desactivar" loading={confirmLoading} onCancel={() => setConfirm(null)} onConfirm={confirmDeactivate} />}
    </div>
  );
}

function AdminApp() {
  const [session, setSession] = useState<{ token: string; admin: typeof ADMIN_ME } | null>(null);
  if (!session) return <AdminLogin onLogin={setSession} />;
  return <AdminBusinesses admin={session.admin} onLogout={() => setSession(null)} />;
}

// ── Login del panel de negocio ──
const BIZ_LOGIN = { email: "demo@omnipanel.com", password: "demo123" };
const BIZ_SESSION_KEY = "omnipanel.biz.session";
async function apiBizLogin(email: string, password: string) {
  await wait(600);
  if (email.trim().toLowerCase() !== BIZ_LOGIN.email || password !== BIZ_LOGIN.password) throw new ApiError(401, "invalid_credentials", "Email o contraseña incorrectos.");
  return { token: uid("tok") };
}

function BusinessLogin({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = /.+@.+\..+/.test(email.trim()) && password.length > 0;

  const submit = async () => {
    if (!valid || loading) return;
    setLoading(true); setError(null);
    try { onLogin((await apiBizLogin(email, password)).token); }
    catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4" style={{ background: "#F1F5F9", fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 flex flex-col gap-5" style={{ boxShadow: "0 24px 60px rgba(15,23,42,0.12)" }}>
        <div className="flex flex-col items-center gap-2 text-center">
          <img src={omnipanelLogo} alt="Omnipanel" className="h-11 w-auto mb-3" />
          <h1 className="text-lg font-bold" style={{ color: "#0A1628" }}>Ingresá a tu panel</h1>
          <p style={{ fontSize: "12px", color: "#64748B" }}>Gestioná tus ventas, publicaciones y envíos en un solo lugar.</p>
        </div>
        {error && <AdminErrorNote>{error}</AdminErrorNote>}
        <div className="flex flex-col gap-3.5" onKeyDown={e => { if (e.key === "Enter") submit(); }}>
          <AdminField label="Email" value={email} onChange={setEmail} type="email" placeholder="vos@tunegocio.com" autoFocus />
          <AdminField label="Contraseña" value={password} onChange={setPassword} type="password" placeholder="••••••••" />
        </div>
        <button onClick={submit} disabled={!valid || loading}
          className="px-4 py-2.5 rounded-xl text-sm font-bold text-white transition-colors"
          style={{ background: valid && !loading ? "#4F46E5" : "#C7D2FE", cursor: valid && !loading ? "pointer" : "default" }}>
          {loading ? "Ingresando…" : "Ingresar"}
        </button>
        <p className="text-center" style={{ fontSize: "10.5px", color: "#CBD5E1" }}>Demo: {BIZ_LOGIN.email} · {BIZ_LOGIN.password}</p>
      </div>
    </div>
  );
}

function BusinessApp() {
  const [token, setToken] = useState<string | null>(() => { try { return sessionStorage.getItem(BIZ_SESSION_KEY); } catch { return null; } });
  if (!token) return <BusinessLogin onLogin={t => { try { sessionStorage.setItem(BIZ_SESSION_KEY, t); } catch { /* sin storage */ } setToken(t); }} />;
  return <Dashboard />;
}

export default function App() {
  const [route, setRoute] = useState(() => window.location.hash);
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (route.startsWith("#/admin")) return <AdminApp />;
  return <BusinessApp />;
}
