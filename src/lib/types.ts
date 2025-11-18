export type TimestampLike = Date | string | number

export type MembershipRole = 'owner' | 'manager' | 'analyst' | 'viewer'

export type MenuGroup = {
  id: string
  label: string
  color: string
  subGroups: Array<{
    id: string
    label: string
  }>
}

export type Product = {
  id: string
  name: string
  menuGroupId: string
  menuSubGroupId?: string
  isExtra: boolean
  posCode?: string
  defaultUnitPrice?: number
  activeFrom?: TimestampLike
  activeTo?: TimestampLike
  createdAt: TimestampLike
  updatedAt: TimestampLike
  active?: boolean
}

export type SalesReportStatus = 'uploaded' | 'needs_mapping' | 'processed' | 'error'
export type SalesReportSource = 'excel_upload' | 'api'

export type ReportColumnMapping = {
  productName: string
  quantity: string
  amount: string
}

export type SalesReport = {
  id: string
  reportDate: TimestampLike
  periodKey: string
  source: SalesReportSource
  status: SalesReportStatus
  originalFilePath: string
  totalAmount?: number
  totalQuantity?: number
  createdByUserId: string
  createdAt: TimestampLike
  errorMessage?: string
  unmappedProducts?: string[]
  columnMapping?: ReportColumnMapping
  productMapping?: Record<string, string> // Maps unmapped product names to product IDs
}

export type ProductMapping = {
  id: string
  unmappedProductName: string // Original name from POS/report
  productId: string // Mapped product ID
  createdAt: TimestampLike
  updatedAt: TimestampLike
  createdByUserId: string
}

export type ProductAlly = {
  id: string
  salesName: string // Name from POS/report (normalized for matching)
  productId: string // Target product ID to match to
  createdAt: TimestampLike
  updatedAt: TimestampLike
  createdByUserId: string
}

export type SalesLine = {
  id: string
  reportId: string
  productId: string
  productNameRaw: string
  quantity: number
  amount: number
  unitPrice: number
  productNameAtSale: string
  menuGroupAtSale: string
  menuSubGroupAtSale?: string
  isExtraAtSale: boolean
  periodKey: string
  reportDate: TimestampLike
}

export type MetricDocBase = {
  id: string
  type: string
  periodKey: string
}

export type MonthlyProductSummary = MetricDocBase & {
  type: 'monthlyProductSummary'
  productId: string
  productNameSnapshot: string
  totalQty: number
  totalAmount: number
  avgUnitPrice: number
  menuGroupSnapshot: string
  menuSubGroupSnapshot?: string
}

export type MonthlyCategorySummary = MetricDocBase & {
  type: 'monthlyCategorySummary'
  menuGroupId: string
  menuGroupLabelSnapshot: string
  totalQty: number
  totalAmount: number
  shareOfTotal: number
}

export type MetricDoc = MonthlyProductSummary | MonthlyCategorySummary

export type WorkspaceScope = {
  tenantId: string
  workspaceId: string
}

export type OverviewFilters = {
  includeExtras: boolean
  menuGroupId?: string
}

export type OverviewMetrics = {
  totalAmount: number
  totalQuantity: number
  averageSellingPrice: number
  activeProducts: number
}

export type ProductPerformance = {
  productId: string
  productName: string
  menuGroup: string
  menuSubGroup?: string
  quantity: number
  amount: number
  avgPrice: number
  percentOfTotal: number
}

export type CategoryBreakdown = {
  menuGroupId: string
  label: string
  amount: number
  share: number
  color?: string
}

export type TrendPoint = {
  periodKey: string
  label: string
  productId?: string
  quantity: number
  amount: number
}

export type LifecycleItem = {
  productId: string
  productName: string
  firstSold: TimestampLike
  lastSold: TimestampLike
  lastWindowQty: number
  lifetimeAmount: number
  menuGroup: string
}


