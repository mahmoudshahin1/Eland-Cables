import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  Filter,
  LayoutGrid,
  Loader2,
  Search,
  SlidersHorizontal,
  Table2,
  X,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  CUSTOMER_CATALOG_CATEGORY_META,
  CUSTOMER_CATALOG_PAGE_SIZES,
  catalogPageWindow,
  catalogShowingLabel,
  formatCatalogCores,
  formatCatalogSize,
  parseCustomerCatalogCategory,
  type CustomerCatalogCategory,
  type CustomerCatalogProduct,
} from '../../domain/customerCableCatalog';
import {
  downloadCustomerCableProductsExcel,
  fetchCustomerCableProductFacets,
  fetchCustomerCableProducts,
  type CustomerCatalogFacets,
} from '../../services/customerCableCatalogApiService';
import {
  addCommercialInquiryLine,
  createCommercialInquiry,
} from '../../services/commercialInquiryApiService';
import { CUSTOMER_HOME_PATH, CUSTOMER_PRODUCTS_PATH, customerInquiryDetailPath } from '../../app/shellRoutes';
import { CustomerPageHero } from './CustomerPageHero';
import { AdvancedCableSearchPanel } from '../common/AdvancedCableSearchPanel';
import { Button, Drawer, Input, Modal, Select } from '../ui';
import { CableCrossSectionIcon } from '../ui/icons';
import type { V2CableSearchHit } from '../../domain/v2AdvancedCableSearch';

const EMPTY_FILTERS = {
  voltageClass: '',
  voltage: '',
  conductor: '',
  conductorSize: '',
  cores: '',
  insulation: '',
  screen: '',
  armour: '',
  sheath: '',
  standard: '',
  sheathColour: '',
  coreColour: '',
  diameter: '',
  weight: '',
  specialAdditives: '',
};

type CatalogFilters = typeof EMPTY_FILTERS;

function productThumb(src: string | undefined, alt: string) {
  if (src) {
    return <img src={src} alt="" className="h-9 w-9 object-contain" />;
  }
  return <CableCrossSectionIcon className="h-7 w-7 text-slate-400" aria-label={alt} />;
}

