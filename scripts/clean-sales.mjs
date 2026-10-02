// Produces upload-ready copies of the monthly sales files:
//  - header (Product Name / Quantity / Amount) on row 1 (drops the title row)
//  - drops the TOPLAM total row
//  - numeric quantity & amount
// so the app's Upload Sales Report importer parses & maps them cleanly.
import { readdirSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

const src = 'C:\\Users\\aliku\\Downloads\\Spark_Aylik_Urun_Satislari'
const out = 'C:\\Users\\aliku\\Downloads\\Spark_Aylik_Temiz'
mkdirSync(out, { recursive: true })

function num(text) {
  if (text == null) return 0
  let s = String(text).trim().replace(/[£$€\s]/g, '')
  if (s.includes(',') && s.includes('.')) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.')
    else s = s.replace(/,/g, '')
  } else if (s.includes(',')) {
    const after = s.split(',').pop()
    s = after.length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '')
  }
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

const files = readdirSync(src).filter((f) => f.toLowerCase().endsWith('.xlsx'))
for (const f of files) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(join(src, f))
  const ws = wb.worksheets[0]
  let headerRow = 0
  for (let r = 1; r <= Math.min(10, ws.rowCount); r++) {
    if (String(ws.getRow(r).getCell(1).text).trim().toLowerCase().startsWith('ürün')) { headerRow = r; break }
  }
  if (!headerRow) headerRow = 2

  const outWb = new ExcelJS.Workbook()
  const outWs = outWb.addWorksheet('Sales Data')
  outWs.addRow(['Product Name', 'Quantity', 'Amount'])
  let rows = 0
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const name = String(ws.getRow(r).getCell(1).text).trim()
    if (!name || name.toUpperCase() === 'TOPLAM') continue
    outWs.addRow([name, num(ws.getRow(r).getCell(2).text), num(ws.getRow(r).getCell(3).text)])
    rows++
  }
  await outWb.xlsx.writeFile(join(out, f))
  console.log(`${f}: ${rows} products`)
}
console.log('\nClean files written to:', out)
process.exit(0)
