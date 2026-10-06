import fs from 'fs';
import path from 'path';

const rootDir = process.cwd();
const serverTsPath = path.resolve(rootDir, 'server.ts');

function categorizeEndpoint(mountPath, routePath, legacyFile) {
  const full = (mountPath + (routePath === '/' ? '' : routePath)).replace(/\/+/g, '/');
  const baseName = path.basename(legacyFile);

  if (full.startsWith('/api/auth')) return { phase: 1, module: 'auth' };
  if (full.startsWith('/api/admin/identity') || baseName === 'adminIdentityRoutes.ts') return { phase: 1, module: 'admin-identity' };
  if (full.startsWith('/api/admin/customers') || baseName === 'adminCustomerRoutes.ts') return { phase: 1, module: 'admin-customers' };

  if (baseName === 'marketMetalImportRoutes.ts') return { phase: 2, module: 'market-metal' };
  if (baseName === 'masterDataCutoverRoutes.ts' || baseName === 'masterDataExportRoutes.ts') return { phase: 2, module: 'master-data-export' };
  if (full.startsWith('/api/master/commercial-pricing-rules')) return { phase: 2, module: 'commercial-pricing-rules' };
  if (full.startsWith('/api/master') || full.startsWith('/api/platform/db') || baseName === 'masterDataRoutes.ts') return { phase: 2, module: 'master-data' };

  if (full.startsWith('/api/cables') || full.startsWith('/api/technical-office') || full.startsWith('/api/v2/cables') || baseName === 'cableAuthorityRoutes.ts' || baseName === 'v2CableSearchRoutes.ts') {
    return { phase: 3, module: 'cable-authority' };
  }

  if (full.startsWith('/api/inquiries') || (full.startsWith('/api/quotations') && !full.includes('commercial-pricing')) || baseName === 'commercialRoutes.ts') {
    return { phase: 4, module: 'commercial-inquiries-quotations' };
  }
  if (full.startsWith('/api/commercial-pricing') || baseName === 'commercialPricingRoutes.ts') return { phase: 4, module: 'commercial-pricing' };
  if (full.startsWith('/api/v2/inquiries') || baseName === 'v2InquiryConfigurationRoutes.ts') return { phase: 4, module: 'v2-inquiry-configuration' };
  if (baseName === 'v2PlatformRoutes.ts') return { phase: 4, module: 'v2-platform' };

  if (full.startsWith('/api/costing') || full.startsWith('/api/admin/costing') || full.startsWith('/api/admin/platform') || baseName.startsWith('costing') || baseName === 'platformAdminRoutes.ts') {
    return { phase: 5, module: 'costing' };
  }

  if (baseName === 'containerStudyRoutes.ts' || full.includes('/container-study') || full.includes('/containers')) return { phase: 6, module: 'container-study' };
  if (baseName === 'shippingCostRoutes.ts' || baseName === 'customerShippingCostRoutes.ts' || baseName === 'shipmentCostSnapshotRoutes.ts' || full.includes('shipping')) return { phase: 6, module: 'shipping' };
  if (baseName === 'financialOfferSnapshotRoutes.ts' || full.includes('financial-offer')) return { phase: 6, module: 'financial-offer' };

  if (baseName === 'workflowRoutes.ts' || full.startsWith('/api/v2/workflows')) return { phase: 7, module: 'workflows' };
  if (baseName === 'notificationRoutes.ts' || full.startsWith('/api/notifications')) return { phase: 7, module: 'notifications' };
  if (baseName === 'customerServiceRoutes.ts' || full.startsWith('/api/customer-service')) return { phase: 7, module: 'customer-service' };
  if (baseName === 'commercialCommitmentRoutes.ts' || full.startsWith('/api/commercial-commitments') || full.startsWith('/api/sales-') || full.startsWith('/api/agreement-')) {
    return { phase: 7, module: 'commercial-commitments' };
  }

  if (full === '/api/ai/assistant') return { phase: 8, module: 'ai-assistant' };
  if (full.startsWith('/api/d365') || full.startsWith('/api/advaris')) return { phase: 8, module: 'enterprise-integrations' };
  if (full.startsWith('/api/platform/health') || full.startsWith('/api/platform/status')) return { phase: 0, module: 'platform-health' };

  return { phase: 8, module: 'core-platform' };
}

