import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { format } from 'date-fns'
import type { WorkspaceScope } from '../types'
import { formatCurrency, formatPercent } from './formatting'

type PerformanceMetrics = {
  totalAmount: number
  totalQuantity: number
  averagePrice: number
  firstPeriodAmount: number
  firstPeriodQuantity: number
  firstPeriodLabel?: string
  lastPeriodAmount: number
  lastPeriodQuantity: number
  lastPeriodLabel?: string
  amountChangePercent: number
  quantityChangePercent: number
  trendDirection: 'up' | 'down' | 'stable'
  periodsCount?: number
}

type ProductPeriodData = {
  productId: string
  productName: string
  totalAmount?: number
  totalQuantity?: number
  periods: Array<{
    periodKey: string
    label: string
    quantity: number
    amount: number
    quantityChange?: number
    amountChange?: number
  }>
}

type ExportOptions = {
  workspace: WorkspaceScope
  reportType: 'category' | 'subcategory' | 'product'
  selectedLabel: string
  dateRange: { start: Date; end: Date }
  currency: string
  metrics: PerformanceMetrics | null
  productBreakdown: ProductPeriodData[]
  chartElement?: HTMLElement | null
}

export async function exportPerformanceReportToPDF(options: ExportOptions): Promise<void> {
  const { currency, reportType, selectedLabel, dateRange, metrics, productBreakdown, chartElement } = options

  const doc = new jsPDF('p', 'mm', 'a4')
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const m = 16 // margin
  const cw = pw - 2 * m // content width
  let y = m

  const safeDateFormat = (d: Date, fmt: string) => {
    try {
      if (!(d instanceof Date) || isNaN(d.getTime())) return '—'
      return format(d, fmt)
    } catch { return '—' }
  }

  // --- Helpers ---
  const needsPage = (space: number) => {
    if (y + space > ph - 25) { doc.addPage(); y = m; return true }
    return false
  }

  const line = () => {
    doc.setDrawColor(230, 230, 230)
    doc.line(m, y, pw - m, y)
    y += 6
  }

  const heading = (text: string, size = 13) => {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(size)
    doc.setTextColor(20, 20, 20)
    doc.text(text, m, y)
    y += size * 0.5 + 3
  }

  const bodyText = (text: string, x = m, maxW = cw) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(80, 80, 80)
    const lines = doc.splitTextToSize(text, maxW)
    doc.text(lines, x, y)
    y += lines.length * 4.5
  }

  // ===== HEADER =====
  doc.setFillColor(24, 24, 27) // gray-900
  doc.rect(0, 0, pw, 32, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('Performance Report', m, 14)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 180, 180)
  doc.text(`${selectedLabel}  ·  ${safeDateFormat(dateRange.start, 'MMM d, yyyy')} – ${safeDateFormat(dateRange.end, 'MMM d, yyyy')}`, m, 22)

  doc.setFontSize(8)
  doc.text(`Generated ${safeDateFormat(new Date(), 'MMM d, yyyy HH:mm')}  ·  ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report`, m, 28)

  doc.setTextColor(0, 0, 0)
  y = 40

  // ===== KEY METRICS =====
  if (metrics) {
    heading('Key Metrics')

    const firstLabel = metrics.firstPeriodLabel || 'First Period'
    const lastLabel = metrics.lastPeriodLabel || 'Last Period'

    const kpis = [
      { label: 'Total Revenue', value: formatCurrency(currency, metrics.totalAmount), sub: `${metrics.totalQuantity.toLocaleString()} items` },
      { label: 'Avg. Price', value: formatCurrency(currency, metrics.averagePrice), sub: 'per item sold' },
      { label: 'Revenue Change', value: `${metrics.amountChangePercent >= 0 ? '+' : ''}${formatPercent(metrics.amountChangePercent)}`, sub: `${firstLabel} → ${lastLabel}` },
      { label: 'Volume Change', value: `${metrics.quantityChangePercent >= 0 ? '+' : ''}${formatPercent(metrics.quantityChangePercent)}`, sub: `${firstLabel} → ${lastLabel}` },
    ]

    const boxW = (cw - 6) / 2
    const boxH = 22
    for (let i = 0; i < kpis.length; i += 2) {
      needsPage(boxH + 4)
      for (let j = 0; j < 2 && i + j < kpis.length; j++) {
        const kpi = kpis[i + j]
        const x = m + j * (boxW + 6)

        doc.setFillColor(250, 250, 250)
        doc.setDrawColor(230, 230, 230)
        doc.roundedRect(x, y, boxW, boxH, 2, 2, 'FD')

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(120, 120, 120)
        doc.text(kpi.label.toUpperCase(), x + 4, y + 6)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(13)
        doc.setTextColor(20, 20, 20)
        doc.text(kpi.value, x + 4, y + 13)

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.setTextColor(150, 150, 150)
        doc.text(kpi.sub, x + 4, y + 18)
      }
      y += boxH + 4
    }

    y += 4
    line()

    // ===== PERIOD COMPARISON =====
    needsPage(35)
    heading('Period Comparison')

    const compBoxW = (cw - 20) / 2
    // First period
    doc.setFillColor(250, 250, 250)
    doc.setDrawColor(230, 230, 230)
    doc.roundedRect(m, y, compBoxW, 20, 2, 2, 'FD')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text(firstLabel.toUpperCase(), m + 4, y + 6)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    doc.text(formatCurrency(currency, metrics.firstPeriodAmount), m + 4, y + 13)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text(`${metrics.firstPeriodQuantity.toLocaleString()} units`, m + 4, y + 17)

    // Arrow + change
    const arrowX = m + compBoxW + 3
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    const changeColor = metrics.amountChangePercent >= 0 ? [22, 163, 74] : [220, 38, 38]
    doc.setTextColor(changeColor[0], changeColor[1], changeColor[2])
    doc.text(`→ ${metrics.amountChangePercent >= 0 ? '+' : ''}${formatPercent(metrics.amountChangePercent)}`, arrowX, y + 11, { align: 'center' })

    // Last period
    const lastX = m + compBoxW + 20
    doc.setFillColor(250, 250, 250)
    doc.setDrawColor(230, 230, 230)
    doc.roundedRect(lastX, y, compBoxW, 20, 2, 2, 'FD')

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(120, 120, 120)
    doc.text(lastLabel.toUpperCase(), lastX + 4, y + 6)

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    doc.text(formatCurrency(currency, metrics.lastPeriodAmount), lastX + 4, y + 13)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(120, 120, 120)
    doc.text(`${metrics.lastPeriodQuantity.toLocaleString()} units`, lastX + 4, y + 17)

    y += 28
    line()

    // ===== INSIGHTS & ANALYSIS =====
    needsPage(40)
    heading('Analysis & Insights')

    const insights: string[] = []

    // Revenue trend insight
    if (metrics.amountChangePercent > 15) {
      insights.push(`Strong revenue growth of ${formatPercent(metrics.amountChangePercent)} from ${firstLabel} to ${lastLabel}. This indicates healthy demand momentum.`)
    } else if (metrics.amountChangePercent > 5) {
      insights.push(`Moderate revenue growth of ${formatPercent(metrics.amountChangePercent)} from ${firstLabel} to ${lastLabel}. Performance is trending positively.`)
    } else if (metrics.amountChangePercent > -5) {
      insights.push(`Revenue remained relatively stable (${metrics.amountChangePercent >= 0 ? '+' : ''}${formatPercent(metrics.amountChangePercent)}) between ${firstLabel} and ${lastLabel}.`)
    } else if (metrics.amountChangePercent > -15) {
      insights.push(`Revenue declined by ${formatPercent(Math.abs(metrics.amountChangePercent))} from ${firstLabel} to ${lastLabel}. Monitor contributing factors.`)
    } else {
      insights.push(`Significant revenue decline of ${formatPercent(Math.abs(metrics.amountChangePercent))} from ${firstLabel} to ${lastLabel}. Immediate attention recommended.`)
    }

    // Price vs volume analysis
    if (metrics.quantityChangePercent < -5 && metrics.amountChangePercent > 0) {
      insights.push('Volume is declining while revenue grows — this suggests price increases or a shift toward higher-priced items. Monitor customer retention to ensure price changes aren\'t reducing demand.')
    } else if (metrics.quantityChangePercent > 5 && metrics.amountChangePercent < 0) {
      insights.push('Volume is increasing but revenue is declining — likely driven by heavy discounting or a mix shift toward lower-priced products. Review pricing strategy.')
    } else if (metrics.quantityChangePercent > 10 && metrics.amountChangePercent > 10) {
      insights.push('Both volume and revenue are growing strongly — the business is scaling well across both dimensions.')
    }

    // Average price insight
    const avgPriceFirstPeriod = metrics.firstPeriodQuantity > 0 ? metrics.firstPeriodAmount / metrics.firstPeriodQuantity : 0
    const avgPriceLastPeriod = metrics.lastPeriodQuantity > 0 ? metrics.lastPeriodAmount / metrics.lastPeriodQuantity : 0
    if (avgPriceFirstPeriod > 0 && avgPriceLastPeriod > 0) {
      const priceChange = ((avgPriceLastPeriod - avgPriceFirstPeriod) / avgPriceFirstPeriod) * 100
      if (Math.abs(priceChange) > 5) {
        insights.push(`Average selling price ${priceChange > 0 ? 'increased' : 'decreased'} by ${formatPercent(Math.abs(priceChange))} (${formatCurrency(currency, avgPriceFirstPeriod)} → ${formatCurrency(currency, avgPriceLastPeriod)}). ${priceChange > 0 ? 'This may reflect pricing adjustments or premium product growth.' : 'Consider whether discounting is impacting margins.'}`)
      }
    }

    // Periods count
    if (metrics.periodsCount && metrics.periodsCount <= 2) {
      insights.push(`Note: Only ${metrics.periodsCount} period(s) of data available. Trends may not be statistically meaningful. More data points will improve forecast accuracy.`)
    }

    // Product breakdown insights
    if (productBreakdown.length > 0) {
      const topProduct = productBreakdown[0]
      const totalRevenue = productBreakdown.reduce((s, p) => s + (p.totalAmount || p.periods.reduce((ps, per) => ps + per.amount, 0)), 0)
      const topProductRevenue = topProduct.totalAmount || topProduct.periods.reduce((s, p) => s + p.amount, 0)
      const topShare = totalRevenue > 0 ? (topProductRevenue / totalRevenue) * 100 : 0

      if (topShare > 20) {
        insights.push(`"${topProduct.productName}" dominates with ${formatPercent(topShare)} of total revenue. High dependency on a single product increases risk — consider diversifying.`)
      }

      // Products with declining trend
      const decliningProducts = productBreakdown.filter(p => {
        const periods = p.periods
        if (periods.length < 2) return false
        const last = periods[periods.length - 1]
        const first = periods[0]
        return first.amount > 0 && ((last.amount - first.amount) / first.amount) < -0.2
      })

      if (decliningProducts.length > 0 && decliningProducts.length <= 3) {
        const names = decliningProducts.map(p => `"${p.productName}"`).join(', ')
        insights.push(`Declining products: ${names}. Consider menu engineering or promotional activity for these items.`)
      }
    }

    if (insights.length === 0) {
      insights.push('Insufficient data variation for detailed insights. Continue importing reports to build a richer dataset.')
    }

    for (const insight of insights) {
      needsPage(15)
      doc.setFillColor(252, 252, 253)
      const textLines = doc.splitTextToSize(insight, cw - 12)
      const blockH = textLines.length * 4 + 6
      doc.roundedRect(m, y - 2, cw, blockH, 1.5, 1.5, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(60, 60, 60)
      doc.text(textLines, m + 6, y + 3)
      y += blockH + 3
    }

    y += 4
    line()
  }

  // ===== CHART =====
  if (chartElement) {
    needsPage(90)
    heading('Performance Trend')

    try {
      const canvas = await html2canvas(chartElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      })
      const imgData = canvas.toDataURL('image/png')
      const imgW = cw
      const imgH = (canvas.height * imgW) / canvas.width
      const maxH = ph - y - 30

      needsPage(Math.min(imgH, maxH) + 10)
      doc.addImage(imgData, 'PNG', m, y, imgW, Math.min(imgH, maxH))
      y += Math.min(imgH, maxH) + 8
    } catch (error) {
      console.error('Error capturing chart:', error)
      bodyText('Chart could not be included in the PDF.')
    }
    line()
  }

  // ===== PRODUCT BREAKDOWN TABLE =====
  if (productBreakdown.length > 0) {
    needsPage(30)
    heading('Product Breakdown')

    const periods = productBreakdown[0]?.periods || []
    // Limit to 6 periods max to prevent overflow
    const maxPeriods = Math.min(periods.length, 6)
    const periodsToShow = periods.slice(0, maxPeriods)

    const nameColW = 38
    const periodColW = (cw - nameColW) / maxPeriods

    // Header row
    const drawTableHeader = () => {
      doc.setFillColor(245, 245, 245)
      doc.rect(m, y - 1, cw, 8, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(6.5)
      doc.setTextColor(100, 100, 100)
      doc.text('PRODUCT', m + 2, y + 4)

      for (let i = 0; i < maxPeriods; i++) {
        const x = m + nameColW + i * periodColW
        doc.text(periodsToShow[i].label.toUpperCase(), x + periodColW / 2, y + 4, { align: 'center' })
      }
      y += 10
    }

    drawTableHeader()

    // Data rows
    for (const product of productBreakdown) {
      const rowH = 14
      if (needsPage(rowH + 10)) {
        drawTableHeader()
      }

      // Product name
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7.5)
      doc.setTextColor(30, 30, 30)
      const name = product.productName.length > 20 ? product.productName.substring(0, 18) + '...' : product.productName
      doc.text(name, m + 2, y + 4)

      // Period data
      for (let i = 0; i < maxPeriods; i++) {
        const period = product.periods[i]
        if (!period) continue
        const x = m + nameColW + i * periodColW
        const cx = x + periodColW / 2

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7)
        doc.setTextColor(30, 30, 30)
        doc.text(formatCurrency(currency, period.amount), cx, y + 4, { align: 'center' })

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6)
        doc.setTextColor(130, 130, 130)
        doc.text(`${period.quantity.toLocaleString()} units`, cx, y + 8, { align: 'center' })

        if (i > 0 && period.amountChange !== undefined) {
          const cc = period.amountChange >= 0 ? [22, 163, 74] : [220, 38, 38]
          doc.setTextColor(cc[0], cc[1], cc[2])
          doc.setFontSize(5.5)
          doc.text(`${period.amountChange >= 0 ? '+' : ''}${formatPercent(period.amountChange)}`, cx, y + 11.5, { align: 'center' })
        }
      }

      y += rowH
      doc.setDrawColor(240, 240, 240)
      doc.line(m, y - 1, pw - m, y - 1)
    }

    if (periods.length > maxPeriods) {
      y += 4
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(7)
      doc.setTextColor(150, 150, 150)
      doc.text(`* Showing ${maxPeriods} of ${periods.length} periods. Full data available in the application.`, m, y)
      y += 6
    }
  }

  // ===== FOOTER ON ALL PAGES =====
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setDrawColor(230, 230, 230)
    doc.line(m, ph - 14, pw - m, ph - 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text('Scales Analytics · Performance Report', m, ph - 9)
    doc.text(`Page ${i} of ${totalPages}`, pw - m, ph - 9, { align: 'right' })
  }

  // Save
  const typeLabel = reportType.charAt(0).toUpperCase() + reportType.slice(1)
  doc.save(`Performance-Report-${typeLabel}-${safeDateFormat(new Date(), 'yyyy-MM-dd')}.pdf`)
}
