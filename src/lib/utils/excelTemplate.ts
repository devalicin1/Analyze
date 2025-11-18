import ExcelJS from 'exceljs'
import type { MenuGroup } from '../types'

export async function downloadProductTemplate(menuGroups: MenuGroup[]): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Products')

  // Header row with clearer labels
  worksheet.columns = [
    { header: 'Product Name', key: 'name', width: 30 },
    { header: 'Category (Menu Group)', key: 'category', width: 25 },
    { header: 'Category ID', key: 'menuGroupId', width: 20 },
    { header: 'Subcategory (Menu Sub Group)', key: 'subcategory', width: 30 },
    { header: 'Subcategory ID', key: 'menuSubGroupId', width: 25 },
    { header: 'Is Extra (Yes/No)', key: 'isExtra', width: 15 },
    { header: 'POS Code', key: 'posCode', width: 15 },
    { header: 'Default Unit Price', key: 'defaultUnitPrice', width: 20 },
    { header: 'Active From (YYYY-MM-DD)', key: 'activeFrom', width: 25 },
    { header: 'Active To (YYYY-MM-DD)', key: 'activeTo', width: 25 },
  ]

  // Style header row
  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  // Add example rows
  if (menuGroups.length > 0) {
    const firstGroup = menuGroups[0]
    const firstSubGroup = firstGroup.subGroups[0]

    worksheet.addRow({
      name: 'Example Product 1',
      category: firstGroup.label,
      menuGroupId: firstGroup.id,
      subcategory: firstSubGroup?.label || '',
      menuSubGroupId: firstSubGroup?.id || '',
      isExtra: 'No',
      posCode: 'POS001',
      defaultUnitPrice: 10.99,
      activeFrom: '',
      activeTo: '',
    })

    worksheet.addRow({
      name: 'Example Product 2',
      category: firstGroup.label,
      menuGroupId: firstGroup.id,
      subcategory: '',
      menuSubGroupId: '',
      isExtra: 'Yes',
      posCode: 'EXT001',
      defaultUnitPrice: 2.50,
      activeFrom: '2025-01-01',
      activeTo: '2025-12-31',
    })
  }

  // Add Instructions sheet
  const instructionsSheet = workbook.addWorksheet('Instructions')
  instructionsSheet.columns = [{ key: 'instruction', width: 100 }]

  instructionsSheet.addRow({ instruction: 'PRODUCT BULK UPLOAD TEMPLATE' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: 'HOW TO USE THIS TEMPLATE' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: 'STEP 1: Review the "Categories" sheet to see available categories and subcategories' })
  instructionsSheet.addRow({ instruction: 'STEP 2: Fill in the "Products" sheet with your product data' })
  instructionsSheet.addRow({ instruction: 'STEP 3: Use either Category Label OR Category ID (both work)' })
  instructionsSheet.addRow({ instruction: 'STEP 4: Use either Subcategory Label OR Subcategory ID (both work)' })
  instructionsSheet.addRow({ instruction: 'STEP 5: Save the file and upload it using the Bulk Upload feature' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: 'COLUMN DESCRIPTIONS' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '1. Product Name (REQUIRED)' })
  instructionsSheet.addRow({ instruction: '   → The name of your product (e.g., "Margherita Pizza", "Coca Cola")' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '2. Category (Menu Group) (REQUIRED - Use Label OR ID)' })
  instructionsSheet.addRow({ instruction: '   → The category name (e.g., "Pizzas", "Drinks")' })
  instructionsSheet.addRow({ instruction: '   → OR use the Category ID from the Categories sheet' })
  instructionsSheet.addRow({ instruction: '   → Must match an existing category' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '3. Category ID (REQUIRED - Use Label OR ID)' })
  instructionsSheet.addRow({ instruction: '   → The unique ID of the category (e.g., "group_1")' })
  instructionsSheet.addRow({ instruction: '   → OR use the Category Label instead' })
  instructionsSheet.addRow({ instruction: '   → See Categories sheet for available IDs' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '4. Subcategory (Menu Sub Group) (OPTIONAL - Use Label OR ID)' })
  instructionsSheet.addRow({ instruction: '   → The subcategory name (e.g., "Classic Pizzas", "Soft Drinks")' })
  instructionsSheet.addRow({ instruction: '   → OR use the Subcategory ID from the Categories sheet' })
  instructionsSheet.addRow({ instruction: '   → Must belong to the selected category' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '5. Subcategory ID (OPTIONAL - Use Label OR ID)' })
  instructionsSheet.addRow({ instruction: '   → The unique ID of the subcategory (e.g., "group_1_sub_1")' })
  instructionsSheet.addRow({ instruction: '   → OR use the Subcategory Label instead' })
  instructionsSheet.addRow({ instruction: '   → See Categories sheet for available IDs' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '6. Is Extra (OPTIONAL)' })
  instructionsSheet.addRow({ instruction: '   → Enter "Yes" if this is an extra/add-on product' })
  instructionsSheet.addRow({ instruction: '   → Enter "No" or leave empty for regular products' })
  instructionsSheet.addRow({ instruction: '   → Default: No' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '7. POS Code (OPTIONAL)' })
  instructionsSheet.addRow({ instruction: '   → Point of Sale system code for this product' })
  instructionsSheet.addRow({ instruction: '   → Leave empty if not applicable' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '8. Default Unit Price (OPTIONAL)' })
  instructionsSheet.addRow({ instruction: '   → Default price for this product (numeric value)' })
  instructionsSheet.addRow({ instruction: '   → Example: 10.99, 25.50' })
  instructionsSheet.addRow({ instruction: '   → Leave empty if not applicable' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '9. Active From (OPTIONAL)' })
  instructionsSheet.addRow({ instruction: '   → Start date when product becomes active' })
  instructionsSheet.addRow({ instruction: '   → Format: YYYY-MM-DD (e.g., 2025-01-01)' })
  instructionsSheet.addRow({ instruction: '   → Leave empty if product is always active' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '10. Active To (OPTIONAL)' })
  instructionsSheet.addRow({ instruction: '    → End date when product becomes inactive' })
  instructionsSheet.addRow({ instruction: '    → Format: YYYY-MM-DD (e.g., 2025-12-31)' })
  instructionsSheet.addRow({ instruction: '    → Leave empty if product is always active' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: 'IMPORTANT NOTES' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '• You can use EITHER Category Label OR Category ID (not both required)' })
  instructionsSheet.addRow({ instruction: '• You can use EITHER Subcategory Label OR Subcategory ID (not both required)' })
  instructionsSheet.addRow({ instruction: '• If you use Label, the system will automatically find the matching ID' })
  instructionsSheet.addRow({ instruction: '• Category and Subcategory must match existing values from the Categories sheet' })
  instructionsSheet.addRow({ instruction: '• Subcategory must belong to the selected Category' })
  instructionsSheet.addRow({ instruction: '• Example rows can be deleted - they are just for reference' })
  instructionsSheet.addRow({ instruction: '• Empty rows will be skipped automatically' })
  instructionsSheet.addRow({ instruction: '' })

  // Style instructions
  instructionsSheet.getRow(1).font = { bold: true, size: 16 }
  instructionsSheet.getRow(3).font = { bold: true, size: 12 }
  instructionsSheet.getRow(5).font = { bold: true, size: 12 }
  instructionsSheet.getRow(12).font = { bold: true, size: 12 }
  instructionsSheet.getRow(50).font = { bold: true, size: 12 }

  // Add Categories reference sheet
  const categoriesSheet = workbook.addWorksheet('Categories')
  categoriesSheet.columns = [
    { header: 'Category Label', key: 'categoryLabel', width: 30 },
    { header: 'Category ID', key: 'categoryId', width: 25 },
    { header: 'Subcategory Label', key: 'subcategoryLabel', width: 30 },
    { header: 'Subcategory ID', key: 'subcategoryId', width: 30 },
  ]

  // Style header
  categoriesSheet.getRow(1).font = { bold: true }
  categoriesSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  // Add category data
  if (menuGroups.length > 0) {
    menuGroups.forEach((group) => {
      if (group.subGroups.length > 0) {
        // Group with subgroups - add a row for each subgroup
        group.subGroups.forEach((sub) => {
          categoriesSheet.addRow({
            categoryLabel: group.label,
            categoryId: group.id,
            subcategoryLabel: sub.label,
            subcategoryId: sub.id,
          })
        })
      } else {
        // Group without subgroups
        categoriesSheet.addRow({
          categoryLabel: group.label,
          categoryId: group.id,
          subcategoryLabel: '',
          subcategoryId: '',
        })
      }
    })
  } else {
    categoriesSheet.addRow({
      categoryLabel: 'No categories defined yet',
      categoryId: '',
      subcategoryLabel: '',
      subcategoryId: '',
    })
  }

  // Add note at the bottom
  const lastRow = categoriesSheet.lastRow?.number || 1
  categoriesSheet.addRow({})
  categoriesSheet.getCell(`A${lastRow + 2}`).value = 'NOTE: Use either Label OR ID in the Products sheet'
  categoriesSheet.getCell(`A${lastRow + 2}`).font = { italic: true, color: { argb: 'FF666666' } }

  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'product_bulk_upload_template.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export async function parseProductExcel(
  file: File,
  menuGroups: MenuGroup[],
): Promise<{
  products: Array<{
    name: string
    menuGroupId: string
    menuSubGroupId?: string
    isExtra: boolean
    posCode?: string
    defaultUnitPrice?: number
    activeFrom?: Date | null
    activeTo?: Date | null
  }>
  errors: Array<{ row: number; productName: string; error: string }>
}> {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const worksheet = workbook.getWorksheet('Products') || workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('No worksheet found in Excel file')
  }

  const products: Array<{
    name: string
    menuGroupId: string
    menuSubGroupId?: string
    isExtra: boolean
    posCode?: string
    defaultUnitPrice?: number
    activeFrom?: Date | null
    activeTo?: Date | null
  }> = []
  
  const errors: Array<{ row: number; productName: string; error: string }> = []

  // Skip header row (row 1) and example rows
  let startRow = 2
  // Check if first data row is an example (contains "Example")
  const firstDataRow = worksheet.getRow(2)
  const firstNameCell = firstDataRow.getCell(1)?.value
  if (typeof firstNameCell === 'string' && firstNameCell.toLowerCase().includes('example')) {
    // Skip example rows (usually rows 2 and 3)
    startRow = 4
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return

    const name = String(row.getCell(1)?.value || '').trim()
    // Skip empty rows and example rows
    if (!name || name.toLowerCase().includes('example')) return

    // Get Category - can be Label (col 2) or ID (col 3)
    const categoryLabel = String(row.getCell(2)?.value || '').trim()
    const categoryId = String(row.getCell(3)?.value || '').trim()

    // Find menu group by label or ID
    let menuGroupId: string | null = null
    if (categoryId) {
      // Use ID if provided
      const groupById = menuGroups.find((g) => g.id === categoryId)
      if (groupById) {
        menuGroupId = categoryId
      } else {
        errors.push({
          row: rowNumber,
          productName: name,
          error: `Category ID "${categoryId}" not found. Available IDs: ${menuGroups.map(g => g.id).join(', ') || 'none'}`,
        })
        return
      }
    } else if (categoryLabel) {
      // Use Label if ID not provided
      const groupByLabel = menuGroups.find(
        (g) => g.label.toLowerCase().trim() === categoryLabel.toLowerCase().trim(),
      )
      if (groupByLabel) {
        menuGroupId = groupByLabel.id
      } else {
        errors.push({
          row: rowNumber,
          productName: name,
          error: `Category Label "${categoryLabel}" not found. Available labels: ${menuGroups.map(g => g.label).join(', ') || 'none'}`,
        })
        return
      }
    } else {
      errors.push({
        row: rowNumber,
        productName: name,
        error: 'Category (Label or ID) is required',
      })
      return
    }

    // Get Subcategory - can be Label (col 4) or ID (col 5)
    const subcategoryLabel = String(row.getCell(4)?.value || '').trim()
    const subcategoryId = String(row.getCell(5)?.value || '').trim()

    // Find subcategory by label or ID
    let menuSubGroupId: string | undefined = undefined
    const selectedGroup = menuGroups.find((g) => g.id === menuGroupId)
    if (selectedGroup) {
      if (subcategoryId) {
        // Use ID if provided
        const subById = selectedGroup.subGroups.find((sg) => sg.id === subcategoryId)
        if (subById) {
          menuSubGroupId = subcategoryId
        } else {
          // Subcategory ID not found, but don't fail - just log warning
          console.warn(`Subcategory ID "${subcategoryId}" not found in group "${selectedGroup.label}" for product "${name}"`)
        }
      } else if (subcategoryLabel) {
        // Use Label if ID not provided
        const subByLabel = selectedGroup.subGroups.find(
          (sg) => sg.label.toLowerCase().trim() === subcategoryLabel.toLowerCase().trim(),
        )
        if (subByLabel) {
          menuSubGroupId = subByLabel.id
        } else {
          // Subcategory Label not found, but don't fail - just log warning
          console.warn(`Subcategory Label "${subcategoryLabel}" not found in group "${selectedGroup.label}" for product "${name}"`)
        }
      }
    }

    const isExtraCell = row.getCell(6)?.value
    const isExtraStr = String(isExtraCell || '').trim().toLowerCase()
    const isExtra = isExtraStr === 'yes' || isExtraStr === 'true' || isExtraStr === '1'

    const posCodeCell = row.getCell(7)?.value
    const posCode = posCodeCell ? String(posCodeCell).trim() : undefined

    const priceCell = row.getCell(8)?.value
    const defaultUnitPrice = priceCell ? Number(priceCell) : undefined

    const activeFromCell = row.getCell(9)?.value
    let activeFrom: Date | null = null
    if (activeFromCell) {
      if (activeFromCell instanceof Date) {
        activeFrom = activeFromCell
      } else {
        const dateStr = String(activeFromCell).trim()
        if (dateStr) {
          const parsed = new Date(dateStr)
          if (!isNaN(parsed.getTime())) {
            activeFrom = parsed
          }
        }
      }
    }

    const activeToCell = row.getCell(10)?.value
    let activeTo: Date | null = null
    if (activeToCell) {
      if (activeToCell instanceof Date) {
        activeTo = activeToCell
      } else {
        const dateStr = String(activeToCell).trim()
        if (dateStr) {
          const parsed = new Date(dateStr)
          if (!isNaN(parsed.getTime())) {
            activeTo = parsed
          }
        }
      }
    }

    products.push({
      name,
      menuGroupId,
      menuSubGroupId: menuSubGroupId || undefined,
      isExtra,
      posCode: posCode || undefined,
      defaultUnitPrice: isNaN(defaultUnitPrice!) ? undefined : defaultUnitPrice,
      activeFrom,
      activeTo,
    })
  })

  return { products, errors }
}

