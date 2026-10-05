/**
 * Customer delivery preference combinations for future Customer Master use.
 * Grain is customer + country + incoterm + destination port.
 * These rows are not the global Incoterm master and must not restrict Container Study Incoterms.
 */

export type ApprovedDeliveryCombinationSpec = {
  customerCode: string;
  countryLabel: string;
  countryCode: string;
  incotermCode: string;
  incotermName: string;
  destinationPortCode: string;
  destinationPortName: string;
};

export type CustomerDeliveryCombinationView = {
  countryCode: string;
  countryLabel: string;
  incotermCode: string;
  destinationPortCode: string;
  destinationPortName: string;
  isDefault?: boolean;
  active?: boolean;
};

export function formatDeliveryCombinationLabel(
  row: Pick<CustomerDeliveryCombinationView, 'countryLabel' | 'incotermCode' | 'destinationPortName'>
): string {
  return `${row.countryLabel} / ${row.incotermCode} / ${row.destinationPortName}`;
}

export function deliveryCombinationKey(
  row: Pick<CustomerDeliveryCombinationView, 'countryCode' | 'incotermCode' | 'destinationPortCode'>
): string {
  return `${norm(row.countryCode)}|${norm(row.incotermCode)}|${norm(row.destinationPortCode)}`;
}

/** Energya-supplied Eland preference data. Do not convert into the global Incoterm master. */
export const ELAND_APPROVED_DELIVERY_COMBINATIONS: readonly ApprovedDeliveryCombinationSpec[] = [
  {
    customerCode: 'C-ELAND',
    countryLabel: 'UK',
    countryCode: 'UK',
    incotermCode: 'DAP',
    incotermName: 'DAP',
    destinationPortCode: 'DONCASTER',
    destinationPortName: 'DONCASTER',
  },
  {
    customerCode: 'C-ELAND',
    countryLabel: 'NETHERLANDS',
    countryCode: 'NL',
    incotermCode: 'CIF',
    incotermName: 'CIF',
    destinationPortCode: 'ROTTERDAM',
    destinationPortName: 'ROTTERDAM',
  },
  {
    customerCode: 'C-ELAND',
    countryLabel: 'Portugal',
    countryCode: 'PT',
    incotermCode: 'CIF',
    incotermName: 'CIF',
    destinationPortCode: 'SINES',
    destinationPortName: 'Sines',
  },
  {
    customerCode: 'C-ELAND',
    countryLabel: 'Portugal',
    countryCode: 'PT',
    incotermCode: 'CIF',
    incotermName: 'CIF',
    destinationPortCode: 'LISBON',
    destinationPortName: 'Lisbon, Portugal',
  },
];

export const UNAPPROVED_CUSTOMER_DELIVERY_COMBINATION_MESSAGE =
  'This delivery combination is not approved for this customer.';

