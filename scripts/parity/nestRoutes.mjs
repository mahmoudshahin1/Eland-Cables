// Single source of truth for which legacy routes are served by NestJS in the hybrid UI.
// Add a route here only after it passes G1 (parity) for its phase.

const SEG = '[^/]+';

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
  { phase: '2a', methods: ['GET'], path: new RegExp(`^/api/master/cables/${SEG}$`) },
  { phase: '2a', methods: ['GET', 'POST'], path: new RegExp(`^/api/master/cables/${SEG}/attachments$`) },
  { phase: '2a', methods: ['GET', 'DELETE'], path: new RegExp(`^/api/master/cables/${SEG}/attachments/${SEG}$`) },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/raw-materials$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/boms$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/drums$/ },
  { phase: '2a', methods: ['POST'], path: /^\/api\/master\/drums\/(capacity|candidates|validate|optimize)$/ },
  { phase: '2a', methods: ['GET'], path: new RegExp(`^/api/master/drums/${SEG}$`) },
  { phase: '2a', methods: ['GET'], path: /^\/api\/master\/(reference|keys|uniqueness|sot-status)$/ },
  { phase: '2a', methods: ['GET'], path: /^\/api\/platform\/db$/ },

  // Phase 3 routes ported early with 2a (customer catalog); export stays on legacy
  { phase: '3-early', methods: ['GET'], path: /^\/api\/v2\/cables\/products(\/facets)?$/ },
];

export function isNestRoute(method, url) {
  const pathname = String(url || '').split('?')[0].replace(/\/+$/, '') || '/';
  const m = String(method || 'GET').toUpperCase();
  return NEST_ROUTES.some(
    (r) => (r.methods === '*' || r.methods.includes(m) || (m === 'HEAD' && r.methods.includes('GET'))) && r.path.test(pathname),
  );
}
