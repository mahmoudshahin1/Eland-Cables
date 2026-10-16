const fs = require('fs');
const list = JSON.parse(fs.readFileSync('temp_phase2_clean.json', 'utf8'));

// User instructions:
// 2a: مسارات القراءة كلها لـ cables وraw-materials وboms وdrums وreference وkeys وuniqueness وdb (الـ aliases الاثنين) + ملحقات الكابل + drums/:drumCode + drum compute POSTs.
// 2b: استيراد/تصدير ومعادن (imports, exports, metal pricing, market metals, cable scrap import/export, excel commit, cutover)
// 2c: حوكمة (governance: engineering-mappings, bom-conflicts, raw-material-prices workflow/actions, readiness, commercial-pricing-rules)

function categorize(rawItem) {
  const p = rawItem.path.replace(/`/g, '').trim();
  const m = rawItem.method.replace(/`/g, '').trim();

  // 2a Endpoints:
  // 1. Cables read:
  if ((p === '/api/master/cables' || p === '/api/platform/cables') && m === 'GET') return '2a';
  if ((p === '/api/master/cables/:materialNumber' || p === '/api/platform/cables/:materialNumber') && m === 'GET') return '2a';
  // Cable attachments:
  if (p.includes('/attachments')) return '2a';

  // 2. Raw materials read:
  if ((p === '/api/master/raw-materials' || p === '/api/platform/raw-materials') && m === 'GET') return '2a';

  // 3. BOMs read:
  if ((p === '/api/master/boms' || p === '/api/platform/boms') && m === 'GET') return '2a';

  // 4. Drums read + drums/:drumCode:
  if ((p === '/api/master/drums' || p === '/api/platform/drums') && m === 'GET') return '2a';
  if ((p === '/api/master/drums/:drumCode' || p === '/api/platform/drums/:drumCode') && m === 'GET') return '2a';

  // 5. Drum compute POSTs:
  if (p.match(/\/drums\/(capacity|candidates|validate|optimize)$/) && m === 'POST') return '2a';

  // 6. Reference read:
  if ((p === '/api/master/reference' || p === '/api/platform/reference') && m === 'GET') return '2a';

  // 7. Keys read:
  if ((p === '/api/master/keys' || p === '/api/platform/keys') && m === 'GET') return '2a';

  // 8. Uniqueness read:
  if ((p === '/api/master/uniqueness' || p === '/api/platform/uniqueness') && m === 'GET') return '2a';

  // 9. DB health/status:
  if (p.match(/\/(master|platform)\/db$/) && m === 'GET') return '2a';
  if (p.match(/\/(master|platform)\/sot-status$/) && m === 'GET') return '2a'; // sot-status is db sync status

  // 2b: Imports, Exports, Metals, Mutations on Masters (Cables, Raw Materials, Drums CRUD)
  // - Metal pricing / market metals:
  if (p.includes('metal')) return '2b';
  // - Imports / exports / cutover / excel:
  if (p.includes('import') || p.includes('export') || p.includes('cutover') || p.includes('excel')) return '2b';
  if (p.includes('scrap')) return '2b';
  // - Master data mutations (Cables, Drums, Raw Materials write/update/delete):
  if (p.startsWith('/api/master/cables') || p.startsWith('/api/platform/cables')) return '2b';
  if (p.startsWith('/api/master/raw-materials') || p.startsWith('/api/platform/raw-materials')) return '2b';
  if (p.startsWith('/api/master/drums') || p.startsWith('/api/platform/drums')) return '2b';

  // 2c: Governance & Workflows
  // - Engineering Mappings (workflow, actions, import, commit, export)
  // - BOM Conflicts (register, export, actions)
  // - Raw Material Prices workflow/governance (draft, actions, readiness)
  // - Commercial Pricing Rules (workflow, rules, actions)
  // - Costing Readiness & Price Readiness
  // - BOM Duplicate Observations
  if (p.includes('engineering-mapping') || p.includes('bom-conflict') || p.includes('raw-material-price') || p.includes('commercial-pricing-rules') || p.includes('readiness') || p.includes('duplicate-observations')) {
    return '2c';
  }

  return 'OTHER';
}


const classified = list.map(item => ({
  ...item,
  subPhase: categorize(item)
}));

const counts = {};
classified.forEach(c => {
  counts[c.subPhase] = (counts[c.subPhase] || 0) + 1;
});

console.log('Sub-phase counts:', counts);

fs.writeFileSync('temp_classified_endpoints.json', JSON.stringify(classified, null, 2));
