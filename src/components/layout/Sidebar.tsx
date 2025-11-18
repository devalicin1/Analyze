import { NavLink } from 'react-router-dom'
import {
  BarChart2,
  ChartLine,
  FileText,
  Layers,
  LineChart,
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
  { label: 'Trends', icon: LineChart, to: '/trends' },
  { label: 'Extras', icon: Layers, to: '/extras' },
  { label: 'Lifecycle', icon: ChartLine, to: '/lifecycle' },
  { label: 'Products', icon: ListChecks, to: '/products' },
  { label: 'Reports', icon: FileText, to: '/reports' },
  { label: 'Performance', icon: TrendingUp, to: '/reports/performance' },
  { label: 'Upload Report', icon: Upload, to: '/reports/upload' },
  { label: 'Settings', icon: Settings2, to: '/settings/menu-groups' },
  { label: 'Product Allies', icon: Link2, to: '/settings/product-allies' },
]

export function Sidebar() {
  const { workspaceName, currency } = useWorkspace()

  return (
    <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white/90 px-4 py-6 backdrop-blur lg:flex">
      <div className="mb-8">
        <div className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
          SCALES
        </div>
        <div className="mt-1 text-2xl font-semibold text-gray-900">
          Multi-Restaurant
        </div>
      </div>
      <nav className="space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary-muted text-primary shadow-sm'
                    : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900',
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
      <div className="mt-auto rounded-2xl bg-gray-50 px-3 py-4 text-xs text-gray-500">
        <p className="font-semibold text-gray-900">{workspaceName}</p>
        <p>Primary currency: {currency}</p>
        <p>Data refreshed hourly</p>
      </div>
    </aside>
  )
}


