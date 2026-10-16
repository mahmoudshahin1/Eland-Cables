import { Injectable } from '@nestjs/common';
import {
  listDrumCandidates,
  buildDrumMasterEngineeringGapReport,
  validateManualDrumPlan,
  optimizeDrumPlan,
  optimizeDrumPlanForSchedule,
} from '../../shared/domain/drumOptimizationService.js';

@Injectable()
export class DrumOptimizationService {
  computeCandidates(
    drums: any[],
    cable: {
      cableDiameterMm?: number;
      outputDiameterMm?: number | null;
      approxWeightKgKm?: number;
    },
    cuttingLengthM: number,
    cableTolerancePercent: number,
  ) {
    const cableInput = {
      cableDiameterMm: Number(cable.cableDiameterMm),
      outputDiameterMm: cable.outputDiameterMm != null ? Number(cable.outputDiameterMm) : null,
      approxWeightKgKm: Number(cable.approxWeightKgKm),
    };
    const result = listDrumCandidates({
      drums,
      cable: cableInput,
      cuttingLengthM,
      cableTolerancePercent,
    });
    const engineeringGap = buildDrumMasterEngineeringGapReport({
      drums,
      cableDiameterMm: cableInput.cableDiameterMm,
    });
    return {
      suitable: result.suitable,
      incomplete: result.incomplete,
      unsuitable: result.unsuitable,
      summary: {
        suitableCount: result.suitable.length,
        incompleteCount: result.incomplete.length,
        unsuitableCount: result.unsuitable.length,
        drumCount: drums.length,
      },
      engineeringGap,
    };
  }

  validatePlan(
    drums: any[],
    cable: {
      cableDiameterMm?: number;
      outputDiameterMm?: number | null;
      approxWeightKgKm?: number;
    },
    cableTolerancePercent: number,
    rows: any[],
    includeEngineering: boolean = true,
  ) {
    return validateManualDrumPlan({
      drums,
      cable: {
        cableDiameterMm: Number(cable.cableDiameterMm),
        outputDiameterMm: cable.outputDiameterMm != null ? Number(cable.outputDiameterMm) : null,
        approxWeightKgKm: Number(cable.approxWeightKgKm),
      },
      cableTolerancePercent: Number(cableTolerancePercent),
      rows: rows.map((r: any) => ({
        drumCode: String(r.drumCode || ''),
        numberOfDrums: Number(r.numberOfDrums),
        cuttingLengthM: Number(r.cuttingLengthM),
        drumTolerancePercent: Number(r.drumTolerancePercent ?? 0),
      })),
      includeEngineering,
    });
  }

  optimize(
    drums: any[],
    cable: {
      cableDiameterMm?: number;
      outputDiameterMm?: number | null;
      approxWeightKgKm?: number;
    },
    body: {
      totalOrderLengthM?: number;
      requestedDrumCount?: number;
      cableTolerancePercent?: number;
      drumTolerancePercent?: number;
      includeEngineering?: boolean;
      requirements?: any[];
    },
  ) {
    const cableInput = {
      cableDiameterMm: Number(cable.cableDiameterMm),
      outputDiameterMm: cable.outputDiameterMm != null ? Number(cable.outputDiameterMm) : null,
      approxWeightKgKm: Number(cable.approxWeightKgKm),
    };
    const cableTolerancePercent = Number(body.cableTolerancePercent);
    const drumTolerancePercent = body.drumTolerancePercent != null ? Number(body.drumTolerancePercent) : 0;
    const includeEngineering = body.includeEngineering !== false;
    const requirementRows = Array.isArray(body.requirements) ? body.requirements : [];

    if (requirementRows.length > 0) {
      return optimizeDrumPlanForSchedule({
        drums,
        cable: cableInput,
        cableTolerancePercent,
        drumTolerancePercent,
        includeEngineering,
        requirements: requirementRows,
      });
    }

    const rawCount = Number(body.requestedDrumCount);
    const requestedDrumCount = Number.isFinite(rawCount) && rawCount >= 1 ? Math.floor(rawCount) : 1;

    return optimizeDrumPlan({
      drums,
      cable: cableInput,
      totalOrderLengthM: Number(body.totalOrderLengthM),
      requestedDrumCount,
      cableTolerancePercent,
      drumTolerancePercent,
      includeEngineering,
    });
  }
}
