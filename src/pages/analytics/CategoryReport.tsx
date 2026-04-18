import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, DollarSign, Package, LayoutGrid, BarChart3 } from 'lucide-react'
import { useWorkspace } from '../../context/WorkspaceContext'
import { formatCurrency } from '../../lib/utils/formatting'
import type { SalesLine, MenuGroup } from '../../lib/types'

type ProductRow = {
    id: string
    name: string
    revenue: number
    quantity: number
    avgPrice: number
    revenueShare: number
}

type SubcategoryRow = {
    id: string
    name: string
    revenue: number
    quantity: number
    avgPrice: number
    revenueShare: number
    products: ProductRow[]
}

type CategoryRow = {
    id: string
    name: string
    color: string
    revenue: number
    quantity: number
    avgPrice: number
    revenueShare: number
    quantityShare: number
    subcategories: SubcategoryRow[]
}

export function CategoryReport({ dateRange }: { dateRange: { start: Date; end: Date } }) {
    const workspace = useWorkspace()
    const [loading, setLoading] = useState(true)
    const [categories, setCategories] = useState<CategoryRow[]>([])
    const [expandedCategory, setExpandedCategory] = useState<string | null>(null)
    const [expandedSubcategory, setExpandedSubcategory] = useState<string | null>(null)

    useEffect(() => {
        async function loadData() {
            setLoading(true)
            try {
                const { fetchSalesLines } = await import('../../lib/api/analytics')
                const { getMenuGroups } = await import('../../lib/api/menuGroups')

                const [lines, menuGroups]: [SalesLine[], MenuGroup[]] = await Promise.all([
                    fetchSalesLines(workspace, { dateRange }),
                    getMenuGroups(workspace),
                ])

                const menuGroupMap = new Map<string, MenuGroup>()
                menuGroups.forEach((mg) => menuGroupMap.set(mg.label, mg))

                // Build nested aggregation: category -> subcategory -> product
                const catMap = new Map<
                    string,
                    {
                        revenue: number
                        quantity: number
                        color: string
                        subcategories: Map<
                            string,
                            {
                                revenue: number
                                quantity: number
                                products: Map<string, { name: string; revenue: number; quantity: number }>
                            }
                        >
                    }
                >()

                lines.forEach((line) => {
                    const catKey = line.menuGroupAtSale || 'Uncategorized'
                    const subKey = line.menuSubGroupAtSale || 'Other'

                    if (!catMap.has(catKey)) {
                        const mg = menuGroupMap.get(catKey)
                        catMap.set(catKey, {
                            revenue: 0,
                            quantity: 0,
                            color: mg?.color || '#6b7280',
                            subcategories: new Map(),
                        })
                    }
                    const cat = catMap.get(catKey)!
                    cat.revenue += line.amount
                    cat.quantity += line.quantity

                    if (!cat.subcategories.has(subKey)) {
                        cat.subcategories.set(subKey, {
                            revenue: 0,
                            quantity: 0,
                            products: new Map(),
                        })
                    }
                    const sub = cat.subcategories.get(subKey)!
                    sub.revenue += line.amount
                    sub.quantity += line.quantity

                    if (!sub.products.has(line.productId)) {
                        sub.products.set(line.productId, {
                            name: line.productNameAtSale,
                            revenue: 0,
                            quantity: 0,
                        })
                    }
                    const prod = sub.products.get(line.productId)!
                    prod.revenue += line.amount
                    prod.quantity += line.quantity
                })

                const totalRevenue = Array.from(catMap.values()).reduce((s, c) => s + c.revenue, 0)
                const totalQuantity = Array.from(catMap.values()).reduce((s, c) => s + c.quantity, 0)

                const builtCategories: CategoryRow[] = Array.from(catMap.entries())
                    .map(([name, data]) => {
                        const subcategories: SubcategoryRow[] = Array.from(data.subcategories.entries())
                            .map(([subName, subData]) => {
                                const products: ProductRow[] = Array.from(subData.products.entries())
                                    .map(([prodId, prodData]) => ({
                                        id: prodId,
                                        name: prodData.name,
                                        revenue: prodData.revenue,
                                        quantity: prodData.quantity,
                                        avgPrice: prodData.quantity > 0 ? prodData.revenue / prodData.quantity : 0,
                                        revenueShare:
                                            subData.revenue > 0
                                                ? (prodData.revenue / subData.revenue) * 100
                                                : 0,
                                    }))
                                    .sort((a, b) => b.revenue - a.revenue)
                                    .slice(0, 20)

                                return {
                                    id: subName,
                                    name: subName,
                                    revenue: subData.revenue,
                                    quantity: subData.quantity,
                                    avgPrice:
                                        subData.quantity > 0 ? subData.revenue / subData.quantity : 0,
                                    revenueShare:
                                        data.revenue > 0
                                            ? (subData.revenue / data.revenue) * 100
                                            : 0,
                                    products,
                                }
                            })
                            .sort((a, b) => b.revenue - a.revenue)

                        const mg = menuGroupMap.get(name)
                        return {
                            id: mg?.id || name,
                            name,
                            color: data.color,
                            revenue: data.revenue,
                            quantity: data.quantity,
                            avgPrice: data.quantity > 0 ? data.revenue / data.quantity : 0,
                            revenueShare:
                                totalRevenue > 0 ? (data.revenue / totalRevenue) * 100 : 0,
                            quantityShare:
                                totalQuantity > 0 ? (data.quantity / totalQuantity) * 100 : 0,
                            subcategories,
                        }
                    })
                    .sort((a, b) => b.revenue - a.revenue)

                setCategories(builtCategories)
            } catch (error) {
                console.error('Error loading category report:', error)
            } finally {
                setLoading(false)
            }
        }
        loadData()
    }, [workspace, dateRange])

    const summary = useMemo(() => {
        const totalRevenue = categories.reduce((s, c) => s + c.revenue, 0)
        const totalQuantity = categories.reduce((s, c) => s + c.quantity, 0)
        const activeCategories = categories.length
        const avgPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0
        return { totalRevenue, totalQuantity, activeCategories, avgPrice }
    }, [categories])

    function handleCategoryClick(catId: string) {
        if (expandedCategory === catId) {
            setExpandedCategory(null)
            setExpandedSubcategory(null)
        } else {
            setExpandedCategory(catId)
            setExpandedSubcategory(null)
        }
    }

    function handleSubcategoryClick(subId: string) {
        if (expandedSubcategory === subId) {
            setExpandedSubcategory(null)
        } else {
            setExpandedSubcategory(subId)
        }
    }

    if (loading) {
        return (
            <div className="app-card p-8 text-center text-slate-500">
                Loading category report...
            </div>
        )
    }

    const kpis = [
        {
            label: 'Total Revenue',
            value: formatCurrency(workspace.currency, summary.totalRevenue),
            icon: DollarSign,
        },
        {
            label: 'Total Items Sold',
            value: summary.totalQuantity.toLocaleString(),
            icon: Package,
        },
        {
            label: 'Active Categories',
            value: summary.activeCategories.toLocaleString(),
            icon: LayoutGrid,
        },
        {
            label: 'Avg Price / Item',
            value: formatCurrency(workspace.currency, summary.avgPrice),
            icon: BarChart3,
        },
    ]

    const maxRevenueShare = Math.max(...categories.map((c) => c.revenueShare), 1)

    return (
        <div className="space-y-6">
            {/* Summary KPI Cards */}
            <div className="grid md:grid-cols-4 gap-4">
                {kpis.map((kpi) => (
                    <div key={kpi.label} className="app-card p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-100">
                                <kpi.icon className="h-4 w-4 text-gray-500" />
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">{kpi.label}</p>
                                <p className="text-lg font-semibold text-gray-900">
                                    {kpi.value}
                                </p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Category Table */}
            <div className="app-card p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">
                    Category &amp; Subcategory Breakdown
                </h3>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                                <th className="pb-2 pr-4 font-medium">Category</th>
                                <th className="pb-2 pr-4 font-medium text-right">Revenue</th>
                                <th className="pb-2 pr-4 font-medium text-right">Qty</th>
                                <th className="pb-2 pr-4 font-medium text-right">Avg Price</th>
                                <th className="pb-2 pr-4 font-medium text-right">Rev. Share</th>
                                <th className="pb-2 font-medium text-right">Qty Share</th>
                            </tr>
                        </thead>
                        <tbody>
                            {categories.map((cat) => {
                                const isCatExpanded = expandedCategory === cat.id
                                return (
                                    <CategoryTableRows
                                        key={cat.id}
                                        category={cat}
                                        isCatExpanded={isCatExpanded}
                                        expandedSubcategory={expandedSubcategory}
                                        maxRevenueShare={maxRevenueShare}
                                        currency={workspace.currency}
                                        onCategoryClick={() => handleCategoryClick(cat.id)}
                                        onSubcategoryClick={handleSubcategoryClick}
                                    />
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Category Distribution Bar Chart */}
            <div className="app-card p-6">
                <h3 className="text-sm font-medium text-gray-900 mb-4">
                    Category Distribution
                </h3>
                <div className="space-y-3">
                    {categories.map((cat) => (
                        <div key={cat.id} className="flex items-center gap-3">
                            <span className="w-28 text-sm text-gray-700 truncate flex-shrink-0">
                                {cat.name}
                            </span>
                            <div className="flex-1 bg-gray-100 rounded h-6 overflow-hidden">
                                <div
                                    className="h-6 rounded transition-all duration-300"
                                    style={{
                                        width: `${cat.revenueShare}%`,
                                        backgroundColor: cat.color,
                                    }}
                                />
                            </div>
                            <span className="w-36 text-sm text-gray-600 text-right flex-shrink-0">
                                {formatCurrency(workspace.currency, cat.revenue)} ({cat.revenueShare.toFixed(1)}%)
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

function CategoryTableRows({
    category,
    isCatExpanded,
    expandedSubcategory,
    maxRevenueShare,
    currency,
    onCategoryClick,
    onSubcategoryClick,
}: {
    category: CategoryRow
    isCatExpanded: boolean
    expandedSubcategory: string | null
    maxRevenueShare: number
    currency: string
    onCategoryClick: () => void
    onSubcategoryClick: (subId: string) => void
}) {
    const barWidth = maxRevenueShare > 0 ? (category.revenueShare / maxRevenueShare) * 100 : 0

    return (
        <>
            {/* Category Row */}
            <tr
                className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={onCategoryClick}
            >
                <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                        <ChevronDown
                            className={`h-3.5 w-3.5 text-gray-400 transition-transform ${
                                isCatExpanded ? '' : '-rotate-90'
                            }`}
                        />
                        <span
                            className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: category.color }}
                        />
                        <span className="font-medium text-gray-900">{category.name}</span>
                    </div>
                </td>
                <td className="py-2.5 pr-4 text-right text-gray-900">
                    {formatCurrency(currency, category.revenue)}
                </td>
                <td className="py-2.5 pr-4 text-right text-gray-900">
                    {category.quantity.toLocaleString()}
                </td>
                <td className="py-2.5 pr-4 text-right text-gray-900">
                    {formatCurrency(currency, category.avgPrice)}
                </td>
                <td className="py-2.5 pr-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                        <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                                className="h-1.5 rounded-full"
                                style={{
                                    width: `${barWidth}%`,
                                    backgroundColor: category.color,
                                }}
                            />
                        </div>
                        <span className="text-gray-900 w-12 text-right">
                            {category.revenueShare.toFixed(1)}%
                        </span>
                    </div>
                </td>
                <td className="py-2.5 text-right text-gray-900">
                    {category.quantityShare.toFixed(1)}%
                </td>
            </tr>

            {/* Subcategory Rows */}
            {isCatExpanded &&
                category.subcategories.map((sub) => {
                    const isSubExpanded = expandedSubcategory === sub.id
                    return (
                        <SubcategoryTableRows
                            key={sub.id}
                            subcategory={sub}
                            isSubExpanded={isSubExpanded}
                            currency={currency}
                            onSubcategoryClick={() => onSubcategoryClick(sub.id)}
                        />
                    )
                })}
        </>
    )
}

function SubcategoryTableRows({
    subcategory,
    isSubExpanded,
    currency,
    onSubcategoryClick,
}: {
    subcategory: SubcategoryRow
    isSubExpanded: boolean
    currency: string
    onSubcategoryClick: () => void
}) {
    return (
        <>
            {/* Subcategory Row */}
            <tr
                className="border-b border-gray-50 bg-gray-50/30 hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={onSubcategoryClick}
            >
                <td className="py-2 pr-4 pl-10">
                    <div className="flex items-center gap-2">
                        <ChevronDown
                            className={`h-3 w-3 text-gray-400 transition-transform ${
                                isSubExpanded ? '' : '-rotate-90'
                            }`}
                        />
                        <span className="text-gray-600">{subcategory.name}</span>
                    </div>
                </td>
                <td className="py-2 pr-4 text-right text-gray-600">
                    {formatCurrency(currency, subcategory.revenue)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-600">
                    {subcategory.quantity.toLocaleString()}
                </td>
                <td className="py-2 pr-4 text-right text-gray-600">
                    {formatCurrency(currency, subcategory.avgPrice)}
                </td>
                <td className="py-2 pr-4 text-right text-gray-600">
                    {subcategory.revenueShare.toFixed(1)}%
                </td>
                <td className="py-2 text-right text-gray-600">&mdash;</td>
            </tr>

            {/* Product Rows */}
            {isSubExpanded &&
                subcategory.products.map((prod) => (
                    <tr
                        key={prod.id}
                        className="border-b border-gray-50 bg-gray-50/20"
                    >
                        <td className="py-1.5 pr-4 pl-16">
                            <span className="text-gray-500">{prod.name}</span>
                        </td>
                        <td className="py-1.5 pr-4 text-right text-gray-500">
                            {formatCurrency(currency, prod.revenue)}
                        </td>
                        <td className="py-1.5 pr-4 text-right text-gray-500">
                            {prod.quantity.toLocaleString()}
                        </td>
                        <td className="py-1.5 pr-4 text-right text-gray-500">
                            {formatCurrency(currency, prod.avgPrice)}
                        </td>
                        <td className="py-1.5 pr-4 text-right text-gray-500">
                            {prod.revenueShare.toFixed(1)}%
                        </td>
                        <td className="py-1.5 text-right text-gray-500">&mdash;</td>
                    </tr>
                ))}
        </>
    )
}
