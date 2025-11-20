import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Download, Trash2, Upload, Edit2 } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { useAuth } from '../../context/AuthContext'
import {
  listProductAllies,
  saveProductAllies,
  saveProductAlly,
  deleteProductAlly,
} from '../../lib/api/productAllies'
import { listProducts } from '../../lib/api/products'
import {
  downloadProductAlliesTemplate,
  parseProductAlliesExcel,
} from '../../lib/utils/excelTemplate'
import { FileUpload } from '../../components/forms/FileUpload'
import { Modal } from '../../components/forms/Modal'
import { SearchableSelect } from '../../components/forms/SearchableSelect'
import { DataTable } from '../../components/tables/DataTable'
import type { ProductAlly, Product } from '../../lib/types'
import { normalizeName } from '../../lib/utils/productMatching'

// Type for parsed ally from Excel (matches parseProductAlliesExcel return type)
type ParsedAlly = { salesName: string; productId: string }

// Alias entries to import into Product Allies
const ALIAS_ENTRIES: [string, string][] = [
  // --- Shots / Spirits ---
  ['ABSOLUT 25ml', 'Absolut Vodka (35ml)'],
  ['ABSOLUT 50ml', 'Absolut Vodka (35ml)'],
  ['BAILEYS* 25ml', 'Baileys'],
  ['BAILEYS* 50ml', 'Baileys'],
  ['BOMBAY SAPPHIRE 25ml', 'Bombay Sapphire (35ml)'],
  ['BOMBAY SAPPHIRE 50ml', 'Bombay Sapphire (35ml)'],
  ['GREY GOSE 25ml', 'Grey Goose Vodka (35ml)'],
  ['GORDONS 25ml', 'Gordons Gin (35ml)'],
  ['GORDONS PINK 25ml', 'Gordons Pink Gin (35ml)'],
  ['GORDONS PINK 50ml', 'Gordons Pink Gin (35ml)'],
  ['SPICED 25ml', 'Captain Morgan Spiced (35ml)'],
  ['TANQUERAY SEVILA 25ml', 'Tanqueray Sevilla (35ml)'],
  ['TANQUERAY No10 25ml', 'Tanqueray No 10 (35ml)'],
  ['TEQUILA ROSE', 'Tequila Rose'],
  ['DISARRONO* 50ml', 'Disaronno'],
  ['PATRON SILVER', 'Patron Silver'],
  // --- Soft drinks & juices ---
  ['APPLE JUICE', 'Fresh Apple Juice'],
  ['APPLE TIZER', 'Appletiser (330ml)'],
  ['COKE 330 ml', 'Coke / Diet / Zero (330ml)'],
  ['COKE ZERO 330 ml', 'Coke / Diet / Zero (330ml)'],
  ['DIET COKE 330 ml', 'Coke / Diet / Zero (330ml)'],
  ['COKE 500 ml', 'Coke / Diet / Zero (500ml)'],
  ['DIET COKE 500 ml', 'Coke / Diet / Zero (500ml)'],
  ['FANTA 330 ml', 'Fanta (330ml)'],
  ['FANTA 500 ml', 'Fanta (500ml)'],
  ['SPRITE 330 ml', 'Sprite (330ml)'],
  ['GINGER BEER', 'Ginger Beer'],
  ['KOPPARBERG STRAWBERRY LIME', 'Koppaberg (Bottle)'],
  ['LIME CORDIAL', 'Lime Cordial'],
  ['SODA WATER DASH BLACKCURRANT', 'Soda Water'],
  ['SODA WATER DASH LIME', 'Soda Water'],
  ['TONIC WATER DASH BLACKCURRANT', 'Tonic Water'],
  ['TONIC WATER DASH LIME', 'Tonic Water'],
  // --- Coffee / Tea / Non-alc ---
  ['MINT TEA', 'Fresh Mint Tea'],
  ['BERRY NICE SMOOTHIE', 'Berry Nice Smoothie'],
  ['CARRIBEAN CRUSH', 'Caribbean Crush'],
  ['MINUTE MAID ORANGE', 'Fresh Orange Juice'],
  ['TROPICAL CUP', 'Tropical Cup'],
  ['WHISKEY SOUR', 'Whiskey Sour'],
  ['MIMOSA', 'Mimosa'],
  // --- Cocktails & Spritz ---
  ['APEROL SPRITZ', 'Aperol Spritz'],
  ['HUGO SPRITZ', 'Hugo Spritz'],
  ['LIMONCELLO SPRITZ', 'Limoncello Spritz'],
  ['FROZEN PINA COLADA', 'Frozen Pina Colada'],
  ['FROZEN PORNSTAR MARTINI', 'Frozen Pornstar Martini'],
  ['ESPRESSO MARTINI', 'Espresso Martini'],
  ['ITALIAN ESPRESSO MARTINI', 'Italian Espresso Martini'],
  ['FRENCH MARTINI', 'French Martini'],
  ['LYCHEE MARTINI', 'Lychee Martini'],
  ['MOJITO PASSION FRUIT', 'Mojito (Passion Fruit)'],
  ['MOJITO STRAWBERRY', 'Mojito (Strawberry)'],
  ['MOJITO CLASSIC', 'Mojito (Classic)'],
  ['PORNSTAR MARTINI', 'Pornstar Martini'],
  ['LONG ISLAN ICED TEA', 'Long Island Iced Tea'],
  ['ROSE SANGRIA', 'Rose Sangria'],
  ['SANGRIA GLASS', 'Sangria'],
  ['VIRGIN MOJITO', 'Virgin Mojito (Classic)'],
  ['BELLINI PASSION FRUIT', 'Bellini (Passion Fruit)'],
  ['MOJITO LYCEE', 'Mojito (Lychee)'],
  // --- Wine (glass & bottle) ---
  ['CHARDONNAY 175ml', 'Chardonnay, Soldiers Block (175ml)'],
  ['MERLOT 175ml', 'Merlot Reserva, Los Espinos (175ml)'],
  ['MALBEC MENDOZA 175ml', 'Malbec, Santuario (175ml)'],
  ['MONTEPULCIANO 175ml', 'Montepulciano d\'Abruzzo, Il Faggio (175ml)'],
  ['PINOT GRIGIO 175ml', 'Pinot Grigio, Mirabello (175ml)'],
  ['PINOT NOIR 175ml', 'Pinot Noir, Monte Vista (175ml)'],
  ['PINOT GRIGIO ROSE Glass', 'Pinot Grigio Rose, Mirabello (175ml)'],
  ['CASAL MENDES ROSE GLASS 175ml', 'Casal Mendes Rose (175ml)'],
  ['PRIMITIVO 175ml', 'Primitivo Del Salento, Boheme (175ml)'],
  ['RIOJA RESERVA 175ml', 'Ontanon Rioja Crianza (175ml)'],
  ['SAUVIGNON BLANC GLASS 175ml', 'Sauvignon Blanc, Cloud Factory (175ml)'],
  ['Vinho Verde 175ml', 'Vinho Verde, Quinta de Azevedo (175ml)'],
  ['SHIRAZ Glas', 'Shiraz, Soldiers Block (175ml)'],
  ['PINOT GRIGIO BOTTLE', 'Pinot Grigio, Mirabello (750ml)'],
  ['PINOT GRIGIO ROSE Bottle', 'Pinot Grigio Rose, Mirabello (750ml)'],
  ['PINK PROSECCO GLASS 125ML', 'Rose Prosecco, Lunetta (125ml)'],
  ['PINK PROSECCO Bottle', 'Rose Prosecco, Lunetta (750ml)'],
  ['PROSECCO DOC 125ml', 'Prosecco, Le Dolci Colline (125ml)'],
  ['PROSECCO DOC Bottle', 'Prosecco, Le Dolci Colline (750ml)'],
  ['PRIMITIVO Bottle', 'Primitivo Del Salento, Boheme (750ml)'],
  ['MONTEPULCIANO Bottle', 'Montepulciano d\'Abruzzo, Il Faggio (750ml)'],
  ['MALBEC MENDOZA Bottle', 'Malbec, Santuario (750ml)'],
  ['MERLOT Bottle', 'Merlot Reserva, Los Espinos (750ml)'],
  ['PINOT NOIR Bottle', 'Pinot Noir, Monte Vista (750ml)'],
  ['RIOJA CRIANZA Bottle', 'Ontanon Rioja Crianza (750ml)'],
  ['SAUV. BOTTLE', 'Sauvignon Blanc, Cloud Factory (750ml)'],
  ['SHIRAZ Bottle', 'Shiraz, Soldiers Block (750ml)'],
  ['Vinho Verde Bottle', 'Vinho Verde, Quinta de Azevedo (750ml)'],
  ['AMARONE Bottle', 'Amarone Della Valpolicella (750ml)'],
  // --- Beer & cider ---
  ['STELLA ARTOIS', 'Stella Artois (Pint)'],
  ['MORETTI', 'Morretti (Pint)'],
  ['CORONA', 'Corona (Bottle)'],
  // --- Breakfast & kids & mains ---
  ['FULL ARTYSANZ BREAKFAST', 'Full Artysansz'],
  ['MEDITERRANEAN BREAKFAST', 'Mediterranean'],
  ['VEGGIE BREAKFAST', 'Veggie (V)'],
  ['VEGAN BREAKFAST', 'Vegan (Vg)'],
  ['BREAK-FEAST', 'Break-Feast'],
  ['KIDS BREAKFAST', 'Kids Breakfast'],
  ['AMERICAN BREAKFAST', 'American'],
  ['BOLOGNNESE PASTA KIDS', 'Bolognese Penne Pasta (Kids)'],
  ['CREAMY PENNE PASTA KIDS', 'Creamy Penne Pasta (Kids)'],
  ['PENNE NAPOLI PASTA KIDS', 'Penne Napoli Pasta (Kids)'],
  ['CHICKEN BREAST BURGER KIDS', 'Chicken Breast Burger (Kids)'],
  ['BEEF BURGER KIDS', 'Beef Burger (Kids)'],
  ['CHICKEN BURGER KIDS', 'Chicken Burger (Kids)'],
  ['CHICKEN NUGGETS KIDS', 'Chicken Nuggets (Kids)'],
  ['FISH FINGERS KIDS', 'Fish Fingers (Kids)'],
  ['BOLOGNESE PENNE', 'Bolognese Penne Pasta'],
  ['MILANEZA PASTA', 'Milaneza Pasta'],
  ['PENNE POLLO FUNGHI', 'Penne Pollo Funghi'],
  ['SPAGHETTI VCARBONARA', 'Spaghetti Carbonara'],
  ['BUTTERFLY GRILLED CHICKEN BREAST PERI PERI', 'Butterfly Grilled Chicken Breast'],
  ['SHORT BEEF RIBS', 'Short Beef Ribs'],
  // --- Sandwich / bread type varyantları ---
  ['CLUB SANDWHICH CIABATTA', 'Club Sandwich'],
  ['CLUB SANDWHICH SOURDOUGH', 'Club Sandwich'],
  ['SALT BEEF CIABATTA', 'Salt Beef Sandwich'],
  ['SALT BEEF SOURDOUGH', 'Salt Beef Sandwich'],
  ['CHICKEN ESCALOPE TORTILLA', 'Chicken Escalope Wrap'],
  ['CHICKEN ESCALOPE CIABATTA', 'Chicken Escalope Sandwich'],
  ['CHICKEN ESCALOPE SOURDOUGH', 'Chicken Escalope Sandwich'],
  ['TUNA MAYO SOURDOUGH', 'Tuna Mayo Sandwich'],
  ['TUNA MAYO CIABATTA', 'Tuna Mayo Sandwich'],
  // --- Burgers / wraps / vb. ---
  ['CRISPY HALLOUMI BURGER', 'Halloumi Burger'],
  ['HALLOUMI BURGER', 'Halloumi Burger'],
  ['CRISPY SPICY CHICKEN BURGER', 'Crispy Spicy Chicken Burger'],
  ['CLASSIC CHEESE BEEF BURGER', 'Classic Cheese Beef Burger'],
  ['VEGAN WRAP', 'Vegan Wrap (Vg)'],
  ['CHICKEN WRAP', 'Chicken Wrap'],
  // --- Tapas & starters ---
  ['TAPAS GORDAL QUEEN OLIVES', 'Tapas Gordal Queen Olives'],
  ['TAPAS CHORIZO A LA SIDRA', 'Tapas Chorizo a la Sidra'],
  ['TAPAS NACHOS CON QUESO', 'Tapas Nachos Con Queso'],
  ['TAPAS TORTILLA DE PATATAS', 'Tapas Tortilla de Patatas'],
  ['TAPAS SEABASS A LA PLANCHA', 'Tapas Seabass a la Plancha'],
  ['TAPAS ESPARRAGOS CON MANCHEGO', 'Tapas Esparragos Con Manchego'],
  ['TAPAS SWEET POTATO FRIES', 'Tapas Sweet Potato Fries'],
  ['TRIO STARTER', 'Trio Starter'],
  ['PAN COOKED CAJUN SALMON', 'Pan Cooked Cajun Salmon'],
  ['HELADO', 'Helado'],
  ['COLESLAW', 'Coleslaw'],
  ['VEGETARIANA PIDE', 'Vegetarian Pide'],
  // --- Kahve / diğer ---
  ['CORTADO', 'Cortado'],
  ['ICED BLACK AMERICANO', 'Iced Black Americano'],
  // --- Extra / add-on'lar (kahvaltı) ---
  ['+ Bolognese', 'Spaghetti Bolognese'],
  ['+ Extra Scrambled Egg', 'Egg (Extra)'],
  ['+ Extra Fried Egg', 'Egg (Extra)'],
  ['+ Extra Poached Egg', 'Egg (Extra)'],
  ['+ Add Poached Egg', 'Egg (Extra)'],
  ['+ Add Bacon', 'Crispy Bacon (Extra)'],
  ['+ Add Streaky Bacon', 'Crispy Bacon (Extra)'],
  ['+ Extra Veg Sausage', 'Veg Sausage (Extra)'],
  ['+ Extra Avo Smashed', 'Avo Smashed (Extra)'],
  ['+ Extra Cherry Tomato', 'Cherry Tomato (Extra)'],
  ['+ Extra Toast w Butter', 'Toast (Extra)'],
  ['+ Beans', 'Baked Beans (Extra)'],
  ['+ Extra Baked Beans', 'Baked Beans (Extra)'],
  ['+ Extra Hashbrown', 'Hash Browns (Extra)'],
  ['+ Small Mix Fruit', 'Mixed Fruit (Extra)'],
  ['+ Extra Sauted Spinach', 'Sauteed Spinach (Extra)'],
  ['+ Extra Grilled Hallom', 'Halloumi Grilled (Extra)'],
  ['+ Extra Pancakes', 'Fluffy Pancakes'],
  ['+ Extra Nutella', 'Fruit Jam / Nutella (Extra)'],
  ['+ Extra Salad', 'Mixed Salad'],
  ['+ Add Halloumi', 'Halloumi Grilled (Extra)'],
  // --- New Extras ---
  ['+ Extra Streaky Bacon', 'Crispy Bacon (Extra)'],
  ['+ Extra Mushroom', 'Portobello Mushroom (Extra)'],
  ['+ Extra Jam', 'Fruit Jam / Nutella (Extra)'],
  ['+ Mix Fruit', 'Mixed Fruit (Extra)'],
  ['+ Avocado Slice', 'Avo Smashed (Extra)'],
  // --- Breakfast / Eggs ---
  ['OMELETTE 1', 'Omelette 1 (1 Ingredient)'],
  ['OMELETTE 3', 'Omelette 3 (3 Ingredients)'],
  ['EGGS BENEDICT BACON', 'Eggs Benedict'],
  ['EGGS BENEDICT HAM', 'Eggs Benedict'],
  ['TRUFFLED SPINACH FLORENTINE', 'Spinach Florentine (V)'],
  ['PORRIDGE WHOLE MILK', 'Porridge'],
  ['PORRIDGE ALMOND MILK', 'Porridge'],
  ['PORRIDGE OAT MILK', 'Porridge'],
  // --- Sandwiches ---
  ['CLUB SANDWICH SOURDOUGH', 'Club Sandwich'],
  ['CLUB SANDWICH CIABATTA', 'Club Sandwich'],
  ['CHICKEN ESCALOPE TORTILLA', 'Chicken Escalope Sandwich'],
  // --- Tea / Hot Drinks ---
  ['FRESH MINT TEA', 'Herbal Tea (Chamomile/Peppermint/Ginger/Mixed Fruit)'],
  ['PEPPERMINT TEA', 'Herbal Tea (Chamomile/Peppermint/Ginger/Mixed Fruit)'],
  ['CAMOMILE TEA', 'Herbal Tea (Chamomile/Peppermint/Ginger/Mixed Fruit)'],
  ['GINGER TEA', 'Herbal Tea (Chamomile/Peppermint/Ginger/Mixed Fruit)'],
  // --- Coffee ---
  ['MACCHIATO single', 'Macchiato'],
  ['MACCHIATO double', 'Macchiato'],
  // --- Juices / Soft Drinks ---
  ['CRANBERRY JUICE', 'Juices (Apple/Pineapple/Cranberry/Orange)'],
  ['PINEAPPLE JUICE', 'Juices (Apple/Pineapple/Cranberry/Orange)'],
  ['FIZZY JUICE', 'Fresh Mix Juice'],
  ['TONIC WATER tonic', 'Tonic Water'],
  ['TONIC WATER slimlime', 'Tonic Water'],
  ['REDBULL', 'Red Bull'],
  // --- Smoothies / Cocktails ---
  ['PINEAPPLE SUNRISE SMOOTHIE', 'Pineapple Surprise Smoothie'],
  ['BELLINI LYCEE', 'Bellini'],
  ['BELLINI PEACH', 'Bellini'],
  ['BELLINI STRAWBERRY', 'Bellini'],
  ['VIRGIN STRAWBERRY DAIQUIRI', 'Virgin Frozen Daiquiri'],
  ['CLASSIC MOJITO', 'Mojito (Classic)'],
  ['FROZEN STRAWBERRY DAIQUIRI', 'Frozen Daiquiri'],
  ['OLD FASHIONED CLASSIC', 'Old Fashioned'],
  // --- Wine / Spirits ---
  ['HENDRICKS 50ml', 'Hendricks (35ml)'],
  ['CABERNET MERLOT C.K.A 175ml', 'Merlot Reserva, Los Espinos (175ml)'],
  // --- Salads / Main Dishes ---
  ['GRILLED CHICKEN CEASER SALAD', 'Grilled Chicken Caesar'],
  ['SAUTED PINACH', 'Sauteed Spinach'],
  ['LAMB CUBES W CHEESE PIDE', 'Lamb Cubes Pide'],
  ['MINCED LAMB W CHEESE EGG PIDE', 'Minced Lamb Pide'],
  ['ROASTED LAMB W CHEESE EGG PIDE', 'Lamb Cubes Pide'],
  // --- Pide / Pizza / Set Menu ---
  ['LAHMACUN PIDE', 'Lahmacun'],
  ['MARGHERITA', 'Margherita Pizza'],
  ['SIGNATURE VEGETARIANA PIDE', 'Vegetarian Pide'],
  ['VEGETERIAN PIDE', 'Vegetarian Pide'],
  ['BUFALINA PIDE', 'Vegetarian Pide'],
  ['CLASICO TAPAS', 'Clasico Set Menu'],
  ['DELA CASA TAPAS', 'De La Casa Set Menu'],
  ['TONNATA PIDE', 'Tonnato'],
  ['SALSICCIA E FRIARIELLI PIDE', 'Salsiccia e Friarelli Pizza'],
  // --- Burgers / Wraps ---
  ['CRIPY SPICY CHICKEN BURGER', 'Crispy Spicy Chicken Burger'],
  // --- Miscellaneous ---
  ['MAGNERS ORIGINAL', 'Magners (Bottle)'],
]

