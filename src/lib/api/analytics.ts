import {
  collection,
  getDocs,
  query,
  Timestamp,
  type QueryConstraint,
  where,
} from 'firebase/firestore'
import { format, eachMonthOfInterval } from 'date-fns'
import { db } from '../firebase'
import { USE_MOCK_DATA } from './dataSource'
import { getMenuGroups } from './menuGroups'
import { listProducts } from './products'
import { listSalesReports } from './salesReports'
import { mockProducts, mockSalesLines, buildOverviewFromMock, buildTrendSeries } from './mockData'
import type {
  CategoryBreakdown,
  LifecycleItem,
  ProductPerformance,
  SalesLine,
  TrendPoint,
  WorkspaceScope,
} from '../types'

export type CategoryTrendPoint = {
  periodKey: string
  menuGroup: string
  amount: number
  quantity: number
  label: string
}

// Helper to convert Firestore Timestamp to Date
function convertTimestampToDate(timestamp: unknown): Date {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate()
  }
  if (timestamp instanceof Date) {
    return timestamp
  }
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    return new Date(timestamp)
  }
  return new Date()
}

// Helper to get periodKeys from date range
function getPeriodKeysFromDateRange(start: Date, end: Date): string[] {
  const months = eachMonthOfInterval({ start, end })
  return months.map((month) => format(month, 'yyyy-MM'))
}

