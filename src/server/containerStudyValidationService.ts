import { evaluateContainerStudyStructure, evaluateConfirmReadiness } from '../domain/containerStudyValidation';

export const containerStudyValidationService = {
  evaluateStructure: evaluateContainerStudyStructure,
  evaluateConfirm: evaluateConfirmReadiness,
};
