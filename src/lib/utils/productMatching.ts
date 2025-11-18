import type { Product } from '../types'

export type MatchScore = {
  product: Product
  score: number
  reason: string
}

// ---------------------------------------------------------------------------
// Normalizasyon & tokenizasyon
// ---------------------------------------------------------------------------

const STOP_WORDS = new Set<string>([
  'the',
  'and',
  'with',
  'w',
  'of',
  'ml',
  'glass',
  'bottle',
  'pint',
  'half',
  'shot',
  'classic',
  'kids',
  'set',
  'sourdough',
  'ciabatta',
  'nutella',
  'syrup',
  'cream',
  'peri',
])

export function normalizeName(raw: string): string {
  let s = raw.toLowerCase().trim()

  s = s.replace(/&/g, ' and ')
  s = s.replace(/-/g, ' ') // break-feast -> break feast
  s = s.replace(/[()*/]/g, ' ')
  s = s.replace(/\bml\b/g, '')
  s = s.replace(/\s+/g, ' ')

  return s.trim()
}

export function tokenizeName(norm: string): string[] {
  return norm
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t && !STOP_WORDS.has(t))
}

// ---------------------------------------------------------------------------
// Benzerlik fonksiyonları
// ---------------------------------------------------------------------------

function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0

  const dp = Array.from({ length: b.length + 1 }, (_, i) => i)

  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev
      } else {
        dp[j] = Math.min(prev + 1, dp[j] + 1, dp[j - 1] + 1)
      }
      prev = tmp
    }
  }

  const dist = dp[b.length]
  return 1 - dist / Math.max(a.length, b.length)
}

function tokenJaccard(aTokens: string[], bTokens: string[]): number {
  const setA = new Set(aTokens)
  const setB = new Set(bTokens)
  if (!setA.size || !setB.size) return 0

  let inter = 0
  for (const t of setA) if (setB.has(t)) inter++

  const union = new Set([...setA, ...setB]).size
  return inter / union
}

function calculateSimilarity(str1: string, str2: string): number {
  const n1 = normalizeName(str1)
  const n2 = normalizeName(str2)
  if (n1 === n2) return 1

  const tokens1 = tokenizeName(n1)
  const tokens2 = tokenizeName(n2)

  const lev = levenshteinSimilarity(n1, n2)
  const jac = tokenJaccard(tokens1, tokens2)

  let score = 0.6 * lev + 0.4 * jac

  // biri diğerini tamamen içeriyorsa küçük bonus
  if (n1.includes(n2) || n2.includes(n1)) {
    score += 0.1
  }

  return Math.min(score, 1)
}

// ---------------------------------------------------------------------------
// Domain based candidate filter
// ---------------------------------------------------------------------------

function filterCandidates(salesName: string, products: Product[]): Product[] {
  const norm = normalizeName(salesName)
  const tokens = tokenizeName(norm)

  const has = (t: string) => tokens.includes(t)

  const isExtra = /^\+\s*extra\b/i.test(salesName)
  const isMilkAddon = /^\+\s*(oat|almond|soya|soy|coconut)s?\s+milk/i.test(salesName)
  const isSyrupAddon = /^\+\s*(vanilla|caramel|hazelnut)\s+syrup/i.test(salesName)

  const isCoffee =
    ['latte', 'cappuccino', 'espresso', 'americano', 'mocha', 'cortado', 'macchiato', 'frappuccino'].some(has) ||
    (has('flat') && has('white'))

  const isTea = norm.includes('tea')
  const isBreakfast = norm.includes('breakfast') || norm.includes('break feast')
  const isKids = norm.includes('kids')
  const isPide = norm.includes('pide') || norm.includes('lahmacun')
  const isTapas = tokens[0] === 'tapas'
  const isMilkshake = norm.includes('milkshake') || norm.includes('smoothie') || norm.includes('frappuccino')
  const isCocktail =
    ['martini', 'mojito', 'spritz', 'sour', 'bellini', 'zombie', 'negroni', 'daiquiri', 'sangria', 'mai', 'tai'].some(
      has,
    ) || norm.includes('pina colada')

  const isWineOrProsecco =
    ['rioja', 'malbec', 'chardonnay', 'merlot', 'pinot', 'verde', 'sauvignon', 'prosecco', 'gavi'].some(has) ||
    /\b(125|175|750)\b/.test(norm)

  const isBeer = ['peroni', 'stella', 'moretti', 'estrella', 'magners', 'koppaberg'].some(has)
  const isSoft =
    ['coke', 'sprite', 'fanta', 'water', 'juice', 'red', 'bull', 'cordial', 'soda', 'tonic', 'bitter'].some(has)

  // Addon'ları şimdilik filtrelemiyoruz, ayrı fonksiyon handle edecek
  if (isExtra || isMilkAddon || isSyrupAddon) {
    return products
  }

  return products.filter((p) => {
    const pn = normalizeName(p.name)

    if (isCoffee)
        return /(latte|cappuccino|espresso|americano|flat white|mocha|matcha|frappuccino|cortado)/.test(pn)      
    if (isTea) return /tea|earl grey|english/.test(pn)
    if (isBreakfast) return /break|arty|american|medi|veggie|vegan/.test(pn)
    if (isKids) return /kids/.test(pn)
    if (isPide) return /pide|lahmacun/.test(pn)
    if (isTapas) return /tapas|humus|nibbles/.test(pn)
    if (isMilkshake) return /milkshake|smoothie|frappuccino/.test(pn)
    if (isCocktail)
      return /martini|mojito|spritz|sour|bellini|zombie|negroni|daiquiri|sangria|mai tai|pina colada/.test(pn)
    if (isWineOrProsecco) return /rioja|malbec|chardonnay|merlot|pinot|verde|sauvignon|prosecco|gavi|175ml|750ml/.test(pn)
    if (isBeer) return /peroni|stella|moretti|estrella|magners|koppaberg|zero/.test(pn)
    if (isSoft) return /coke|sprite|fanta|water|juice|red bull|cordial|soda|tonic|bitter/.test(pn)

    // emin değilsek tüm product listesi kalsın
    return true
  })
}

