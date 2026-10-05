/**
 * EFFECTIVE ACCESS evaluation — deny by default.
 *
 * EFFECTIVE ACCESS =
 *   Authentication
 *   ∩ Role permissions (MODULE:RESOURCE:ACTION), including via Security Groups
 *   ∩ Resource / customer scope
 *   ∩ Record ownership
 *   ∩ Workflow state guards (optional)
 *   ∩ Field-level policy (optional)
 *
 * UI visibility is a projection of this result, never the source of truth.
 */

import { hasPermission, isAuthenticated, type PermissionActor } from '../../domain/rbacEngine';
import { permissionCode } from '../../domain/permissionCatalog';

export type AccessDecisionCode =
  | 'ALLOW'
  | 'DENY_UNAUTHENTICATED'
  | 'DENY_PERMISSION'
  | 'DENY_SCOPE'
  | 'DENY_OWNERSHIP'
  | 'DENY_WORKFLOW'
  | 'DENY_FIELD'
  | 'DENY_DEFAULT';

export interface EffectiveAccessRecordContext {
  customerId?: string | null;
  customerMasterId?: string | null;
  ownerUserId?: string | null;
  workflowStatus?: string | null;
  /** Immutable / approved states that block mutate actions */
  mutateBlockedStatuses?: string[];
}

export interface EffectiveAccessFieldPolicy {
  fieldCode: string;
  /** When set, field is denied unless actor has one of these permission codes */
  requiredPermissionCodes?: string[];
  /** When true, customers never see the field */
  hideFromCustomer?: boolean;
  readOnly?: boolean;
}

export interface EffectiveAccessRequest {
  actor: PermissionActor & {
    userType?: string;
    customerId?: string;
    customerCode?: string;
    customerScopeKeys?: string[];
    customerMasterIds?: string[];
    customerScopeStatus?: string;
  };
  module: string;
  resource: string;
  action: string;
  record?: EffectiveAccessRecordContext;
  field?: EffectiveAccessFieldPolicy;
  /** Extra permission codes granted via Security Groups (pre-resolved by caller) */
  groupPermissionCodes?: string[];
}

export interface EffectiveAccessReason {
  layer: 'auth' | 'permission' | 'scope' | 'ownership' | 'workflow' | 'field' | 'default';
  outcome: 'pass' | 'fail';
  message: string;
}

export interface EffectiveAccessResult {
  allowed: boolean;
  code: AccessDecisionCode;
  permissionCode: string;
  reasons: EffectiveAccessReason[];
  httpStatus: 200 | 401 | 403;
}

const MUTATE_ACTIONS = new Set([
  'CREATE',
  'UPDATE',
  'DELETE',
  'APPROVE',
  'REJECT',
  'SUBMIT',
  'ACTIVATE',
  'DEACTIVATE',
  'IMPORT',
  'MANAGE',
  'CALCULATE',
  'RECALCULATE',
  'ALLOCATE',
]);

function actorHasCode(
  actor: PermissionActor,
  code: string,
  groupPermissionCodes?: string[]
): boolean {
  if (actor.permissionCodes?.includes(code)) return true;
  if (groupPermissionCodes?.includes(code)) return true;
  const [module, resource, action] = code.split(':');
  if (module && resource && action) {
    // hasPermission already handles legacy flags when granular codes empty
    if (!groupPermissionCodes?.length) {
      return hasPermission(actor, module, resource, action);
    }
    // When group codes exist, also check legacy via hasPermission if no granular on actor
    if (!actor.permissionCodes?.length) {
      return hasPermission(actor, module, resource, action);
    }
  }
  return false;
}

function checkPermission(
  actor: PermissionActor,
  module: string,
  resource: string,
  action: string,
  groupPermissionCodes?: string[]
): boolean {
  const code = permissionCode({ module, resource, action });
  if (actorHasCode(actor, code, groupPermissionCodes)) return true;
  // Legacy path when no granular codes at all
  if ((!actor.permissionCodes || actor.permissionCodes.length === 0) && !groupPermissionCodes?.length) {
    return hasPermission(actor, module, resource, action);
  }
  return false;
}

function checkCustomerScope(
  actor: EffectiveAccessRequest['actor'],
  record?: EffectiveAccessRecordContext
): EffectiveAccessReason | null {
  if (actor.userType !== 'customer') {
    return { layer: 'scope', outcome: 'pass', message: 'Internal actor — customer scope N/A.' };
  }
  if (!record?.customerId && !record?.customerMasterId) {
    return { layer: 'scope', outcome: 'pass', message: 'No customer record context supplied.' };
  }
  const keys = new Set(
    [
      actor.customerId,
      actor.customerCode,
      ...(actor.customerScopeKeys || []),
      ...(actor.customerMasterIds || []),
    ]
      .filter(Boolean)
      .map((k) => String(k).toLowerCase())
  );
  const candidates = [record.customerId, record.customerMasterId]
    .filter(Boolean)
    .map((k) => String(k).toLowerCase());
  if (candidates.some((c) => keys.has(c))) {
    return { layer: 'scope', outcome: 'pass', message: 'Customer scope matches record.' };
  }
  return {
    layer: 'scope',
    outcome: 'fail',
    message: 'Customer scope does not include this record.',
  };
}

