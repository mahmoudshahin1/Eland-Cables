import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

interface MountInfo {
  mountPath: string;
  routerExportName: string;
  sourceFile: string;
}

interface EndpointRecord {
  method: string;
  fullPath: string;
  mountPath: string;
  routePath: string;
  legacyFile: string;
  lineNumber: number;
  middlewares: string[];
  targetPhase: number;
  targetModule: string;
}

// Map mounts and files to Phase and Target Module based on MIGRATION_PLAN.md
function categorizeEndpoint(mountPath: string, routePath: string, legacyFile: string): { phase: number; module: string } {
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

function parseServerTs(serverTsPath: string): { mounts: MountInfo[]; directEndpoints: EndpointRecord[] } {
  const content = fs.readFileSync(serverTsPath, 'utf-8');
  const sourceFile = ts.createSourceFile(serverTsPath, content, ts.ScriptTarget.Latest, true);

  // 1. Gather import statements: imported identifier -> relative file path
  const importMap = new Map<string, string>(); // routerName -> filePath
  sourceFile.statements.forEach((stmt) => {
    if (ts.isImportDeclaration(stmt) && stmt.importClause && stmt.importClause.namedBindings) {
      const moduleSpecifier = (stmt.moduleSpecifier as ts.StringLiteral).text;
      if (ts.isNamedImports(stmt.importClause.namedBindings)) {
        for (const el of stmt.importClause.namedBindings.elements) {
          const importedName = el.name.text;
          const propName = el.propertyName ? el.propertyName.text : importedName;
          let resolved = moduleSpecifier;
          if (!resolved.endsWith('.ts')) resolved += '.ts';
          if (resolved.startsWith('./')) resolved = path.resolve(path.dirname(serverTsPath), resolved);
          importMap.set(importedName, resolved);
        }
      }
    }
  });

  const mounts: MountInfo[] = [];
  const directEndpoints: EndpointRecord[] = [];

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const objName = expr.expression.getText(sourceFile);
        const methodName = expr.name.getText(sourceFile);

        // Check app.use('/api/...', router)
        if (objName === 'app' && methodName === 'use' && node.arguments.length >= 2) {
          const firstArg = node.arguments[0];
          const secondArg = node.arguments[1];
          if (ts.isStringLiteral(firstArg) && ts.isIdentifier(secondArg)) {
            const mountPath = firstArg.text;
            const routerVar = secondArg.text;
            const resolvedPath = importMap.get(routerVar) || '';
            mounts.push({
              mountPath,
              routerExportName: routerVar,
              sourceFile: resolvedPath,
            });
          }
        }

        // Check direct endpoints on app: app.get, app.post, app.put, etc.
        const httpMethods = ['get', 'post', 'put', 'patch', 'delete'];
        if (objName === 'app' && httpMethods.includes(methodName.toLowerCase()) && node.arguments.length >= 2) {
          const firstArg = node.arguments[0];
          if (ts.isStringLiteral(firstArg)) {
            const routePath = firstArg.text;
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
            const cat = categorizeEndpoint('', routePath, serverTsPath);
            directEndpoints.push({
              method: methodName.toUpperCase(),
              fullPath: routePath,
              mountPath: '',
              routePath,
              legacyFile: 'server.ts',
              lineNumber: line + 1,
              middlewares: [],
              targetPhase: cat.phase,
              targetModule: cat.module,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return { mounts, directEndpoints };
}

function parseRouterFile(filePath: string, mountPath: string, routerVarName: string): EndpointRecord[] {
  if (!fs.existsSync(filePath)) {
    console.warn('File does not exist: ' + filePath);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  const endpoints: EndpointRecord[] = [];
  const httpMethods = new Set(['get', 'post', 'put', 'patch', 'delete']);

  function extractMiddlewares(args: ts.NodeArray<ts.Expression>): string[] {
    const list: string[] = [];
    // Arguments between first (path) and last (handler) are typically middlewares
    for (let i = 1; i < args.length - 1; i++) {
      list.push(args[i].getText(sourceFile).replace(/\s+/g, ' '));
    }
    return list;
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const methodName = expr.name.getText(sourceFile).toLowerCase();

        if (httpMethods.has(methodName) && node.arguments.length >= 1) {
          const firstArg = node.arguments[0];
          // E.g. router.get('/path', ...)
          if (ts.isStringLiteral(firstArg)) {
            const routePath = firstArg.text;
            const callerText = expr.expression.getText(sourceFile);
            const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));

            const fullPath = (mountPath + (routePath.startsWith('/') ? routePath : '/' + routePath)).replace(/\/+/g, '/').replace(/\/$/, '') || '/';
            const cat = categorizeEndpoint(mountPath, routePath, filePath);

            endpoints.push({
              method: methodName.toUpperCase(),
              fullPath,
              mountPath,
              routePath,
              legacyFile: path.relative(process.cwd(), filePath).replace(/\\/g, '/'),
              lineNumber: line + 1,
              middlewares: extractMiddlewares(node.arguments),
              targetPhase: cat.phase,
              targetModule: cat.module,
            });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return endpoints;
}

export function generateInventory() {
  const rootDir = process.cwd();
  const serverTsPath = path.resolve(rootDir, 'server.ts');
  const { mounts, directEndpoints } = parseServerTs(serverTsPath);

  const allEndpoints: EndpointRecord[] = [...directEndpoints];

  for (const m of mounts) {
    if (!m.sourceFile) continue;
    const fileEndpoints = parseRouterFile(m.sourceFile, m.mountPath, m.routerExportName);
    allEndpoints.push(...fileEndpoints);
  }

  // Also check attachQuotationPricingRoutes and attachCommercialApprovalRoutes
  // which attach to quotationsRouter (mounted at /api/quotations)
  const commercialPricingFile = path.resolve(rootDir, 'src/server/commercialPricingRoutes.ts');
  const commercialCommitmentFile = path.resolve(rootDir, 'src/server/commercialCommitmentRoutes.ts');
  allEndpoints.push(...parseRouterFile(commercialPricingFile, '/api/quotations', 'quotationsRouter'));
  allEndpoints.push(...parseRouterFile(commercialCommitmentFile, '/api/quotations', 'quotationsRouter'));

  // Sort by Path then Method
  allEndpoints.sort((a, b) => a.fullPath.localeCompare(b.fullPath) || a.method.localeCompare(b.method));

  // Deduplicate exact method + fullPath + lineNumber
  const seen = new Set<string>();
  const uniqueEndpoints: EndpointRecord[] = [];
  for (const ep of allEndpoints) {
    const key = `${ep.method} ${ep.fullPath} ${ep.legacyFile}:${ep.lineNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueEndpoints.push(ep);
    }
  }

  // Summary by Phase
  const byPhase: Record<number, number> = {};
  for (const ep of uniqueEndpoints) {
    byPhase[ep.targetPhase] = (byPhase[ep.targetPhase] || 0) + 1;
  }

  // Generate Markdown
  let md = `# Energya Connect: جرد الـ Endpoints الكامل (Endpoint Inventory)\n\n`;
  md += `> تم توليد هذا الملف آلياً من فحص \`server.ts\` وجميع ملفات \`src/server/*Routes.ts\`.\n`;
  md += `> إجمالي الـ Endpoints المحصورة: **${uniqueEndpoints.length}** endpoint.\n\n`;

  md += `## 1. توزيع الـ Endpoints حسب المراحل (Phases)\n\n`;
  md += `| Phase | الوصف | عدد الـ Endpoints | النسبة | المستهدف في NestJS |\n`;
  md += `|---|---|---|---|---|\n`;

  const phaseDescriptions: Record<number, { desc: string; target: string }> = {
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

  console.log(`Generated inventory with ${uniqueEndpoints.length} endpoints to ${outPath}`);
}

generateInventory();