// ---------------------------------------------------------------------------
// Alias tablosu (rapordan gelen örneklerle)
// ---------------------------------------------------------------------------

const aliasEntries: [string, string][] = [
  // Breakfast
  ['THE ENGLISH BREAKFAST', 'The English'],
  ['FULL ARTYSANZ BREAKFAST', 'Full Artysansz'],
  ['AMERICAN BREAKFAST', 'American'],
  ['MEDITERRANEAN BREAKFAST', 'Mediterranean'],
  ['VEGGIE BREAKFAST', 'Veggie (V)'],
  ['VEGAN BREAKFAST', 'Vegan (Vg)'],
  ['BREAK-FEAST', 'Break-Feast'],

  // Jacket potato
  ['PLAIN JP', 'Plain Jack Potato'],

  // Soft drinks / water
  ['DIET COKE 330 ml', 'Coke / Diet / Zero (330ml)'],
  ['COKE ZERO 330 ml', 'Coke / Diet / Zero (330ml)'],
  ['COKE 330 ml', 'Coke / Diet / Zero (330ml)'],
  ['COKE 500 ml', 'Coke / Diet / Zero (500ml)'],
  ['DIET COKE 500 ml', 'Coke / Diet / Zero (500ml)'],
  ['SPRITE 330 ml', 'Sprite (330ml)'],
  ['FANTA 330 ml', 'Fanta (330ml)'],
  ['FANTA 500 ml', 'Fanta (500ml)'],
  ['STILL WATER 330ml', 'Still Water (330ml)'],
  ['STILL WATER 500ml', 'Still Water (500ml)'],
  ['SPARKLING WATER 330ml', 'Sparkling Water (330ml)'],
  ['SPARKLING WATER 500ml', 'Sparkling Water (500ml)'],
  ['ORANGE JUICE', 'Fresh Orange Juice'],
  ['APPLE JUICE', 'Fresh Apple Juice'],

  // Beer
  ['PERONI DRAFT PINT', 'Peroni Draft (Pint)'],
  ['PERONI DRAFT HALF', 'Peroni Draft (Half pint)'],
  ['PERONI ZERO', 'Peroni Zero (Bottle)'],
  ['CORONA', 'Corona (Bottle)'],
  ['STELLA ARTOIS', 'Stella Artois (Pint)'],

  // Prosecco & sparkling
  ['PROSECCO DOC 125ml', 'Prosecco, Le Dolci Colline (125ml)'],
  ['PROSECCO DOC Bottle', 'Prosecco, Le Dolci Colline (750ml)'],
  ['PINK PROSECCO DOC 125ml', 'Rose Prosecco, Lunetta (125ml)'],
  ['PINK PROSECCO DOC Bottle', 'Rose Prosecco, Lunetta (750ml)'],

  // Wine (rapor + menü)
  ['PINOT GRIGIO 175ml', 'Pinot Grigio, Mirabello (175ml)'],
  ['PINOT GRIGIO Bottle', 'Pinot Grigio, Mirabello (750ml)'],
  ['CASAL MENDES ROSE GLASS 175ml', 'Rose, Casal Mendes (175ml)'],
  ['SAUVIGNON BLANC GLASS 175ml', 'Sauvignon Blanc, Cloud Factory (175ml)'],
  ['SAUVIGNON BLANC BOTTLE', 'Sauvignon Blanc, Cloud Factory (750ml)'],
  ['MERLOT 175ml', 'Merlot Reserva, Los Espinos (175ml)'],
  ['CHARDONNAY 175ml', 'Chardonnay, Soldiers Block (175ml)'],
  ['MALBEC MENDOZA 175ml', 'Malbec, Santuario (175ml)'],
  ['MALBEC MENDOZA Bottle', 'Malbec, Santuario (750ml)'],
  ['MONTEPULCIANO 175ml', "Montepulciano D'Abruzzo (175ml)"],
  ['MONTEPULCIANO Bottle', "Montepulciano D'Abruzzo (750ml)"],
  ['PINOT NOIR 175ml', 'Pinot Noir, Le Fou (175ml)'],
  ['PINOT NOIR Bottle', 'Pinot Noir, Le Fou (750ml)'],
  ['GAVI DI GAVI GLASS', 'Gavi Di Gavi (750ml)'],
  ['GAVI DI GAVI BOTTLE', 'Gavi Di Gavi (750ml)'],
  ['PRIMITIVO 175ml', 'Primitivo, Vallone Versante (175ml)'],
  ['PRIMITIVO Bottle', 'Primitivo, Vallone Versante (750ml)'],
  ['Whispering Angel Provence 175ml', 'Whispering Angel (175ml)'],
  ['Whispering Angel Provence Bottle', 'Whispering Angel (750ml)'],
  ['Vinho Verde 175ml', 'Vinho Verde, Casal Mendes (175ml)'],
  ['PINOT GRIGIO ROSE Glass', 'Pinot Grigio Rose, Mirabello (175ml)'],
  ['PINOT GRIGIO ROSE Bottle', 'Pinot Grigio Rose, Mirabello (750ml)'],

  // Spirits – ml varyasyonları
  ['CAPTAIN MORGAN SPICED 25ml', 'Captain Morgan Spiced (35ml)'],
  ['HAVANA CLUB 7YRS 25ml', 'Havana Club 7yrs (35ml)'],
  ['BOMBAY SAPPHIRE 25ml', 'Bombay Sapphire (35ml)'],
  ['BOMBAY SAPPHIRE 50ml', 'Bombay Sapphire (35ml)'],
  ['JACK DANIELS 50ml', 'Jack Daniels (25ml)'],
  ['DON JULIO REPOSADO 50ml', 'Don Julio Reposado (35ml)'],
  ['PATRON SILVER', 'Patron Silver (35ml)'],
  ['GREY GOSE 25ml', 'Grey Goose Vodka (35ml)'],

  // Cocktails
  ['LONG ISLAN ICED TEA', 'Long Island Iced Tea'],
  ['MARGARITA CLASSIC', 'Margarita (Classic/Passion Fruit/Strawberry)'],
  ['MARGARITA PASSION FRUIT', 'Margarita (Classic/Passion Fruit/Strawberry)'],
  ['MOJITO PASSION FRUIT', 'Mojito (Passion Fruit/Strawberry/Raspberry/Coconut)'],
  ['MOJITO STRAWBERRY', 'Mojito (Passion Fruit/Strawberry/Raspberry/Coconut)'],
  ['MOJITO LYCEE', 'Mojito (Passion Fruit/Strawberry/Raspberry/Coconut)'],
  ['VIRGIN MOJITO', 'Virgin Mojito (Classic)'],
  ['PINA COLADA', 'Frozen Pina Colada'], // alkolik versiyon

  // Kahve & çay
  ['BLACK AMERICANO', 'Americano (Single)'],
  ['WHITE AMERICANO', 'Americano (Single)'],
  ['ICED MATCHA', 'Iced Matcha Latte'],
  ['ICED CHAI LATTE', 'Chai Latte'],

  // Extras / brunch
  ['SMASHED AVOCADO', 'Smashed Avocado (V)'],
  ['VEGAN WRAP', 'Vegan Wrap (Vg)'],
  ['FLUFFY PANCAKES NUTELLA', 'Fluffy Pancakes'],
  ['FLUFFY PANCAKES MAPLE SYRUP', 'Fluffy Pancakes'],
  ['BELGIUM WAFFLES NUTELLLA', 'Belgian Waffles'],
  ['BELGIUM WAFFLES MAPLE SYRUP', 'Belgian Waffles'],
  ['GARLIC KING PRAWNS', 'King Prawns'],
  ['MINUTE STEAK', 'Sirloin Minute Steak'],
  ['GRANOLA', 'Granola (Vg)'],
  ['KIDS BREAKFAST', 'Kids Breakfast'],

  // Milkshake / smoothie varyasyonları
  ['KINDER BUENO MILKSHAKE WITH CREAM', 'Kinder Bueno Milkshake'],
  ['CHOCOLATE MILKSHAKE WITH CREAM', 'Chocolate Milkshake'],
  ['OREO MILKSHAKE WITH CREAM', 'Oreo Milkshake'],

  // Pide & pizza typo
  ['VEGETARIANA PIDE', 'Vegetarian Pide'],
  ['CAPRICCIOSA PIDE', 'Capricciosa Pizza'],
]

