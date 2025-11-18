import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  serverTimestamp,
  where,
  deleteDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { USE_MOCK_DATA } from './dataSource'
import type { ProductMapping, WorkspaceScope } from '../types'

const mappingsPath = (scope: WorkspaceScope) =>
  `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/productMappings`

const collectionRef = (scope: WorkspaceScope) => collection(db, mappingsPath(scope))

/**
 * Get all saved product mappings for a workspace
 */
export async function getProductMappings(scope: WorkspaceScope): Promise<Record<string, string>> {
  if (USE_MOCK_DATA) {
    return {}
  }

  const snapshot = await getDocs(collectionRef(scope))
  const mappings: Record<string, string> = {}
  
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as Omit<ProductMapping, 'id'>
    mappings[data.unmappedProductName] = data.productId
  })

  return mappings
}

/**
 * Get a specific mapping by unmapped product name
 */
export async function getProductMapping(
  scope: WorkspaceScope,
  unmappedProductName: string,
): Promise<string | null> {
  if (USE_MOCK_DATA) {
    return null
  }

  const q = query(collectionRef(scope), where('unmappedProductName', '==', unmappedProductName))
  const snapshot = await getDocs(q)
  
  if (snapshot.empty) {
    return null
  }

  const data = snapshot.docs[0].data() as Omit<ProductMapping, 'id'>
  return data.productId
}

/**
 * Save or update a product mapping
 */
export async function saveProductMapping(
  scope: WorkspaceScope,
  unmappedProductName: string,
  productId: string,
  userId: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    return
  }

  // Check if mapping already exists
  const q = query(collectionRef(scope), where('unmappedProductName', '==', unmappedProductName))
  const snapshot = await getDocs(q)

  if (!snapshot.empty) {
    // Update existing mapping
    const existingDoc = snapshot.docs[0]
    await setDoc(
      doc(db, `${mappingsPath(scope)}/${existingDoc.id}`),
      {
        productId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } else {
    // Create new mapping
    const newDocRef = doc(collectionRef(scope))
    await setDoc(newDocRef, {
      unmappedProductName,
      productId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUserId: userId,
    })
  }
}

/**
 * Save multiple product mappings at once
 */
export async function saveProductMappings(
  scope: WorkspaceScope,
  mappings: Record<string, string>,
  userId: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    return
  }

  // Get existing mappings
  const existingSnapshot = await getDocs(collectionRef(scope))
  const existingMap = new Map<string, string>()
  existingSnapshot.forEach((docSnap) => {
    const data = docSnap.data() as Omit<ProductMapping, 'id'>
    existingMap.set(data.unmappedProductName, docSnap.id)
  })

  // Save or update each mapping
  for (const [unmappedName, productId] of Object.entries(mappings)) {
    const existingId = existingMap.get(unmappedName)
    
    if (existingId) {
      // Update existing
      await setDoc(
        doc(db, `${mappingsPath(scope)}/${existingId}`),
        {
          productId,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )
    } else {
      // Create new
      const newDocRef = doc(collectionRef(scope))
      await setDoc(newDocRef, {
        unmappedProductName: unmappedName,
        productId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUserId: userId,
      })
    }
  }
}

/**
 * Delete a product mapping
 */
export async function deleteProductMapping(
  scope: WorkspaceScope,
  unmappedProductName: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    return
  }

  const q = query(collectionRef(scope), where('unmappedProductName', '==', unmappedProductName))
  const snapshot = await getDocs(q)

  if (!snapshot.empty) {
    await deleteDoc(doc(db, `${mappingsPath(scope)}/${snapshot.docs[0].id}`))
  }
}

/**
 * Get all product mappings as a list (for management UI)
 */
export async function listProductMappings(scope: WorkspaceScope): Promise<ProductMapping[]> {
  if (USE_MOCK_DATA) {
    return []
  }

  const snapshot = await getDocs(collectionRef(scope))
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ProductMapping, 'id'>),
  }))
}