function parseServer() {
  const content = fs.readFileSync(serverTsPath, 'utf-8');
  const lines = content.split('\n');

  // Find imports: import { router1, router2 } from './src/server/...'
  const importMap = new Map(); // routerName -> relative path
  for (const line of lines) {
    const impMatch = line.match(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/);
    if (impMatch) {
      const vars = impMatch[1].split(',').map((s) => s.trim().replace(/^.*as\s+/, ''));
      let rel = impMatch[2];
      if (!rel.endsWith('.ts')) rel += '.ts';
      const absPath = path.resolve(rootDir, rel);
      for (const v of vars) {
        if (v) importMap.set(v, absPath);
      }
    }
  }

  // Find app.use('/api/...', routerVar)
  const mounts = [];
  const directEndpoints = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // app.use('/mount', router)
    const mountMatch = line.match(/app\.use\(\s*['"]([^'"]+)['"]\s*,\s*([a-zA-Z0-9_]+)\s*\)/);
    if (mountMatch) {
      const mountPath = mountMatch[1];
      const routerVar = mountMatch[2];
      const sourceFile = importMap.get(routerVar);
      if (sourceFile) {
        mounts.push({ mountPath, routerVar, sourceFile });
      }
    }

    // Direct app endpoints: app.get('/api/...', ...)
    const directMatch = line.match(/app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/);
    if (directMatch) {
      const method = directMatch[1].toUpperCase();
      const routePath = directMatch[2];
      const cat = categorizeEndpoint('', routePath, serverTsPath);
      directEndpoints.push({
        method,
        fullPath: routePath,
        mountPath: '',
        routePath,
        legacyFile: 'server.ts',
        lineNumber: lineNum,
        middlewares: [],
        targetPhase: cat.phase,
        targetModule: cat.module,
      });
    }
  }

  return { mounts, directEndpoints };
}

function parseRouteFile(filePath, mountPath, targetRouterName) {
  if (!fs.existsSync(filePath)) return [];
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const endpoints = [];

  // Look for router calls: [a-zA-Z0-9_]+\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]
  // Also handle chained .route('/path').get(...).post(...)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Direct router method call
    const regex = /(?:[a-zA-Z0-9_]+)\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
    let match;
    while ((match = regex.exec(line)) !== null) {
      const method = match[1].toUpperCase();
      const routePath = match[2];

      // Extract middlewares from remainder of the line or arguments
      const argSub = line.slice(match.index + match[0].length);
      const middlewares = [];
      if (argSub.includes('requirePermission')) {
        const permMatch = argSub.match(/requirePermission\(([^)]+)\)/);
        if (permMatch) middlewares.push(`requirePermission(${permMatch[1].trim()})`);
      }
      if (argSub.includes('loginRateLimit')) {
        middlewares.push('loginRateLimit');
      }
      if (argSub.includes('authenticate')) {
        middlewares.push('authenticate');
      }

      const fullPath = (mountPath + (routePath.startsWith('/') ? routePath : '/' + routePath))
        .replace(/\/+/g, '/')
        .replace(/\/$/, '') || '/';
      const cat = categorizeEndpoint(mountPath, routePath, filePath);

      endpoints.push({
        method,
        fullPath,
        mountPath,
        routePath,
        legacyFile: path.relative(rootDir, filePath).replace(/\\/g, '/'),
        lineNumber: lineNum,
        middlewares,
        targetPhase: cat.phase,
        targetModule: cat.module,
      });
    }
  }

  return endpoints;
}

