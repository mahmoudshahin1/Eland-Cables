// Single source of truth for which legacy routes are served by NestJS in the hybrid UI.
// Add a route here only after it passes G1 (parity) for its phase.

/** @type {Array<{ phase: string, methods: string[] | '*', path: RegExp }>} */
export const NEST_ROUTES = [
  // Phase 1: auth, admin identity, admin customers (all methods under these prefixes are migrated)
  { phase: '1', methods: '*', path: /^\/api\/auth(\/|$)/ },
  {
    phase: '1',
    methods: '*',
    path: /^\/api\/admin\/(users|roles|permissions|security|customers|customer-users|customer-reference-masters)(\/|$)/,
  },

  // Phase 2a: master data reads, attachments, drum engine
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/cables$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/cables\/[^/]+$/ },
  { phase: '2a', methods: ['GET', 'POST'], path: /^\/api\/master\/cables\/[^/]+\/attachments$/ },
  { phase: '2a', methods: ['GET', 'DELETE'], path: /^\/api\/master\/cables\/[^/]+\/attachments\/[^/]+$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/raw-materials$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/boms$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/drums$/ },
  { phase: '2a', methods: ['POST'], path: /^\/api\/master\/drums\/(capacity|candidates|validate|optimize)$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/drums\/[^/]+$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/(reference|keys|uniqueness|sot-status)$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/platform\/db$/ },

  // Phase 2b: master data mutations, excel imports, exports, market metals
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/cables$/ },
  { phase: '2b', methods: ['PUT'], path: /^\/api\/master\/cables\/[^/]+$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/raw-materials$/ },
  { phase: '2b', methods: ['PUT'], path: /^\/api\/master\/raw-materials\/[^/]+$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/raw-materials\/[^/]+\/prices$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/drums$/ },
  { phase: '2b', methods: ['PUT', 'DELETE'], path: /^\/api\/master\/drums\/[^/]+$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/drums\/(excel-preview|excel-commit)$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/boms\/excel-commit$/ },
  { phase: '2b', methods: ['GET', 'POST'], path: /^\/api\/master\/market-metals\/imports$/ },
  { phase: '2b', methods: ['GET'], path: /^\/api\/master\/market-metals\/imports\/[^/]+$/ },
  { phase: '2b', methods: ['GET'], path: /^\/api\/master\/market-metals\/imports\/[^/]+\/image$/ },
  { phase: '2b', methods: ['PATCH'], path: /^\/api\/master\/market-metals\/imports\/[^/]+\/rows\/[^/]+$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/market-metals\/imports\/[^/]+\/(approve|publish)$/ },
  { phase: '2b', methods: ['GET'], path: /^\/api\/master\/export\/[^/]+$/ },
  { phase: '2b', methods: ['GET'], path: /^\/api\/master\/(cable-scrap-template-export|raw-material-prices-export|engineering-mappings-export|bom-conflicts-export)$/ },
  { phase: '2b', methods: ['GET'], path: /^\/api\/master\/commercial-pricing-rules\/export$/ },
  { phase: '2b', methods: ['GET'], path: /^\/api\/master\/imports$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/imports\/(preview|commit)$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/cable-scrap-import\/(preview|commit)$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/raw-material-prices\/import\/(preview|commit)$/ },
  { phase: '2b', methods: ['POST'], path: /^\/api\/master\/engineering-mappings\/import\/(preview|commit)$/ },
];

export function isNestRoute(method, url) {
  const pathname = String(url || '').split('?')[0].replace(/\/+$/, '') || '/';
  const m = String(method || 'GET').toUpperCase();
  return NEST_ROUTES.some(
    (r) => (r.methods === '*' || r.methods.includes(m) || (m === 'HEAD' && r.methods.includes('GET'))) && r.path.test(pathname),
  );
}
