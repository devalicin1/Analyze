import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

const dir = 'C:\\Users\\aliku\\Downloads\\Spark_Aylik_Urun_Satislari'
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx'))

function num(text) {
  if (text == null) return 0
  let s = String(text).trim().replace(/[£$€\s]/g, '')
  // handle thousands/decimal: if both . and , -> assume , thousands . decimal unless , after .
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (s.includes(',')) {
    const after = s.split(',').pop()
    if (after.length <= 2) s = s.replace(',', '.')
    else s = s.replace(/,/g, '')
  }
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

const agg = new Map() // name -> { name, months:Set, totalQty, totalAmount }
const perFile = []

for (const f of files) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(join(dir, f))
  const ws = wb.worksheets[0]
  // find header row (col1 === 'Ürün Adı')
  let headerRow = 0
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    if (String(ws.getRow(r).getCell(1).text).trim().toLowerCase().startsWith('ürün')) {
      headerRow = r
      break
    }
  }
  if (!headerRow) headerRow = 2
  let rows = 0
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const name = String(ws.getRow(r).getCell(1).text).trim()
    if (!name) continue
    const qty = num(ws.getRow(r).getCell(2).text)
    const amount = num(ws.getRow(r).getCell(3).text)
    rows++
    const key = name.toUpperCase()
    let e = agg.get(key)
    if (!e) { e = { name, months: new Set(), totalQty: 0, totalAmount: 0 }; agg.set(key, e) }
    e.months.add(f.replace('.xlsx', ''))
    e.totalQty += qty
    e.totalAmount += amount
  }
  perFile.push({ file: f.replace('.xlsx', ''), dataRows: rows })
}

const list = [...agg.values()]
  .map((e) => ({
    name: e.name,
    monthsCount: e.months.size,
    totalQty: Math.round(e.totalQty),
    totalAmount: Math.round(e.totalAmount * 100) / 100,
  }))
  .sort((a, b) => b.totalAmount - a.totalAmount)

writeFileSync(
  'C:\\Users\\aliku\\Downloads\\Analyzer\\scripts\\spark-sales-products.json',
  JSON.stringify(list, null, 2),
)

console.log('Files parsed:', files.length)
perFile.forEach((p) => console.log(`  ${p.file}: ${p.dataRows} rows`))
console.log('UNIQUE PRODUCTS:', list.length)
console.log('--- top 25 by total amount ---')
list.slice(0, 25).forEach((p) => console.log(`  ${p.totalAmount}\t${p.totalQty}\t${p.monthsCount}mo\t${p.name}`))
console.log('--- 25 rarest (lowest amount) ---')
list.slice(-25).forEach((p) => console.log(`  ${p.totalAmount}\t${p.totalQty}\t${p.monthsCount}mo\t${p.name}`))
process.exit(0)
