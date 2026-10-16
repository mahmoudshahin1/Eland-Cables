import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import http from 'http';
import { masterDataRouter } from '../../src/server/masterDataRoutes';
import { getPrisma } from '../../src/server/db';

async function main() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api/master', masterDataRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const base = `http://127.0.0.1:${addr.port}`;

  console.log('Legacy app listening on', base);

  const prisma = getPrisma();
  if (!prisma) throw new Error('Database not connected');

  const materialNumber = '10009487';

  console.log('Seeding cable and attachment directly into database...');
  await prisma.cableMaster.upsert({
    where: { materialNumber },
    create: {
      materialNumber,
      itemCode: 'ITEM-10009487',
      customerCode: 'N2XH',
      description: 'Confidential Power Cable 1x240 mm2',
      voltage: 'LV',
      conductor: 'Copper',
      cores: '1C',
      diameter: 28.5,
      weight: 2950,
      status: 'ACTIVE',
    },
    update: {
      status: 'ACTIVE',
    },
  });

  const testPayload = {
    materialNumber,
    kind: 'TECHNICAL_OFFER',
    fileName: 'confidential_cable_spec.pdf',
    mimeType: 'application/pdf',
    byteSize: 58,
    content: Buffer.from('%PDF-1.4 Confirmed Internal Proprietary Technical Drawing'),
    source: 'TECHNICAL_OFFICE',
    uploadedBy: 'admin@energya.com',
  };

  const attachment = await prisma.cableMasterAttachment.upsert({
    where: { materialNumber_kind: { materialNumber, kind: testPayload.kind } },
    create: testPayload,
    update: testPayload,
  });

  const attachmentId = attachment.id;
  console.log(`Attachment seeded successfully with ID: ${attachmentId}`);

  // 2. PROBE ANONYMOUS: GET /api/master/cables/:materialNumber/attachments WITHOUT ANY TOKEN
  console.log('\n--- PROBE ANONYMOUS: GET /api/master/cables/:mat/attachments (NO TOKEN) ---');
  const listRes = await fetch(`${base}/api/master/cables/${materialNumber}/attachments`);
  const listStatus = listRes.status;
  const listData = await listRes.json();
  console.log(`Status: ${listStatus}`);
  console.log('Verbatim response payload:');
  console.log(JSON.stringify(listData, null, 2));

  // 3. PROBE ANONYMOUS: GET /api/master/cables/:mat/attachments/:id WITHOUT ANY TOKEN
  console.log('\n--- PROBE ANONYMOUS: GET /api/master/cables/:mat/attachments/:id (NO TOKEN) ---');
  const dlRes = await fetch(`${base}/api/master/cables/${materialNumber}/attachments/${attachmentId}`);
  const dlStatus = dlRes.status;
  const dlContentType = dlRes.headers.get('content-type');
  const dlContentDisp = dlRes.headers.get('content-disposition');
  const dlBuffer = await dlRes.arrayBuffer();
  const dlText = Buffer.from(dlBuffer).toString('utf8');

  console.log(`Status: ${dlStatus}`);
  console.log(`Content-Type: ${dlContentType}`);
  console.log(`Content-Disposition: ${dlContentDisp}`);
  console.log(`Bytes Received: ${dlBuffer.byteLength}`);
  console.log(`Verbatim File Content Preview: ${dlText}`);

  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
