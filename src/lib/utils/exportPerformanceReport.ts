import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { format } from 'date-fns'
import type { WorkspaceScope } from '../types'

type PerformanceMetrics = {
  totalAmount: number
  totalQuantity: number
  averagePrice: number
  firstPeriodAmount: number
  firstPeriodQuantity: number
  lastPeriodAmount: number
  lastPeriodQuantity: number
  amountChangePercent: number
  quantityChangePercent: number
  trendDirection: 'up' | 'down' | 'stable'
}

type ProductPeriodData = {
  productId: string
  productName: string
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
  metrics: PerformanceMetrics | null
  productBreakdown: ProductPeriodData[]
  chartElement?: HTMLElement | null
}

const formatCurrency = (currency: string, value: number) => {
  const decimals = value >= 1000 ? 0 : 2
  return `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

const formatPercent = (value: number) => {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

export async function exportPerformanceReportToPDF(options: ExportOptions): Promise<void> {
  const { workspace, reportType, selectedLabel, dateRange, metrics, productBreakdown, chartElement } = options

  const doc = new jsPDF('p', 'mm', 'a4')
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 15
  const footerHeight = 20 // Space for footer
  const contentWidth = pageWidth - 2 * margin
  let currentY = margin

  // Helper to add new page if needed
  const checkNewPage = (requiredSpace: number) => {
    if (currentY + requiredSpace > pageHeight - margin - footerHeight) {
      doc.addPage()
      currentY = margin
      return true
    }
    return false
  }

  // Helper to draw line
  const drawLine = () => {
    doc.setDrawColor(200, 200, 200)
    doc.line(margin, currentY, pageWidth - margin, currentY)
    currentY += 5
  }

  // Header
  doc.setFillColor(59, 130, 246) // blue-500
  doc.rect(0, 0, pageWidth, 35, 'F')
  
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(24)
  doc.setFont('helvetica', 'bold')
  doc.text('Performance Report', margin, 20)
  
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.text(selectedLabel, margin, 28)
  
  doc.setTextColor(0, 0, 0)
  currentY = 45

  // Report Info
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  
  const reportTypeText = reportType.charAt(0).toUpperCase() + reportType.slice(1)
  doc.text(`Report Type: ${reportTypeText}`, margin, currentY)
  currentY += 5
  
  const dateRangeText = `${format(dateRange.start, 'MMM d, yyyy')} – ${format(dateRange.end, 'MMM d, yyyy')}`
  doc.text(`Date Range: ${dateRangeText}`, margin, currentY)
  currentY += 5
  
  const generatedAt = format(new Date(), 'MMM d, yyyy HH:mm')
  doc.text(`Generated: ${generatedAt}`, margin, currentY)
  currentY += 10

  drawLine()
  currentY += 5

  // Metrics Section
  if (metrics) {
    checkNewPage(60)
    
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Summary Metrics', margin, currentY)
    currentY += 10

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')

    // Metrics Grid
    const metricsPerRow = 2
    const metricWidth = contentWidth / metricsPerRow
    const metricsData = [
      { label: 'Total Revenue', value: formatCurrency(workspace.currency, metrics.totalAmount), sub: `Qty: ${metrics.totalQuantity.toLocaleString()}` },
      { label: 'Avg. Price', value: formatCurrency(workspace.currency, metrics.averagePrice), sub: 'per item' },
      { label: 'Revenue Change', value: formatPercent(metrics.amountChangePercent), sub: 'First vs Last period' },
      { label: 'Quantity Change', value: formatPercent(metrics.quantityChangePercent), sub: 'First vs Last period' },
    ]

    for (let i = 0; i < metricsData.length; i += metricsPerRow) {
      checkNewPage(25)
      
      for (let j = 0; j < metricsPerRow && i + j < metricsData.length; j++) {
        const metric = metricsData[i + j]
        const x = margin + j * metricWidth

        doc.setFillColor(245, 247, 250)
        doc.roundedRect(x, currentY - 12, metricWidth - 5, 20, 3, 3, 'F')

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(100, 100, 100)
        doc.text(metric.label, x + 3, currentY - 5)

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(0, 0, 0)
        doc.text(metric.value, x + 3, currentY + 2)

        if (metric.sub) {
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(8)
          doc.setTextColor(150, 150, 150)
          doc.text(metric.sub, x + 3, currentY + 7)
        }
      }
      
      currentY += 25
    }

    currentY += 10
    drawLine()
    currentY += 10

    // Period Comparison
    checkNewPage(30)
    
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Period Comparison', margin, currentY)
    currentY += 10

    const periodWidth = contentWidth / 2
    const periods = [
      { label: 'First Period', amount: metrics.firstPeriodAmount, quantity: metrics.firstPeriodQuantity },
      { label: 'Last Period', amount: metrics.lastPeriodAmount, quantity: metrics.lastPeriodQuantity },
    ]

    for (let i = 0; i < periods.length; i++) {
      const period = periods[i]
      const x = margin + i * periodWidth

      doc.setFillColor(245, 247, 250)
      doc.roundedRect(x, currentY - 10, periodWidth - 5, 22, 3, 3, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(50, 50, 50)
      doc.text(period.label, x + 5, currentY)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(0, 0, 0)
      doc.text(formatCurrency(workspace.currency, period.amount), x + 5, currentY + 7)

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 100, 100)
      doc.text(`${period.quantity.toLocaleString()} units`, x + 5, currentY + 12)
    }

    currentY += 25
    currentY += 10
    drawLine()
    currentY += 10
  }

  // Chart Image
  if (chartElement) {
    checkNewPage(80)
    
    try {
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('Performance Trend', margin, currentY)
      currentY += 10

      const canvas = await html2canvas(chartElement, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
      })

      const imgData = canvas.toDataURL('image/png')
      const imgWidth = contentWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      checkNewPage(imgHeight + 20)
      
      if (imgHeight > pageHeight - currentY - margin - footerHeight) {
        // Split image if too large
        const maxHeight = pageHeight - currentY - margin - footerHeight - 10
        doc.addImage(imgData, 'PNG', margin, currentY, imgWidth, maxHeight)
        currentY += maxHeight + 10
        checkNewPage(10)
      } else {
        doc.addImage(imgData, 'PNG', margin, currentY, imgWidth, imgHeight)
        currentY += imgHeight + 10
      }

      drawLine()
      currentY += 5
    } catch (error) {
      console.error('Error capturing chart:', error)
      doc.setFontSize(10)
      doc.setTextColor(150, 150, 150)
      doc.text('Chart could not be included in PDF', margin, currentY)
      currentY += 10
    }
  }

  // Product Breakdown Table
  if (productBreakdown.length > 0) {
    checkNewPage(40)
    
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(0, 0, 0)
    doc.text('Product Performance Breakdown', margin, currentY)
    currentY += 10

    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('Comparative analysis by product and period', margin, currentY)
    currentY += 10

    // Table headers
    if (productBreakdown[0]?.periods.length > 0) {
      const periods = productBreakdown[0].periods
      const productColWidth = 50
      const periodColWidth = (contentWidth - productColWidth) / periods.length
      
      // Limit columns to fit on page
      const maxPeriodsPerPage = Math.min(periods.length, Math.floor((contentWidth - productColWidth) / 25))
      const periodsToShow = periods.slice(0, maxPeriodsPerPage)

      // Header row
      checkNewPage(25)
      
      let headerY = currentY
      
      doc.setFillColor(248, 250, 252)
      doc.rect(margin, headerY - 6, contentWidth, 12, 'F')
      
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.setTextColor(50, 50, 50)
      
      // Product column
      doc.text('Product', margin + 2, headerY + 2)
      
      // Period columns
      let headerX = margin + productColWidth
      for (let i = 0; i < periodsToShow.length; i++) {
        const period = periodsToShow[i]
        if (headerX + periodColWidth > pageWidth - margin) {
          doc.addPage()
          headerY = margin + 15
          currentY = headerY
          // Redraw header background and product column on new page
          doc.setFillColor(248, 250, 252)
          doc.rect(margin, headerY - 6, contentWidth, 12, 'F')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(50, 50, 50)
          doc.text('Product', margin + 2, headerY + 2)
          headerX = margin + productColWidth
        }
        
        doc.text(period.label, headerX + periodColWidth / 2, headerY + 2, {
          align: 'center',
          maxWidth: periodColWidth - 2,
        })
        headerX += periodColWidth
      }

      currentY = headerY + 12

      // Product rows
      for (const product of productBreakdown) {
        // Check if we need more space (header text + 3 lines of data + separator)
        const rowHeight = 18 // Increased row height
        checkNewPage(rowHeight)

        let rowStartY = currentY

        // Product name (truncate if too long)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(0, 0, 0)
        const productName = product.productName.length > 25 
          ? product.productName.substring(0, 22) + '...'
          : product.productName
        doc.text(productName, margin + 2, rowStartY + 5, { maxWidth: productColWidth - 4 })

        // Period data
        let dataX = margin + productColWidth
        for (let i = 0; i < periodsToShow.length; i++) {
          const period = product.periods[i]
          if (!period) continue

          if (dataX + periodColWidth > pageWidth - margin) {
            doc.addPage()
            currentY = margin + 15
            // Redraw header on new page if needed
            headerY = margin + 15
            doc.setFillColor(248, 250, 252)
            doc.rect(margin, headerY - 6, contentWidth, 12, 'F')
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(50, 50, 50)
            doc.text('Product', margin + 2, headerY + 2)
            
            // Redraw period headers
            let newHeaderX = margin + productColWidth
            for (let j = i; j < periodsToShow.length; j++) {
              const periodHeader = periodsToShow[j]
              doc.text(periodHeader.label, newHeaderX + periodColWidth / 2, headerY + 2, {
                align: 'center',
                maxWidth: periodColWidth - 2,
              })
              newHeaderX += periodColWidth
            }
            
            dataX = margin + productColWidth
            currentY = headerY + 12
            
            // Redraw product name on new page
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(8)
            doc.setTextColor(0, 0, 0)
            doc.text(productName, margin + 2, currentY + 5, { maxWidth: productColWidth - 4 })
            rowStartY = currentY
          }

          const cellY = rowStartY
          
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(0, 0, 0)
          
          const amountText = formatCurrency(workspace.currency, period.amount)
          doc.text(amountText, dataX + periodColWidth / 2, cellY + 5, {
            align: 'center',
            maxWidth: periodColWidth - 2,
          })

          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.setTextColor(100, 100, 100)
          
          const qtyText = `${period.quantity.toLocaleString()} units`
          doc.text(qtyText, dataX + periodColWidth / 2, cellY + 9, {
            align: 'center',
            maxWidth: periodColWidth - 2,
          })

          if (period.amountChange !== undefined && i > 0) {
            doc.setFontSize(6)
            const changeColor = period.amountChange >= 0 ? [34, 197, 94] : [239, 68, 68]
            doc.setTextColor(changeColor[0], changeColor[1], changeColor[2])
            doc.text(
              formatPercent(period.amountChange),
              dataX + periodColWidth / 2,
              cellY + 12,
              { align: 'center', maxWidth: periodColWidth - 2 }
            )
          }

          dataX += periodColWidth
        }

        currentY = rowStartY + rowHeight
        
        // Draw separator line at the bottom of the row
        doc.setDrawColor(230, 230, 230)
        doc.line(margin, currentY - 2, pageWidth - margin, currentY - 2)
      }
    }
  }

  // Footer on all pages
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(
      `Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    )
  }

  // Generate filename
  const reportTypeLabel = reportType.charAt(0).toUpperCase() + reportType.slice(1)
  const filename = `Performance-Report-${reportTypeLabel}-${format(new Date(), 'yyyy-MM-dd')}.pdf`

  // Save PDF
  doc.save(filename)
}