export function ProductAlliesPage() {
  const workspace = useWorkspace()
  const { user } = useAuth()
  const [allies, setAllies] = useState<ProductAlly[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [editingAlly, setEditingAlly] = useState<ProductAlly | null>(null)
  const [editSalesName, setEditSalesName] = useState('')
  const [editProductId, setEditProductId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const [alliesList, productsList] = await Promise.all([
          listProductAllies(workspace),
          listProducts(workspace),
        ])
        setAllies(Array.isArray(alliesList) ? alliesList : [])
        setProducts(Array.isArray(productsList) ? productsList : [])
      } catch (error) {
        console.error('Failed to load data:', error)
        setAllies([])
        setProducts([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [workspace])

  function handleBulkUploadSuccess() {
    listProductAllies(workspace).then((alliesList) => {
      setAllies(Array.isArray(alliesList) ? alliesList : [])
    })
    setBulkUploadOpen(false)
    setFeedback('Product allies updated successfully.')
    setTimeout(() => setFeedback(null), 3000)
  }

  async function handleImportAliases() {
    if (products.length === 0) {
      setFeedback('Please wait for products to load.')
      setTimeout(() => setFeedback(null), 3000)
      return
    }

    try {
      setLoading(true)
      setFeedback(null)

      // Create a map of product names to product IDs (normalized for matching)
      const productNameMap = new Map<string, string>()
      for (const product of products) {
        const normalizedName = normalizeName(product.name)
        // Store both normalized and original name mappings
        productNameMap.set(normalizedName, product.id)
        productNameMap.set(product.name.toLowerCase().trim(), product.id)
      }

      // Convert alias entries to allies format
      const alliesToSave: Array<{ salesName: string; productId: string }> = []
      const notFound: string[] = []

      for (const [salesName, targetProductName] of ALIAS_ENTRIES) {
        // Try to find product by exact name match first
        let productId: string | undefined = productNameMap.get(targetProductName.toLowerCase().trim())

        // If not found, try normalized match
        if (!productId) {
          const normalizedTarget = normalizeName(targetProductName)
          productId = productNameMap.get(normalizedTarget)
        }

        // If still not found, try partial match
        if (!productId) {
          const foundProduct = products.find((p) => {
            const pName = p.name.toLowerCase().trim()
            const target = targetProductName.toLowerCase().trim()
            return pName === target || pName.includes(target) || target.includes(pName)
          })
          if (foundProduct) {
            productId = foundProduct.id
          }
        }

        if (productId) {
          // Store normalized sales name for consistent matching
          alliesToSave.push({
            salesName: normalizeName(salesName),
            productId,
          })
        } else {
          notFound.push(`${salesName} → ${targetProductName}`)
        }
      }

      // Save all allies
      if (alliesToSave.length > 0) {
        if (user?.userId) {
          await saveProductAllies(workspace, alliesToSave, user.userId)
        }
        await listProductAllies(workspace).then((alliesList) => {
          setAllies(Array.isArray(alliesList) ? alliesList : [])
        })

        const successMsg =
          notFound.length > 0
            ? `Imported ${alliesToSave.length} allies. ${notFound.length} products not found.`
            : `Successfully imported ${alliesToSave.length} allies.`
        setFeedback(successMsg)

        if (notFound.length > 0) {
          console.warn('Products not found:', notFound)
        }
      } else {
        setFeedback('No allies could be imported. Please check if products exist.')
      }

      setTimeout(() => setFeedback(null), 5000)
    } catch (error) {
      console.error('Failed to import aliases:', error)
      setFeedback('Failed to import aliases. Please try again.')
      setTimeout(() => setFeedback(null), 3000)
    } finally {
      setLoading(false)
    }
  }

  function handleEdit(ally: ProductAlly) {
    setEditingAlly(ally)
    setEditSalesName(ally.salesName)
    setEditProductId(ally.productId)
  }

  function handleCloseEdit() {
    setEditingAlly(null)
    setEditSalesName('')
    setEditProductId('')
  }

  async function handleSaveEdit() {
    if (!editingAlly || !user?.userId) return

    if (!editSalesName.trim()) {
      setFeedback('Sales name is required.')
      setTimeout(() => setFeedback(null), 3000)
      return
    }

    if (!editProductId) {
      setFeedback('Product selection is required.')
      setTimeout(() => setFeedback(null), 3000)
      return
    }

    setSaving(true)
    setFeedback(null)

    try {
      const normalizedSalesName = normalizeName(editSalesName.trim())

      // If sales name changed, we need to delete the old one and create a new one
      // (since salesName is used as the key)
      if (normalizedSalesName !== editingAlly.salesName) {
        // Delete old ally
        await deleteProductAlly(workspace, editingAlly.salesName)
        // Create new ally with new sales name
        await saveProductAlly(workspace, normalizedSalesName, editProductId, user.userId)
      } else {
        // Just update the product ID
        await saveProductAlly(workspace, normalizedSalesName, editProductId, user.userId)
      }

      // Reload allies list
      const updatedAllies = await listProductAllies(workspace)
      setAllies(Array.isArray(updatedAllies) ? updatedAllies : [])

      setFeedback('Ally updated successfully.')
      setTimeout(() => setFeedback(null), 3000)
      handleCloseEdit()
    } catch (error) {
      console.error('Failed to update ally:', error)
      setFeedback('Failed to update ally. Please try again.')
      setTimeout(() => setFeedback(null), 3000)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(salesName: string) {
    if (!confirm(`Are you sure you want to delete the ally for "${salesName}"?`)) {
      return
    }

    try {
      await deleteProductAlly(workspace, salesName)
      setAllies((prev) => prev.filter((a) => a.salesName !== salesName))
      setFeedback('Ally deleted successfully.')
      setTimeout(() => setFeedback(null), 3000)
    } catch (error) {
      console.error('Failed to delete ally:', error)
      setFeedback('Failed to delete ally. Please try again.')
      setTimeout(() => setFeedback(null), 3000)
    }
  }

  const safeProducts = Array.isArray(products) ? products : []
  const productMap = new Map(safeProducts.map((p) => [p.id, p.name]))

  const alliesColumns = [
    {
      header: 'Sales Name (POS Name)',
      accessor: (ally: ProductAlly) => (
        <span className="font-medium text-slate-900">{ally.salesName}</span>
      ),
    },
    {
      header: 'Product Name',
      accessor: (ally: ProductAlly) => (
        <span className="text-slate-700">{productMap.get(ally.productId) || ally.productId}</span>
      ),
    },
    {
      header: 'Actions',
      accessor: (ally: ProductAlly) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleEdit(ally)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
            title="Edit"
          >
            <Edit2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => handleDelete(ally.salesName)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
      align: 'right' as const,
    },
  ]

  if (loading) {
    return (
      <section className="space-y-6">
        <div className="app-card">
          <p className="text-sm text-gray-600">Loading product allies...</p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="page-title">Product Allies</h1>
          <p className="text-sm text-slate-500">
            Manage product matching rules. Allies are checked first during product matching and take
            priority over all other matching methods.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleImportAliases}
            disabled={loading || products.length === 0}
            className="btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Import Aliases
          </button>
          <button
            type="button"
            onClick={() => setBulkUploadOpen(true)}
            className="btn-secondary"
          >
            <Upload className="h-4 w-4" />
            Bulk Upload
          </button>
        </div>
      </header>

      {feedback && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
          {feedback}
        </div>
      )}

      <div className="app-card">
        {allies.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-slate-500">No product allies defined yet.</p>
            <p className="mt-2 text-sm text-slate-400">
              Use Bulk Upload to add product allies from an Excel file.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-600">
                {allies.length} product ally{allies.length !== 1 ? 'ies' : ''} defined
              </p>
            </div>
            <DataTable columns={alliesColumns} data={allies} emptyLabel="No allies found" />
          </div>
        )}
      </div>

      <Modal
        open={editingAlly !== null}
        onClose={handleCloseEdit}
        title="Edit Product Ally"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1">
              Sales Name (POS Name)
            </label>
            <input
              type="text"
              value={editSalesName}
              onChange={(e) => setEditSalesName(e.target.value)}
              placeholder="Enter sales name from POS report"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <p className="mt-1 text-xs text-slate-500">
              This name will be normalized for matching (lowercase, trimmed, etc.)
            </p>
          </div>

          <div>
            <SearchableSelect
              label="Product"
              value={editProductId}
              onChange={(selectedValue) => setEditProductId(selectedValue)}
              options={safeProducts.map((p) => ({
                label: p.name,
                value: p.id,
              }))}
              placeholder="Select product..."
              searchPlaceholder="Search products..."
              helperText="Select the product to match this sales name to"
            />
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={saving || !editSalesName.trim() || !editProductId}
              className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
            <button
              type="button"
              onClick={handleCloseEdit}
              disabled={saving}
              className="btn-secondary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>

      <ProductAlliesBulkUploadModal
        isOpen={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        workspace={workspace}
        products={safeProducts}
        currentAllies={allies}
        userId={user?.userId || ''}
        onSuccess={handleBulkUploadSuccess}
      />
    </section>
  )
}

type ProductAlliesBulkUploadModalProps = {
  isOpen: boolean
  onClose: () => void
  workspace: { tenantId: string; workspaceId: string }
  products: Product[]
  currentAllies: ProductAlly[]
  userId: string
  onSuccess: () => void
}

function ProductAlliesBulkUploadModal({
  isOpen,
  onClose,
  workspace,
  products,
  userId,
  onSuccess,
}: ProductAlliesBulkUploadModalProps) {
  // CRITICAL: Ensure products is always an array, never a number
  const safeProducts = Array.isArray(products) ? products : []

  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState<Array<{ salesName: string; productId: string; productName: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [parseErrors, setParseErrors] = useState<
    Array<{ row: number; salesName: string; error: string }>
  >([])

  async function handleDownloadTemplate() {
    try {
      const productsForTemplate = safeProducts.map((p) => ({ id: p.id, name: p.name }))
      await downloadProductAlliesTemplate(productsForTemplate)
    } catch (err) {
      console.error('Failed to download template:', err)
      alert('Failed to download template. Please try again.')
    }
  }

  async function handleFileSelected(selectedFile: File) {
    setFile(selectedFile)
    setPreview([])
    setError(null)
    setParseErrors([])

    try {
      const productsForTemplate = safeProducts.map((p) => ({ id: p.id, name: p.name }))
      const result = await parseProductAlliesExcel(selectedFile, productsForTemplate)

      // Defensive check: ensure result has the expected structure
      if (!result || typeof result !== 'object') {
        setError('Invalid file format. Please check the file and try again.')
        setFile(null)
        setPreview([])
        setParseErrors([])
        return
      }

      // Ensure errors is an array
      if (Array.isArray(result.errors) && result.errors.length > 0) {
        setParseErrors(result.errors)
      } else {
        setParseErrors([])
      }

      // Defensive check: ensure allies is an array before using
      const safeAllies = Array.isArray(result.allies) ? result.allies : []

      if (safeAllies.length === 0) {
        setError('No product allies found in the file. Please check the format.')
        setFile(null)
        setPreview([])
        return
      }

      // Add product names for preview
      const productMap = new Map(safeProducts.map((p) => [p.id, p.name]))
      const previewWithNames = safeAllies
        .filter((ally): ally is ParsedAlly => {
          return ally && typeof ally === 'object' && ally !== null && 'salesName' in ally && 'productId' in ally
        })
        .map((ally) => {
          return {
            salesName: ally.salesName || '',
            productId: ally.productId || '',
            productName: productMap.get(ally.productId) || ally.productId || '',
          }
        })

      setPreview(previewWithNames.length > 0 ? previewWithNames : [])
    } catch (err) {
      console.error('Failed to parse file:', err)
      setError(`Failed to parse file: ${err instanceof Error ? err.message : 'Unknown error'}`)
      setFile(null)
      setPreview([])
    }
  }

  async function handleUpload() {
    if (!file || !preview) return

    // Ensure preview is an array before proceeding
    const safePreview = Array.isArray(preview) ? preview : []
    if (safePreview.length === 0) return

    setUploading(true)
    setError(null)

    try {
      // Store original sales names (matching will normalize during lookup)
      const alliesToSave = safePreview
        .filter((ally) => ally && typeof ally === 'object' && ally !== null)
        .map((ally) => ({
          salesName: ally.salesName || '', // Store original name as provided
          productId: ally.productId || '',
        }))

      await saveProductAllies(workspace, alliesToSave, userId)
      onSuccess()
      handleClose()
    } catch (err) {
      console.error('Upload failed:', err)
      setError(`Upload failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setUploading(false)
    }
  }

  function handleClose() {
    if (!uploading) {
      setFile(null)
      setPreview([])
      setError(null)
      setParseErrors([])
      onClose()
    }
  }

  const safePreviewForUpload = Array.isArray(preview) ? preview : []
  const canUpload = file && safePreviewForUpload.length > 0 && !uploading

  const previewColumns: Array<{
    header: string
    accessor: (row: { salesName: string; productName: string }) => ReactNode
  }> = [
      {
        header: 'Sales Name',
        accessor: (row: { salesName: string }) => (
          <span className="font-medium text-gray-900">{row.salesName}</span>
        ),
      },
      {
        header: 'Product Name',
        accessor: (row: { productName: string }) => (
          <span className="text-gray-700">{row.productName}</span>
        ),
      },
    ]

  return (
    <Modal open={isOpen} onClose={handleClose} title="Bulk Upload Product Allies">
      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-600">
            Upload an Excel file with product allies. The file should have Sales Name (POS Name) and
            Product Name/ID columns.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Download Template
          </button>
        </div>

        <FileUpload
          accept=".xlsx,.xls"
          onFileSelected={handleFileSelected}
          label="Select Excel file"
        />

        {error && (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {Array.isArray(parseErrors) && parseErrors.length > 0 && (
          <div className="rounded-xl bg-yellow-50 border border-yellow-200 px-4 py-3">
            <p className="text-sm font-semibold text-yellow-800 mb-2">
              {parseErrors.length} error(s) found in file:
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1">
              {parseErrors.slice(0, 10).map((err, idx) => (
                <p key={idx} className="text-xs text-yellow-700">
                  Row {err.row}: {err.salesName} - {err.error}
                </p>
              ))}
              {parseErrors.length > 10 && (
                <p className="text-xs text-yellow-700">
                  ... and {parseErrors.length - 10} more errors
                </p>
              )}
            </div>
          </div>
        )}

        {(() => {
          const safePreview = Array.isArray(preview) ? preview : []
          const safePreviewColumns = Array.isArray(previewColumns) ? previewColumns : []

          if (safePreview.length === 0 || safePreviewColumns.length === 0) {
            return null
          }

          return (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-gray-900">
                  Preview ({safePreview.length} allies)
                </p>
              </div>
              <div className="max-h-60 overflow-y-auto rounded-xl border border-gray-200">
                <DataTable
                  columns={safePreviewColumns}
                  data={safePreview.slice(0, 20)}
                />
                {safePreview.length > 20 && (
                  <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
                    ... and {safePreview.length - 20} more rows
                  </div>
                )}
              </div>
            </div>
          )
        })()}

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={handleClose}
            disabled={uploading}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!canUpload}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : `Upload ${Array.isArray(preview) ? preview.length : 0} allies`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

