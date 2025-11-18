import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { deleteObject, ref, uploadBytes } from 'firebase/storage'
import { v4 as uuid } from 'uuid'
import { db, storage } from '../firebase'
import { USE_MOCK_DATA } from './dataSource'
import { mockSalesReports } from './mockData'
import type { SalesReport, WorkspaceScope } from '../types'

// Helper to convert Firestore Timestamp to Date
function convertTimestampToDate(timestamp: unknown): Date {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate()
  }
  if (timestamp instanceof Date) {
    return timestamp
  }
  if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    return new Date(timestamp)
  }
  return new Date()
}

const reportsPath = (scope: WorkspaceScope) =>
  `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/salesReports`

const salesLinesPath = (scope: WorkspaceScope) =>
  `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/salesLines`

const collectionRef = (scope: WorkspaceScope) => collection(db, reportsPath(scope))

export async function listSalesReports(scope: WorkspaceScope): Promise<SalesReport[]> {
  if (USE_MOCK_DATA) {
    return mockSalesReports
  }

  const q = query(collectionRef(scope), orderBy('reportDate', 'desc'))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<SalesReport, 'id'>
    return {
      id: docSnap.id,
      ...data,
      reportDate: convertTimestampToDate(data.reportDate),
      createdAt: data.createdAt ? convertTimestampToDate(data.createdAt) : new Date(),
    }
  })
}

export type CreateReportInput = Omit<SalesReport, 'id' | 'createdAt' | 'status'> & {
  status?: SalesReport['status']
}

/**
 * Upload a file to Firebase Storage
 */
export async function uploadReportFile(
  scope: WorkspaceScope,
  file: File,
  reportId: string,
): Promise<string> {
  if (USE_MOCK_DATA) {
    // In mock mode, return a fake path
    console.log('[uploadReportFile] Using mock data mode, skipping Firebase Storage upload')
    return `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/uploads/${reportId}_${file.name}`
  }

  const fileExtension = file.name.split('.').pop() || 'xlsx'
  const fileName = `${reportId}.${fileExtension}`
  const storagePath = `tenants/${scope.tenantId}/workspaces/${scope.workspaceId}/uploads/${fileName}`
  const storageRef = ref(storage, storagePath)

  console.log('[uploadReportFile] Uploading to Firebase Storage:', storagePath)
  console.log('[uploadReportFile] USE_MOCK_DATA:', USE_MOCK_DATA)
  
  try {
    await uploadBytes(storageRef, file)
    console.log('[uploadReportFile] Upload successful')
    return storagePath
  } catch (error) {
    console.error('[uploadReportFile] Upload failed:', error)
    throw error
  }
}

export async function createSalesReport(
  scope: WorkspaceScope,
  input: CreateReportInput,
  file?: File,
): Promise<SalesReport> {
  if (USE_MOCK_DATA) {
    return {
      id: uuid(),
      ...input,
      createdAt: new Date(),
      status: input.status ?? 'uploaded',
    } as SalesReport
  }

  const docRef = doc(collectionRef(scope))
  let finalFilePath = input.originalFilePath

  // Upload file to Storage if provided
  if (file) {
    finalFilePath = await uploadReportFile(scope, file, docRef.id)
  }

  const serverPayload = {
    ...input,
    originalFilePath: finalFilePath,
    status: input.status ?? 'uploaded',
    createdAt: serverTimestamp(),
  }
  await setDoc(docRef, serverPayload)
  return {
    id: docRef.id,
    ...input,
    originalFilePath: finalFilePath,
    status: input.status ?? 'uploaded',
    createdAt: new Date(),
  } as SalesReport
}

export async function updateSalesReport(
  scope: WorkspaceScope,
  reportId: string,
  updates: Partial<SalesReport>,
) {
  console.log('[updateSalesReport] Called with:', {
    reportId,
    updates: {
      ...updates,
      productMapping: updates.productMapping ? `${Object.keys(updates.productMapping).length} mappings` : undefined,
      unmappedProducts: updates.unmappedProducts ? `${updates.unmappedProducts.length} items` : undefined,
    },
  })
  
  if (USE_MOCK_DATA) {
    return {
      ...mockSalesReports.find((report) => report.id === reportId),
      ...updates,
    } as SalesReport
  }

  const ref = doc(db, `${reportsPath(scope)}/${reportId}`)
  await updateDoc(ref, updates)
  console.log('[updateSalesReport] Report updated successfully')
}

