import { format, subMonths } from 'date-fns'
import type {
  CategoryBreakdown,
  MenuGroup,
  MetricDoc,
  MonthlyCategorySummary,
  MonthlyProductSummary,
  Product,
  ProductPerformance,
  SalesLine,
  SalesReport,
  TrendPoint,
} from '../types'

const now = new Date()

const makePeriodKey = (date: Date) => format(date, 'yyyy-MM')

export const mockMenuGroups: MenuGroup[] = [
  {
    id: 'breakfast',
    label: 'Breakfast',
    color: '#7C3AED',
    subGroups: [
      { id: 'plates', label: 'Plates' },
      { id: 'sides', label: 'Sides' },
    ],
  },
  {
    id: 'coffee',
    label: 'Coffee',
    color: '#0F8BFD',
    subGroups: [
      { id: 'hot', label: 'Hot coffee' },
      { id: 'iced', label: 'Iced coffee' },
    ],
  },
  {
    id: 'drinks',
    label: 'Drinks',
    color: '#16A34A',
    subGroups: [{ id: 'non_alcoholic', label: 'Non alcoholic' }],
  },
  {
    id: 'extras',
    label: 'Extras',
    color: '#F97316',
    subGroups: [{ id: 'addons', label: 'Add-ons' }],
  },
]

export const mockProducts: Product[] = [
  {
    id: 'prod_cappuccino',
    name: 'Cappuccino',
    menuGroupId: 'coffee',
    menuSubGroupId: 'hot',
    isExtra: false,
    defaultUnitPrice: 3.2,
    createdAt: subMonths(now, 18),
    updatedAt: subMonths(now, 1),
  },
  {
    id: 'prod_flat_white',
    name: 'Flat White',
    menuGroupId: 'coffee',
    menuSubGroupId: 'hot',
    isExtra: false,
    defaultUnitPrice: 3.4,
    createdAt: subMonths(now, 18),
    updatedAt: subMonths(now, 1),
  },
  {
    id: 'prod_english_breakfast',
    name: 'The English Breakfast',
    menuGroupId: 'breakfast',
    menuSubGroupId: 'plates',
    isExtra: false,
    defaultUnitPrice: 12.5,
    createdAt: subMonths(now, 12),
    updatedAt: subMonths(now, 1),
  },
  {
    id: 'prod_avocado_toast',
    name: 'Avocado Toast',
    menuGroupId: 'breakfast',
    menuSubGroupId: 'plates',
    isExtra: false,
    defaultUnitPrice: 9.5,
    createdAt: subMonths(now, 10),
    updatedAt: subMonths(now, 1),
  },
  {
    id: 'prod_oat_milk',
    name: '+ Oat Milk',
    menuGroupId: 'extras',
    menuSubGroupId: 'addons',
    isExtra: true,
    defaultUnitPrice: 0.8,
    createdAt: subMonths(now, 18),
    updatedAt: subMonths(now, 1),
  },
  {
    id: 'prod_extra_fries',
    name: '+ Fries',
    menuGroupId: 'extras',
    menuSubGroupId: 'addons',
    isExtra: true,
    defaultUnitPrice: 3.0,
    createdAt: subMonths(now, 8),
    updatedAt: subMonths(now, 1),
  },
]

export const mockSalesReports: SalesReport[] = Array.from({ length: 3 }).map((_, idx) => {
  const date = subMonths(now, idx)
  const periodKey = makePeriodKey(date)
  return {
    id: `report_${periodKey}`,
    reportDate: date,
    periodKey,
    source: 'excel_upload',
    status: 'processed',
    originalFilePath: `uploads/report_${periodKey}.xlsx`,
    totalAmount: 48000 - idx * 2200,
    totalQuantity: 6100 - idx * 150,
    createdByUserId: 'testUser',
    createdAt: date,
    columnMapping: {
      productName: 'Product Name',
      quantity: 'Quantity',
      amount: 'Amount',
    },
  }
})

