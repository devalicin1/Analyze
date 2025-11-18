import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { USE_MOCK_DATA } from './dataSource'
import { mockMenuGroups } from './mockData'
import type { MenuGroup, WorkspaceScope } from '../types'

const settingsDocPath = (scope: WorkspaceScope) =>
  `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/settings/menuGroupsConfig`

export async function getMenuGroups(scope: WorkspaceScope): Promise<MenuGroup[]> {
  if (USE_MOCK_DATA) {
    return mockMenuGroups
  }

  const ref = doc(db, settingsDocPath(scope))
  const snap = await getDoc(ref)
  if (!snap.exists()) return []
  const data = snap.data() as { groups?: MenuGroup[] }
  return data.groups ?? []
}

export async function saveMenuGroups(scope: WorkspaceScope, groups: MenuGroup[]) {
  if (USE_MOCK_DATA) {
    return groups
  }

  const ref = doc(db, settingsDocPath(scope))
  await setDoc(
    ref,
    {
      groups,
    },
    { merge: true },
  )
}


