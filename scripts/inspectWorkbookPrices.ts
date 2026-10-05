import fs from 'node:fs';
import * as XLSX from 'xlsx';

const FILES = [
  'data/source/Raw Material List.xlsx',
  'data/source/ELAND Cost Sheet Required.xlsx',
  'data/regression/ELAND Cost Sheet Required.xlsx',
];
const NEEDLE = ['HF27', 'HF30', 'CX05', 'ML04', 'TP01', 'XL08', 'CR01', 'A-ECAP10', 'USD/LE', '14600', 'Scrap', 'CU L'];

function main() {
  for (const file of FILES) {
    if (!fs.existsSync(file)) {
      console.log(JSON.stringify({ file, missing: true }));
      continue;
    }
    const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
    const sheets = wb.SheetNames.map((name) => {
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: '', raw: true });
      const headers = rows[0] ? Object.keys(rows[0]) : [];
      const hits = rows.filter((r) => {
        const s = JSON.stringify(r).toUpperCase();
        return NEEDLE.some((n) => s.includes(n.toUpperCase()));
      });
      return { name, rowCount: rows.length, headers, hits: hits.slice(0, 20) };
    });
    console.log(JSON.stringify({ file, sheets }, null, 2));
  }
}

main();
