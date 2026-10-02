// One-off admin helper for Spark Bar & Kitchen setup.
// Reads Firebase config from .env and talks to Firestore via the web SDK
// (Firestore security rules are currently open for dev).
//
// Usage:
//   node scripts/spark-firestore.mjs list
//   node scripts/spark-firestore.mjs get-menu <workspaceId>
//   node scripts/spark-firestore.mjs write-menu <workspaceId> <groupsJsonPath>
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import {
  initializeFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
  writeBatch,
  Timestamp,
} from 'firebase/firestore'

const envText = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const env = {}
for (const line of envText.split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
// Force long-polling so the Firestore web SDK works in Node (no WebChannel).
const db = initializeFirestore(app, { experimentalForceLongPolling: true })

const TENANT = 'testTenant'
const [cmd, ...args] = process.argv.slice(2)

const menuDocPath = (wsId) =>
  `tenants/${TENANT}/workspaces/${wsId}/settings/menuGroupsConfig`

async function main() {
  if (cmd === 'list') {
    const snap = await getDocs(collection(db, `tenants/${TENANT}/workspaces`))
    if (snap.empty) {
      console.log('(no workspace docs found)')
      return
    }
    snap.forEach((d) => {
      const x = d.data()
      console.log(
        JSON.stringify({ id: d.id, name: x.name, currency: x.currency, timezone: x.timezone }),
      )
    })
  } else if (cmd === 'get-menu') {
    const [wsId] = args
    const snap = await getDoc(doc(db, menuDocPath(wsId)))
    console.log(snap.exists() ? JSON.stringify(snap.data(), null, 2) : '(no menuGroupsConfig)')
  } else if (cmd === 'write-menu') {
    const [wsId, jsonPath] = args
    const groups = JSON.parse(readFileSync(jsonPath, 'utf8'))
    await setDoc(doc(db, menuDocPath(wsId)), { groups }, { merge: true })
    console.log(`Wrote ${groups.length} menu groups to ${menuDocPath(wsId)}`)
  } else if (cmd === 'fix-report-month') {
    // fix-report-month <wsId> <reportId> <oldPeriodKey> <newPeriodKey> <newDateISO>
    const [wsId, reportId, oldPk, newPk, newDateISO] = args
    const base = `tenants/${TENANT}/workspaces/${wsId}`
    const newDate = Timestamp.fromDate(new Date(`${newDateISO}T12:00:00Z`))

    // 1) report doc
    await setDoc(doc(db, `${base}/salesReports/${reportId}`), { periodKey: newPk, reportDate: newDate }, { merge: true })
    console.log(`report ${reportId}: periodKey ${oldPk} -> ${newPk}, reportDate -> ${newDateISO}`)

    // 2) its salesLines (update periodKey + reportDate), aggregating for metrics
    const linesSnap = await getDocs(query(collection(db, `${base}/salesLines`), where('reportId', '==', reportId)))
    const prodAgg = new Map(), catAgg = new Map()
    let b = writeBatch(db), n = 0
    for (const ls of linesSnap.docs) {
      const d = ls.data()
      b.set(ls.ref, { periodKey: newPk, reportDate: newDate }, { merge: true }); n++
      if (n >= 450) { await b.commit(); b = writeBatch(db); n = 0 }
      const pa = prodAgg.get(d.productId) || { qty: 0, amount: 0, name: d.productNameAtSale, mg: d.menuGroupAtSale, msg: d.menuSubGroupAtSale }
      pa.qty += d.quantity || 0; pa.amount += d.amount || 0; prodAgg.set(d.productId, pa)
      const ca = catAgg.get(d.menuGroupAtSale) || { qty: 0, amount: 0 }
      ca.qty += d.quantity || 0; ca.amount += d.amount || 0; catAgg.set(d.menuGroupAtSale, ca)
    }
    if (n > 0) await b.commit()
    console.log(`updated ${linesSnap.size} salesLines`)

    // 3) delete stale metrics for old period (only this report lived there)
    const oldM = await getDocs(query(collection(db, `${base}/metrics`), where('periodKey', '==', oldPk)))
    let db1 = writeBatch(db), m = 0
    for (const md of oldM.docs) { db1.delete(md.ref); m++; if (m >= 450) { await db1.commit(); db1 = writeBatch(db); m = 0 } }
    if (m > 0) await db1.commit()
    console.log(`deleted ${oldM.size} stale metrics for ${oldPk}`)

    // 4) recompute metrics for new period from the report's lines
    const mg = await getDoc(doc(db, `${base}/settings/menuGroupsConfig`))
    const labels = {}; (mg.data()?.groups || []).forEach((g) => { labels[g.id] = g.label })
    let wb = writeBatch(db), w = 0
    for (const [pid, a] of prodAgg) {
      const data = { type: 'monthlyProductSummary', periodKey: newPk, productId: pid, productNameSnapshot: a.name, totalQty: a.qty, totalAmount: a.amount, avgUnitPrice: a.qty > 0 ? a.amount / a.qty : 0, menuGroupSnapshot: a.mg }
      if (a.msg) data.menuSubGroupSnapshot = a.msg
      wb.set(doc(db, `${base}/metrics/monthlyProductSummary_${newPk}_${pid}`), data, { merge: true }); w++
      if (w >= 450) { await wb.commit(); wb = writeBatch(db); w = 0 }
    }
    for (const [mgId, a] of catAgg) {
      wb.set(doc(db, `${base}/metrics/monthlyCategorySummary_${newPk}_${mgId}`), { type: 'monthlyCategorySummary', periodKey: newPk, menuGroupId: mgId, menuGroupLabelSnapshot: labels[mgId] || mgId, totalQty: a.qty, totalAmount: a.amount }, { merge: true }); w++
      if (w >= 450) { await wb.commit(); wb = writeBatch(db); w = 0 }
    }
    if (w > 0) await wb.commit()
    console.log(`wrote metrics for ${newPk}: ${prodAgg.size} products, ${catAgg.size} categories`)
  } else if (cmd === 'diag') {
    const [wsId] = args
    const reps = await getDocs(collection(db, `tenants/${TENANT}/workspaces/${wsId}/salesReports`))
    console.log('salesReports:', reps.size)
    reps.forEach((d) => {
      const x = d.data()
      const rd = x.reportDate?.toDate ? x.reportDate.toDate().toISOString().slice(0, 10) : String(x.reportDate)
      console.log(`  ${d.id}  periodKey=${x.periodKey}  reportDate=${rd}  status=${x.status}  total=${x.totalAmount}`)
    })
    const lines = await getDocs(collection(db, `tenants/${TENANT}/workspaces/${wsId}/salesLines`))
    const byPeriod = {}
    lines.forEach((d) => { const p = d.data().periodKey || '(none)'; byPeriod[p] = (byPeriod[p] || 0) + 1 })
    console.log('salesLines:', lines.size, 'distinct periodKeys:', JSON.stringify(byPeriod))
  } else if (cmd === 'count-products') {
    const [wsId] = args
    const snap = await getDocs(collection(db, `tenants/${TENANT}/workspaces/${wsId}/products`))
    console.log('products:', snap.size)
  } else if (cmd === 'write-products') {
    const [wsId, jsonPath] = args
    const products = JSON.parse(readFileSync(jsonPath, 'utf8'))
    const colPath = `tenants/${TENANT}/workspaces/${wsId}/products`
    // Stable doc id from name -> re-running overwrites instead of duplicating.
    const slug = (n) => 'p_' + n.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    const seen = new Set()
    let batch = writeBatch(db)
    let n = 0, total = 0
    for (const p of products) {
      let id = slug(p.name)
      while (seen.has(id)) id += '_'
      seen.add(id)
      const data = {
        name: p.name,
        posCode: p.posCode ?? p.name,
        isExtra: p.isExtra ?? false,
        active: true,
        menuGroupId: p.menuGroupId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      if (p.menuSubGroupId) data.menuSubGroupId = p.menuSubGroupId
      batch.set(doc(db, `${colPath}/${id}`), data, { merge: true })
      n++; total++
      if (n >= 450) { await batch.commit(); batch = writeBatch(db); n = 0 }
    }
    if (n > 0) await batch.commit()
    console.log(`Wrote ${total} products to ${colPath}`)
  } else {
    console.log('Unknown command. Use: list | get-menu <wsId> | write-menu <wsId> <jsonPath>')
    process.exitCode = 1
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err?.message || err)
    process.exit(1)
  })
