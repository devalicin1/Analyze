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
  writeBatch,
} from 'firebase/firestore'
import { db } from '../firebase'
import { USE_MOCK_DATA } from './dataSource'
import type { ProductAlly, WorkspaceScope } from '../types'

const alliesPath = (scope: WorkspaceScope) =>
  `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/productAllies`

const collectionRef = (scope: WorkspaceScope) => collection(db, alliesPath(scope))

/**
 * Get all product allies for a workspace as a map (salesName -> productId)
 */
export async function getProductAllies(scope: WorkspaceScope): Promise<Record<string, string>> {
  if (USE_MOCK_DATA) {
    return {}
  }

  const snapshot = await getDocs(collectionRef(scope))
  const allies: Record<string, string> = {}
  
  snapshot.forEach((docSnap) => {
    const data = docSnap.data() as Omit<ProductAlly, 'id'>
    allies[data.salesName] = data.productId
  })

  return allies
}

/**
 * Get a specific ally by sales name
 */
export async function getProductAlly(
  scope: WorkspaceScope,
  salesName: string,
): Promise<string | null> {
  if (USE_MOCK_DATA) {
    return null
  }

  const q = query(collectionRef(scope), where('salesName', '==', salesName))
  const snapshot = await getDocs(q)
  
  if (snapshot.empty) {
    return null
  }

  const data = snapshot.docs[0].data() as Omit<ProductAlly, 'id'>
  return data.productId
}

/**
 * Save or update a product ally
 */
export async function saveProductAlly(
  scope: WorkspaceScope,
  salesName: string,
  productId: string,
  userId: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    return
  }

  // Check if ally already exists
  const q = query(collectionRef(scope), where('salesName', '==', salesName))
  const snapshot = await getDocs(q)

  if (!snapshot.empty) {
    // Update existing ally
    const existingDoc = snapshot.docs[0]
    await setDoc(
      doc(db, `${alliesPath(scope)}/${existingDoc.id}`),
      {
        productId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    )
  } else {
    // Create new ally
    const newDocRef = doc(collectionRef(scope))
    await setDoc(newDocRef, {
      salesName,
      productId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByUserId: userId,
    })
  }
}

/**
 * Save multiple product allies at once
 */
export async function saveProductAllies(
  scope: WorkspaceScope,
  allies: Array<{ salesName: string; productId: string }>,
  userId: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    return
  }

  // Get existing allies
  const existingSnapshot = await getDocs(collectionRef(scope))
  const existingMap = new Map<string, string>()
  existingSnapshot.forEach((docSnap) => {
    const data = docSnap.data() as Omit<ProductAlly, 'id'>
    existingMap.set(data.salesName, docSnap.id)
  })

  // Use batch for better performance
  const batch = writeBatch(db)
  let batchCount = 0
  const MAX_BATCH_SIZE = 500

  for (const { salesName, productId } of allies) {
    const existingId = existingMap.get(salesName)
    
    if (existingId) {
      // Update existing
      const docRef = doc(db, `${alliesPath(scope)}/${existingId}`)
      batch.update(docRef, {
        productId,
        updatedAt: serverTimestamp(),
      })
    } else {
      // Create new
      const newDocRef = doc(collectionRef(scope))
      batch.set(newDocRef, {
        salesName,
        productId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdByUserId: userId,
      })
    }

    batchCount++
    if (batchCount >= MAX_BATCH_SIZE) {
      await batch.commit()
      batchCount = 0
    }
  }

  if (batchCount > 0) {
    await batch.commit()
  }
}

/**
 * Delete a product ally
 */
export async function deleteProductAlly(
  scope: WorkspaceScope,
  salesName: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    return
  }

  const q = query(collectionRef(scope), where('salesName', '==', salesName))
  const snapshot = await getDocs(q)

  if (!snapshot.empty) {
    await deleteDoc(doc(db, `${alliesPath(scope)}/${snapshot.docs[0].id}`))
  }
}

/**
 * Delete multiple product allies
 */
export async function deleteProductAllies(
  scope: WorkspaceScope,
  salesNames: string[],
): Promise<void> {
  if (USE_MOCK_DATA) {
    return
  }

  const batch = writeBatch(db)
  let batchCount = 0
  const MAX_BATCH_SIZE = 500

  for (const salesName of salesNames) {
    const q = query(collectionRef(scope), where('salesName', '==', salesName))
    const snapshot = await getDocs(q)

    if (!snapshot.empty) {
      const docRef = doc(db, `${alliesPath(scope)}/${snapshot.docs[0].id}`)
      batch.delete(docRef)
      batchCount++

      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit()
        batchCount = 0
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit()
  }
}

/**
 * Get all product allies as a list (for management UI)
 */
export async function listProductAllies(scope: WorkspaceScope): Promise<ProductAlly[]> {
  if (USE_MOCK_DATA) {
    return []
  }

  const snapshot = await getDocs(collectionRef(scope))
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<ProductAlly, 'id'>),
  }))
}

