import { NavLink } from 'react-router-dom'
import {
  BarChart2,
  ChartLine,
  FileText,
  ListChecks,
  Settings2,
  Upload,
  Link2,
  TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'
import { useWorkspace } from '../../context/WorkspaceContext'

const navItems = [
  { label: 'Overview', icon: BarChart2, to: '/' },
  { label: 'Lifecycle', icon: ChartLine, to: '/lifecycle' },
  { label: 'Products', icon: ListChecks, to: '/products' },
  { label: 'Reports', icon: FileText, to: '/reports' },
  { label: 'Analytics', icon: TrendingUp, to: '/analytics' },
  { label: 'Performance', icon: TrendingUp, to: '/reports/performance' },
  { label: 'Upload Report', icon: Upload, to: '/reports/upload' },
  { label: 'Settings', icon: Settings2, to: '/settings/menu-groups' },
  { label: 'Product Allies', icon: Link2, to: '/settings/product-allies' },
]

export function Sidebar() {
  const { workspaceName, currency } = useWorkspace()

  return (
    <aside className="hidden w-60 flex-col border-r border-gray-200 bg-white lg:flex">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-900 text-white">
          <BarChart2 className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-gray-900">Scales Analytics</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-0.5 px-3 py-2">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium transition-colors duration-150',
                  isActive
                    ? 'bg-gray-100 text-gray-900'
                    : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700',
                )
              }
              end={item.to === '/'}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      {/* Workspace info */}
      <div className="border-t border-gray-200 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
            {workspaceName.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium text-gray-900">{workspaceName}</p>
            <p className="text-[11px] text-gray-400">{currency}</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