// Fetch salesLines from Firestore
export async function fetchSalesLines(
  scope: WorkspaceScope,
  options?: { 
    periodKey?: string
    periodKeys?: string[]
    dateRange?: { start: Date; end: Date }
    includeExtras?: boolean
    reportId?: string
  },
): Promise<SalesLine[]> {
  const salesLinesPath = `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/salesLines`
  console.log('[fetchSalesLines] Called with:', {
    path: salesLinesPath,
    options: options
      ? {
          periodKey: options.periodKey,
          periodKeys: options.periodKeys,
          dateRange: options.dateRange
            ? {
                start: options.dateRange.start.toISOString(),
                end: options.dateRange.end.toISOString(),
              }
            : undefined,
          includeExtras: options.includeExtras,
          reportId: options.reportId,
        }
      : 'no options',
  })

  const constraints: QueryConstraint[] = []
  
  // Handle periodKey filtering
  if (options?.periodKey) {
    console.log('[fetchSalesLines] Filtering by periodKey:', options.periodKey)
    constraints.push(where('periodKey', '==', options.periodKey))
  } else if (options?.periodKeys && options.periodKeys.length > 0) {
    // Firestore 'in' operator has a limit of 10 items, so we need to handle larger ranges
    if (options.periodKeys.length <= 10) {
      console.log('[fetchSalesLines] Filtering by periodKeys (in):', options.periodKeys)
      constraints.push(where('periodKey', 'in', options.periodKeys))
    } else {
      console.log('[fetchSalesLines] PeriodKeys array too large (>10), will filter in memory')
      // For larger ranges, we'll filter in memory after fetching
      // This is a limitation we need to work with
    }
  } else if (options?.dateRange) {
    const periodKeys = getPeriodKeysFromDateRange(options.dateRange.start, options.dateRange.end)
    console.log('[fetchSalesLines] Calculated periodKeys from dateRange:', periodKeys)
    if (periodKeys.length > 0) {
      if (periodKeys.length <= 10) {
        console.log('[fetchSalesLines] Using periodKeys filter (in):', periodKeys)
        constraints.push(where('periodKey', 'in', periodKeys))
      } else {
        console.log('[fetchSalesLines] PeriodKeys array too large (>10), will filter in memory')
        // If more than 10 months, we'll filter in memory
      }
    }
  } else {
    console.log('[fetchSalesLines] No periodKey filtering - fetching all sales lines')
  }
  
  if (options?.includeExtras === false) {
    console.log('[fetchSalesLines] Excluding extras')
    constraints.push(where('isExtraAtSale', '==', false))
  }

  if (options?.reportId) {
    console.log('[fetchSalesLines] Filtering by reportId:', options.reportId)
    constraints.push(where('reportId', '==', options.reportId))
  }

  console.log('[fetchSalesLines] Query constraints count:', constraints.length)

  const q = constraints.length > 0 
    ? query(collection(db, salesLinesPath), ...constraints)
    : collection(db, salesLinesPath)
    
  console.log('[fetchSalesLines] Executing Firestore query...')
  const snapshot = await getDocs(q)
  console.log('[fetchSalesLines] Firestore query returned', snapshot.docs.length, 'documents')
  
  // Debug: Check what periodKeys exist in Firestore (if no results)
  if (snapshot.docs.length === 0) {
    console.log('[fetchSalesLines] No documents found with filter. Checking all documents in collection...')
    const allSnapshot = await getDocs(collection(db, salesLinesPath))
    const allPeriodKeys = new Set<string>()
    allSnapshot.docs.forEach((doc) => {
      const data = doc.data()
      if (data.periodKey) {
        allPeriodKeys.add(data.periodKey)
      }
    })
    console.log('[fetchSalesLines] All periodKeys in Firestore:', Array.from(allPeriodKeys).sort())
    console.log('[fetchSalesLines] Total documents in collection:', allSnapshot.docs.length)
    
    if (allSnapshot.docs.length > 0) {
      console.log('[fetchSalesLines] Sample document:', {
        id: allSnapshot.docs[0].id,
        data: allSnapshot.docs[0].data(),
      })
    }
  }
  
  let lines = snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<SalesLine, 'id'>
    return {
      id: docSnap.id,
      ...data,
      reportDate: convertTimestampToDate(data.reportDate),
    }
  })

  console.log('[fetchSalesLines] Mapped sales lines:', {
    count: lines.length,
    samplePeriodKeys: [...new Set(lines.map((l) => l.periodKey))].slice(0, 5),
  })

  // Filter by date range in memory if periodKeys array was too large
  if (options?.dateRange && (!options.periodKeys || options.periodKeys.length > 10)) {
    const { start, end } = options.dateRange
    const beforeFilter = lines.length
    lines = lines.filter((line) => {
      const reportDate = convertTimestampToDate(line.reportDate)
      return reportDate >= start && reportDate <= end
    })
    console.log('[fetchSalesLines] Filtered by dateRange in memory:', {
      before: beforeFilter,
      after: lines.length,
      dateRange: { start: start.toISOString(), end: end.toISOString() },
    })
  }

  // Remove duplicate salesLines: exact duplicates based on reportId, productId, quantity, amount, and productNameRaw
  // This prevents double counting when the same sales line appears multiple times in Firestore
  const beforeDedup = lines.length
  const seenKeys = new Set<string>()
  const deduplicatedLines: SalesLine[] = []
  
  lines.forEach((line) => {
    // Create a unique key from all identifying fields
    // If all these match exactly, it's likely a duplicate
    const key = `${line.reportId}_${line.productId}_${line.quantity}_${line.amount}_${line.productNameRaw}`
    
    if (!seenKeys.has(key)) {
      seenKeys.add(key)
      deduplicatedLines.push(line)
    } else {
      console.log('[fetchSalesLines] Found duplicate salesLine:', {
        reportId: line.reportId,
        productId: line.productId,
        productName: line.productNameAtSale,
        quantity: line.quantity,
        amount: line.amount,
      })
    }
  })
  
  lines = deduplicatedLines
  
  if (beforeDedup !== lines.length) {
    console.log('[fetchSalesLines] Removed duplicates:', {
      before: beforeDedup,
      after: lines.length,
      removed: beforeDedup - lines.length,
    })
  }

  if (lines.length > 0) {
    const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0)
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0)
    console.log('[fetchSalesLines] Summary:', {
      totalAmount,
      totalQuantity,
      averageAmount: totalAmount / lines.length,
      averageQuantity: totalQuantity / lines.length,
    })
  } else {
    console.warn('[fetchSalesLines] No sales lines found!')
  }

  return lines
}