function norm(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

export function matchCustomerDestinationPort(
  requestedDestination: string | null | undefined,
  combinations: readonly CustomerDeliveryCombinationView[]
): CustomerDeliveryCombinationView | null {
  const dest = norm(requestedDestination);
  if (!dest) return null;
  return (
    combinations.find((row) => {
      const code = norm(row.destinationPortCode);
      const name = norm(row.destinationPortName);
      const label = norm(formatDeliveryCombinationLabel(row));
      return dest === code || dest === name || dest === `${code} — ${name}` || dest === `${code} - ${name}` || dest === label;
    }) || null
  );
}

export function uniqueIncotermsFromCombinations(
  combinations: readonly Pick<CustomerDeliveryCombinationView, 'incotermCode'>[]
): Array<{ code: string; name: string }> {
  const seen = new Set<string>();
  const out: Array<{ code: string; name: string }> = [];
  for (const row of combinations) {
    const code = String(row.incotermCode || '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: code });
  }
  return out;
}

export function uniqueDestinationPortsFromCombinations(
  combinations: readonly Pick<CustomerDeliveryCombinationView, 'destinationPortCode' | 'destinationPortName'>[]
): Array<{ code: string; name: string }> {
  const seen = new Set<string>();
  const out: Array<{ code: string; name: string }> = [];
  for (const row of combinations) {
    const code = String(row.destinationPortCode || '').trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push({ code, name: String(row.destinationPortName || code).trim() || code });
  }
  return out;
}

export function destinationsForIncoterm(
  incotermCode: string | null | undefined,
  combinations: readonly CustomerDeliveryCombinationView[]
): CustomerDeliveryCombinationView[] {
  const wanted = norm(incotermCode);
  if (!wanted) return [...combinations];
  return combinations.filter((row) => norm(row.incotermCode) === wanted);
}

export function incotermsForDestination(
  destinationPortCode: string | null | undefined,
  combinations: readonly CustomerDeliveryCombinationView[]
): CustomerDeliveryCombinationView[] {
  const wanted = norm(destinationPortCode);
  if (!wanted) return [...combinations];
  return combinations.filter((row) => norm(row.destinationPortCode) === wanted);
}

export function matchCustomerDeliveryCombination(input: {
  requestedDestination?: string | null;
  requestedIncoterm?: string | null;
  combinations: readonly CustomerDeliveryCombinationView[];
}): CustomerDeliveryCombinationView | null {
  const dest = norm(input.requestedDestination);
  const incoterm = norm(input.requestedIncoterm);
  if (!dest || !incoterm) return null;
  return (
    input.combinations.find((row) => {
      const code = norm(row.destinationPortCode);
      const name = norm(row.destinationPortName);
      const inc = norm(row.incotermCode);
      const destMatched = dest === code || dest === name || dest === `${code} — ${name}` || dest === `${code} - ${name}`;
      return destMatched && inc === incoterm;
    }) || null
  );
}

export function planElandDeliveryMasterLoad(existing: {
  customerCode?: string | null;
  ports: Array<{ code: string; name: string }>;
  incoterms: Array<{ code: string }>;
  combinations: Array<{
    customerCode: string;
    countryCode: string;
    incotermCode: string;
    destinationPortCode: string;
  }>;
}): {
  customer: 'reuse' | 'missing';
  incoterms: Array<{ code: string; name: string; action: 'reuse' | 'create' }>;
  ports: Array<{ code: string; name: string; countryCode: string; action: 'reuse' | 'create' }>;
  combinations: Array<{
    countryLabel: string;
    countryCode: string;
    incotermCode: string;
    destinationPortCode: string;
    destinationPortName: string;
    action: 'reuse' | 'create';
  }>;
} {
  const customer = existing.customerCode && existing.customerCode.trim().toUpperCase() === 'C-ELAND' ? 'reuse' : 'missing';
  const portByCode = new Map(existing.ports.map((row) => [norm(row.code), row]));
  const incotermByCode = new Set(existing.incoterms.map((row) => norm(row.code)));
  const comboKeys = new Set(
    existing.combinations.map(
      (row) => `${norm(row.customerCode)}|${norm(row.countryCode)}|${norm(row.incotermCode)}|${norm(row.destinationPortCode)}`
    )
  );

  const incoterms: Array<{ code: string; name: string; action: 'reuse' | 'create' }> = [];
  const seenIncoterms = new Set<string>();
  const ports: Array<{ code: string; name: string; countryCode: string; action: 'reuse' | 'create' }> = [];
  const seenPorts = new Set<string>();
  const combinations = ELAND_APPROVED_DELIVERY_COMBINATIONS.map((row) => {
    if (!seenIncoterms.has(row.incotermCode)) {
      seenIncoterms.add(row.incotermCode);
      incoterms.push({
        code: row.incotermCode,
        name: row.incotermName,
        action: incotermByCode.has(row.incotermCode) ? 'reuse' : 'create',
      });
    }
    if (!seenPorts.has(row.destinationPortCode)) {
      seenPorts.add(row.destinationPortCode);
      ports.push({
        code: row.destinationPortCode,
        name: row.destinationPortName,
        countryCode: row.countryCode,
        action: portByCode.has(row.destinationPortCode) ? 'reuse' : 'create',
      });
    }
    const key = `C-ELAND|${norm(row.countryCode)}|${norm(row.incotermCode)}|${norm(row.destinationPortCode)}`;
    return {
      countryLabel: row.countryLabel,
      countryCode: row.countryCode,
      incotermCode: row.incotermCode,
      destinationPortCode: row.destinationPortCode,
      destinationPortName: row.destinationPortName,
      action: comboKeys.has(key) ? ('reuse' as const) : ('create' as const),
    };
  });

  return { customer, incoterms, ports, combinations };
}
