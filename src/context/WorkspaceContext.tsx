/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { subDays } from 'date-fns'
import {
  createWorkspace,
  DEFAULT_WORKSPACE,
  listWorkspaces,
} from '../lib/api/workspaces'
import { fetchDataDateRange } from '../lib/api/analytics'
import type { Workspace } from '../lib/types'

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
  // Full span of the workspace's data ("All data"), or null if none yet.
  dataRange: DateRange | null
  // Multi-restaurant support
  workspaces: Workspace[]
  setWorkspaceId: (id: string) => void
  addWorkspace: (input: Omit<Workspace, 'id'>) => Promise<Workspace>
  refreshWorkspaces: () => Promise<void>
}

const TENANT_ID = 'testTenant'
const STORAGE_KEY = 'analyzer.selectedWorkspaceId'

const defaultRange: DateRange = {
  label: 'Last 30 days',
  start: subDays(new Date(), 29),
  end: new Date(),
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  tenantId: TENANT_ID,
  workspaceId: DEFAULT_WORKSPACE.id,
  workspaceName: DEFAULT_WORKSPACE.name,
  currency: DEFAULT_WORKSPACE.currency,
  timezone: DEFAULT_WORKSPACE.timezone,
  dateRange: defaultRange,
  setDateRange: () => undefined,
  dataRange: null,
  workspaces: [DEFAULT_WORKSPACE],
  setWorkspaceId: () => undefined,
  addWorkspace: async () => DEFAULT_WORKSPACE,
  refreshWorkspaces: async () => undefined,
})

function readStoredWorkspaceId(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_WORKSPACE.id
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_WORKSPACE.id
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [dateRange, setDateRangeState] = useState(defaultRange)
  const [dataRange, setDataRange] = useState<DateRange | null>(null)
  const [workspaces, setWorkspaces] = useState<Workspace[]>([DEFAULT_WORKSPACE])
  const [workspaceId, setWorkspaceIdState] = useState<string>(readStoredWorkspaceId)

  // Tracks whether the current date range is auto-managed (true) or was picked
  // by the user (false). Reset to auto on each workspace switch so each
  // restaurant opens on its own data span.
  const autoRangeRef = useRef(true)

  // A user-initiated date range change opts out of auto-defaulting.
  const setDateRange = useCallback((next: DateRange) => {
    autoRangeRef.current = false
    setDateRangeState(next)
  }, [])

  // Stable callbacks so the context value keeps a stable identity across
  // renders — consumers key data-fetching effects on the whole `workspace`
  // object, so an unstable value would cause refetch loops.
  const setWorkspaceId = useCallback((id: string) => {
    setWorkspaceIdState(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [])

  // On workspace switch (and initial mount), discover the data span and — unless
  // the user has manually picked a range — default the dashboard to "All data"
  // so the Overview shows the workspace's full picture instead of an empty
  // window that happens not to overlap the (historical) data.
  useEffect(() => {
    let cancelled = false
    autoRangeRef.current = true
    setDataRange(null)
    fetchDataDateRange({ tenantId: TENANT_ID, workspaceId })
      .then((span) => {
        if (cancelled || !span) return
        const all: DateRange = { label: 'All data', start: span.start, end: span.end }
        setDataRange(all)
        if (autoRangeRef.current) setDateRangeState(all)
      })
      .catch(() => {
        /* leave the default range if data range can't be determined */
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const refreshWorkspaces = useCallback(async () => {
    const list = await listWorkspaces(TENANT_ID)
    setWorkspaces(list)
  }, [])

  const addWorkspace = useCallback(
    async (input: Omit<Workspace, 'id'>) => {
      const created = await createWorkspace(TENANT_ID, input)
      await refreshWorkspaces()
      return created
    },
    [refreshWorkspaces],
  )

  useEffect(() => {
    void refreshWorkspaces()
  }, [refreshWorkspaces])

  // Metadata for the currently selected restaurant. Falls back to the default
  // while the list is still loading, but `workspaceId` always drives queries.
  const current =
    workspaces.find((w) => w.id === workspaceId) ?? DEFAULT_WORKSPACE

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      tenantId: TENANT_ID,
      workspaceId,
      workspaceName: current.name,
      currency: current.currency,
      timezone: current.timezone,
      dateRange,
      setDateRange,
      dataRange,
      workspaces,
      setWorkspaceId,
      addWorkspace,
      refreshWorkspaces,
    }),
    [
      workspaceId,
      current.name,
      current.currency,
      current.timezone,
      dateRange,
      setDateRange,
      dataRange,
      workspaces,
      setWorkspaceId,
      addWorkspace,
      refreshWorkspaces,
    ],
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