export async function findReportsByStatus(
  scope: WorkspaceScope,
  status: SalesReport['status'],
) {
  if (USE_MOCK_DATA) {
    return mockSalesReports.filter((report) => report.status === status)
  }

  const q = query(collectionRef(scope), where('status', '==', status))
  const snapshot = await getDocs(q)
  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data() as Omit<SalesReport, 'id'>
    return {
      id: docSnap.id,
      ...data,
      reportDate: convertTimestampToDate(data.reportDate),
      createdAt: data.createdAt ? convertTimestampToDate(data.createdAt) : new Date(),
    }
  })
}

export async function getSalesReport(scope: WorkspaceScope, reportId: string) {
  if (USE_MOCK_DATA) {
    return mockSalesReports.find((report) => report.id === reportId) ?? null
  }

  const ref = doc(db, `${reportsPath(scope)}/${reportId}`)
  const snap = await getDoc(ref)
  if (!snap.exists()) return null
  const data = snap.data() as Omit<SalesReport, 'id'>
  return {
    id: snap.id,
    ...data,
    reportDate: convertTimestampToDate(data.reportDate),
    createdAt: data.createdAt ? convertTimestampToDate(data.createdAt) : new Date(),
  }
}

/**
 * Delete a sales report, its associated file from Storage, and all related sales lines
 */
export async function deleteSalesReport(
  scope: WorkspaceScope,
  reportId: string,
): Promise<void> {
  if (USE_MOCK_DATA) {
    console.log('[deleteSalesReport] Using mock data mode, skipping deletion')
    return
  }

  try {
    // Get the report to find the file path
    const reportDocRef = doc(db, `${reportsPath(scope)}/${reportId}`)
    const reportSnap = await getDoc(reportDocRef)
    
    if (!reportSnap.exists()) {
      console.warn(`[deleteSalesReport] Report ${reportId} not found`)
      return
    }

    const reportData = reportSnap.data() as SalesReport
    
    // Delete all sales lines associated with this report
    const salesLinesCollection = collection(db, salesLinesPath(scope))
    const salesLinesQuery = query(salesLinesCollection, where('reportId', '==', reportId))
    const salesLinesSnapshot = await getDocs(salesLinesQuery)
    
    if (!salesLinesSnapshot.empty) {
      console.log(`[deleteSalesReport] Found ${salesLinesSnapshot.docs.length} sales lines to delete`)
      
      // Delete sales lines in batches (Firestore batch limit is 500)
      const BATCH_SIZE = 500
      let currentBatch = writeBatch(db)
      let batchCount = 0
      
      for (const salesLineDoc of salesLinesSnapshot.docs) {
        currentBatch.delete(salesLineDoc.ref)
        batchCount++
        
        if (batchCount >= BATCH_SIZE) {
          await currentBatch.commit()
          console.log(`[deleteSalesReport] Deleted batch of ${batchCount} sales lines`)
          currentBatch = writeBatch(db)
          batchCount = 0
        }
      }
      
      // Commit remaining sales lines
      if (batchCount > 0) {
        await currentBatch.commit()
        console.log(`[deleteSalesReport] Deleted final batch of ${batchCount} sales lines`)
      }
      
      console.log(`[deleteSalesReport] Deleted all ${salesLinesSnapshot.docs.length} sales lines`)
    } else {
      console.log(`[deleteSalesReport] No sales lines found for report ${reportId}`)
    }
    
    // Delete the file from Storage if it exists
    if (reportData.originalFilePath) {
      try {
        const storageRef = ref(storage, reportData.originalFilePath)
        await deleteObject(storageRef)
        console.log(`[deleteSalesReport] Deleted file from Storage: ${reportData.originalFilePath}`)
      } catch (storageError) {
        // Log but don't fail if file doesn't exist
        console.warn(`[deleteSalesReport] Failed to delete file from Storage:`, storageError)
      }
    }

    // Delete the Firestore document
    await deleteDoc(reportDocRef)
    console.log(`[deleteSalesReport] Deleted report document: ${reportId}`)
  } catch (error) {
    console.error(`[deleteSalesReport] Failed to delete report ${reportId}:`, error)
    throw error
  }
}