export async function fetchOverview(
  scope: WorkspaceScope,
  dateRange?: { start: Date; end: Date },
) {
  console.log('[fetchOverview] Called with:', {
    scope,
    dateRange: dateRange
      ? {
          start: dateRange.start.toISOString(),
          end: dateRange.end.toISOString(),
        }
      : 'no date range',
  })

  if (USE_MOCK_DATA) {
    console.log('[fetchOverview] Using mock data')
    return buildOverviewFromMock()
  }

  // Fetch data from Firestore
  console.log('[fetchOverview] Fetching data from Firestore...')
  const [salesLines, products, menuGroups, allReports] = await Promise.all([
    fetchSalesLines(scope, dateRange ? { dateRange } : undefined),
    listProducts(scope),
    getMenuGroups(scope),
    listSalesReports(scope),
  ])

  console.log('[fetchOverview] Fetched data:', {
    salesLinesCount: salesLines.length,
    productsCount: products.length,
    menuGroupsCount: menuGroups.length,
    reportsCount: allReports.length,
  })

  // Calculate totals from salesLines to ensure consistency with product/category breakdowns
  // This prevents double counting issues when reports and salesLines contain overlapping data
  const totalAmount = salesLines.reduce((sum, line) => sum + line.amount, 0)
  const totalQuantity = salesLines.reduce((sum, line) => sum + line.quantity, 0)
  
  console.log('[fetchOverview] Calculated from salesLines:', {
    salesLinesCount: salesLines.length,
    totalAmount,
    totalQuantity,
  })
  
  const averageSellingPrice = totalQuantity > 0 ? totalAmount / totalQuantity : 0

  console.log('[fetchOverview] Final calculated metrics:', {
    totalAmount,
    totalQuantity,
    averageSellingPrice,
    source: 'salesLines',
  })
  
  if (salesLines.length > 0) {
    console.log('[fetchOverview] Sample sales lines (first 3):', salesLines.slice(0, 3).map((line) => ({
      id: line.id,
      productId: line.productId,
      productName: line.productNameAtSale,
      periodKey: line.periodKey,
      reportDate: line.reportDate instanceof Date ? line.reportDate.toISOString() : line.reportDate,
      quantity: line.quantity,
      amount: line.amount,
    })))
  }

  // Get unique active products
  const activeProductIds = new Set(salesLines.map((line) => line.productId))
  const activeProducts = products.filter((p) => activeProductIds.has(p.id))

  // Aggregate by product
  const productTotals = new Map<string, ProductPerformance>()
  salesLines.forEach((line) => {
    const existing = productTotals.get(line.productId) ?? {
      productId: line.productId,
      productName: line.productNameAtSale,
      menuGroup: line.menuGroupAtSale,
      menuSubGroup: line.menuSubGroupAtSale,
      quantity: 0,
      amount: 0,
      avgPrice: 0,
      percentOfTotal: 0,
    }
    existing.quantity += line.quantity
    existing.amount += line.amount
    productTotals.set(line.productId, existing)
  })

  // Calculate averages and percentages
  const productPerformances = Array.from(productTotals.values()).map((item) => ({
    ...item,
    avgPrice: item.quantity > 0 ? item.amount / item.quantity : 0,
    percentOfTotal: totalAmount > 0 ? item.amount / totalAmount : 0,
  }))

  // Top products
  const topProductsByQty = [...productPerformances]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)

  const topProductsByAmount = [...productPerformances]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)

  // Category breakdown
  const categoryTotals = new Map<string, CategoryBreakdown>()
  salesLines.forEach((line) => {
    const group = menuGroups.find((g) => g.id === line.menuGroupAtSale)
    if (!group) return

    const existing = categoryTotals.get(group.id) ?? {
      menuGroupId: group.id,
      label: group.label,
      amount: 0,
      share: 0,
      color: group.color,
    }
    existing.amount += line.amount
    categoryTotals.set(group.id, existing)
  })

  const categories = Array.from(categoryTotals.values()).map((item) => ({
    ...item,
    share: totalAmount > 0 ? item.amount / totalAmount : 0,
  }))

  const result = {
    metrics: {
      totalAmount,
      totalQuantity,
      averageSellingPrice,
      activeProducts: activeProducts.length,
    },
    topProductsByQty,
    topProductsByAmount,
    categories,
  }

  console.log('[fetchOverview] Final result:', {
    metrics: result.metrics,
    topProductsByQtyCount: result.topProductsByQty.length,
    topProductsByAmountCount: result.topProductsByAmount.length,
    categoriesCount: result.categories.length,
  })

  return result
}