type LineInput = {
  productId: string
  quantity: number
  amount: number
  reportDate: Date
}

const buildLine = ({ productId, quantity, amount, reportDate }: LineInput, index: number): SalesLine => {
  const product = mockProducts.find((p) => p.id === productId)!
  const periodKey = makePeriodKey(reportDate)
  return {
    id: `${productId}_${periodKey}_${index}`,
    reportId: `report_${periodKey}`,
    productId,
    productNameRaw: product.name,
    quantity,
    amount,
    unitPrice: amount / Math.max(quantity, 1),
    productNameAtSale: product.name,
    menuGroupAtSale: product.menuGroupId,
    menuSubGroupAtSale: product.menuSubGroupId,
    isExtraAtSale: product.isExtra,
    periodKey,
    reportDate,
  }
}

const baseLines: LineInput[] = [
  { productId: 'prod_cappuccino', quantity: 1200, amount: 3840, reportDate: subMonths(now, 0) },
  { productId: 'prod_flat_white', quantity: 950, amount: 3230, reportDate: subMonths(now, 0) },
  { productId: 'prod_english_breakfast', quantity: 420, amount: 5250, reportDate: subMonths(now, 0) },
  { productId: 'prod_avocado_toast', quantity: 380, amount: 3610, reportDate: subMonths(now, 0) },
  { productId: 'prod_oat_milk', quantity: 680, amount: 544, reportDate: subMonths(now, 0) },
  { productId: 'prod_extra_fries', quantity: 310, amount: 930, reportDate: subMonths(now, 0) },

  { productId: 'prod_cappuccino', quantity: 1100, amount: 3520, reportDate: subMonths(now, 1) },
  { productId: 'prod_flat_white', quantity: 870, amount: 2960, reportDate: subMonths(now, 1) },
  { productId: 'prod_english_breakfast', quantity: 390, amount: 4875, reportDate: subMonths(now, 1) },
  { productId: 'prod_avocado_toast', quantity: 340, amount: 3230, reportDate: subMonths(now, 1) },
  { productId: 'prod_oat_milk', quantity: 640, amount: 512, reportDate: subMonths(now, 1) },
  { productId: 'prod_extra_fries', quantity: 270, amount: 810, reportDate: subMonths(now, 1) },

  { productId: 'prod_cappuccino', quantity: 980, amount: 3136, reportDate: subMonths(now, 2) },
  { productId: 'prod_flat_white', quantity: 790, amount: 2690, reportDate: subMonths(now, 2) },
  { productId: 'prod_english_breakfast', quantity: 350, amount: 4375, reportDate: subMonths(now, 2) },
  { productId: 'prod_avocado_toast', quantity: 300, amount: 2850, reportDate: subMonths(now, 2) },
  { productId: 'prod_oat_milk', quantity: 580, amount: 464, reportDate: subMonths(now, 2) },
  { productId: 'prod_extra_fries', quantity: 240, amount: 720, reportDate: subMonths(now, 2) },
]

export const mockSalesLines: SalesLine[] = baseLines.map(buildLine)

const buildProductMetric = (line: SalesLine): MonthlyProductSummary => ({
  id: `monthlyProductSummary_${line.periodKey}_${line.productId}`,
  type: 'monthlyProductSummary',
  periodKey: line.periodKey,
  productId: line.productId,
  productNameSnapshot: line.productNameAtSale,
  totalQty: line.quantity,
  totalAmount: line.amount,
  avgUnitPrice: line.unitPrice,
  menuGroupSnapshot: line.menuGroupAtSale,
  menuSubGroupSnapshot: line.menuSubGroupAtSale,
})