const aliasMap: Record<string, string> = {}
for (const [src, dst] of aliasEntries) {
  aliasMap[normalizeName(src)] = dst
}

function resolveAlias(salesName: string): string | null {
  const key = normalizeName(salesName)
  return aliasMap[key] ?? null
}

// ---------------------------------------------------------------------------
// Addon kuralları: + Extra, + Oat Milk, + Syrup vb.
// ---------------------------------------------------------------------------

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ')
}

function matchSpecialAddons(salesName: string, products: Product[]): Product | null {
  const raw = salesName.trim()

  // + Extra X → "X (Extra)" veya en yakın Extra ürünü
  const extraMatch = /^\+\s*extra\s+(.+)$/i.exec(raw)
  if (extraMatch) {
    let base = extraMatch[1].trim()

    // ufak temizlikler
    base = base.replace(/w butter/i, 'Toast')
    base = base.replace(/hashbrown/i, 'Hash Browns')
    base = base.replace(/hallom/i, 'Halloumi')

    const baseTitle = toTitleCase(base)

    // Özel case: Extra Shot direkt ürün
    if (baseTitle === 'Shot') {
      const shot = products.find((p) => normalizeName(p.name) === normalizeName('Extra Shot'))
      if (shot) return shot
    }

    const guessName = `${baseTitle} (Extra)`
    const normGuess = normalizeName(guessName)

    const direct = products.find((p) => normalizeName(p.name) === normGuess)
    if (direct) return direct

    const extras = products.filter((p) => normalizeName(p.name).includes('extra'))
    let best: Product | null = null
    let bestScore = 0

    for (const p of extras) {
      const nameWithoutParen = p.name.replace(/\(.*?\)/g, '')
      const sc = calculateSimilarity(baseTitle, nameWithoutParen)
      if (sc > bestScore) {
        bestScore = sc
        best = p
      }
    }

    if (best && bestScore >= 0.7) return best
    return null
  }

  // + Oat/Almond/Soya/Coconut Milk → Alternative Milk (...)
  if (/^\+\s*(oat|almond|soya|soy|coconut)s?\s+milk/i.test(raw)) {
    return (
      products.find((p) => normalizeName(p.name).includes('alternative milk')) ??
      null
    )
  }

  // + Vanilla/Caramel/Hazelnut Syrup → Syrup (...)
  if (/^\+\s*(vanilla|caramel|hazelnut)\s+syrup/i.test(raw)) {
    return (
      products.find((p) => normalizeName(p.name).includes('syrup')) ??
      null
    )
  }

  // + Tonic Water → Tonic Water
  if (/^\+\s*tonic\s+water/i.test(raw)) {
    return (
      products.find((p) => normalizeName(p.name) === normalizeName('Tonic Water')) ??
      null
    )
  }

  // + Extra Shot (bazı POS'larda direkt böyle)
  if (/^\+\s*extra\s*shot/i.test(raw)) {
    return (
      products.find((p) => normalizeName(p.name) === normalizeName('Extra Shot')) ??
      null
    )
  }

  return null
}

