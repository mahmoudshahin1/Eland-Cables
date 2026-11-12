/**
 * Strips internal costing warnings before a customer sees a calculate response.
 * Master raw-material prices are not written here. A missing price is a calculation-only zero.
 */
export function projectCalculateResultForActor<T extends { unpricedMaterials?: unknown; partial?: boolean }>(
  result: T,
  actor: { userType?: string | null }
): T {
  if (actor.userType !== 'customer') return result;
  const { unpricedMaterials: _hiddenMaterials, partial: _hiddenPartial, ...customerResult } = result;
  return customerResult as T;
}
