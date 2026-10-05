import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { checkDatabase } from './src/server/db';
import { applyCors, applySecurityHeaders } from './src/server/httpSecurity';
import { masterDataRouter, platformDbRouter } from './src/server/masterDataRoutes';
import { marketMetalImportRouter } from './src/server/marketMetalImportRoutes';
import { masterDataCutoverRouter } from './src/server/masterDataCutoverRoutes';
import { masterDataExportRouter } from './src/server/masterDataExportRoutes';
import { cableAuthorityRouter, technicalOfficeRouter } from './src/server/cableAuthorityRoutes';
import { costingRouter } from './src/server/costingRoutes';
import { costingAdminRouter } from './src/server/costingAdminRoutes';
import { platformAdminRouter } from './src/server/platformAdminRoutes';
import { v2PlatformRouter } from './src/server/v2PlatformRoutes';
import { v2InquiryConfigurationRouter } from './src/server/v2InquiryConfigurationRoutes';
import { v2CableSearchRouter } from './src/server/v2CableSearchRoutes';
import { containerStudyRouter } from './src/server/containerStudyRoutes';
import { shippingCostRouter } from './src/server/shippingCostRoutes';
import { customerShippingCostRouter } from './src/server/customerShippingCostRoutes';
import { shipmentCostSnapshotRouter } from './src/server/shipmentCostSnapshotRoutes';
import { financialOfferSnapshotRouter } from './src/server/financialOfferSnapshotRoutes';
import { workflowRouter } from './src/server/workflowRoutes';
import { notificationRouter } from './src/server/notificationRoutes';
import { inquiriesRouter, quotationsRouter } from './src/server/commercialRoutes';
import { customerServiceRouter } from './src/server/customerServiceRoutes';
import { pricingMasterRouter, commercialPricingRouter, attachQuotationPricingRoutes } from './src/server/commercialPricingRoutes';
import {
  attachCommercialApprovalRoutes,
  agreementReleasesRouter,
  commercialCommitmentsRouter,
  epcSalesOrdersRouter,
  salesAgreementsRouter,
} from './src/server/commercialCommitmentRoutes';
import { identityAuthRouter } from './src/server/identityAuthRoutes';
import { adminIdentityRouter } from './src/server/adminIdentityRoutes';
import { adminCustomerRouter } from './src/server/adminCustomerRoutes';
import { postAiAssistant } from './src/server/aiAssistantHandler';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3847;

app.disable('x-powered-by');
app.use(applySecurityHeaders);
app.use(applyCors);
app.use(express.json({ limit: '10mb' }));
app.use('/api/auth', identityAuthRouter);
app.use('/api/admin', adminIdentityRouter);
app.use('/api/admin', adminCustomerRouter);

app.post('/api/ai/assistant', postAiAssistant);

app.get('/api/platform/health', async (_req, res) => {
  const db = await checkDatabase();
  res.status(db.ok ? 200 : 200).json({
    ok: true,
    service: 'energya-connect',
    architecture: 'modular-monolith',
    database: db,
  });
});

app.get('/api/platform/status', async (_req, res) => {
  const db = await checkDatabase();
  res.json({
    persistence: db.ok ? 'POSTGRESQL_SOT_WITH_LOCALSTORAGE_COMPAT' : 'BROWSER_LOCAL_AND_PROCESS_MEMORY',
    postgresql: db.ok,
    nestjs: false,
    prisma: Boolean(process.env.DATABASE_URL),
    d365DomainAdapters: 'NOT_IMPLEMENTED',
    note: 'GET /api/d365/sync-status remains a prototype stub and must not be treated as live ERP connectivity. localStorage remains until each domain is fully cut over.',
    database: db,
  });
});

app.use('/api/platform', platformDbRouter);
app.use('/api/master', masterDataRouter);
app.use('/api/master', marketMetalImportRouter);
app.use('/api/master', masterDataCutoverRouter);
app.use('/api/master', masterDataExportRouter);
app.use('/api/master/commercial-pricing-rules', pricingMasterRouter);
app.use('/api/cables', cableAuthorityRouter);
app.use('/api/technical-office', technicalOfficeRouter);
app.use('/api/costing', costingRouter);
app.use('/api/admin/costing', costingAdminRouter);
app.use('/api/admin/platform', platformAdminRouter);
app.use('/api/v2/inquiries', v2InquiryConfigurationRouter);
app.use('/api/v2/cables', v2CableSearchRouter);
app.use('/api/v2/workflows', workflowRouter);
app.use('/api/notifications', notificationRouter);
app.use('/api/v2', containerStudyRouter);
app.use('/api/v2', shippingCostRouter);
app.use('/api/v2', customerShippingCostRouter);
app.use('/api/v2', shipmentCostSnapshotRouter);
app.use('/api/v2', financialOfferSnapshotRouter);
app.use('/api/v2', v2PlatformRouter);
app.use('/api/commercial-pricing', commercialPricingRouter);
app.use('/api/inquiries', inquiriesRouter);
app.use('/api/customer-service', customerServiceRouter);
attachQuotationPricingRoutes(quotationsRouter);
attachCommercialApprovalRoutes(quotationsRouter);
app.use('/api/quotations', quotationsRouter);
app.use('/api/commercial-commitments', commercialCommitmentsRouter);
app.use('/api/sales-orders', epcSalesOrdersRouter);
app.use('/api/sales-agreements', salesAgreementsRouter);
app.use('/api/agreement-releases', agreementReleasesRouter);

// Enterprise Integrations Status API
app.get('/api/d365/sync-status', (_req, res) => {
  res.json({
    connected: false,
    status: 'NOT_CONNECTED',
    erpSystem: 'Microsoft Dynamics 365 Finance & Operations',
    lastSync: null,
    entityCounts: null,
    syncHealth: 'NOT_CONNECTED',
    note: 'D365 F&O is not integrated. Domain adapters return NOT_IMPLEMENTED. This endpoint must not report connected:true.',
  });
});

app.get('/api/advaris/mes-status', (_req, res) => {
  res.json({
    connected: false,
    status: 'NOT_CONNECTED',
    mesSystem: 'Advaris Cable MES',
    activeProductionLines: null,
    efficiencyOEE: null,
    liveJobs: null,
    syncHealth: 'NOT_CONNECTED',
    note: 'Advaris MES is not connected. Shop-floor metrics are not live.',
  });
});

// Setup Vite Development or Static Production Middleware
async function startServer() {
  // Unmatched /api/* requests must never fall through to Vite or the SPA index.html.
  app.use('/api', (req, res) => {
    res.status(404).json({
      error: 'API route not found.',
      hint: 'If this route was recently added, restart the dev server (npm run dev) or rebuild production (npm run build). Express does not hot-reload new API routes.',
      method: req.method,
      path: req.originalUrl,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true, host: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({
          error: 'API route not found.',
          hint: 'Rebuild production (npm run build) so server.cjs includes the latest API routes.',
          method: req.method,
          path: req.originalUrl,
        });
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Bind IPv6 unspecified so ::1 and 127.0.0.1 both work (Cursor Preview often uses IPv6 localhost).
  const HOST = process.env.HOST || '0.0.0.0';

  app.listen(PORT, HOST, () => {
    console.log(`Energya Connect Platform running on http://${HOST}:${PORT}`);
  });
}

startServer();

