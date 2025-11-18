import type { ReactNode } from 'react'
import { AuthProvider } from './AuthContext'
import { WorkspaceProvider } from './WorkspaceContext'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <WorkspaceProvider>{children}</WorkspaceProvider>
    </AuthProvider>
  )
}


