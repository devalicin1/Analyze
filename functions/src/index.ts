import * as admin from 'firebase-admin'
import { processSalesReport } from './processSalesReport'

if (!admin.apps.length) {
  admin.initializeApp()
}

export { processSalesReport }


