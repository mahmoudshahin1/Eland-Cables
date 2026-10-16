import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import http from 'http';
import { masterDataRouter } from '../../src/server/masterDataRoutes';
import { signTestToken } from '../../src/server/auth';
import { getPrisma } from '../../src/server/db';

async function main() {
  const app = express();
  app.use(express.json());
  app.use('/api/master', masterDataRouter);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const addr = server.address() as any;
  const base = `http://127.0.0.1:${addr.port}`;

  console.log('Legacy app listening on', base);

  // 1. Generate Customer Token (userType: customer)
  const customerToken = signTestToken({
    id: 'cust-user-1',
    email: 'custA@parity.test',
    name: 'Customer A Parity',
    userType: 'customer',
    customerId: 'cust-corp-1',
    permissions: {},
  });

  console.log('Generated customer token.');

  // 2. Request GET /api/master/raw-materials
  console.log('\n--- GET /api/master/raw-materials ---');
  const rmRes = await fetch(`${base}/api/master/raw-materials`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const rmStatus = rmRes.status;
  const rmData: any = await rmRes.json();
  console.log(`Status: ${rmStatus}`);
  if (rmStatus !== 200) console.log('RM Response Body:', rmData);
  console.log(`Total Raw Materials returned: ${Array.isArray(rmData.rawMaterials) ? rmData.rawMaterials.length : 'N/A'}`);
  if (Array.isArray(rmData.rawMaterials) && rmData.rawMaterials.length > 0) {
    console.log('First 2 raw materials verbatim:');
    console.log(JSON.stringify(rmData.rawMaterials.slice(0, 2), null, 2));
  }

  // 3. Request GET /api/master/boms
  console.log('\n--- GET /api/master/boms ---');
  const bomRes = await fetch(`${base}/api/master/boms`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const bomStatus = bomRes.status;
  const bomData: any = await bomRes.json();
  console.log(`Status: ${bomStatus}`);
  if (bomStatus !== 200) console.log('BOM Response Body:', bomData);
  console.log(`Total BOM lines returned: ${Array.isArray(bomData.boms) ? bomData.boms.length : 'N/A'}`);
  if (Array.isArray(bomData.boms) && bomData.boms.length > 0) {
    console.log('First 2 BOM lines verbatim:');
    console.log(JSON.stringify(bomData.boms.slice(0, 2), null, 2));
  }

  server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