// ---------------------------------------------------------------------------
// TAPAS gruplama – detay isimleri ana Tapas ürünlerine bağla
// ---------------------------------------------------------------------------

function matchTapasGroup(salesName: string, products: Product[]): Product | null {
  const norm = normalizeName(salesName)
  if (!norm.startsWith('tapas ')) return null

  let targetLabel = 'Tapas (General)'

  if (/(meatball|pork|jamon|belly|sausage|ribs|chorizo)/.test(norm)) {
    targetLabel = 'Meat (Tapas)'
  } else if (/(prawn|gambas|oyster|scallop|seabass|fish|calamar)/.test(norm)) {
    targetLabel = 'Seafood (Tapas)'
  } else if (/(patatas|aubergine|pepper|veg|veggie|asparagus|potato|spinach|esparragos)/.test(norm)) {
    targetLabel = 'Vegetables (Tapas)'
  }

  const normTarget = normalizeName(targetLabel)
  return (
    products.find((p) => normalizeName(p.name) === normTarget) ??
    null
  )
}

// ---------------------------------------------------------------------------
// En iyi eşleşmeleri bul
// ---------------------------------------------------------------------------

export function findBestMatches(
  salesName: string,
  products: Product[],
  maxResults: number = 5,
): MatchScore[] {
  const candidates = filterCandidates(salesName, products)
  const scores: MatchScore[] = []

  for (const product of candidates) {
    let reason = 'Similarity match'
    let score = calculateSimilarity(salesName, product.name)

    // POS code desteği (varsa)
    const anyProduct = product as any
    if (anyProduct.posCode) {
      const pos = String(anyProduct.posCode).toLowerCase().trim()
      const salesNorm = normalizeName(salesName)
      if (pos && (salesNorm.includes(pos) || pos.includes(salesNorm))) {
        score = Math.max(score, 0.9)
        reason = 'POS code match'
      }
    }

    if (score > 0.3) {
      scores.push({ product, score, reason })
    }
  }

  scores.sort((a, b) => b.score - a.score)
  return scores.slice(0, maxResults)
}

