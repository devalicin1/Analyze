import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { USE_MOCK_DATA } from './dataSource'
import type { Workspace } from '../types'

/**
 * The original single-restaurant workspace. Its data lives under
 * `tenants/testTenant/workspaces/testWorkspace/...` and was created via
 * subcollections without a parent metadata document, so it won't always be
 * returned by a `workspaces` collection query — we always merge it into the
 * list client-side.
 */
export const DEFAULT_WORKSPACE: Workspace = {
  id: 'testWorkspace',
  name: 'Artysansz, London',
  currency: 'GBP',
  timezone: 'Europe/London',
}

const workspacesPath = (tenantId: string) => `tenants/${tenantId}/workspaces`

/**
 * List every restaurant (workspace) registered under a tenant. The default
 * workspace is always included even if it has no metadata document yet.
 */
export async function listWorkspaces(tenantId: string): Promise<Workspace[]> {
  if (USE_MOCK_DATA) return [DEFAULT_WORKSPACE]

  const snapshot = await getDocs(collection(db, workspacesPath(tenantId)))

  // Map keyed by id so a real `testWorkspace` doc (e.g. after a rename)
  // overrides the hardcoded default, and duplicates collapse.
  const byId = new Map<string, Workspace>()
  byId.set(DEFAULT_WORKSPACE.id, DEFAULT_WORKSPACE)

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data()
    // Skip phantom parent docs that only hold subcollections (no metadata).
    if (!data?.name) return
    byId.set(docSnap.id, {
      id: docSnap.id,
      name: data.name,
      currency: data.currency ?? DEFAULT_WORKSPACE.currency,
      timezone: data.timezone ?? DEFAULT_WORKSPACE.timezone,
    })
  })

  return Array.from(byId.values())
}

/**
 * Create a new restaurant (workspace) under a tenant. A Firestore auto-id is
 * used as the workspaceId; its sales/products/etc. subcollections are created
 * lazily as data is added under `tenants/{tenantId}/workspaces/{id}/...`.
 */
export async function createWorkspace(
  tenantId: string,
  input: Omit<Workspace, 'id'>,
): Promise<Workspace> {
  if (USE_MOCK_DATA) {
    return { id: `mock_${input.name.replace(/\s+/g, '_').toLowerCase()}`, ...input }
  }

  const docRef = doc(collection(db, workspacesPath(tenantId)))
  await setDoc(docRef, { ...input, createdAt: serverTimestamp() })
  return { id: docRef.id, ...input }
}
