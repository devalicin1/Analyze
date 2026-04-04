import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-white text-gray-900">
      <Sidebar />
      <div className="flex flex-1 flex-col min-w-0">
        <Topbar />
        <main className="flex-1 overflow-x-hidden px-6 py-6 lg:px-8">
          <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}