// ---------------------------------------------------------------------------
// Product Allies Excel Template
// ---------------------------------------------------------------------------

export async function downloadProductAlliesTemplate(products: Array<{ id: string; name: string }>): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Product Allies')

  // Header row
  worksheet.columns = [
    { header: 'Sales Name (POS Name)', key: 'salesName', width: 40 },
    { header: 'Product Name', key: 'productName', width: 40 },
    { header: 'Product ID', key: 'productId', width: 30 },
  ]

  // Style header row
  worksheet.getRow(1).font = { bold: true }
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  // Add example rows
  if (products.length > 0) {
    const firstProduct = products[0]
    worksheet.addRow({
      salesName: 'COKE 330 ml',
      productName: firstProduct.name,
      productId: firstProduct.id,
    })
    worksheet.addRow({
      salesName: 'DIET COKE 330 ml',
      productName: firstProduct.name,
      productId: firstProduct.id,
    })
  }

  // Add Instructions sheet
  const instructionsSheet = workbook.addWorksheet('Instructions')
  instructionsSheet.columns = [{ key: 'instruction', width: 100 }]

  instructionsSheet.addRow({ instruction: 'PRODUCT ALLIES BULK UPLOAD TEMPLATE' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: 'HOW TO USE THIS TEMPLATE' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: 'STEP 1: Fill in the "Product Allies" sheet with your mapping data' })
  instructionsSheet.addRow({ instruction: 'STEP 2: Sales Name is the name from your POS system/report' })
  instructionsSheet.addRow({ instruction: 'STEP 3: Use either Product Name OR Product ID (both work)' })
  instructionsSheet.addRow({ instruction: 'STEP 4: Save the file and upload it using the Bulk Upload feature' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: 'COLUMN DESCRIPTIONS' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '1. Sales Name (POS Name) (REQUIRED)' })
  instructionsSheet.addRow({ instruction: '   → The exact name from your POS system or sales report' })
  instructionsSheet.addRow({ instruction: '   → Example: "COKE 330 ml", "THE ENGLISH BREAKFAST"' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '2. Product Name (REQUIRED - Use Name OR ID)' })
  instructionsSheet.addRow({ instruction: '   → The name of the product in your system' })
  instructionsSheet.addRow({ instruction: '   → OR use the Product ID from the Products sheet' })
  instructionsSheet.addRow({ instruction: '   → Must match an existing product' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '3. Product ID (REQUIRED - Use Name OR ID)' })
  instructionsSheet.addRow({ instruction: '   → The unique ID of the product' })
  instructionsSheet.addRow({ instruction: '   → OR use the Product Name instead' })
  instructionsSheet.addRow({ instruction: '   → See Products sheet for available IDs' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: 'IMPORTANT NOTES' })
  instructionsSheet.addRow({ instruction: '═══════════════════════════════════════════════════════════════════════════════' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: '• Product Allies are checked FIRST during product matching' })
  instructionsSheet.addRow({ instruction: '• This takes priority over all other matching methods' })
  instructionsSheet.addRow({ instruction: '• You can use EITHER Product Name OR Product ID (not both required)' })
  instructionsSheet.addRow({ instruction: '• If you use Name, the system will automatically find the matching ID' })
  instructionsSheet.addRow({ instruction: '• Sales Name should match exactly as it appears in your POS reports' })
  instructionsSheet.addRow({ instruction: '• Example rows can be deleted - they are just for reference' })
  instructionsSheet.addRow({ instruction: '• Empty rows will be skipped automatically' })
  instructionsSheet.addRow({ instruction: '' })

  // Style instructions
  instructionsSheet.getRow(1).font = { bold: true, size: 16 }
  instructionsSheet.getRow(3).font = { bold: true, size: 12 }
  instructionsSheet.getRow(5).font = { bold: true, size: 12 }
  instructionsSheet.getRow(12).font = { bold: true, size: 12 }
  instructionsSheet.getRow(30).font = { bold: true, size: 12 }

  // Add Products reference sheet
  const productsSheet = workbook.addWorksheet('Products')
  productsSheet.columns = [
    { header: 'Product Name', key: 'productName', width: 40 },
    { header: 'Product ID', key: 'productId', width: 30 },
  ]

  // Style header
  productsSheet.getRow(1).font = { bold: true }
  productsSheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' },
  }

  // Add product data
  if (products.length > 0) {
    products.forEach((product) => {
      productsSheet.addRow({
        productName: product.name,
        productId: product.id,
      })
    })
  } else {
    productsSheet.addRow({
      productName: 'No products defined yet',
      productId: '',
    })
  }

  // Add note at the bottom
  const lastRow = productsSheet.lastRow?.number || 1
  productsSheet.addRow({})
  productsSheet.getCell(`A${lastRow + 2}`).value = 'NOTE: Use either Product Name OR Product ID in the Product Allies sheet'
  productsSheet.getCell(`A${lastRow + 2}`).font = { italic: true, color: { argb: 'FF666666' } }

  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'product_allies_template.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

