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
    <aside className="hidden w-72 flex-col border-r border-border bg-white px-6 py-8 lg:flex">
      <div className="mb-10 flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white shadow-lg shadow-primary/20">
          <BarChart2 className="h-6 w-6" />
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-400">
            SCALES
          </div>
          <div className="text-lg font-bold text-gray-900 leading-tight">
            Analytics
          </div>
        </div>
      </div>

      <nav className="space-y-1.5 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-primary text-white shadow-md shadow-primary/25'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                )
              }
              end={item.to === '/'}
            >
              <Icon className={clsx("h-5 w-5 transition-colors", ({ isActive }: { isActive: boolean }) => isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-600')} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-auto rounded-2xl border border-border bg-gray-50 p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-lg font-bold text-primary">
            {workspaceName.charAt(0)}
          </div>
          <div className="overflow-hidden">
            <p className="truncate font-semibold text-gray-900 text-sm">{workspaceName}</p>
            <p className="text-xs text-gray-500 truncate">{currency} • Updated hourly</p>
          </div>
        </div>
      </div>
    </aside>
  )
}


