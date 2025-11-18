import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { v4 as uuid } from 'uuid'
import { db } from '../firebase'
import { USE_MOCK_DATA } from './dataSource'
import { mockProducts } from './mockData'
import type { Product, WorkspaceScope } from '../types'

const productsPath = (scope: WorkspaceScope) =>
  `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/products`

const collectionRef = (scope: WorkspaceScope) => collection(db, productsPath(scope))

export async function listProducts(scope: WorkspaceScope): Promise<Product[]> {
  if (USE_MOCK_DATA) {
    return mockProducts
  }

  const snapshot = await getDocs(collectionRef(scope))
  return snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...(docSnap.data() as Omit<Product, 'id'>),
  }))
}

export async function getProduct(scope: WorkspaceScope, productId: string) {
  if (USE_MOCK_DATA) {
    return mockProducts.find((product) => product.id === productId) ?? null
  }

  const ref = doc(db, `${productsPath(scope)}/${productId}`)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  return { id: snap.id, ...(snap.data() as Omit<Product, 'id'>) }
}

type SaveProductInput = Omit<Product, 'createdAt' | 'updatedAt'> & {
  createdAt?: Product['createdAt']
  updatedAt?: Product['updatedAt']
}

export async function saveProduct(
  scope: WorkspaceScope,
  product: Partial<SaveProductInput> & { id?: string },
) {
  if (USE_MOCK_DATA) {
    const now = new Date()
    return {
      id: product.id ?? uuid(),
      ...product,
      createdAt: product.createdAt ?? now,
      updatedAt: now,
    } as Product
  }

  const id = product.id ?? doc(collectionRef(scope)).id
  const ref = doc(db, `${productsPath(scope)}/${id}`)
  
  // Remove undefined values and metadata fields - Firestore doesn't accept undefined
  const cleanProduct: Record<string, unknown> = {}
  Object.keys(product).forEach((key) => {
    // Skip id, createdAt, updatedAt - these are handled separately
    if (key === 'id' || key === 'createdAt' || key === 'updatedAt') {
      return
    }
    const value = product[key as keyof typeof product]
    if (value !== undefined) {
      cleanProduct[key] = value
    }
  })
  
  await setDoc(
    ref,
    {
      ...cleanProduct,
      createdAt: product.createdAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return { ...(product as Product), id }
}

export async function updateProduct(
  scope: WorkspaceScope,
  productId: string,
  updates: Partial<Product>,
) {
  if (USE_MOCK_DATA) {
    return {
      ...mockProducts.find((product) => product.id === productId),
      ...updates,
      updatedAt: new Date(),
    } as Product
  }

  const ref = doc(db, `${productsPath(scope)}/${productId}`)
  
  // Remove undefined values - Firestore doesn't accept undefined
  const cleanUpdates: Record<string, unknown> = {}
  Object.keys(updates).forEach((key) => {
    // Skip id, createdAt, updatedAt - these are handled separately
    if (key === 'id' || key === 'createdAt') {
      return
    }
    const value = updates[key as keyof typeof updates]
    if (value !== undefined) {
      cleanUpdates[key] = value
    }
  })
  
  await updateDoc(ref, {
    ...cleanUpdates,
    updatedAt: serverTimestamp(),
  })
}


