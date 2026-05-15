/** Maps store names to their icon source (brand favicon or custom emoji). */

type StoreIconInfo =
  | { type: 'favicon'; domain: string }
  | { type: 'emoji';   emoji: string  }

// Known grocery chains → fetch their favicon via Google's S2 favicon service
// Custom / ethnic / specialty stores → use an emoji
const STORE_ICON_MAP: Array<{ pattern: RegExp; info: StoreIconInfo }> = [
  // Major US chains
  { pattern: /trader\s*joe/i,          info: { type: 'favicon', domain: 'traderjoes.com' } },
  { pattern: /whole\s*food/i,          info: { type: 'favicon', domain: 'wholefoodsmarket.com' } },
  { pattern: /costco/i,                info: { type: 'favicon', domain: 'costco.com' } },
  { pattern: /safeway/i,               info: { type: 'favicon', domain: 'safeway.com' } },
  { pattern: /kroger/i,                info: { type: 'favicon', domain: 'kroger.com' } },
  { pattern: /walmart/i,               info: { type: 'favicon', domain: 'walmart.com' } },
  { pattern: /target/i,                info: { type: 'favicon', domain: 'target.com' } },
  { pattern: /albertson/i,             info: { type: 'favicon', domain: 'albertsons.com' } },
  { pattern: /sprout/i,                info: { type: 'favicon', domain: 'sprouts.com' } },
  { pattern: /publix/i,                info: { type: 'favicon', domain: 'publix.com' } },
  { pattern: /aldi/i,                  info: { type: 'favicon', domain: 'aldi.us' } },
  { pattern: /meijer/i,                info: { type: 'favicon', domain: 'meijer.com' } },
  { pattern: /\bh[-\s]?e[-\s]?b\b/i,  info: { type: 'favicon', domain: 'heb.com' } },
  { pattern: /wegman/i,                info: { type: 'favicon', domain: 'wegmans.com' } },
  { pattern: /fresh\s*market/i,        info: { type: 'favicon', domain: 'thefreshmarket.com' } },
  { pattern: /market\s*basket/i,       info: { type: 'favicon', domain: 'marketbasket.com' } },
  { pattern: /stop\s*[&and]+\s*shop/i, info: { type: 'favicon', domain: 'stopandshop.com' } },
  { pattern: /harris\s*teeter/i,       info: { type: 'favicon', domain: 'harristeeter.com' } },
  { pattern: /food\s*lion/i,           info: { type: 'favicon', domain: 'foodlion.com' } },
  { pattern: /giant/i,                 info: { type: 'favicon', domain: 'giantfood.com' } },
  { pattern: /morrisons/i,             info: { type: 'favicon', domain: 'morrisons.com' } },
  { pattern: /tesco/i,                 info: { type: 'favicon', domain: 'tesco.com' } },
  { pattern: /lidl/i,                  info: { type: 'favicon', domain: 'lidl.com' } },
  { pattern: /amazon\s*fresh/i,        info: { type: 'favicon', domain: 'amazon.com' } },
  { pattern: /instacart/i,             info: { type: 'favicon', domain: 'instacart.com' } },
  // Specialty / ethnic / custom — emoji fallback
  { pattern: /indian/i,                info: { type: 'emoji', emoji: '🌶️' } },
  { pattern: /asian/i,                 info: { type: 'emoji', emoji: '🥢' } },
  { pattern: /chinese/i,               info: { type: 'emoji', emoji: '🥢' } },
  { pattern: /japanese/i,              info: { type: 'emoji', emoji: '🍱' } },
  { pattern: /korean/i,                info: { type: 'emoji', emoji: '🍜' } },
  { pattern: /mexican/i,               info: { type: 'emoji', emoji: '🫔' } },
  { pattern: /latin/i,                 info: { type: 'emoji', emoji: '🌮' } },
  { pattern: /italian/i,               info: { type: 'emoji', emoji: '🍝' } },
  { pattern: /middle\s*east/i,         info: { type: 'emoji', emoji: '🫙' } },
  { pattern: /halal/i,                 info: { type: 'emoji', emoji: '☪️' } },
  { pattern: /kosher/i,                info: { type: 'emoji', emoji: '✡️' } },
  { pattern: /farmer.?s?\s*market/i,   info: { type: 'emoji', emoji: '🌾' } },
  { pattern: /farm\b/i,                info: { type: 'emoji', emoji: '🚜' } },
  { pattern: /butcher/i,               info: { type: 'emoji', emoji: '🥩' } },
  { pattern: /bakery|boulangerie/i,    info: { type: 'emoji', emoji: '🥖' } },
  { pattern: /fish|seafood/i,          info: { type: 'emoji', emoji: '🐟' } },
  { pattern: /organic/i,               info: { type: 'emoji', emoji: '🌱' } },
  { pattern: /deli/i,                  info: { type: 'emoji', emoji: '🥪' } },
  { pattern: /pharmacy|drug\s*store|cvs|walgreen|rite\s*aid/i, info: { type: 'emoji', emoji: '💊' } },
]

/** Returns icon info for the given store name. Falls back to a shopping cart emoji. */
export function getStoreIconInfo(storeName: string): StoreIconInfo {
  for (const { pattern, info } of STORE_ICON_MAP) {
    if (pattern.test(storeName)) return info
  }
  return { type: 'emoji', emoji: '🛒' }
}

/** Google S2 favicon CDN — reliable, returns a PNG at requested size. */
export function faviconUrl(domain: string, size = 32): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`
}

// ── StoreIcon component ───────────────────────────────────────────────────────

interface StoreIconProps {
  name: string
  /** User-set emoji override (from family_stores.emoji). Takes precedence over the map. */
  emoji?: string | null
  /** Rendered size in px. The favicon img is fetched at 2× for retina. Default: 16 */
  size?: number
  style?: React.CSSProperties
}

/** Renders a brand favicon or emoji for the given store name. */
export function StoreIcon({ name, emoji, size = 16, style }: StoreIconProps) {
  // User-set emoji always wins over the automatic map lookup
  const info: StoreIconInfo = emoji
    ? { type: 'emoji', emoji }
    : getStoreIconInfo(name)

  if (info.type === 'favicon') {
    return (
      <img
        src={faviconUrl(info.domain, size * 2)}
        alt={name}
        style={{
          width:  size,
          height: size,
          objectFit: 'contain',
          borderRadius: '3px',
          flexShrink: 0,
          ...style,
        }}
      />
    )
  }

  return (
    <span
      style={{
        fontSize: Math.round(size * 0.9),
        lineHeight: 1,
        flexShrink: 0,
        display: 'inline-block',
        ...style,
      }}
    >
      {info.emoji}
    </span>
  )
}
