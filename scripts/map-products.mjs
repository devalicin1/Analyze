// Maps the 417 Spark sales product names to category/subcategory ids.
// Reads scripts/spark-sales-products.json + scripts/spark-menu-groups.json,
// writes scripts/spark-products.json, and prints a per-category count + any
// fallbacks (names that matched no rule) for review.
import { readFileSync, writeFileSync } from 'node:fs'

const sales = JSON.parse(readFileSync(new URL('./spark-sales-products.json', import.meta.url), 'utf8'))
const groups = JSON.parse(readFileSync(new URL('./spark-menu-groups.json', import.meta.url), 'utf8'))

// valid id sets for validation
const validCat = new Set(groups.map((g) => g.id))
const validSub = new Set(groups.flatMap((g) => g.subGroups.map((s) => s.id)))

function classify(rawName) {
  const U = rawName.toUpperCase().replace(/\s+/g, ' ').trim()
  const has = (s) => U.includes(s)
  const eq = (s) => U === s
  const any = (arr) => arr.some((s) => U.includes(s))

  // 0. Set menus & packages (must precede coffee/cocktail/beer rules)
  if (any(['LUNCH', 'CHUG', 'SET MENU', 'UNLIMITED', 'JUST 2', '3 COURSE', 'FESTIVE'])) return ['cat_packages']
  // 1. Kids
  if (U.startsWith('KIDS')) return ['cat_kids']
  // 2. Roasts (+ roast accompaniments)
  if (has('ROAST') || any(['CAULIFLOWER CHEESE', 'HORSERADISH CREAM', 'MINT SAUCE'])) return ['cat_roasts']
  // 3. Shots
  if (any(['SHOT', 'SAMBUCA', 'SOURZ', 'JAGERBOMB', 'BABY GUINNESS', 'SLIPPERY NIPPLE'])) return ['cat_shots']
  // 4. Other / Misc
  if (U.startsWith('MISC') || any(['GIFT BY SPARK', 'TAP WATER', 'GLASS OF ICE']) || eq('GLUTEN FREE')) return ['cat_misc']
  // 5. Liqueur coffees (before hot drinks / liqueurs)
  if (has('COFFEE') && any(['IRISH', 'BAILEYS', 'FRENCH', 'CALYPSO', 'ITALIAN', 'FLOATER'])) return ['cat_liqueur_coffees']
  if (eq('HOT TODDY')) return ['cat_liqueur_coffees']
  // 6. Cocktails
  if (U.startsWith('VIRGIN')) return ['cat_cocktails', 'cat_cocktails_virgin']
  if (eq('FROZEN BUBBLE GUM')) return ['cat_cocktails', 'cat_cocktails_signature']
  if (eq('NO FROZEN PINA COLADA')) return ['cat_cocktails', 'cat_cocktails_classic']
  if (has('FROZEN')) return ['cat_cocktails', 'cat_cocktails_frozen']
  if (has('MARTINI') && !eq('DRY MARTINI') && !eq('MARTINI ROSSO')) return ['cat_cocktails', 'cat_cocktails_martini']
  if (any(['SPRITZ', 'BELLINI', 'KIR ROYAL', 'HUGO'])) return ['cat_cocktails', 'cat_cocktails_fizz']
  if (any(['GORDONS PINK FIZZ', 'RASPBERRY BOMB', 'NEGRONI', 'ARTIC MIRAGE', 'ARCTIC MIRAGE'])) return ['cat_cocktails', 'cat_cocktails_gin']
  if (any(['ROSE SANGRIA', 'SPARKS SECRET', "SPARK'S SECRET", 'CARABBEAN CRUSH', 'CARIBBEAN CRUSH', 'PASSION LOVE', 'SMOKE HOUSE'])) return ['cat_cocktails', 'cat_cocktails_signature']
  if (any(['MOJITO', 'COSMOPOLITAN', 'MARGHARITA', 'MARGARITA', 'SEX ON THE BEACH', 'ZOMBIE', 'OLD FASHIONED', 'SOUR', 'LONG ISLAND', 'PURPLE RAIN', 'RUSTY NAIL', 'WALLBANGER', 'COLLINS', 'PINA COLADA'])) return ['cat_cocktails', 'cat_cocktails_classic']
  // 7. Hot drinks (after cocktails so ESPRESSO MARTINI etc are gone)
  if (any(['ESPRESSO', 'CAPPUCCINO', 'LATTE', 'MOCHA', 'MACCHIATO', 'FLAT WHITE', 'AMERICANO', 'HOT CHOCOLATE', 'TURKISH COFFEE'])) return ['cat_hot_drinks']
  if (/\bTEA\b/.test(U) && !has('ICE TEA')) return ['cat_hot_drinks']
  // 8. Soft drinks (COKE/FANTA word-bounded so COKERTME KEBAB / FANTASTICA don't match)
  if (/\bCOKE\b/.test(U) || /\bFANTA\b/.test(U) || any(['PEPSI', 'SPRITE', 'J20', 'JUICE', 'APPLETISER', 'GINGER ALE', 'BITTER LEMON', 'TONIC', 'SODA', 'RED BULL', 'STILL WATER', 'SPARKLING WATER', 'LEMONADE', 'ICE TEA', 'CORDIAL'])) return ['cat_soft_drinks']
  // 8.5 Desserts (before wines/spirits so LIMONCELLO ICE CREAM etc are safe)
  if (has('ICE CREAM') || has('ICECREAM') || any(['SORBET', 'PUNKY', 'FERRERO ROCHER', 'MIDNIGHT MINT', 'COCONUT SUPREME', 'CADBURYS FLAKE'])) return ['cat_desserts', 'cat_desserts_icecream']
  if (any(['BAKLAVA', 'CHEESECAKE', 'STICKY TOFFEE', 'BROWNIE', 'CREME BRULEE', 'TIRAMISU', 'APPLE PIE'])) return ['cat_desserts', 'cat_desserts_desserts']
  // 9. Wines
  if (any(['PROSECCO', 'BRUT', 'CHAMPAGNE', 'BOLLINGER', 'VEUVE', 'LAURENT PERRIER', 'CHANDON', 'PERIGNON', 'MOET'])) return ['cat_sparkling']
  if (eq('MONBAZILLAC WHITE') || eq('PORT')) return ['cat_dessert_wine']
  if ((has('ROSE') || has('BLUSH') || has('WHISPERING ANGEL')) && !eq('TEQUILA ROSE')) return ['cat_rose_wine']
  if (any(['CHARDONNAY', 'PINOT GRIGIO', 'CANKAYA', 'RIESLING', 'SAUVIGNON', 'MAKUTU', 'GAVI', 'CHABLIS', 'SANCERRE', 'ALBARINO', 'CHENIN', 'SOAVE', 'VINHO VERDE', 'HOUSE WHITE'])) return ['cat_white_wine']
  if (any(['MERLOT', 'SHIRAZ', 'MONTEPULCIANO', 'MALBEC', 'PRIMITIVO', 'PINOT NOIR', 'BAROLO', 'AMARONE', 'RIOJA', 'YAKUT', 'SANGIOVESE', 'HOUSE RED', 'DOMAINE RED', 'ERYTHROS'])) return ['cat_red_wine']
  // 10. Beers
  if (any(['DRAFT', 'PINT', 'MADRI'])) return ['cat_beer_draft']
  if (has('BOTTLE') || any(['PERONI', 'CORONA', 'KOPPARBERG', 'MAGNERS', 'ASAHI', 'BUDWEISER', 'STELLA', 'CAMDEN', 'BREWDOG', 'EFES 500'])) return ['cat_beer_bottled']
  // 11. Spirits
  if (eq('TEQUILA ROSE') || any(['TEQUILA', 'JOSE CUERVO', 'PATRON', 'CAZCABEL'])) return ['cat_tequila']
  if (/\bGIN\b/.test(U) || any(['GORDONS', 'BOMBAY SAPPHIRE', 'TANQUERAY', 'HOXTON'])) return ['cat_gin']
  if (any(['SMIRNOFF', 'ABSOLUT', 'BELVEDERE', 'CIROC', 'GREY GOOSE', 'CRYSTAL HEAD', 'STOLICHNAYA', 'BELUGA'])) return ['cat_vodka']
  if (any(['BACARDI', 'CAPTAIN MORGAN', 'MORGON SPICED', 'MORGAN SPICED', 'DIPLOMATICO', 'HAVANA', 'WRAY', 'JEREMY XO'])) return ['cat_rum']
  if (any(['COURVOIS', 'MARTELL', 'REMY MARTIN', 'HENNESSY', 'HENNESY', 'CHATEAU BEAULON', 'TESSERON'])) return ['cat_cognac']
  if (any(['ARMAGNAC', 'CALVADOS', 'PERE MAGLOIRE', 'LAUVIA'])) return ['cat_armagnac']
  if (any(['TIA MARIA', 'KAHLUA', 'SOUTHERN COMFORT', 'DRAMBUIE', 'GRAND MARNIER', 'BAILEYS', 'BAILYS', 'JAGERMEISTER', 'DISARRONO', 'MALIBU', 'ARCHERS', 'COINTREAU', 'FRANGELICO', 'CHAMBORD', 'LIMONCELLO', 'LEMONCELLO', 'ST GERMAIN', 'DOM BENEDICTINE'])) return ['cat_liqueurs']
  // 12. Whisky
  if (any(['JAMESON', 'BUSH MILLS', 'BUSHMILLS'])) return ['cat_whisky', 'cat_whisky_irish']
  if (any(['JOHNNIE WALKER', 'JW RED', 'CHIVAS', 'GLENFIDDICH', 'MONKEY SHOULDER', 'BLACK LABEL', 'FAMOUS GROUSE', 'GLENMORANGIE', 'HAIG CLUB', 'TALISKER', 'LAGAVULIN'])) return ['cat_whisky', 'cat_whisky_scotch']
  if (any(['JACK DANIELS', 'JIM BEAM', 'MAKERS MARK', 'MARKERS MARK', 'WOODFORD', 'BULLEIT'])) return ['cat_whisky', 'cat_whisky_bourbon']
  if (any(['HIGHLAND PARK', 'VALKYRIE'])) return ['cat_whisky', 'cat_whisky_malt']
  if (any(['YAMAZAKI'])) return ['cat_whisky', 'cat_whisky_japanese']
  // 13. Aperitifs
  if (any(['APEROL', 'CAMPARI', 'PIMMS', 'MIDORI', 'DRY MARTINI', 'MARTINI ROSSO', 'PERNOD', 'RAKI', 'NOILLY PRAT'])) return ['cat_aperitifs']
  // 14. Grill & kebabs
  if (has('W/YOGHURT') || has('WITH YOGHURT')) return ['cat_grill', 'cat_grill_yoghurt']
  if (has('COMBINATION') || any(['CHICKEN SHISH & ADANA', 'CHICKEN SHISH & CHICKEN BEYTI', 'LAMB SHISH & ADANA', 'LAMB SHISH & CHICKEN BEYTI', 'LAMB BEYTI & CHICKEN BEYTI', 'LAMB CHOPS & LAMB RIBS'])) return ['cat_grill', 'cat_grill_combinations']
  if (any(['HOUSE SPECIAL LAMB', 'CREAMY MUSHROOM CHICKEN', 'COKERTME'])) return ['cat_grill', 'cat_grill_signature']
  // 15. Hot starters that contain grill/seafood words (handle before generic grill/seafood)
  if (any(['SPICY BEEF SAUSAGE', 'CREAMY GARLIC MUSHROOM', 'MUSHROOM & HALLOUMI', 'CHEESY PASTRY ROLLS', 'GRILLED HALLOUMI', 'CHICKEN WINGS STARTER', 'HUMMUS KAVURMA', 'LAMB LIVER', 'CRUNCHY GOATS CHEESE', 'CRISPY SQUID', 'PAN COOKED PRAWNS', 'MUSSELS CREAMY', 'MUSSELS TOMATO', 'FALAFEL (STR)', 'PADRON PEPPER', 'HALLOUMI & SUCUK']) || eq('SQUID')) return ['cat_starters', 'cat_starters_hot']
  // 16. Seafood
  if (any(['SEA BASS', 'FISH KEBAB', 'TIGER PRAWNS', 'OCTOPUS'])) return ['cat_seafood', 'cat_seafood_dishes']
  // 17. Grill mains
  if (any(['SHISH', 'KOFTE', 'BEYTI', 'ADANA', 'LAMB RIBS', 'LAMB CHOPS', 'MIXED GRILL', 'WAGYU BURGER', 'CHICKEN WINGS', 'MINCED'])) return ['cat_grill', 'cat_grill_mains']
  // 18. Cold starters
  if (any(['MIXED OLIVES', 'KRUDITE', 'TARAMA', 'CACIK', 'PATLICAN SOSLU', 'AVOCADO PRAWN COCKTAIL', 'DOLMA']) || eq('HUMMUS') || eq('EZME SALAD') || eq('SPICY EZME SALAD')) return ['cat_starters', 'cat_starters_cold']
  // 19. Sharing boards
  if (eq('MIXED COLD STARTERS') || eq('MIXED HOT STARTERS') || eq('MIXED BOARD')) return ['cat_starters', 'cat_starters_sharing']
  // 20. Vegetarian
  if (eq('VEGETABLE GRILL HALLOUMI') || eq('FALAFEL MAIN')) return ['cat_vegetarian', 'cat_vegetarian_mains']
  // 21. Salads
  if (has('SALAD') && !eq('MIXED SALAD')) return ['cat_salads', 'cat_salads_all']
  // 22. Sides
  if (any(['THICK CUT CHIPS', 'CREAMY MASH', 'SAUTEED NEW POTATOES', 'SAUTEED BABY SPINACH', 'BROCCOLI & ALMOND', 'GRILLED ONIONS', 'GRILLED MUSHROOMS', 'SAUTEED VEGETABLES', 'MIXED SALAD', 'TRUFFLE CHIPS', 'BUTTERED COURGETTE']) || eq('YOGHURT') || eq('BREAD') || eq('RICE') || eq('COUSCOUS')) return ['cat_sides', 'cat_sides_all']
  // 23. Steaks
  if (has('STEAK')) return ['cat_steaks', 'cat_steaks_scottish']

  return [null] // fallback
}