export function run() {
  const { mounts, directEndpoints } = parseServer();
  const allEndpoints = [...directEndpoints];

  for (const m of mounts) {
    const eps = parseRouteFile(m.sourceFile, m.mountPath, m.routerVar);
    allEndpoints.push(...eps);
  }

  // Also include attached routes:
  // attachQuotationPricingRoutes(quotationsRouter) in src/server/commercialPricingRoutes.ts
  const commPricingFile = path.resolve(rootDir, 'src/server/commercialPricingRoutes.ts');
  allEndpoints.push(...parseRouteFile(commPricingFile, '/api/quotations', 'quotationsRouter'));

  // attachCommercialApprovalRoutes(quotationsRouter) in src/server/commercialCommitmentRoutes.ts
  const commCommitFile = path.resolve(rootDir, 'src/server/commercialCommitmentRoutes.ts');
  allEndpoints.push(...parseRouteFile(commCommitFile, '/api/quotations', 'quotationsRouter'));

  // Deduplicate by method + fullPath + lineNumber
  const seen = new Set();
  const uniqueEndpoints = [];
  for (const ep of allEndpoints) {
    const key = `${ep.method} ${ep.fullPath} ${ep.legacyFile}:${ep.lineNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEndpoints.push(ep);
    }
  }

  uniqueEndpoints.sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));

  // Summary by Phase
  const byPhase = {};
  for (const ep of uniqueEndpoints) {
    byPhase[ep.targetPhase] = (byPhase[ep.targetPhase] || 0) + 1;
  }

  let md = `# Energya Connect: جرد الـ Endpoints الكامل (Endpoint Inventory)\n\n`;
  md += `> تم إنشاء هذا الجرد آلياً من فحص \`server.ts\` وجميع ملفات \`src/server/*Routes.ts\`.\n`;
  md += `> إجمالي الـ Endpoints المحصورة: **${uniqueEndpoints.length}** endpoint.\n\n`;

  md += `## 1. توزيع الـ Endpoints حسب المراحل (Phases)\n\n`;
  md += `| Phase | الوصف | عدد الـ Endpoints | النسبة | المستهدف في NestJS |\n`;
  md += `|---|---|---|---|---|\n`;

  const phaseDescriptions = {
    0: { desc: 'الأساس والأمان وفحص الصحة', target: 'platform-health / common' },
    1: { desc: 'الهوية والمصادقة والصلاحيات والعملاء', target: 'auth, admin-identity, admin-customers, common/rbac' },
    2: { desc: 'البيانات الأساسية والمعادن والاستيراد', target: 'master-data, market-metal, master-data-export' },
    3: { desc: 'هيئة الكابلات والبحث والمكتب الفني', target: 'cable-authority, technical-office' },
    4: { desc: 'الطلبات التجارية والتسعير وعروض الأسعار', target: 'inquiries, quotations, commercial-pricing' },
    5: { desc: 'التكاليف وحسابات الكابلات (Costing)', target: 'costing, admin-costing, platform-admin' },
    6: { desc: 'دراسة الحاويات والشحن والعرض المالي', target: 'container-study, shipping, financial-offer' },
    7: { desc: 'سير العمل والإشعارات وخدمة العملاء والارتباطات', target: 'workflows, notifications, customer-service, commitments' },
    8: { desc: 'الذكاء الاصطناعي والتكاملات الخارجية والمساعدات', target: 'ai-assistant, d365, advaris, core-platform' },
  };

  for (let p = 0; p <= 8; p++) {
    const count = byPhase[p] || 0;
    const pct = ((count / uniqueEndpoints.length) * 100).toFixed(1);
    const info = phaseDescriptions[p];
    md += `| Phase ${p} | ${info.desc} | **${count}** | ${pct}% | \`${info.target}\` |\n`;
  }
  md += `| **الإجمالي** | **جميع المراحل** | **${uniqueEndpoints.length}** | **100%** | - |\n\n`;

  md += `## 2. جدول الـ Endpoints المفصل\n\n`;
  md += `| # | Method | Path | Legacy Handler File:Line | Target Phase | Target NestJS Module | Middlewares / Guards |\n`;
  md += `|---|---|---|---|---|---|---|\n`;

  uniqueEndpoints.forEach((ep, idx) => {
    const mw = ep.middlewares.length > 0 ? ep.middlewares.map((m) => `\`${m}\``).join(', ') : '-';
    md += `| ${idx + 1} | \`${ep.method}\` | \`${ep.fullPath}\` | [${ep.legacyFile}:${ep.lineNumber}](file:///${path.resolve(rootDir, ep.legacyFile).replace(/\\/g, '/')}#L${ep.lineNumber}) | Phase ${ep.targetPhase} | \`${ep.targetModule}\` | ${mw} |\n`;
  });

  const outPath = path.resolve(rootDir, 'docs/MIGRATION/ENDPOINT_INVENTORY.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, md, 'utf-8');

  console.log(`Endpoint Inventory written successfully: ${uniqueEndpoints.length} endpoints -> ${outPath}`);
  console.log('Breakdown by phase:', byPhase);
}

run();
