import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'
import { OverviewPage } from '../pages/dashboard/OverviewPage'
import { TrendsPage } from '../pages/dashboard/TrendsPage'
import { ExtrasPage } from '../pages/dashboard/ExtrasPage'
import { LifecyclePage } from '../pages/dashboard/LifecyclePage'
import { ProductsListPage } from '../pages/products/ProductsListPage'
import { EditProductPage } from '../pages/products/EditProductPage'
import { ReportsPage } from '../pages/reports/ReportsPage'
import { PerformanceReportPage } from '../pages/reports/PerformanceReportPage'
import { UploadReportPage } from '../pages/reports/UploadReportPage'
import { ReportDetailPage } from '../pages/reports/ReportDetailPage'
import { MenuGroupsSettingsPage } from '../pages/settings/MenuGroupsSettingsPage'
import { ProductAlliesPage } from '../pages/settings/ProductAlliesPage'
import { SeedDataPage } from '../pages/dev/SeedDataPage'

const devRoutes =
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEV_ROUTES !== 'false'
    ? [{ path: '/dev/seed', element: <SeedDataPage /> }]
    : []

const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'trends', element: <TrendsPage /> },
      { path: 'extras', element: <ExtrasPage /> },
      { path: 'lifecycle', element: <LifecyclePage /> },
      { path: 'products', element: <ProductsListPage /> },
      { path: 'products/:productId', element: <EditProductPage /> },
      { path: 'reports', element: <ReportsPage /> },
      { path: 'reports/performance', element: <PerformanceReportPage /> },
      { path: 'reports/upload', element: <UploadReportPage /> },
      { path: 'reports/:reportId', element: <ReportDetailPage /> },
      { path: 'settings/menu-groups', element: <MenuGroupsSettingsPage /> },
      { path: 'settings/product-allies', element: <ProductAlliesPage /> },
      ...devRoutes,
    ],
  },
])

export function AppRoutes() {
  return <RouterProvider router={router} />
}