export async function fetchProductTrends(
  scope: WorkspaceScope,
  productIds: string[],
  dateRange?: { start: Date; end: Date },
) {
  void scope
  if (USE_MOCK_DATA) {
    return buildTrendSeries(productIds)
  }
  
  // Fetch sales lines for the date range
  const salesLines = await fetchSalesLines(scope, dateRange ? { dateRange } : undefined)
  
  // Filter by product IDs and aggregate by period
  const trendMap = new Map<string, { quantity: number; amount: number }>()
  
  salesLines
    .filter((line) => productIds.includes(line.productId))
    .forEach((line) => {
      const key = line.periodKey
      const existing = trendMap.get(key) ?? { quantity: 0, amount: 0 }
      existing.quantity += line.quantity
      existing.amount += line.amount
      trendMap.set(key, existing)
    })
  
  return Array.from(trendMap.entries()).map(([periodKey, data]) => ({
    periodKey,
    label: formatPeriod(periodKey),
    quantity: data.quantity,
    amount: data.amount,
  })) as TrendPoint[]
}

export async function fetchCategoryTrends(
  scope: WorkspaceScope,
  dateRange?: { start: Date; end: Date },
): Promise<CategoryTrendPoint[]> {
  if (USE_MOCK_DATA) {
    const aggregates = mockSalesLines.reduce<Record<
      string,
      { periodKey: string; menuGroup: string; amount: number; quantity: number }
    >>((acc, line) => {
      const key = `${line.periodKey}_${line.menuGroupAtSale}`
      if (!acc[key]) {
        acc[key] = {
          periodKey: line.periodKey,
          menuGroup: line.menuGroupAtSale,
          amount: 0,
          quantity: 0,
        }
      }
      acc[key].amount += line.amount
      acc[key].quantity += line.quantity
      return acc
    }, {})

    return Object.values(aggregates).map((entry) => ({
      ...entry,
      label: formatPeriod(entry.periodKey),
    }))
  }
  
  // Fetch sales lines for the date range
  const salesLines = await fetchSalesLines(scope, dateRange ? { dateRange } : undefined)
  
  // Aggregate by period and menu group
  const aggregates = new Map<string, { periodKey: string; menuGroup: string; amount: number; quantity: number }>()
  
  salesLines.forEach((line) => {
    const key = `${line.periodKey}_${line.menuGroupAtSale}`
    const existing = aggregates.get(key) ?? {
      periodKey: line.periodKey,
      menuGroup: line.menuGroupAtSale,
      amount: 0,
      quantity: 0,
    }
    existing.amount += line.amount
    existing.quantity += line.quantity
    aggregates.set(key, existing)
  })
  
  return Array.from(aggregates.values()).map((entry) => ({
    ...entry,
    label: formatPeriod(entry.periodKey),
  }))
}

export type SubcategoryTrendPoint = {
  periodKey: string
  menuGroup: string
  menuSubGroup: string
  amount: number
  quantity: number
  label: string
}

