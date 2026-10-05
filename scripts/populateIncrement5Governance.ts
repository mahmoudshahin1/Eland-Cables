import dotenv from 'dotenv';
import fs from 'node:fs';
import {
  seedBomConflictRegister,
  upsertEngineeringMappingsForAllCables,
} from '../src/server/governanceRepository';
import { disconnectPrisma } from '../src/server/db';
import { listEngineeringMappings } from '../src/server/governanceRepository';

dotenv.config();

async function main() {
  const mapping = await upsertEngineeringMappingsForAllCables();
  const conflicts = await seedBomConflictRegister();
  const report = await listEngineeringMappings();
  fs.writeFileSync(
    'docs/ENGINEERING_MAPPING_REPORT.json',
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        note: 'Approved/SOURCE values only in family..weight columns. suggested is not master data.',
        summary: mapping,
        cables: report.map((r) => ({
          materialNumber: r.materialNumber,
          description: r.description,
          family: r.family,
          voltage: r.voltage,
          conductor: r.conductor,
          size: r.size,
          cores: r.cores,
          insulation: r.insulation,
          screen: r.screen,
          armour: r.armour,
          sheath: r.sheath,
          coreColour: r.coreColour,
          diameter: r.diameter,
          weight: r.weight,
          dataSource: r.dataSource,
          mappingStatus: r.mappingStatus,
        })),
      },
      null,
      2
    )
  );
  console.log('engineering mappings', mapping);
  console.log('bom conflict register', conflicts);
  console.log('wrote docs/ENGINEERING_MAPPING_REPORT.json');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectPrisma();
  });
