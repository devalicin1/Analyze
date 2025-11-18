import { useState } from 'react'
import { seedWorkspaceData } from '../../lib/seed/seedWorkspaceData'
import { useWorkspace } from '../../context/WorkspaceContext'

export function SeedDataPage() {
  const workspace = useWorkspace()
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string>('')

  async function handleSeed() {
    try {
      setStatus('running')
      setMessage('')
      await seedWorkspaceData(workspace)
      setStatus('done')
      setMessage('Workspace seeded successfully.')
    } catch (error) {
      console.error(error)
      setStatus('error')
      setMessage('Failed to seed workspace. Check console for details.')
    }
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="page-title">Seed test data</h1>
        <p className="text-sm text-gray-500">
          Creates menu groups, products, and sample reports for the current workspace.
        </p>
      </header>
      <div className="app-card space-y-4">
        <p className="text-sm text-gray-600">
          This action overwrites existing documents in the dev workspace. Only available in
          development mode.
        </p>
        <button
          onClick={handleSeed}
          disabled={status === 'running'}
          className="inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'running' ? 'Seeding...' : 'Seed workspace data'}
        </button>
        {message && (
          <p
            className={
              status === 'error' ? 'text-sm text-red-500' : 'text-sm text-green-600'
            }
          >
            {message}
          </p>
        )}
      </div>
    </section>
  )
}


