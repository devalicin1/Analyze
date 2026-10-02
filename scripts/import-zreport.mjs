// Directly import a POS Z-Report CSV into Firestore for a workspace, replicating
// what the processSalesReport cloud function produces: a salesReport doc +
// salesLines (matched to products) + monthly metrics. Idempotent per period
// (deterministic report id import_<periodKey>; re-running replaces).
//
// Usage:
//   node scripts/import-zreport.mjs <wsId> <csvPath> <periodKey> <dateISO> [--dry] [--force]
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import {
  initializeFirestore, collection, doc, getDoc, getDocs, query, where,
  setDoc, serverTimestamp, writeBatch, Timestamp,
} from 'firebase/firestore'
import Papa from 'papaparse'

const env = {}
for (const line of readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
}
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY, authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID, storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID, appId: env.VITE_FIREBASE_APP_ID,
})
const db = initializeFirestore(app, { experimentalForceLongPolling: true })
const TENANT = 'testTenant'

const [wsId, csvPath, periodKey, dateISO] = process.argv.slice(2)
const DRY = process.argv.includes('--dry')
const FORCE = process.argv.includes('--force')
const base = `tenants/${TENANT}/workspaces/${wsId}`

const num = (s) => { const n = Number(String(s ?? '').replace(/[£,\s]/g, '')); return Number.isNaN(n) ? 0 : n }

// --- parse the per-product section of the Z-report ---
function parseZReport(text) {
  const rows = Papa.parse(text, { skipEmptyLines: false }).data
  const headerIdx = rows.findIndex((r) => (r[0] || '') === 'Product' && (r[1] || '') === 'Portion')
  if (headerIdx === -1) throw new Error('no per-item section found')
  const agg = new Map() // name -> {qty, amount, group}
  let group = ''
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const c0 = (r[0] || '').toString().trim()
    if (!c0) continue
    if (c0 === 'All Products' || c0.startsWith('Total for all products')) break
    if (c0.startsWith('Group:')) { group = c0.replace('Group:', '').trim(); continue }
    if (c0.startsWith('Total')) continue
    if (c0 === '--------------') continue
    if (r.length < 4) continue
    const amountRaw = (r[3] || '').toString().trim()
    if (amountRaw === '-' || amountRaw === '') continue
    const e = agg.get(c0) || { qty: 0, amount: 0, group }
    e.qty += num(r[2]); e.amount += num(r[3]); agg.set(c0, e)
  }
  return agg
}

