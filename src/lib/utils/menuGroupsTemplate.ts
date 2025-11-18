import ExcelJS from 'exceljs'
import type { MenuGroup } from '../types'

export async function downloadMenuGroupsTemplate(menuGroups: MenuGroup[]): Promise<void> {
  const workbook = new ExcelJS.Workbook()
  const worksheet = workbook.addWorksheet('Menu Groups')

  // Header row
  worksheet.columns = [
    { header: 'Group Label', key: 'groupLabel', width: 30 },
    { header: 'Color (Hex)', key: 'color', width: 15 },
    { header: 'Sub Group Label', key: 'subGroupLabel', width: 30 },
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

    // Example: Group with subgroups
    worksheet.addRow({
      groupLabel: 'Example Group 1',
      color: '#FF5733',
      subGroupLabel: 'Example Subgroup 1',
    })

    // Example: Same group, different subgroup
    worksheet.addRow({
      groupLabel: '', // Empty means same group
      color: '', // Empty means same color
      subGroupLabel: 'Example Subgroup 2',
    })

    // Example: Group without subgroups
    worksheet.addRow({
      groupLabel: 'Example Group 2',
      color: '#0F8BFD',
      subGroupLabel: '',
    })
  } else {
    // Default examples if no groups exist
    worksheet.addRow({
      groupLabel: 'Example Group 1',
      color: '#FF5733',
      subGroupLabel: 'Example Subgroup 1',
    })
    worksheet.addRow({
      groupLabel: '',
      color: '',
      subGroupLabel: 'Example Subgroup 2',
    })
    worksheet.addRow({
      groupLabel: 'Example Group 2',
      color: '#0F8BFD',
      subGroupLabel: '',
    })
  }

  // Add instructions sheet
  const instructionsSheet = workbook.addWorksheet('Instructions')
  instructionsSheet.columns = [{ key: 'instruction', width: 80 }]

  instructionsSheet.addRow({ instruction: 'MENU GROUPS BULK UPLOAD TEMPLATE' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: 'INSTRUCTIONS:' })
  instructionsSheet.addRow({ instruction: '1. Fill in the Menu Groups sheet with your menu group data' })
  instructionsSheet.addRow({ instruction: '2. Group Label: Required - The name of the menu group' })
  instructionsSheet.addRow({ instruction: '3. Color: Optional - Hex color code (e.g., #FF5733). Default: #0F8BFD' })
  instructionsSheet.addRow({ instruction: '4. Sub Group Label: Optional - Leave empty for groups without subgroups' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: 'IMPORTANT NOTES:' })
  instructionsSheet.addRow({ instruction: '- Group IDs are automatically generated - you don\'t need to enter them' })
  instructionsSheet.addRow({ instruction: '- To add subgroups to a group, use multiple rows with the same Group Label' })
  instructionsSheet.addRow({ instruction: '- Leave Group Label and Color empty for subsequent rows of the same group' })
  instructionsSheet.addRow({ instruction: '- Each group must have at least one row with Group Label filled' })
  instructionsSheet.addRow({ instruction: '' })
  instructionsSheet.addRow({ instruction: 'CURRENT MENU GROUPS:' })

  if (menuGroups.length > 0) {
    menuGroups.forEach((group) => {
      instructionsSheet.addRow({ instruction: `  - ${group.label} (ID: ${group.id}) - Color: ${group.color}` })
      if (group.subGroups.length > 0) {
        group.subGroups.forEach((sub) => {
          instructionsSheet.addRow({ instruction: `    └─ ${sub.label} (ID: ${sub.id})` })
        })
      } else {
        instructionsSheet.addRow({ instruction: '    └─ No subgroups' })
      }
    })
  } else {
    instructionsSheet.addRow({ instruction: '  No menu groups defined yet.' })
  }

  // Style instructions
  instructionsSheet.getRow(1).font = { bold: true, size: 14 }
  instructionsSheet.getRow(3).font = { bold: true }
  instructionsSheet.getRow(11).font = { bold: true }

  // Generate Excel file
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'menu_groups_bulk_upload_template.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

export async function parseMenuGroupsExcel(file: File): Promise<MenuGroup[]> {
  const buffer = await file.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)

  const worksheet = workbook.getWorksheet('Menu Groups') || workbook.worksheets[0]
  if (!worksheet) {
    throw new Error('No worksheet found in Excel file')
  }

  // Group data by group ID
  const groupsMap = new Map<
    string,
    {
      id: string
      label: string
      color: string
      subGroups: Array<{ id: string; label: string }>
    }
  >()

  // Track current group for rows with empty group label
  let currentGroupId: string | null = null

  // Skip header row (row 1) and example rows
  let startRow = 2
  const firstDataRow = worksheet.getRow(2)
  const firstGroupLabelCell = firstDataRow.getCell(1)?.value
  if (typeof firstGroupLabelCell === 'string' && firstGroupLabelCell.toLowerCase().includes('example')) {
    startRow = 4
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < startRow) return

    const groupLabelCell = row.getCell(1)?.value
    const colorCell = row.getCell(2)?.value
    const subGroupLabelCell = row.getCell(3)?.value

    const groupLabel = groupLabelCell ? String(groupLabelCell).trim() : ''
    const color = colorCell ? String(colorCell).trim() : ''
    const subGroupLabel = subGroupLabelCell ? String(subGroupLabelCell).trim() : ''

    // Skip empty rows and example rows
    if (!groupLabel && !subGroupLabel) return
    if (groupLabel.toLowerCase().includes('example')) return

    // Determine group ID - auto-generate based on group label
    let effectiveGroupId: string
    if (groupLabel) {
      // Check if we already have a group with this label
      const existingGroup = Array.from(groupsMap.values()).find((g) => g.label === groupLabel)
      if (existingGroup) {
        effectiveGroupId = existingGroup.id
        currentGroupId = effectiveGroupId
      } else {
        // Generate new ID for new group based on label
        const sanitizedLabel = groupLabel
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
        effectiveGroupId = `group_${sanitizedLabel}_${Date.now()}`
        currentGroupId = effectiveGroupId
      }
    } else if (currentGroupId) {
      // Use current group if label is empty
      effectiveGroupId = currentGroupId
    } else {
      // Skip row if no group label and no current group
      return
    }

    // If group label is provided, create or update group
    if (groupLabel) {
      const existingGroup = groupsMap.get(effectiveGroupId)
      if (existingGroup) {
        // Update existing group
        existingGroup.label = groupLabel
        if (color) existingGroup.color = color
      } else {
        // Create new group
        groupsMap.set(effectiveGroupId, {
          id: effectiveGroupId,
          label: groupLabel,
          color: color || '#0F8BFD',
          subGroups: [],
        })
      }
    }

    // If subgroup is provided, add it to the group
    if (subGroupLabel) {
      const group = groupsMap.get(effectiveGroupId)
      // Generate subgroup ID based on label
      const sanitizedSubLabel = subGroupLabel
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
      const subGroupId = `${effectiveGroupId}_sub_${sanitizedSubLabel}_${Date.now()}`

      if (group) {
        // Check if subgroup with same label already exists
        const existingSubGroup = group.subGroups.find((sg) => sg.label === subGroupLabel)
        if (!existingSubGroup) {
          group.subGroups.push({
            id: subGroupId,
            label: subGroupLabel,
          })
        }
      } else {
        // Create group if it doesn't exist yet (shouldn't happen, but safety check)
        groupsMap.set(effectiveGroupId, {
          id: effectiveGroupId,
          label: groupLabel || `Group ${effectiveGroupId}`,
          color: color || '#0F8BFD',
          subGroups: [
            {
              id: subGroupId,
              label: subGroupLabel,
            },
          ],
        })
      }
    }
  })

  // Convert map to array
  return Array.from(groupsMap.values())
}