export function CustomerProductsPage() {
  const { jwtToken, currentUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const category = parseCustomerCatalogCategory(searchParams.get('category'));
  const meta = category ? CUSTOMER_CATALOG_CATEGORY_META[category] : null;

  const [qInput, setQInput] = useState(searchParams.get('q') || '');
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(Number(searchParams.get('page') || 1) || 1);
  const [pageSize, setPageSize] = useState(Number(searchParams.get('pageSize') || 50) || 50);
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'material');
  const [view, setView] = useState<'table' | 'card'>(searchParams.get('view') === 'card' ? 'card' : 'table');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [cables, setCables] = useState<CustomerCatalogProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [facets, setFacets] = useState<CustomerCatalogFacets | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewing, setViewing] = useState<CustomerCatalogProduct | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [qInput]);

  useEffect(() => {
    void fetchCustomerCableProductFacets(jwtToken)
      .then(setFacets)
      .catch(() => setFacets(null));
  }, [jwtToken]);

  const queryPayload = useMemo(
    () => ({
      category: category || undefined,
      q: q || undefined,
      ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)),
      page,
      pageSize,
      sortBy,
    }),
    [category, q, filters, page, pageSize, sortBy]
  );

  const load = useCallback(async () => {
    if (!jwtToken) {
      setLoading(false);
      setError('Sign in to view Cable Products.');
      setCables([]);
      setTotal(0);
      return;
    }
    setLoading(true);
    try {
      const result = await fetchCustomerCableProducts(jwtToken, queryPayload);
      setCables(result.cables);
      setTotal(result.total);
      setPage(result.page);
      setError(null);
    } catch (err) {
      setCables([]);
      setTotal(0);
      setError(err instanceof Error ? err.message : 'Unable to load Cable Products.');
    } finally {
      setLoading(false);
    }
  }, [jwtToken, queryPayload]);

  useEffect(() => {
    void load();
  }, [load]);

  const setCategory = (next: string) => {
    const parsed = parseCustomerCatalogCategory(next);
    const params = new URLSearchParams(searchParams);
    if (parsed) params.set('category', parsed);
    else params.delete('category');
    params.delete('page');
    setSearchParams(params);
    setPage(1);
    setSelected(new Set());
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setQInput('');
    setQ('');
    setPage(1);
    setAdvancedFiltersOpen(false);
  };

  const addToInquiry = async (cable: CustomerCatalogProduct) => {
    if (!jwtToken) return;
    setAddingId(cable.materialNumber);
    setError(null);
    try {
      const inquiry = await createCommercialInquiry(jwtToken, {
        customerName: currentUser?.companyName || currentUser?.fullName || undefined,
        contactPerson: currentUser?.fullName || undefined,
        projectName: 'Customer Cable Inquiry',
        currency: 'USD',
        notes: 'Created from customer cable catalog.',
      });
      await addCommercialInquiryLine(jwtToken, inquiry.id, {
        materialNumber: cable.materialNumber,
        itemCode: cable.itemCode,
        customerCode: cable.customerCode,
        cableDescription: cable.description,
        requestedQuantity: 1,
        requestedLengthMeters: 1000,
        quantityUom: 'M',
      });
      navigate(customerInquiryDetailPath(inquiry.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add cable to a new inquiry.');
    } finally {
      setAddingId(null);
    }
  };

  const onAdvancedSelect = (hit: V2CableSearchHit) => {
    setAdvancedOpen(false);
    const match = cables.find((row) => row.materialNumber === hit.materialNumber);
    setViewing(
      match || {
        materialNumber: hit.materialNumber,
        itemCode: hit.itemCode,
        customerCode: hit.customerCode,
        description: hit.description,
        family: hit.family,
        voltage: hit.voltage,
        conductor: hit.conductor,
        conductorSize: hit.conductorSize,
        cores: hit.cores,
        insulation: hit.insulation,
        screen: hit.screen,
        armour: hit.armour,
        sheath: hit.sheath,
        standard: hit.standard,
        diameterMm: hit.diameterMm,
        weightKgKm: hit.weightKgKm,
        display: {
          conductor: hit.conductor,
          conductorSize: hit.conductorSize,
          cores: hit.cores,
          insulation: hit.insulation,
          screen: hit.screen,
          armour: hit.armour,
          sheath: hit.sheath,
          standard: hit.standard,
        },
      }
    );
  };

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const pages = catalogPageWindow(page, pageCount);
  const thumbSrc = meta?.imageSrc;
  const allSelected = cables.length > 0 && cables.every((row) => selected.has(row.materialNumber));

  const filterForm = (
    <div className="space-y-3">
      <FieldSelect
        label="Product Category"
        value={category || ''}
        onChange={setCategory}
        placeholder="All categories"
        options={(facets?.productCategory || Object.keys(CUSTOMER_CATALOG_CATEGORY_META)).map((id) => ({
          value: id,
          label: CUSTOMER_CATALOG_CATEGORY_META[id as CustomerCatalogCategory]?.title || id,
        }))}
      />
      <div>
        <label className="block text-[12px] font-semibold text-slate-600 mb-1">Keyword Search</label>
        <div className="relative">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <Input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search material no., description..."
            className="ps-8 text-[13px] h-9"
          />
        </div>
      </div>
      <FieldSelect
        label="Voltage Class"
        value={filters.voltageClass}
        onChange={(v) => {
          setFilters((prev) => ({ ...prev, voltageClass: v }));
          setPage(1);
        }}
        placeholder="Select voltage class"
        options={facetOptions(facets?.voltageClass)}
      />
      <FieldSelect
        label="Voltage"
        value={filters.voltage}
        onChange={(v) => {
          setFilters((prev) => ({ ...prev, voltage: v }));
          setPage(1);
        }}
        placeholder="Select voltage"
        options={facetOptions(facets?.voltage)}
      />
      <FieldSelect
        label="Conductor Material"
        value={filters.conductor}
        onChange={(v) => {
          setFilters((prev) => ({ ...prev, conductor: v }));
          setPage(1);
        }}
        placeholder="Select conductor"
        options={facetOptions(facets?.conductor)}
      />
      <FieldSelect
        label="Conductor Size"
        value={filters.conductorSize}
        onChange={(v) => {
          setFilters((prev) => ({ ...prev, conductorSize: v }));
          setPage(1);
        }}
        placeholder="Select size"
        options={facetOptions(facets?.conductorSize)}
      />
      <FieldSelect
        label="Number of Cores"
        value={filters.cores}
        onChange={(v) => {
          setFilters((prev) => ({ ...prev, cores: v }));
          setPage(1);
        }}
        placeholder="Select cores"
        options={facetOptions(facets?.cores)}
      />
      <FieldSelect
        label="Insulation"
        value={filters.insulation}
        onChange={(v) => {
          setFilters((prev) => ({ ...prev, insulation: v }));
          setPage(1);
        }}
        placeholder="Select insulation"
        options={facetOptions(facets?.insulation)}
      />
      <div className="grid grid-cols-2 gap-2">
        <FieldSelect
          label="Screen"
          value={filters.screen}
          onChange={(v) => {
            setFilters((prev) => ({ ...prev, screen: v }));
            setPage(1);
          }}
          placeholder="Select screen"
          options={facetOptions(facets?.screen)}
        />
        <FieldSelect
          label="Armour"
          value={filters.armour}
          onChange={(v) => {
            setFilters((prev) => ({ ...prev, armour: v }));
            setPage(1);
          }}
          placeholder="Select armour"
          options={facetOptions(facets?.armour)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <FieldSelect
          label="Sheath"
          value={filters.sheath}
          onChange={(v) => {
            setFilters((prev) => ({ ...prev, sheath: v }));
            setPage(1);
          }}
          placeholder="Select sheath"
          options={facetOptions(facets?.sheath)}
        />
        <FieldSelect
          label="Standard"
          value={filters.standard}
          onChange={(v) => {
            setFilters((prev) => ({ ...prev, standard: v }));
            setPage(1);
          }}
          placeholder="Select standard"
          options={facetOptions(facets?.standard)}
        />
      </div>
      <button
        type="button"
        onClick={() => setAdvancedFiltersOpen((open) => !open)}
        className="w-full flex items-center justify-between text-[13px] font-semibold text-slate-600 py-2"
      >
        <span className="inline-flex items-center gap-2">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Advanced Technical Filters
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${advancedFiltersOpen ? 'rotate-180' : ''}`} />
      </button>
      {advancedFiltersOpen ? (
        <div className="space-y-3 pt-1">
          <FieldSelect
            label="Sheath colour"
            value={filters.sheathColour}
            onChange={(v) => {
              setFilters((prev) => ({ ...prev, sheathColour: v }));
              setPage(1);
            }}
            placeholder="Select sheath colour"
            options={facetOptions(facets?.sheathColour)}
          />
          <FieldSelect
            label="Core colour"
            value={filters.coreColour}
            onChange={(v) => {
              setFilters((prev) => ({ ...prev, coreColour: v }));
              setPage(1);
            }}
            placeholder="Select core colour"
            options={facetOptions(facets?.coreColour)}
          />
          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Diameter (mm)</label>
            <Input
              value={filters.diameter}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, diameter: e.target.value }));
                setPage(1);
              }}
              placeholder="Exact diameter"
              className="text-[13px] h-9"
            />
          </div>
          <div>
            <label className="block text-[12px] font-semibold text-slate-600 mb-1">Weight (kg/km)</label>
            <Input
              value={filters.weight}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, weight: e.target.value }));
                setPage(1);
              }}
              placeholder="Exact weight"
              className="text-[13px] h-9"
            />
          </div>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-4">
      <CustomerPageHero
        breadcrumbs={[
          { label: 'Home', to: CUSTOMER_HOME_PATH },
          { label: 'Products', to: CUSTOMER_PRODUCTS_PATH },
          { label: meta?.crumb || 'Cable Products' },
        ]}
        title={meta?.title || 'Cable Products'}
        titleAccessory={
          <span className="text-[1.05rem] sm:text-[1.15rem] font-semibold text-slate-400">
            {total.toLocaleString()} products
          </span>
        }
        subtitle={meta?.subtitle || 'Browse the Energya Cable Master catalog.'}
        photoSrc={meta?.imageSrc}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[16.5rem_minmax(0,1fr)] gap-4 items-start">
        <aside className="hidden lg:block customer-home-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-slate-800 inline-flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-500" />
              Filters
            </h2>
            <button type="button" onClick={clearFilters} className="text-[12px] font-semibold text-[#2563EB] hover:underline">
              Clear All
            </button>
          </div>
          {filterForm}
        </aside>

        <section className="customer-home-card min-w-0 overflow-hidden">
          <div className="px-4 pt-3 pb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
            <div className="flex items-center gap-1 rounded-lg bg-slate-50 p-0.5">
              <button
                type="button"
                onClick={() => setView('table')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold ${
                  view === 'table' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                Table View
              </button>
              <button
                type="button"
                onClick={() => setView('card')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-semibold ${
                  view === 'card' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Card View
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button className="lg:hidden" variant="secondary" size="sm" leadingIcon={Filter} onClick={() => setFilterDrawerOpen(true)}>
                Filters
              </Button>
              <Button variant="secondary" size="sm" leadingIcon={SlidersHorizontal} onClick={() => setAdvancedOpen(true)}>
                Advanced Search
              </Button>
            </div>
          </div>

          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-slate-800">Cable Products</h2>
              <p className="text-[12px] text-slate-500">{catalogShowingLabel(page, pageSize, total)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value);
                  setPage(1);
                }}
                className="text-[12px] h-9 w-[10.5rem]"
                aria-label="Sort products"
              >
                <option value="material">Material No.</option>
                <option value="description">Description</option>
                <option value="voltage">Voltage</option>
                <option value="conductor">Conductor</option>
                <option value="size">Size</option>
                <option value="recent">Recently added</option>
              </Select>
              <Button
                variant="secondary"
                size="sm"
                leadingIcon={Download}
                onClick={() => void downloadCustomerCableProductsExcel(jwtToken, queryPayload)}
              >
                Export Excel
              </Button>
            </div>
          </div>

          {error ? (
            <div className="mx-4 mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div>
          ) : null}

          {loading ? (
            <div className="flex flex-col items-center py-16 text-slate-500">
              <Loader2 className="h-7 w-7 animate-spin mb-2 text-brand-500" />
              <p className="text-sm">Loading cable products…</p>
            </div>
          ) : view === 'table' ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 text-[11px] uppercase tracking-wide">
                    <th className="px-3 py-2.5 w-10">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={(e) =>
                          setSelected(e.target.checked ? new Set(cables.map((row) => row.materialNumber)) : new Set())
                        }
                        aria-label="Select all on this page"
                      />
                    </th>
                    <th className="px-3 py-2.5 text-left font-semibold">Material No.</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Cable Description</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Voltage</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Conductor</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Size</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Cores</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Standard</th>
                    <th className="px-3 py-2.5 text-left font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cables.map((cable) => (
                    <tr key={cable.materialNumber} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-3 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(cable.materialNumber)}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(cable.materialNumber);
                              else next.delete(cable.materialNumber);
                              return next;
                            });
                          }}
                          aria-label={`Select ${cable.materialNumber}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <button
                          type="button"
                          className="font-semibold text-[#2563EB] hover:underline"
                          onClick={() => setViewing(cable)}
                        >
                          {cable.materialNumber}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-[16rem]">
                          <span className="h-10 w-10 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                            {productThumb(thumbSrc, cable.description)}
                          </span>
                          <span className="text-slate-700 leading-snug">{cable.description}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{cable.voltage || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{cable.display.conductor || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                        {formatCatalogSize(cable.display.conductorSize)}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{formatCatalogCores(cable.display.cores)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">{cable.display.standard || '—'}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewing(cable)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                          <button
                            type="button"
                            disabled={addingId === cable.materialNumber}
                            onClick={() => void addToInquiry(cable)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-[12px] font-semibold"
                          >
                            Add to Inquiry
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cables.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-14">No cables match these filters.</p>
              ) : null}
            </div>
          ) : (
            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {cables.map((cable) => (
                <article key={cable.materialNumber} className="rounded-xl border border-slate-200 p-3 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <span className="h-14 w-14 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                      {productThumb(thumbSrc, cable.description)}
                    </span>
                    <div className="min-w-0">
                      <button
                        type="button"
                        className="font-semibold text-[#2563EB] hover:underline"
                        onClick={() => setViewing(cable)}
                      >
                        {cable.materialNumber}
                      </button>
                      <p className="text-[13px] text-slate-700 mt-0.5 leading-snug">{cable.description}</p>
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-slate-600">
                    <div>
                      <dt className="text-slate-400">Voltage</dt>
                      <dd>{cable.voltage || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Conductor</dt>
                      <dd>{cable.display.conductor || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Size</dt>
                      <dd>{formatCatalogSize(cable.display.conductorSize)}</dd>
                    </div>
                    <div>
                      <dt className="text-slate-400">Cores</dt>
                      <dd>{formatCatalogCores(cable.display.cores)}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-400">Standard</dt>
                      <dd>{cable.display.standard || '—'}</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewing(cable)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600"
                    >
                      View
                    </button>
                    <button
                      type="button"
                      disabled={addingId === cable.materialNumber}
                      onClick={() => void addToInquiry(cable)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2563EB] text-white text-[12px] font-semibold"
                    >
                      Add to Inquiry
                    </button>
                  </div>
                </article>
              ))}
              {cables.length === 0 ? (
                <p className="col-span-full text-center text-sm text-slate-500 py-10">No cables match these filters.</p>
              ) : null}
            </div>
          )}

          <div className="px-4 py-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
            <label className="text-[12px] text-slate-500 inline-flex items-center gap-2">
              Rows per page
              <Select
                value={String(pageSize)}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 text-[12px] w-[4.5rem]"
              >
                {CUSTOMER_CATALOG_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </Select>
            </label>
            <nav className="flex items-center gap-1" aria-label="Pagination">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              {pages.map((item, index) =>
                item === 'ellipsis' ? (
                  <span key={`e-${index}`} className="px-1 text-slate-400">
                    …
                  </span>
                ) : (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setPage(item)}
                    className={`min-w-8 h-8 px-2 rounded-lg text-[12px] font-semibold ${
                      item === page ? 'bg-[#2563EB] text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                className="h-8 w-8 rounded-lg border border-slate-200 flex items-center justify-center disabled:opacity-40"
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </nav>
          </div>
        </section>
      </div>

      <Drawer
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
        title="Filters"
        footer={
          <Button variant="tertiary" size="sm" onClick={clearFilters}>
            Clear All
          </Button>
        }
      >
        {filterForm}
      </Drawer>

      {advancedOpen ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-3">
          <div className="bg-slate-50 rounded-2xl shadow-2xl border border-brand-500/30 w-full max-w-6xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="bg-brand-500 text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-sm font-display">Advanced Search</h3>
                <p className="text-[11px] text-brand-100">Existing Cable Master search. Not a compatibility engine.</p>
              </div>
              <button type="button" onClick={() => setAdvancedOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-5">
              <AdvancedCableSearchPanel
                jwtToken={jwtToken}
                actorKind={currentUser?.userType === 'customer' ? 'customer' : 'internal'}
                onSelect={onAdvancedSelect}
              />
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        open={Boolean(viewing)}
        onClose={() => setViewing(null)}
        title={viewing ? viewing.materialNumber : 'Cable'}
        widthClassName="max-w-2xl"
        footer={
          viewing ? (
            <>
              <Button variant="secondary" onClick={() => setViewing(null)}>
                Close
              </Button>
              <Button variant="primary" onClick={() => viewing && void addToInquiry(viewing)}>
                Add to Inquiry
              </Button>
            </>
          ) : null
        }
      >
        {viewing ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className="h-16 w-16 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden">
                {productThumb(thumbSrc, viewing.description)}
              </span>
              <p className="text-sm text-slate-700 leading-relaxed">{viewing.description}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <Detail label="Item Code" value={viewing.itemCode} />
              <Detail label="Customer Code" value={viewing.customerCode} />
              <Detail label="Family" value={viewing.family} />
              <Detail label="Voltage" value={viewing.voltage} />
              <Detail label="Conductor" value={viewing.display.conductor} />
              <Detail label="Size" value={formatCatalogSize(viewing.display.conductorSize)} />
              <Detail label="Cores" value={formatCatalogCores(viewing.display.cores)} />
              <Detail label="Insulation" value={viewing.display.insulation} />
              <Detail label="Screen" value={viewing.display.screen} />
              <Detail label="Armour" value={viewing.display.armour} />
              <Detail label="Sheath" value={viewing.display.sheath} />
              <Detail label="Standard" value={viewing.display.standard} />
            </dl>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function facetOptions(values?: string[]) {
  return (values || []).map((value) => ({ value, label: value }));
}

function FieldSelect({
  label,
  value,
  onChange,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-slate-600 mb-1">{label}</label>
      <Select value={value} onChange={(e) => onChange(e.target.value)} className="text-[13px] h-9">
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-slate-800 mt-0.5">{value || '—'}</dd>
    </div>
  );
}
