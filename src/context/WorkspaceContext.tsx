/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { subDays } from 'date-fns'

export type DateRange = {
  label: string
  start: Date
  end: Date
}

export type WorkspaceContextValue = {
  tenantId: string
  workspaceId: string
  workspaceName: string
  currency: string
  timezone: string
  dateRange: DateRange
  setDateRange: (next: DateRange) => void
}

const defaultRange: DateRange = {
  label: 'Last 30 days',
  start: subDays(new Date(), 29),
  end: new Date(),
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  tenantId: 'testTenant',
  workspaceId: 'testWorkspace',
  workspaceName: 'Artysansz, London',
  currency: 'GBP',
  timezone: 'Europe/London',
  dateRange: defaultRange,
  setDateRange: () => undefined,
})

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRange] = useState(defaultRange)

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      tenantId: 'testTenant',
      workspaceId: 'testWorkspace',
      workspaceName: 'Artysansz, London',
      currency: 'GBP',
      timezone: 'Europe/London',
      dateRange,
      setDateRange,
    }),
    [dateRange],
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}


