import ExcelJS from 'exceljs'
import type { Product } from '../types'
import { findBestMatches } from './productMatching'

export type MappingExportRow = {
  unmappedProductName: string
  status: 'mapped' | 'unmapped'
  mappedToProductId?: string
  mappedToProductName?: string
  suggestion1?: string
  suggestion1Score?: number
  suggestion1Reason?: string
  suggestion2?: string
  suggestion2Score?: number
  suggestion2Reason?: string
  suggestion3?: string
  suggestion3Score?: number
  suggestion3Reason?: string
}

export async function exportMappingReport(
  unmappedProducts: string[],
  products: Product[],
  mapping: Record<string, string>,
  reportId: string,
): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  
  // Create "Mapping Summary" sheet
  const summarySheet = workbook.addWorksheet('Mapping Summary')
  summarySheet.columns = [
    { header: 'Unmapped Product Name', key: 'unmappedProductName', width: 40 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Mapped To Product ID', key: 'mappedToProductId', width: 30 },
    { header: 'Mapped To Product Name', key: 'mappedToProductName', width: 40 },
    { header: 'Suggestion 1', key: 'suggestion1', width: 40 },
    { header: 'Suggestion 1 Score', key: 'suggestion1Score', width: 15 },
    { header: 'Suggestion 1 Reason', key: 'suggestion1Reason', width: 20 },
    { header: 'Suggestion 2', key: 'suggestion2', width: 40 },
    { header: 'Suggestion 2 Score', key: 'suggestion2Score', width: 15 },
    { header: 'Suggestion 2 Reason', key: 'suggestion2Reason', width: 20 },
    { header: 'Suggestion 3', key: 'suggestion3', width: 40 },
    { header: 'Suggestion 3 Score', key: 'suggestion3Score', width: 15 },
    { header: 'Suggestion 3 Reason', key: 'suggestion3Reason', width: 20 },
  ]

  // Style header row
  summarySheet.getRow(1).font = { bold: true }
  summarySheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  // Add data rows
  unmappedProducts.forEach((unmappedName) => {
    const isMapped = !!mapping[unmappedName]
    const mappedProduct = isMapped
      ? products.find((p) => p.id === mapping[unmappedName])
      : undefined
    const suggestions = findBestMatches(unmappedName, products, 3)

    const row = summarySheet.addRow({
      unmappedProductName: unmappedName,
      status: isMapped ? 'Mapped' : 'Unmapped',
      mappedToProductId: mappedProduct?.id ?? '',
      mappedToProductName: mappedProduct?.name ?? '',
      suggestion1: suggestions[0]?.product.name ?? '',
      suggestion1Score: suggestions[0] ? Math.round(suggestions[0].score * 100) : '',
      suggestion1Reason: suggestions[0]?.reason ?? '',
      suggestion2: suggestions[1]?.product.name ?? '',
      suggestion2Score: suggestions[1] ? Math.round(suggestions[1].score * 100) : '',
      suggestion2Reason: suggestions[1]?.reason ?? '',
      suggestion3: suggestions[2]?.product.name ?? '',
      suggestion3Score: suggestions[2] ? Math.round(suggestions[2].score * 100) : '',
      suggestion3Reason: suggestions[2]?.reason ?? '',
    })

    // Color code rows
    if (isMapped) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD4EDDA' }, // Light green
      }
    } else {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFF3CD' }, // Light yellow
      }
    }
  })

  // Create "Mapped Products" sheet
  const mappedSheet = workbook.addWorksheet('Mapped Products')
  mappedSheet.columns = [
    { header: 'Unmapped Product Name', key: 'unmappedProductName', width: 40 },
    { header: 'Mapped To Product ID', key: 'mappedToProductId', width: 30 },
    { header: 'Mapped To Product Name', key: 'mappedToProductName', width: 40 },
    { header: 'Category', key: 'category', width: 30 },
    { header: 'POS Code', key: 'posCode', width: 20 },
  ]

  mappedSheet.getRow(1).font = { bold: true }
  mappedSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  unmappedProducts
    .filter((name) => mapping[name])
    .forEach((unmappedName) => {
      const mappedProduct = products.find((p) => p.id === mapping[unmappedName])
      if (mappedProduct) {
        mappedSheet.addRow({
          unmappedProductName: unmappedName,
          mappedToProductId: mappedProduct.id,
          mappedToProductName: mappedProduct.name,
          category: mappedProduct.menuGroupId ?? '',
          posCode: mappedProduct.posCode ?? '',
        })
      }
    })

  // Create "Unmapped Products" sheet
  const unmappedSheet = workbook.addWorksheet('Unmapped Products')
  unmappedSheet.columns = [
    { header: 'Unmapped Product Name', key: 'unmappedProductName', width: 40 },
    { header: 'Best Suggestion', key: 'bestSuggestion', width: 40 },
    { header: 'Best Score', key: 'bestScore', width: 15 },
    { header: 'Best Reason', key: 'bestReason', width: 20 },
    { header: 'Suggestion 2', key: 'suggestion2', width: 40 },
    { header: 'Suggestion 2 Score', key: 'suggestion2Score', width: 15 },
    { header: 'Suggestion 3', key: 'suggestion3', width: 40 },
    { header: 'Suggestion 3 Score', key: 'suggestion3Score', width: 15 },
  ]

  unmappedSheet.getRow(1).font = { bold: true }
  unmappedSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  unmappedProducts
    .filter((name) => !mapping[name])
    .forEach((unmappedName) => {
      const suggestions = findBestMatches(unmappedName, products, 3)
      unmappedSheet.addRow({
        unmappedProductName: unmappedName,
        bestSuggestion: suggestions[0]?.product.name ?? 'No suggestions',
        bestScore: suggestions[0] ? Math.round(suggestions[0].score * 100) : '',
        bestReason: suggestions[0]?.reason ?? '',
        suggestion2: suggestions[1]?.product.name ?? '',
        suggestion2Score: suggestions[1] ? Math.round(suggestions[1].score * 100) : '',
        suggestion3: suggestions[2]?.product.name ?? '',
        suggestion3Score: suggestions[2] ? Math.round(suggestions[2].score * 100) : '',
      })
    })

  // Generate file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `product-mapping-report-${reportId}-${new Date().toISOString().split('T')[0]}.xlsx`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

