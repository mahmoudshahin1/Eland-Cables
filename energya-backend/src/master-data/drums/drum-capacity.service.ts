import { Injectable } from '@nestjs/common';
import { calculateDrumCapacity } from '../../shared/domain/drumCapacityCalculator.js';

@Injectable()
export class DrumCapacityService {
  computeCapacity(
    drum: {
      drumCode?: string;
      flange?: number;
      barrel?: number;
      innerWidth?: number;
      clearanceMm?: number | null;
      maxLoadKg?: number | null;
      maxWeight?: number | null;
      emptyDrumNetWeightKg?: number | null;
    },
    cable: {
      cableDiameterMm?: number;
      outputDiameterMm?: number | null;
      approxWeightKgKm?: number;
    },
  ) {
    return calculateDrumCapacity(
      {
        drumCode: String(drum.drumCode || 'UNKNOWN'),
        flange: Number(drum.flange),
        barrel: Number(drum.barrel),
        innerWidth: Number(drum.innerWidth),
        clearanceMm: drum.clearanceMm != null ? Number(drum.clearanceMm) : null,
        maxLoadKg: drum.maxLoadKg != null ? Number(drum.maxLoadKg) : drum.maxWeight != null ? Number(drum.maxWeight) : null,
        emptyDrumNetWeightKg: drum.emptyDrumNetWeightKg != null ? Number(drum.emptyDrumNetWeightKg) : null,
      },
      {
        cableDiameterMm: Number(cable.cableDiameterMm),
        outputDiameterMm: cable.outputDiameterMm != null ? Number(cable.outputDiameterMm) : null,
        approxWeightKgKm: Number(cable.approxWeightKgKm),
      },
    );
  }
}