type ParsedAlly = { salesName: string; productId: string }
type ParseError = { row: number; salesName: string; error: string }

export async function parseProductAlliesExcel(
  file: File,
  products: Array<{ id: string; name: string }>,
): Promise<{ allies: ParsedAlly[]; errors: ParseError[] }> {
  // CRITICAL: Ensure products is always an array, never a number
  const safeProducts = Array.isArray(products) ? products : []
  
  // Always initialize as arrays - never use 0 as a sentinel
  const allies: ParsedAlly[] = []
  const errors: ParseError[] = []
  
  try {
    const buffer = await file.arrayBuffer()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)

    // Safely get worksheets - ensure it's an array
    const worksheets = Array.isArray(workbook.worksheets) ? workbook.worksheets : []
    if (worksheets.length === 0) {
      return {
        allies: [],
        errors: [{ row: 0, salesName: '', error: 'No worksheets found in Excel file' }],
      }
    }

    // Try to get 'Product Allies' worksheet, fallback to first worksheet
    const worksheet = workbook.getWorksheet('Product Allies') || worksheets[0]
    if (!worksheet) {
      return {
        allies: [],
        errors: [{ row: 0, salesName: '', error: 'No worksheet found in Excel file' }],
      }
    }

    // Skip header row (row 1) and example rows
    let startRow = 2
    
    // Safely check first data row
    try {
      const firstDataRow = worksheet.getRow(2)
      const firstSalesNameCell = firstDataRow?.getCell(1)?.value
      if (
        typeof firstSalesNameCell === 'string' &&
        (firstSalesNameCell.includes('COKE') || firstSalesNameCell.toLowerCase().includes('example'))
      ) {
        // Skip example rows (usually rows 2 and 3)
        startRow = 4
      }
    } catch {
      // If row access fails, continue with default startRow
    }

    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber < startRow) return

      const salesName = String(row.getCell(1)?.value || '').trim()
      // Skip empty rows and example rows
      if (!salesName || salesName.toLowerCase().includes('example')) return

      // Get Product - can be Name (col 2) or ID (col 3)
      const productName = String(row.getCell(2)?.value || '').trim()
      const productId = String(row.getCell(3)?.value || '').trim()

      // Find product by name or ID
      let foundProductId: string | null = null
      if (productId) {
        // Use ID if provided
        const productById = safeProducts.find((p) => p.id === productId)
        if (productById) {
          foundProductId = productId
        } else {
          errors.push({
            row: rowNumber,
            salesName,
            error: `Product ID "${productId}" not found. Available IDs: ${safeProducts.map(p => p.id).join(', ') || 'none'}`,
          })
          return
        }
      } else if (productName) {
        // Use Name if ID not provided
        const productByName = safeProducts.find(
          (p) => p.name.toLowerCase().trim() === productName.toLowerCase().trim(),
        )
        if (productByName) {
          foundProductId = productByName.id
        } else {
          errors.push({
            row: rowNumber,
            salesName,
            error: `Product Name "${productName}" not found. Available names: ${safeProducts.map(p => p.name).join(', ') || 'none'}`,
          })
          return
        }
      } else {
        errors.push({
          row: rowNumber,
          salesName,
          error: 'Product Name or Product ID is required',
        })
        return
      }

      if (foundProductId) {
        allies.push({
          salesName,
          productId: foundProductId,
        })
      }
    })

    // Always return a valid structure with arrays (never 0)
    return { allies, errors }
  } catch (error) {
    // Ensure we always return a valid structure even on error (always arrays, never 0)
    return {
      allies: [],
      errors: [
        {
          row: 0,
          salesName: '',
          error: error instanceof Error ? error.message : 'Failed to parse Excel file',
        },
      ],
    }
  }
}