// ---------------------------------------------------------------------------
// Auto-match – POS isimlerini ürün id'lerine map et
// ---------------------------------------------------------------------------

export function autoMatchProducts(
  unmappedNames: string[],
  products: Product[],
  threshold: number = 0.8, // 0.90 → 0.80: rapora göre güvenli seviye
  allies?: Record<string, string>, // Allies table: salesName -> productId
): Record<string, string> {
  const mappings: Record<string, string> = {}

  for (const rawName of unmappedNames) {
    const name = rawName.trim()
    const norm = normalizeName(name)

    // Bilerek otomatik eşleştirmediğimiz generic item'lar
    if (/^misc item/i.test(norm)) continue
    if (/^mixer\b/i.test(norm)) continue

    // 0) ALLIES TABLOSU - En yüksek öncelik (ilk kontrol edilir)
    if (allies) {
      // Check with normalized name first (most common case)
      let allyProductId = allies[norm]
      
      // If not found, check original name variations
      if (!allyProductId) {
        allyProductId = allies[rawName] || allies[name]
      }
      
      // If still not found, check all allies with normalized comparison
      if (!allyProductId) {
        for (const [storedSalesName, storedProductId] of Object.entries(allies)) {
          const storedNorm = normalizeName(storedSalesName)
          if (storedNorm === norm) {
            allyProductId = storedProductId
            break
          }
        }
      }
      
      if (allyProductId) {
        // Product ID'nin geçerli olduğunu kontrol et
        const allyProduct = products.find((p) => p.id === allyProductId)
        if (allyProduct) {
          mappings[rawName] = allyProductId
          continue
        }
      }
    }

    // 1) Addon kuralları
    const addonProduct = matchSpecialAddons(name, products)
    if (addonProduct) {
      mappings[rawName] = addonProduct.id
      continue
    }

    // 2) TAPAS gruplama
    const tapasProduct = matchTapasGroup(name, products)
    if (tapasProduct) {
      mappings[rawName] = tapasProduct.id
      continue
    }

    // 3) Alias tablosu
    const aliasTargetName = resolveAlias(name)
    if (aliasTargetName) {
      const target = products.find(
        (p) => normalizeName(p.name) === normalizeName(aliasTargetName),
      )
      if (target) {
        mappings[rawName] = target.id
        continue
      }
    }

    // 4) Benzerlik skoruna göre auto-match
    const matches = findBestMatches(name, products, 1)
    if (matches.length > 0 && matches[0].score >= threshold) {
      mappings[rawName] = matches[0].product.id
    }
  }

  return mappings
}