/**
 * Evaluate EFFECTIVE ACCESS. Deny by default.
 */
export function evaluateEffectiveAccess(req: EffectiveAccessRequest): EffectiveAccessResult {
  const code = permissionCode({
    module: req.module,
    resource: req.resource,
    action: req.action,
  });
  const reasons: EffectiveAccessReason[] = [];

  if (!isAuthenticated(req.actor)) {
    reasons.push({
      layer: 'auth',
      outcome: 'fail',
      message: 'Not authenticated.',
    });
    return {
      allowed: false,
      code: 'DENY_UNAUTHENTICATED',
      permissionCode: code,
      reasons,
      httpStatus: 401,
    };
  }
  reasons.push({ layer: 'auth', outcome: 'pass', message: 'Authenticated.' });

  const permitted = checkPermission(
    req.actor,
    req.module,
    req.resource,
    req.action,
    req.groupPermissionCodes
  );
  if (!permitted) {
    reasons.push({
      layer: 'permission',
      outcome: 'fail',
      message: `Missing permission ${code}.`,
    });
    return {
      allowed: false,
      code: 'DENY_PERMISSION',
      permissionCode: code,
      reasons,
      httpStatus: 403,
    };
  }
  reasons.push({
    layer: 'permission',
    outcome: 'pass',
    message: `Has permission ${code}.`,
  });

  const scopeReason = checkCustomerScope(req.actor, req.record);
  if (scopeReason) {
    reasons.push(scopeReason);
    if (scopeReason.outcome === 'fail') {
      return {
        allowed: false,
        code: 'DENY_SCOPE',
        permissionCode: code,
        reasons,
        httpStatus: 403,
      };
    }
  }

  if (req.record?.ownerUserId && MUTATE_ACTIONS.has(req.action.toUpperCase())) {
    // Soft ownership check: if owner is set and actor is customer, must match
    if (
      req.actor.userType === 'customer' &&
      req.actor.id &&
      req.record.ownerUserId !== req.actor.id
    ) {
      reasons.push({
        layer: 'ownership',
        outcome: 'fail',
        message: 'Record ownership does not match actor.',
      });
      return {
        allowed: false,
        code: 'DENY_OWNERSHIP',
        permissionCode: code,
        reasons,
        httpStatus: 403,
      };
    }
    reasons.push({ layer: 'ownership', outcome: 'pass', message: 'Ownership check passed.' });
  }

  if (
    req.record?.workflowStatus &&
    req.record.mutateBlockedStatuses?.length &&
    MUTATE_ACTIONS.has(req.action.toUpperCase())
  ) {
    if (req.record.mutateBlockedStatuses.includes(req.record.workflowStatus)) {
      reasons.push({
        layer: 'workflow',
        outcome: 'fail',
        message: `Workflow status ${req.record.workflowStatus} blocks ${req.action}.`,
      });
      return {
        allowed: false,
        code: 'DENY_WORKFLOW',
        permissionCode: code,
        reasons,
        httpStatus: 403,
      };
    }
    reasons.push({ layer: 'workflow', outcome: 'pass', message: 'Workflow allows action.' });
  }

  if (req.field) {
    if (req.field.hideFromCustomer && req.actor.userType === 'customer') {
      reasons.push({
        layer: 'field',
        outcome: 'fail',
        message: `Field ${req.field.fieldCode} hidden from customers.`,
      });
      return {
        allowed: false,
        code: 'DENY_FIELD',
        permissionCode: code,
        reasons,
        httpStatus: 403,
      };
    }
    if (req.field.requiredPermissionCodes?.length) {
      const ok = req.field.requiredPermissionCodes.some((c) =>
        actorHasCode(req.actor, c, req.groupPermissionCodes)
      );
      if (!ok) {
        reasons.push({
          layer: 'field',
          outcome: 'fail',
          message: `Field ${req.field.fieldCode} requires additional permission.`,
        });
        return {
          allowed: false,
          code: 'DENY_FIELD',
          permissionCode: code,
          reasons,
          httpStatus: 403,
        };
      }
    }
    if (req.field.readOnly && MUTATE_ACTIONS.has(req.action.toUpperCase())) {
      reasons.push({
        layer: 'field',
        outcome: 'fail',
        message: `Field ${req.field.fieldCode} is read-only.`,
      });
      return {
        allowed: false,
        code: 'DENY_FIELD',
        permissionCode: code,
        reasons,
        httpStatus: 403,
      };
    }
    reasons.push({
      layer: 'field',
      outcome: 'pass',
      message: `Field ${req.field.fieldCode} policy passed.`,
    });
  }

  reasons.push({ layer: 'default', outcome: 'pass', message: 'All access layers passed.' });
  return {
    allowed: true,
    code: 'ALLOW',
    permissionCode: code,
    reasons,
    httpStatus: 200,
  };
}

/** Human-readable explanation for admin “Why does this user have access?” */
export function formatAccessExplanation(result: EffectiveAccessResult): string {
  const lines = [
    `Decision: ${result.code} (${result.allowed ? 'ALLOWED' : 'DENIED'})`,
    `Permission: ${result.permissionCode}`,
    ...result.reasons.map((r) => `- [${r.layer}] ${r.outcome.toUpperCase()}: ${r.message}`),
  ];
  return lines.join('\n');
}
