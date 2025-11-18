import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '../firebase'
import { USE_MOCK_DATA } from './dataSource'
import { mockMetrics } from './mockData'
import type { MetricDoc, WorkspaceScope } from '../types'

const metricsPath = (scope: WorkspaceScope) =>
  `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/metrics`

export async function listMetrics(
  scope: WorkspaceScope,
  options?: { type?: MetricDoc['type']; periodKey?: string },
) {
  if (USE_MOCK_DATA) {
    return mockMetrics.filter((metric) => {
      if (options?.type && metric.type !== options.type) return false
      if (options?.periodKey && metric.periodKey !== options.periodKey) return false
      return true
    })
  }

  const constraints: QueryConstraint[] = [orderBy('periodKey', 'desc')]
  if (options?.type) {
    constraints.push(where('type', '==', options.type))
  }
  if (options?.periodKey) {
    constraints.push(where('periodKey', '==', options.periodKey))
  }

  const q = query(collection(db, metricsPath(scope)), ...constraints)
  const snapshot = await getDocs(q)
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<MetricDoc, 'id'>),
  }))
}