export async function fetchSubcategoryTrends(
  scope: WorkspaceScope,
  categoryId?: string,
  subcategoryId?: string,
  dateRange?: { start: Date; end: Date },
): Promise<SubcategoryTrendPoint[]> {
  // Fetch sales lines for the date range
  const salesLines = await fetchSalesLines(scope, dateRange ? { dateRange } : undefined)
  
  // Filter by category and subcategory if provided
  let filteredLines = salesLines.filter((line) => line.menuSubGroupAtSale)
  
  if (categoryId) {
    filteredLines = filteredLines.filter((line) => line.menuGroupAtSale === categoryId)
  }
  
  if (subcategoryId) {
    filteredLines = filteredLines.filter((line) => line.menuSubGroupAtSale === subcategoryId)
  }
  
  // Aggregate by period, menu group, and subcategory
  const aggregates = new Map<string, { 
    periodKey: string
    menuGroup: string
    menuSubGroup: string
    amount: number
    quantity: number
  }>()
  
  filteredLines.forEach((line) => {
    if (!line.menuSubGroupAtSale) return
    const key = `${line.periodKey}_${line.menuGroupAtSale}_${line.menuSubGroupAtSale}`
    const existing = aggregates.get(key) ?? {
      periodKey: line.periodKey,
      menuGroup: line.menuGroupAtSale,
      menuSubGroup: line.menuSubGroupAtSale,
      amount: 0,
      quantity: 0,
    }
    existing.amount += line.amount
    existing.quantity += line.quantity
    aggregates.set(key, existing)
  })
  
  return Array.from(aggregates.values()).map((entry) => ({
    ...entry,
    label: formatPeriod(entry.periodKey),
  }))
}

function formatPeriod(periodKey: string) {
  const [year, month] = periodKey.split('-').map(Number)
  const date = new Date(year, (month ?? 1) - 1)
  return format(date, 'MMM yyyy')
}

export async function fetchExtrasAnalytics(
  scope: WorkspaceScope,
  dateRange?: { start: Date; end: Date },
) {
  if (USE_MOCK_DATA) {
    const extras = mockSalesLines.filter((line) => line.isExtraAtSale)
    const totalAmount = extras.reduce((sum, line) => sum + line.amount, 0)
    const totalQuantity = extras.reduce((sum, line) => sum + line.quantity, 0)
    const groups = extras.reduce<Record<string, ProductPerformance>>((acc, line) => {
      const key = line.productId
      if (!acc[key]) {
        acc[key] = {
          productId: line.productId,
          productName: line.productNameAtSale,
          menuGroup: line.menuGroupAtSale,
          quantity: 0,
          amount: 0,
          avgPrice: 0,
          percentOfTotal: 0,
        }
      }
      acc[key].quantity += line.quantity
      acc[key].amount += line.amount
      return acc
    }, {})
    const perProduct = Object.values(groups).map((item) => ({
      ...item,
      avgPrice: item.quantity ? item.amount / item.quantity : 0,
      percentOfTotal: totalAmount ? item.amount / totalAmount : 0,
    }))
    const shareOfSales =
      totalAmount / mockSalesLines.reduce((sum, line) => sum + line.amount, 0)
    return {
      totalQuantity,
      totalAmount,
      shareOfSales,
      perProduct,
    }
  }
  
  // Fetch all sales lines for the date range
  const allSalesLines = await fetchSalesLines(scope, dateRange ? { dateRange } : undefined)
  const extras = allSalesLines.filter((line) => line.isExtraAtSale)
  
  const totalAmount = extras.reduce((sum, line) => sum + line.amount, 0)
  const totalQuantity = extras.reduce((sum, line) => sum + line.quantity, 0)
  const totalSalesAmount = allSalesLines.reduce((sum, line) => sum + line.amount, 0)
  
  const groups = extras.reduce<Record<string, ProductPerformance>>((acc, line) => {
    const key = line.productId
    if (!acc[key]) {
      acc[key] = {
        productId: line.productId,
        productName: line.productNameAtSale,
        menuGroup: line.menuGroupAtSale,
        quantity: 0,
        amount: 0,
        avgPrice: 0,
        percentOfTotal: 0,
      }
    }
    acc[key].quantity += line.quantity
    acc[key].amount += line.amount
    return acc
  }, {})
  
  const perProduct = Object.values(groups).map((item) => ({
    ...item,
    avgPrice: item.quantity ? item.amount / item.quantity : 0,
    percentOfTotal: totalAmount ? item.amount / totalAmount : 0,
  }))
  
  const shareOfSales = totalSalesAmount > 0 ? totalAmount / totalSalesAmount : 0
  
  return {
    totalQuantity,
    totalAmount,
    shareOfSales,
    perProduct,
  }
}

