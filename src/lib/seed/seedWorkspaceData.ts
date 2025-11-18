import { saveMenuGroups } from '../api/menuGroups'
import { saveProduct } from '../api/products'
import { createSalesReport } from '../api/salesReports'
import { mockMenuGroups, mockProducts, mockSalesReports } from '../api/mockData'
import type { WorkspaceScope } from '../types'

export async function seedWorkspaceData(scope: WorkspaceScope) {
  await saveMenuGroups(scope, mockMenuGroups)

  for (const product of mockProducts) {
    await saveProduct(scope, product)
  }

  for (const report of mockSalesReports) {
    const { id, ...rest } = report
    void id // id is not needed for createSalesReport
    await createSalesReport(scope, rest)
  }
}


