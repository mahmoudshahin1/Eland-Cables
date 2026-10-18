import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { RequestActor } from '../interfaces/request-actor.interface.js';
import {
  assertCanViewMasterDataCatalog,
  assertCanUseDrumOptimization,
  assertCanWriteCableMaster,
  assertCanWriteBomAndRawMaterials,
  assertCanImportMasterData,
  assertCanExportMasterData,
  assertCanManageScrapRules,
  assertCanViewCostingFormulas,
  assertCanProposeRawMaterialPrice,
  assertCanEditEngineeringMapping,
  assertCanInvestigateBomGovernance,
  assertCanManagePricingRules,
  assertCanManageCostingConfiguration,
} from '../../shared/domain/rbac.js';
import { DomainError } from '../../shared/errors/domainError.js';

function getActor(context: ExecutionContext): RequestActor | null {
  const req = context.switchToHttp().getRequest();
  return req.user || null;
}

@Injectable()
export class MasterReadAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required to view master data.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      assertCanViewMasterDataCatalog(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        const isSignIn = /sign in/i.test(err.message);
        if (isSignIn) {
          throw new UnauthorizedException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
        }
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class DrumComputeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required for drum optimization.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      assertCanUseDrumOptimization(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        const isSignIn = /sign in/i.test(err.message);
        if (isSignIn) {
          throw new UnauthorizedException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
        }
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class MasterWriteAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required to change Cable Master.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      assertCanWriteCableMaster(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class BomRmAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required to change BOM or raw materials.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      assertCanWriteBomAndRawMaterials(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class MasterImportAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required to import master data.',
        code: 'UNAUTHORIZED',
      });
    }

    try {
      assertCanImportMasterData(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class MasterExportAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context);
    if (!actor || (!actor.id && !actor.email && !actor.name)) {
      throw new UnauthorizedException({
        error: 'Sign in is required to export master data.',
        code: 'UNAUTHORIZED',
      });
    }

    const req = context.switchToHttp().getRequest();
    const entity = req.params?.entity || 'cables';

    try {
      assertCanExportMasterData(actor, entity);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class ScrapManageAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context) || { userType: 'anonymous' };
    try {
      assertCanManageScrapRules(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class CostingFormulaAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context) || { userType: 'anonymous' };
    try {
      assertCanViewCostingFormulas(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class RawMaterialPriceProposeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context) || { userType: 'anonymous' };
    try {
      assertCanProposeRawMaterialPrice(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class EngineeringMappingEditAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context) || { userType: 'anonymous' };
    try {
      assertCanEditEngineeringMapping(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class BomGovernanceInvestigateAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context) || { userType: 'anonymous' };
    try {
      assertCanInvestigateBomGovernance(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class PricingRulesManageAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context) || { userType: 'anonymous' };
    try {
      assertCanManagePricingRules(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}

@Injectable()
export class CostingConfigurationManageAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const actor = getActor(context) || { userType: 'anonymous' };
    try {
      assertCanManageCostingConfiguration(actor);
      return true;
    } catch (err: any) {
      if (err instanceof DomainError || err?.code === 'UNAUTHORIZED') {
        const isSignIn = /sign in/i.test(err.message);
        if (isSignIn) {
          throw new UnauthorizedException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
        }
        throw new ForbiddenException({ error: err.message, code: err.code || 'UNAUTHORIZED' });
      }
      throw err;
    }
  }
}