export async function fetchLifecycleInsights(
  scope: WorkspaceScope,
  months = 3,
  dateRange?: { start: Date; end: Date },
) {
  if (USE_MOCK_DATA) {
    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const productLines = mockSalesLines.reduce<Record<string, { first: Date; last: Date; qty: number; amount: number; windowQty: number }>>((acc, line) => {
      if (!acc[line.productId]) {
        acc[line.productId] = {
          first: new Date(line.reportDate),
          last: new Date(line.reportDate),
          qty: 0,
          amount: 0,
          windowQty: 0,
        }
      }
      acc[line.productId].first = new Date(
        Math.min(acc[line.productId].first.getTime(), new Date(line.reportDate).getTime()),
      )
      acc[line.productId].last = new Date(
        Math.max(acc[line.productId].last.getTime(), new Date(line.reportDate).getTime()),
      )
      acc[line.productId].qty += line.quantity
      acc[line.productId].amount += line.amount
      if (new Date(line.reportDate) >= cutoff) {
        acc[line.productId].windowQty += line.quantity
      }
      return acc
    }, {})

    const newItems: LifecycleItem[] = []
    const deadItems: LifecycleItem[] = []

    Object.entries(productLines).forEach(([productId, timeline]) => {
      const product = mockProducts.find((p) => p.id === productId)
      if (!product) return
      const item: LifecycleItem = {
        productId,
        productName: product.name,
        firstSold: timeline.first,
        lastSold: timeline.last,
        lastWindowQty: timeline.windowQty,
        lifetimeAmount: timeline.amount,
        menuGroup: product.menuGroupId,
      }
      if (timeline.first >= cutoff) {
        newItems.push(item)
      } else if (timeline.last < cutoff) {
        deadItems.push(item)
      }
    })

    return { newItems, deadItems }
  }

  // Fetch all sales lines (lifecycle needs full history, not just date range)
  const salesLines = await fetchSalesLines(scope)
  const products = await listProducts(scope)
  
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - months)
  
  const productLines = salesLines.reduce<Record<string, { first: Date; last: Date; qty: number; amount: number; windowQty: number }>>((acc, line) => {
    if (!acc[line.productId]) {
      acc[line.productId] = {
        first: convertTimestampToDate(line.reportDate),
        last: convertTimestampToDate(line.reportDate),
        qty: 0,
        amount: 0,
        windowQty: 0,
      }
    }
    const reportDate = convertTimestampToDate(line.reportDate)
    acc[line.productId].first = new Date(
      Math.min(acc[line.productId].first.getTime(), reportDate.getTime()),
    )
    acc[line.productId].last = new Date(
      Math.max(acc[line.productId].last.getTime(), reportDate.getTime()),
    )
    acc[line.productId].qty += line.quantity
    acc[line.productId].amount += line.amount
    if (reportDate >= cutoff) {
      acc[line.productId].windowQty += line.quantity
    }
    return acc
  }, {})

  const newItems: LifecycleItem[] = []
  const deadItems: LifecycleItem[] = []

  Object.entries(productLines).forEach(([productId, timeline]) => {
    const product = products.find((p) => p.id === productId)
    if (!product) return
    const item: LifecycleItem = {
      productId,
      productName: product.name,
      firstSold: timeline.first,
      lastSold: timeline.last,
      lastWindowQty: timeline.windowQty,
      lifetimeAmount: timeline.amount,
      menuGroup: product.menuGroupId,
    }
    if (timeline.first >= cutoff) {
      newItems.push(item)
    } else if (timeline.last < cutoff) {
      deadItems.push(item)
    }
  })

  return { newItems, deadItems }
}

export function formatCurrency(amount: number, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}