async function main() {
  const agg = parseZReport(readFileSync(csvPath, 'utf8'))

  // live products: name(upper) -> {id, name, menuGroupId, menuSubGroupId, isExtra}
  const snap = await getDocs(collection(db, `${base}/products`))
  const byName = new Map()
  snap.forEach((d) => { const x = d.data(); if (x.name) byName.set(x.name.toUpperCase().trim(), { id: d.id, ...x }) })

  const lines = []
  const unmatched = []
  let totalAmount = 0, totalQuantity = 0
  for (const [name, e] of agg) {
    const p = byName.get(name.toUpperCase().trim())
    if (!p) { unmatched.push({ name, group: e.group, amount: Math.round(e.amount * 100) / 100 }); continue }
    const quantity = e.qty, amount = Math.round(e.amount * 100) / 100
    const line = {
      productId: p.id, productNameRaw: name, quantity, amount,
      unitPrice: amount / Math.max(quantity || 1, 1),
      productNameAtSale: p.name, menuGroupAtSale: p.menuGroupId,
      isExtraAtSale: p.isExtra ?? false,
    }
    if (p.menuSubGroupId) line.menuSubGroupAtSale = p.menuSubGroupId
    lines.push(line)
    totalAmount += amount; totalQuantity += quantity
  }

  console.log(`period ${periodKey} | parsed products: ${agg.size} | matched: ${lines.length} | unmatched: ${unmatched.length}`)
  console.log(`total amount: £${Math.round(totalAmount * 100) / 100} | total qty: ${totalQuantity}`)
  if (unmatched.length) {
    console.log(`\n=== UNMATCHED (need catalog entries first) ===`)
    unmatched.sort((a, b) => b.amount - a.amount).forEach((u) => console.log(`  [${u.group}]  £${u.amount}  ${u.name}`))
  }

  if (DRY) { console.log('\n(dry run — nothing written)'); return }
  if (unmatched.length && !FORCE) {
    console.log('\nABORTED: add the unmatched products to the catalog first, or pass --force to import only matched lines.')
    process.exitCode = 2
    return
  }

  const reportId = `import_${periodKey}`
  const reportDate = Timestamp.fromDate(new Date(`${dateISO}T12:00:00Z`))

  // clean prior data for idempotency
  const oldLines = await getDocs(query(collection(db, `${base}/salesLines`), where('reportId', '==', reportId)))
  const oldMetrics = await getDocs(query(collection(db, `${base}/metrics`), where('periodKey', '==', periodKey)))
  let b = writeBatch(db), c = 0
  const flush = async () => { if (c) { await b.commit(); b = writeBatch(db); c = 0 } }
  for (const d of oldLines.docs) { b.delete(d.ref); if (++c >= 450) await flush() }
  for (const d of oldMetrics.docs) { b.delete(d.ref); if (++c >= 450) await flush() }
  await flush()
  if (oldLines.size || oldMetrics.size) console.log(`cleaned prior: ${oldLines.size} lines, ${oldMetrics.size} metrics`)

  // report doc
  await setDoc(doc(db, `${base}/salesReports/${reportId}`), {
    periodKey, reportDate, source: 'excel_upload', status: 'processed',
    originalFilePath: '', createdByUserId: '', totalAmount, totalQuantity,
    createdAt: serverTimestamp(),
  }, { merge: true })

  // salesLines
  const prodAgg = new Map(), catAgg = new Map()
  for (const ln of lines) {
    b.set(doc(collection(db, `${base}/salesLines`)), { ...ln, reportId, periodKey, reportDate }); if (++c >= 450) await flush()
    const pa = prodAgg.get(ln.productId) || { qty: 0, amount: 0, name: ln.productNameAtSale, mg: ln.menuGroupAtSale, msg: ln.menuSubGroupAtSale }
    pa.qty += ln.quantity; pa.amount += ln.amount; prodAgg.set(ln.productId, pa)
    const ca = catAgg.get(ln.menuGroupAtSale) || { qty: 0, amount: 0 }
    ca.qty += ln.quantity; ca.amount += ln.amount; catAgg.set(ln.menuGroupAtSale, ca)
  }
  await flush()

  // metrics
  const mg = await getDoc(doc(db, `${base}/settings/menuGroupsConfig`))
  const labels = {}; (mg.data()?.groups || []).forEach((g) => { labels[g.id] = g.label })
  for (const [pid, a] of prodAgg) {
    const data = { type: 'monthlyProductSummary', periodKey, productId: pid, productNameSnapshot: a.name, totalQty: a.qty, totalAmount: a.amount, avgUnitPrice: a.qty > 0 ? a.amount / a.qty : 0, menuGroupSnapshot: a.mg }
    if (a.msg) data.menuSubGroupSnapshot = a.msg
    b.set(doc(db, `${base}/metrics/monthlyProductSummary_${periodKey}_${pid}`), data, { merge: true }); if (++c >= 450) await flush()
  }
  for (const [mgId, a] of catAgg) {
    b.set(doc(db, `${base}/metrics/monthlyCategorySummary_${periodKey}_${mgId}`), { type: 'monthlyCategorySummary', periodKey, menuGroupId: mgId, menuGroupLabelSnapshot: labels[mgId] || mgId, totalQty: a.qty, totalAmount: a.amount }, { merge: true }); if (++c >= 450) await flush()
  }
  await flush()

  console.log(`\nIMPORTED report ${reportId}: ${lines.length} salesLines, ${prodAgg.size} product metrics, ${catAgg.size} category metrics, total £${Math.round(totalAmount * 100) / 100}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e?.message || e); process.exit(1) })
