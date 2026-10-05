import React, { useEffect, useMemo, useState } from 'react';
import { Search, RotateCcw, ChevronLeft, ChevronRight, LifeBuoy } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Input, Select } from '../ui/Form';
import type { V2CableSearchHit } from '../../domain/v2AdvancedCableSearch';
import {
  fetchAdvancedCableSearch,
  fetchCableSearchFacets,
  submitCableNotFoundTechnicalOfficeRequest,
  type V2CableSearchFacets,
} from '../../services/v2AdvancedCableSearchApiService';

const EMPTY_FILTERS = {
  matchMode: 'contains',
  materialNumber: '',
  itemCode: '',
  customerCode: '',
  family: '',
  voltageClass: '',
  voltage: '',
  standard: '',
  conductor: '',
  conductorSize: '',
  cores: '',
  insulation: '',
  screen: '',
  armour: '',
  sheath: '',
  sortBy: 'materialNumber',
  sortDir: 'asc',
};

export function AdvancedCableSearchPanel(props: {
  jwtToken?: string | null;
  actorKind: 'customer' | 'internal';
  onSelect: (hit: V2CableSearchHit) => void;
}) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hits, setHits] = useState<V2CableSearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [facets, setFacets] = useState<V2CableSearchFacets | null>(null);
  const [tcrMessage, setTcrMessage] = useState<string | null>(null);
  const [tcrBusy, setTcrBusy] = useState(false);
  const pageSize = 25;

  useEffect(() => {
    void fetchCableSearchFacets(props.jwtToken)
      .then(setFacets)
      .catch(() => setFacets(null));
  }, [props.jwtToken]);

  const runSearch = async (nextPage: number, nextFilters = applied) => {
    setLoading(true);
    setError(null);
    setTcrMessage(null);
    try {
      const result = await fetchAdvancedCableSearch(props.jwtToken, {
        ...nextFilters,
        page: nextPage,
        pageSize,
      });
      setHits(result.cables);
      setTotal(result.total);
      setPage(result.page);
      setSearched(true);
    } catch (err) {
      setHits([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : 'Advanced search failed.');
    } finally {
      setLoading(false);
    }
  };

  const onSearch = () => {
    setApplied(filters);
    setPage(1);
    void runSearch(1, filters);
  };

  const onClear = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setHits([]);
    setTotal(0);
    setSearched(false);
    setError(null);
    setTcrMessage(null);
    setPage(1);
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const facetOptions = (values: string[] | undefined) => values || [];

  const set = (key: keyof typeof EMPTY_FILTERS) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));
  };

  const filterPayload = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(applied)) {
      if (typeof v === 'string' && v) out[k] = v;
    }
    return out;
  }, [applied]);

  const requestTo = async () => {
    setTcrBusy(true);
    setTcrMessage(null);
    try {
      const result = await submitCableNotFoundTechnicalOfficeRequest(props.jwtToken, {
        filters: filterPayload,
      });
      setTcrMessage(
        result.requestNumber
          ? `Technical Office request ${result.requestNumber} submitted.`
          : 'Technical Office request submitted.'
      );
    } catch (err) {
      setTcrMessage(err instanceof Error ? err.message : 'Unable to submit Technical Office request.');
    } finally {
      setTcrBusy(false);
    }
  };

  const field = (label: string, key: keyof typeof EMPTY_FILTERS, options?: string[], placeholder?: string) => (
    <div>
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">{label}</label>
      {options ? (
        <Select value={filters[key]} onChange={set(key)}>
          <option value="">Any</option>
          {options.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </Select>
      ) : (
        <Input value={filters[key]} onChange={set(key)} placeholder={placeholder} className="font-mono" />
      )}
    </div>
  );

  return (
    <div className="space-y-4 text-xs">
      <p className="text-[11px] text-slate-500 dark:text-slate-400">
        Search existing Cable Master records. This is discovery only — not an engineering compatibility engine.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {field('Match', 'matchMode', ['contains', 'exact', 'startsWith'])}
        {field('Material Number', 'materialNumber', undefined, 'e.g. 10000088')}
        {field('Item Code', 'itemCode', undefined, 'e.g. ICO171')}
        {props.actorKind === 'internal'
          ? field('Customer / spec code', 'customerCode', undefined, 'e.g. N2XH')
          : null}
        {field('Cable Family', 'family', facetOptions(facets?.family))}
        {field('Voltage class (catalog)', 'voltageClass', ['LV', 'MV', 'HV', 'Control'])}
        {field('Voltage', 'voltage', facetOptions(facets?.voltage))}
        {field('Standard', 'standard', facetOptions(facets?.standard))}
        {field('Conductor', 'conductor', facetOptions(facets?.conductor))}
        {field('Conductor size', 'conductorSize', undefined, 'e.g. 240')}
        {field('Cores', 'cores', facetOptions(facets?.cores))}
        {field('Insulation', 'insulation', facetOptions(facets?.insulation))}
        {field('Screen', 'screen', facetOptions(facets?.screen))}
        {field('Armour', 'armour', facetOptions(facets?.armour))}
        {field('Sheath', 'sheath', facetOptions(facets?.sheath))}
        {field('Sort', 'sortBy', ['materialNumber', 'itemCode', 'family', 'voltage', 'standard', 'description'])}
        {field('Order', 'sortDir', ['asc', 'desc'])}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={onSearch} leadingIcon={Search} disabled={loading}>
          Search
        </Button>
        <Button variant="secondary" size="sm" onClick={onClear} leadingIcon={RotateCcw}>
          Clear
        </Button>
        <span className="text-slate-500 font-semibold">
          {searched ? `${total} existing Cable Master record${total === 1 ? '' : 's'}` : 'Run a search to list existing cables'}
        </span>
      </div>
      {error && <p className="text-warning-700 font-semibold">{error}</p>}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
              <th className="p-2">Material Number</th>
              <th className="p-2">Item Code</th>
              <th className="p-2">Family</th>
              <th className="p-2">Voltage</th>
              <th className="p-2">Standard</th>
              <th className="p-2">Conductor</th>
              <th className="p-2">Cores</th>
              <th className="p-2">Insulation</th>
              <th className="p-2">Screen</th>
              <th className="p-2">Armour</th>
              <th className="p-2">Sheath</th>
              <th className="p-2">Description</th>
              <th className="p-2 w-24 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {hits.map((hit) => (
              <tr key={hit.materialNumber} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <td className="p-2 font-mono font-bold text-brand-600">{hit.materialNumber}</td>
                <td className="p-2 font-mono">{hit.itemCode}</td>
                <td className="p-2">
                  <Badge tone="neutral">{hit.family || '—'}</Badge>
                </td>
                <td className="p-2">{hit.voltage || '—'}</td>
                <td className="p-2">{hit.standard || '—'}</td>
                <td className="p-2">{hit.conductor || '—'}</td>
                <td className="p-2">{hit.cores || '—'}</td>
                <td className="p-2">{hit.insulation || '—'}</td>
                <td className="p-2">{hit.screen || '—'}</td>
                <td className="p-2">{hit.armour || '—'}</td>
                <td className="p-2">{hit.sheath || '—'}</td>
                <td className="p-2 text-slate-600 dark:text-slate-300 max-w-xs truncate">{hit.description}</td>
                <td className="p-2 text-center">
                  <button
                    type="button"
                    onClick={() => props.onSelect(hit)}
                    className="px-3 py-1 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-bold"
                  >
                    Select Cable
                  </button>
                </td>
              </tr>
            ))}
            {searched && hits.length === 0 && !loading && (
              <tr>
                <td colSpan={13} className="p-8 text-center text-slate-600 dark:text-slate-300">
                  <p className="font-semibold">Required cable was not found in the existing Cable Master.</p>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Do not create a Material Number here. Request Technical Office review if the construction is still needed.
                  </p>
                  <div className="mt-3 flex justify-center">
                    <Button
                      variant="secondary"
                      size="sm"
                      leadingIcon={LifeBuoy}
                      disabled={tcrBusy}
                      onClick={() => void requestTo()}
                    >
                      Request Technical Office Review
                    </Button>
                  </div>
                  {tcrMessage && <p className="mt-2 font-semibold text-brand-700 dark:text-brand-300">{tcrMessage}</p>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > pageSize && (
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={page <= 1 || loading}
            onClick={() => void runSearch(page - 1)}
            leadingIcon={ChevronLeft}
          >
            Previous
          </Button>
          <span className="font-semibold text-slate-500">
            Page {page} of {pageCount}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page >= pageCount || loading}
            onClick={() => void runSearch(page + 1)}
            trailingIcon={ChevronRight}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