const buildCategoryMetric = (groupId: string, periodKey: string, lines: SalesLine[]): MonthlyCategorySummary => {
  const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0)
  const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0)
  const menuGroup = mockMenuGroups.find((g) => g.id === groupId)!
  const totalAmountForPeriod = mockSalesLines
    .filter((line) => line.periodKey === periodKey)
    .reduce((sum, line) => sum + line.amount, 0)

  return {
    id: `monthlyCategorySummary_${periodKey}_${groupId}`,
    type: 'monthlyCategorySummary',
    periodKey,
    menuGroupId: groupId,
    menuGroupLabelSnapshot: menuGroup.label,
    totalQty,
    totalAmount,
    shareOfTotal: totalAmountForPeriod ? totalAmount / totalAmountForPeriod : 0,
  }
}

export const mockMetrics: MetricDoc[] = [
  ...mockSalesLines.map(buildProductMetric),
  ...mockMenuGroups.flatMap((group) => {
    const byGroupAndPeriod: Record<string, SalesLine[]> = {}
    mockSalesLines
      .filter((line) => line.menuGroupAtSale === group.id)
      .forEach((line) => {
        const key = `${group.id}_${line.periodKey}`
        if (!byGroupAndPeriod[key]) {
          byGroupAndPeriod[key] = []
        }
        byGroupAndPeriod[key].push(line)
      })
    return Object.entries(byGroupAndPeriod).map(([key, lines]) => {
      const [, periodKey] = key.split('_')
      return buildCategoryMetric(group.id, periodKey, lines)
    })
  }),
]

export type MockOverview = {
  metrics: {
    totalAmount: number
    totalQuantity: number
    averageSellingPrice: number
    activeProducts: number
  }
  topProductsByQty: ProductPerformance[]
  topProductsByAmount: ProductPerformance[]
  categories: CategoryBreakdown[]
}

export function buildOverviewFromMock(): MockOverview {
  const totalAmount = mockSalesLines.reduce((sum, line) => sum + line.amount, 0)
  const totalQuantity = mockSalesLines.reduce((sum, line) => sum + line.quantity, 0)
  const aggregatedProducts = aggregateProducts()
  const topProductsByQty = [...aggregatedProducts]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)
  const topProductsByAmount = [...aggregatedProducts]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10)
  const categories = aggregateCategories()

  return {
    metrics: {
      totalAmount,
      totalQuantity,
      averageSellingPrice: totalQuantity ? totalAmount / totalQuantity : 0,
      activeProducts: mockProducts.length,
    },
    topProductsByQty,
    topProductsByAmount,
    categories,
  }
}

function aggregateProducts(): ProductPerformance[] {
  const totals = new Map<string, ProductPerformance>()
  const totalAmount = mockSalesLines.reduce((sum, line) => sum + line.amount, 0)

  mockSalesLines.forEach((line) => {
    const existing = totals.get(line.productId) ?? {
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
    totals.set(line.productId, existing)
  })

  return Array.from(totals.values()).map((item) => ({
    ...item,
    avgPrice: item.quantity ? item.amount / item.quantity : 0,
    percentOfTotal: totalAmount ? item.amount / totalAmount : 0,
  }))
}

function aggregateCategories(): CategoryBreakdown[] {
  const totals = new Map<string, CategoryBreakdown>()
  const totalAmount = mockSalesLines.reduce((sum, line) => sum + line.amount, 0)

  mockSalesLines.forEach((line) => {
    const group = mockMenuGroups.find((g) => g.id === line.menuGroupAtSale)
    if (!group) return
    const existing = totals.get(group.id) ?? {
      menuGroupId: group.id,
      label: group.label,
      amount: 0,
      share: 0,
      color: group.color,
    }
    existing.amount += line.amount
    totals.set(group.id, existing)
  })

  return Array.from(totals.values()).map((item) => ({
    ...item,
    share: totalAmount ? item.amount / totalAmount : 0,
  }))
}

export function buildTrendSeries(productIds: string[]): TrendPoint[] {
  return mockSalesLines
    .filter((line) => productIds.includes(line.productId))
    .map((line) => ({
      periodKey: line.periodKey,
      productId: line.productId,
      label: `${line.productNameAtSale}`,
      quantity: line.quantity,
      amount: line.amount,
    }))
}


