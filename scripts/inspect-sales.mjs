import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import ExcelJS from 'exceljs'

const dir = 'C:\\Users\\aliku\\Downloads\\Spark_Aylik_Urun_Satislari'
const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx'))

const target = files[0]
console.log('Inspecting:', target)
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(join(dir, target))
console.log('Sheets:', wb.worksheets.map((w) => w.name).join(' | '))
const ws = wb.worksheets[0]
console.log('Dimensions rowCount:', ws.rowCount, 'colCount:', ws.columnCount)
console.log('--- first 8 rows ---')
for (let r = 1; r <= Math.min(8, ws.rowCount); r++) {
  const row = ws.getRow(r)
  const cells = []
  for (let c = 1; c <= Math.min(8, ws.columnCount); c++) {
    const v = row.getCell(c).text
    cells.push(`[${c}] ${JSON.stringify(v)}`)
  }
  console.log(`row ${r}:`, cells.join('  '))
}
process.exit(0)