const products = []
const fallbacks = []
const counts = {}
const invalid = []

for (const p of sales) {
  if (p.name.toUpperCase().trim() === 'TOPLAM') continue // total row, not a product
  let [cat, sub] = classify(p.name)
  if (!cat) {
    fallbacks.push(p) // unidentified -> park in Other/Misc, flag for review
    cat = 'cat_misc'
    sub = undefined
  }
  if (!validCat.has(cat) || (sub && !validSub.has(sub))) invalid.push({ name: p.name, cat, sub })
  const prod = { name: p.name, posCode: p.name, isExtra: false, menuGroupId: cat }
  if (sub) prod.menuSubGroupId = sub
  products.push(prod)
  counts[cat] = (counts[cat] || 0) + 1
}

writeFileSync(new URL('./spark-products.json', import.meta.url), JSON.stringify(products, null, 2))

const labelOf = Object.fromEntries(groups.map((g) => [g.id, g.label]))
console.log('Mapped products:', products.length, '| fallbacks:', fallbacks.length, '| invalid ids:', invalid.length)
console.log('--- per category ---')
Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([c, n]) => console.log(`  ${n}\t${labelOf[c]}`))
if (invalid.length) { console.log('--- INVALID IDS ---'); invalid.forEach((x) => console.log('  ', JSON.stringify(x))) }
console.log('--- FALLBACKS (need a rule) ---')
fallbacks.sort((a, b) => b.totalAmount - a.totalAmount).forEach((p) => console.log(`  £${p.totalAmount}\t${p.monthsCount}mo\t${p.name}`))

if (process.argv.includes('--dump')) {
  const subLabel = Object.fromEntries(groups.flatMap((g) => g.subGroups.map((s) => [s.id, s.label])))
  console.log('\n===== GROUPED REVIEW =====')
  for (const g of groups) {
    const inCat = products.filter((p) => p.menuGroupId === g.id)
    if (!inCat.length) continue
    console.log(`\n### ${g.label} (${inCat.length})`)
    for (const p of inCat) {
      console.log(`   ${p.menuSubGroupId ? '[' + subLabel[p.menuSubGroupId] + '] ' : ''}${p.name}`)
    }
  }
}
process.exit(0)
