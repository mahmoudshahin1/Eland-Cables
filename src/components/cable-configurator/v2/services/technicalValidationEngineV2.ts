import { evaluateCableAuthority, CableMasterSnapshot } from '../../../../domain/cableAuthority';
import { recordsToSnapshots, selectionsToConfig } from '../../../../api/cableAuthorityMapping';
import { CableRecordV2, SelectionStateV2, TechnicalValidationResultV2 } from '../types';
import { getAllMasterRecordsV2 } from './cableSelectionEngineV2';
import { presentCableAuthorityDecision } from './technicalValidationPresentationV2';

export {
  parseNumber,
  generateTechnicalDescriptionV2,
  estimateCablePhysicals,
  selectionsToConfig,
  recordsToSnapshots,
} from '../../../../api/cableAuthorityMapping';
export { validateCableConfigurationV2 } from './iecPrototypeValidationV2';

/**
 * Full Evaluation Function:
 * 1. Runs prototype IEC notes as warnings only (not a second authority).
 * 2. Cable Master existence and parameter compatibility come from evaluateCableAuthority.
 *
 * Server / backend tests keep this path. Frontend must not import this file.
 */
export function evaluateCableConfigurationV2(
  selections: SelectionStateV2,
  allMasterRecords: CableRecordV2[] = getAllMasterRecordsV2(),
  authority?: {
    cables?: CableMasterSnapshot[];
    parameters?: { kind: string; code: string; status?: string }[];
    compatibility?: { fromKind: string; fromCode: string; toKind: string; toCode: string; relation: 'ALLOWED' | 'FORBIDDEN' }[];
  }
): TechnicalValidationResultV2 {
  const decision = evaluateCableAuthority(selectionsToConfig(selections), {
    cables: authority?.cables || recordsToSnapshots(allMasterRecords),
    parameters: authority?.parameters || [],
    compatibility: authority?.compatibility || [],
  });

  return presentCableAuthorityDecision(selections, decision, allMasterRecords);
}
