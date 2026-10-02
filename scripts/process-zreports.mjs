// Parse the POS "Z REPORT / Item Sales Report" CSV exports into upload-ready
// monthly files (Product Name / Quantity / Amount), and report unmatched
// (new) product names vs the existing catalog.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'

const src = 'C:\\Users\\aliku\\Downloads\\Spark_New_Data'
const out = 'C:\\Users\\aliku\\Downloads\\Spark_New_Temiz'
mkdirSync(out, { recursive: true })

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' }

const catalog = JSON.parse(readFileSync(new URL('./spark-products.json', import.meta.url), 'utf8'))
const catalogNames = new Set(catalog.map((p) => p.name.toUpperCase().trim()))

function num(s) {
  if (s == null) return 0
  const n = Number(String(s).replace(/[£,\s]/g, ''))
  return Number.isNaN(n) ? 0 : n
}

// each folder with a Report.csv
const folders = readdirSync(src, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
const newProducts = new Map() // name -> group (first seen)
const summary = []

for (const folder of folders) {
  const csvPath = join(src, folder, 'Report.csv')
  let text
  try { text = readFileSync(csvPath, 'utf8') } catch { continue }
  const rows = Papa.parse(text, { skipEmptyLines: false }).data

  // period from the date-range line (e.g. "Fri 08 Nov 24 - Sat 30 Nov 24")
  let periodKey = null
  for (const r of rows.slice(0, 10)) {
    const cell = (r[0] || '').toString()
    const m = /\b(\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{2})\b/.exec(cell)
    if (m) { periodKey = `20${m[3]}-${MONTHS[m[2]]}`; break }
  }

  // find the per-item section header: ["Product","Portion","Qty","Amount"]
  const headerIdx = rows.findIndex((r) => (r[0] || '') === 'Product' && (r[1] || '') === 'Portion')
  if (headerIdx === -1) { summary.push({ folder, periodKey, error: 'no item section' }); continue }

  const agg = new Map() // name -> {qty, amount}
  let group = ''
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i]
    const c0 = (r[0] || '').toString().trim()
    if (!c0) continue
    // The clean per-product listing ends here; everything after (All Products
    // recap, Voids, Cancelled, Gifts, Discounts, Properties) is not sales data.
    if (c0 === 'All Products' || c0.startsWith('Total for all products')) break
    if (c0.startsWith('Group:')) { group = c0.replace('Group:', '').trim(); continue }
    if (c0.startsWith('Total for') || c0.startsWith('Total')) continue
    if (c0 === '--------------') continue
    // product row: name, portion, qty, amount
    if (r.length < 4) continue
    const amountRaw = (r[3] || '').toString().trim()
    if (amountRaw === '-' || amountRaw === '') continue
    const name = c0
    const qty = num(r[2])
    const amount = num(r[3])
    const e = agg.get(name) || { qty: 0, amount: 0 }
    e.qty += qty; e.amount += amount; agg.set(name, e)
    if (!catalogNames.has(name.toUpperCase().trim()) && !newProducts.has(name)) {
      newProducts.set(name, group)
    }
  }

  // write cleaned monthly file
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Sales Data')
  ws.addRow(['Product Name', 'Quantity', 'Amount'])
  let total = 0
  for (const [name, e] of agg) { ws.addRow([name, Math.round(e.qty), Math.round(e.amount * 100) / 100]); total += e.amount }
  const fname = `${periodKey || folder}.xlsx`
  await wb.xlsx.writeFile(join(out, fname))
  summary.push({ folder, periodKey, products: agg.size, total: Math.round(total * 100) / 100, file: fname })
}

console.log('=== per report ===')
summary.sort((a, b) => (a.periodKey || '').localeCompare(b.periodKey || ''))
for (const s of summary) console.log(`  ${s.periodKey}  ${s.file || ''}  products=${s.products}  total=£${s.total}${s.error ? '  ERROR:' + s.error : ''}`)
console.log('\nClean files ->', out)
console.log(`\n=== NEW products not in catalog (${newProducts.size}) ===`)
;[...newProducts.entries()].sort().forEach(([n, g]) => console.log(`  [${g}]  ${n}`))
process.exit(0)
