// One-shot inspector for the banking risk sheet. Dumps every sheet,
// row, and cell to stdout so we can grep for drift against the flyer's
// framework framing and the persona constraints (1 agent, no GFH,
// investment-bank, no emoji).
import ExcelJS from 'exceljs';

const path = '/Users/nca/os26/staging-site/sites/compliance/public/underwriting-demo-arabic-bank.xlsx';

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(path);

console.log('=== FILE:', path);
console.log('=== Sheet count:', wb.worksheets.length);
console.log('=== Title:', wb.title);
console.log('=== Subject:', wb.subject);
console.log('');

for (const ws of wb.worksheets) {
  console.log(`\n\n##### SHEET: "${ws.name}" (rowCount=${ws.rowCount}) #####`);
  ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
    const cells = [];
    row.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const v = cell.value;
      let s;
      if (v == null) s = '';
      else if (typeof v === 'object' && v.richText) s = v.richText.map((r) => r.text).join('');
      else if (typeof v === 'object' && v.text) s = v.text;
      else s = String(v);
      cells.push(`[${colNum}] ${s.replace(/\n/g, ' \\n ')}`);
    });
    if (cells.length) console.log(`r${String(rowNum).padStart(3, ' ')}: ${cells.join('  |  ')}`);
  });
}
