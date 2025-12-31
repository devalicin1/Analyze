import { useState } from 'react'
import { PerformanceMatrix } from './PerformanceMatrix'
import { MoversShakers } from './MoversShakers'
import { ParetoAnalysis } from './ParetoAnalysis'
import { CategoryCorrelation } from './CategoryCorrelation'
import { MonthlyOverview } from './MonthlyOverview'
import { ProductCorrelation } from './ProductCorrelation'
import { CategoryMomentum } from './CategoryMomentum'
import { SalesForecast } from './SalesForecast'
import { CategoryMixTrends } from './CategoryMixTrends'
import { DateRangePopover } from '../../components/forms/DateRangePopover'
import { startOfMonth, subMonths, endOfMonth } from 'date-fns'

export function AnalyticsPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'matrix' | 'movers' | 'pareto' | 'correlation' | 'mix' | 'associations' | 'forecast' | 'momentum'>('momentum')
    const [dateRange, setDateRange] = useState<{ start: Date; end: Date; label: string }>({
        start: startOfMonth(subMonths(new Date(), 11)), // Last 12 months by default
        end: endOfMonth(new Date()),
        label: 'Last 12 Months',
    })

    const tabs = [
        { id: 'overview', label: 'Monthly Overview' },
        { id: 'mix', label: 'Category Mix' },
        { id: 'matrix', label: 'Performance Matrix' },
        { id: 'movers', label: 'Movers & Shakers' },
        { id: 'pareto', label: 'Pareto Analysis' },
        { id: 'associations', label: 'Product Associations' },
        { id: 'forecast', label: 'Sales Forecast' },
        { id: 'momentum', label: 'Category Momentum' },
        { id: 'correlation', label: 'Hist. Correlation' },
    ] as const

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
            <div className="mx-auto w-full">
                <div className="space-y-8 px-6 py-6">
                    {/* Header Section */}
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Advanced Analytics</h1>
                            <p className="mt-1 text-sm text-slate-500">Deep dive into your sales performance and trends.</p>
                        </div>
                        {activeTab !== 'movers' && (
                            <DateRangePopover
                                value={dateRange}
                                onChange={setDateRange}
                            />
                        )}
                    </div>

                    {/* Navigation Tabs */}
                    <div className="border-b border-slate-200">
                        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                            {tabs.map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`
                                        whitespace-nowrap border-b-2 py-4 text-sm font-medium transition-colors
                                        ${activeTab === tab.id
                                            ? 'border-indigo-600 text-indigo-600'
                                            : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                                        }
                                    `}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {activeTab === 'overview' && <MonthlyOverview dateRange={dateRange} />}
                    {activeTab === 'matrix' && <PerformanceMatrix dateRange={dateRange} />}
                    {activeTab === 'movers' && <MoversShakers />}
                    {activeTab === 'pareto' && <ParetoAnalysis dateRange={dateRange} />}
                    {activeTab === 'mix' && <CategoryMixTrends dateRange={dateRange} />}
                    {activeTab === 'associations' && <ProductCorrelation dateRange={dateRange} />}
                    {activeTab === 'forecast' && <SalesForecast />}
                    {activeTab === 'momentum' && <CategoryMomentum dateRange={dateRange} />}
                    {activeTab === 'correlation' && <CategoryCorrelation dateRange={dateRange} />}
                </div>
            </div>
        </div>
    )
}
