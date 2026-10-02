// Verifies the "All Products by category" aggregation used by the CSV export,
// against live Spark data (same logic as handleExportCSV).
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { initializeFirestore, collection, doc, getDoc, getDocs } from 'firebase/firestore'

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
const WS = 'WAZU6sMqQO8UYRJSbCrC'
const base = `tenants/testTenant/workspaces/${WS}`

const mg = await getDoc(doc(db, `${base}/settings/menuGroupsConfig`))
const groups = mg.data()?.groups || []
const gLabel = (id) => groups.find((g) => g.id === id)?.label || id
const sLabel = (gid, sid) => groups.find((g) => g.id === gid)?.subGroups.find((s) => s.id === sid)?.label || sid || ''

const snap = await getDocs(collection(db, `${base}/salesLines`))
// same dedup fetchSalesLines applies on read
const seen = new Set()
let dupes = 0
const prod = new Map()
snap.forEach((d) => {
  const l = d.data()
  const key = `${l.reportId}_${l.productId}_${l.quantity}_${l.amount}_${l.productNameRaw}`
  if (seen.has(key)) { dupes++; return }
  seen.add(key)
  const e = prod.get(l.productId) ?? { name: l.productNameAtSale, gid: l.menuGroupAtSale, sid: l.menuSubGroupAtSale || '', qty: 0, amount: 0 }
  e.qty += l.quantity || 0; e.amount += l.amount || 0; prod.set(l.productId, e)
})
console.log('duplicate salesLines skipped:', dupes)
const products = [...prod.values()]
const grand = products.reduce((s, p) => s + p.amount, 0)
const catT = new Map()
products.forEach((p) => { const c = catT.get(p.gid) ?? { qty: 0, amount: 0 }; c.qty += p.qty; c.amount += p.amount; catT.set(p.gid, c) })
const ordered = [...catT.entries()].sort((a, b) => b[1].amount - a[1].amount)

console.log('salesLines:', snap.size, '| products:', products.length, '| categories:', catT.size)
console.log('GRAND TOTAL: £' + Math.round(grand).toLocaleString())
console.log('sum of category totals: £' + Math.round(ordered.reduce((s, [, v]) => s + v.amount, 0)).toLocaleString(), '(should equal grand)')
console.log('\n--- top categories (label | qty | amount | %) ---')
ordered.slice(0, 8).forEach(([gid, v]) => console.log(`  ${gLabel(gid).padEnd(24)} ${String(v.qty).padStart(7)}  £${Math.round(v.amount).toLocaleString().padStart(10)}  ${(v.amount / grand * 100).toFixed(1)}%`))
// Reproduce the exact "All Products" CSV section (first 15 rows) the export writes
const r2 = (n) => Math.round(n * 100) / 100
const pct = (x) => `${(x * 100).toFixed(1)}%`
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const catIdx = new Map(ordered.map(([id], i) => [id, i]))
const subT = new Map()
products.forEach((p) => { const k = `${p.gid}||${p.sid}`; const s = subT.get(k) ?? { amount: 0 }; s.amount += p.amount; subT.set(k, s) })
const subAmt = (gid, sid) => subT.get(`${gid}||${sid}`)?.amount ?? 0
const sorted = products.slice().sort((a, b) => {
  const ci = (catIdx.get(a.gid) ?? 999) - (catIdx.get(b.gid) ?? 999)
  if (ci !== 0) return ci
  const si = subAmt(b.gid, b.sid) - subAmt(a.gid, a.sid)
  if (si !== 0) return si
  return b.amount - a.amount
})
console.log('\n===== "All Products" CSV section (exact output, first 15 of ' + products.length + ' rows) =====')
console.log(['Category', 'Subcategory', 'Product', 'Quantity', 'Amount', 'Avg Price', '% of Total'].map(esc).join(','))
sorted.slice(0, 15).forEach((p) => {
  console.log([gLabel(p.gid), sLabel(p.gid, p.sid), p.name, p.qty, r2(p.amount), r2(p.amount / p.qty), pct(p.amount / grand)].map(esc).join(','))
})
process.exit(0)
