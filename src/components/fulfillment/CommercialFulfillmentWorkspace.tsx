import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FileSpreadsheet,
  Package,
  Plus,
  RefreshCw,
  ShoppingCart,
  Warehouse,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PageHeader } from '../ui/PageHeader';
import { Tabs } from '../ui/Tabs';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Form';
import { Table, THead, TBody, Tr, Th, Td } from '../ui/Table';
import {
  createAgreementReleaseApi,
  createDirectMtsSalesOrderApi,
  formatFulfillmentError,
  getSalesAgreementApi,
  getSalesOrderApi,
  listSalesAgreementsApi,
  listSalesOrdersApi,
  type EpcSalesOrderDto,
  type SalesAgreementDto,
} from '../../services/commercialFulfillmentApiService';
import {
  buildAgreementTraceability,
  buildSalesOrderTraceability,
  parseFulfillmentWorkspaceView,
  resolveFulfillmentActions,
  type FulfillmentWorkspaceView,
} from '../../services/commercialFulfillmentWorkflow';
import {
  ConfirmCreateDialog,
  DisabledActionHint,
  DrumCuttingSummary,
  FulfillmentExceptionAlert,
  IntegrationFutureBadge,
  OperationalStatusBadge,
  OriginModeBadges,
  QtyCell,
  TraceabilityRail,
} from './FulfillmentUi';

type DetailMode = { kind: 'order'; id: string } | { kind: 'agreement'; id: string } | null;

export const CommercialFulfillmentWorkspace: React.FC = () => {
  const { jwtToken, currentUser, hasPermission } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const actions = resolveFulfillmentActions({
    userType: currentUser?.userType,
    hasSalesQuotations: hasPermission('salesQuotations'),
  });

  const view = parseFulfillmentWorkspaceView(searchParams.get('view'));
  const selectedId = searchParams.get('id');

  const setView = (next: FulfillmentWorkspaceView) => {
    const p = new URLSearchParams(searchParams);
    p.set('view', next);
    p.delete('id');
    setSearchParams(p, { replace: true });
  };

  const openDetail = (kind: 'order' | 'agreement', id: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('view', kind === 'order' ? 'orders' : 'agreements');
    p.set('id', id);
    setSearchParams(p, { replace: false });
  };

  const clearDetail = () => {
    const p = new URLSearchParams(searchParams);
    p.delete('id');
    setSearchParams(p, { replace: true });
  };

  if (!jwtToken || currentUser?.userType === 'customer' || !actions.canCreateSalesOrder) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl">
        <PageHeader
          title="Sales fulfillment"
          description="Commercial fulfillment actions are available to internal Sales only."
        />
        <Card>
          <p className="text-sm text-slate-600">
            Customers cannot create Direct MTS orders, sales agreements, or releases. Use Inquiries &amp; Quotes for
            inquiry status.
          </p>
        </Card>
      </div>
    );
  }

  const detail: DetailMode = selectedId
    ? { kind: view === 'agreements' ? 'agreement' : 'order', id: selectedId }
    : null;

  return (
    <div className="p-4 sm:p-6 max-w-[1200px] mx-auto space-y-4">
      <PageHeader
        title="Sales fulfillment"
        description="Cable sales paths: quotation → order, agreement releases, and Direct MTS. D365 stays future-only."
        breadcrumbs={[{ label: 'Commercial' }, { label: 'Sales fulfillment' }]}
      />

      <Tabs
        items={[
          { id: 'orders', label: 'Sales orders', icon: ShoppingCart },
          { id: 'agreements', label: 'Agreements', icon: FileSpreadsheet },
          { id: 'direct-mts', label: 'Direct MTS', icon: Warehouse },
        ]}
        activeId={view}
        onChange={(id) => setView(id as FulfillmentWorkspaceView)}
      />

      {view === 'orders' && (
        <OrdersPane
          token={jwtToken}
          detailId={detail?.kind === 'order' ? detail.id : null}
          onOpen={(id) => openDetail('order', id)}
          onCloseDetail={clearDetail}
          onOpenAgreement={(id) => openDetail('agreement', id)}
        />
      )}
      {view === 'agreements' && (
        <AgreementsPane
          token={jwtToken}
          canRelease={actions.canCreateRelease}
          detailId={detail?.kind === 'agreement' ? detail.id : null}
          onOpen={(id) => openDetail('agreement', id)}
          onCloseDetail={clearDetail}
          onOpenOrder={(id) => openDetail('order', id)}
        />
      )}
      {view === 'direct-mts' && (
        <DirectMtsPane
          token={jwtToken}
          canCreate={actions.canCreateDirectMts}
          onCreated={(id) => openDetail('order', id)}
        />
      )}
    </div>
  );
};

function OrdersPane({
  token,
  detailId,
  onOpen,
  onCloseDetail,
  onOpenAgreement,
}: {
  token: string;
  detailId: string | null;
  onOpen: (id: string) => void;
  onCloseDetail: () => void;
  onOpenAgreement: (id: string) => void;
}) {
  const [orders, setOrders] = useState<EpcSalesOrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string; kind?: string } | null>(null);
  const [originFilter, setOriginFilter] = useState<string>('ALL');
  const [query, setQuery] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await listSalesOrdersApi(token));
    } catch (err) {
      setError(formatFulfillmentError(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      if (originFilter !== 'ALL' && o.orderOrigin !== originFilter) return false;
      if (!query.trim()) return true;
      const q = query.toLowerCase();
      return (
        o.salesOrderNumber.toLowerCase().includes(q) ||
        o.customerName.toLowerCase().includes(q) ||
        (o.customerReference || '').toLowerCase().includes(q) ||
        (o.lines || []).some(
          (l) =>
            (l.materialNumber || '').toLowerCase().includes(q) ||
            l.itemDescription.toLowerCase().includes(q)
        )
      );
    });
  }, [orders, originFilter, query]);

  if (detailId) {
    return (
      <SalesOrderDetailView
        token={token}
        id={detailId}
        onBack={onCloseDetail}
        onOpenAgreement={onOpenAgreement}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Search" className="min-w-[12rem] flex-1">
          <Input
            placeholder="SO #, customer, cable…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </Field>
        <Field label="Origin">
          <Select value={originFilter} onChange={(e) => setOriginFilter(e.target.value)}>
            <option value="ALL">All origins</option>
            <option value="QUOTATION">From quotation</option>
            <option value="AGREEMENT_RELEASE">Agreement release</option>
            <option value="DIRECT_MTS">Direct MTS</option>
          </Select>
        </Field>
        <Button variant="secondary" size="sm" leadingIcon={RefreshCw} onClick={() => void reload()}>
          Refresh
        </Button>
      </div>

      {error && <FulfillmentExceptionAlert title={error.title} message={error.message} />}

      <Card flushBody title="Sales orders" subtitle={`${filtered.length} shown · EPC documents only`}>
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading orders…</p>
        ) : filtered.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            No sales orders yet. Create from an approved quotation, an agreement release, or Direct MTS.
          </p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Origin / mode</Th>
                <Th>Status</Th>
                <Th>Integration</Th>
                <Th>Cable</Th>
              </Tr>
            </THead>
            <TBody>
              {filtered.map((o) => {
                const line = o.lines?.[0];
                return (
                  <Tr
                    key={o.id}
                    className="cursor-pointer hover:bg-brand-50/40"
                    onClick={() => onOpen(o.id)}
                  >
                    <Td>
                      <span className="font-mono font-semibold text-brand-700">{o.salesOrderNumber}</span>
                    </Td>
                    <Td>{o.customerName}</Td>
                    <Td>
                      <OriginModeBadges origin={o.orderOrigin} mode={o.orderFulfillmentMode} />
                    </Td>
                    <Td>
                      <OperationalStatusBadge status={o.status} />
                    </Td>
                    <Td>
                      <IntegrationFutureBadge status={o.integrationStatus} />
                    </Td>
                    <Td className="max-w-[14rem] truncate">
                      {line ? (
                        <span className="text-xs">
                          <span className="font-mono">{line.materialNumber || '—'}</span>
                          <span className="text-slate-500"> · </span>
                          {line.itemDescription}
                        </span>
                      ) : (
                        '—'
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SalesOrderDetailView({
  token,
  id,
  onBack,
  onOpenAgreement,
}: {
  token: string;
  id: string;
  onBack: () => void;
  onOpenAgreement: (id: string) => void;
}) {
  const [order, setOrder] = useState<EpcSalesOrderDto | null>(null);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const so = await getSalesOrderApi(token, id);
        if (!cancelled) setOrder(so);
      } catch (err) {
        if (!cancelled) setError(formatFulfillmentError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, id]);

  if (loading) return <p className="text-sm text-slate-500">Loading sales order…</p>;
  if (error) {
    return (
      <div className="space-y-3">
        <Button variant="tertiary" size="sm" onClick={onBack}>
          ← Back to orders
        </Button>
        <FulfillmentExceptionAlert title={error.title} message={error.message} />
      </div>
    );
  }
  if (!order) return null;

  const steps = buildSalesOrderTraceability(order);
  const agreementId = order.agreementRelease?.agreement?.id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="tertiary" size="sm" onClick={onBack}>
          ← Back to orders
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <OperationalStatusBadge status={order.status} />
          <OriginModeBadges origin={order.orderOrigin} mode={order.orderFulfillmentMode} />
          <IntegrationFutureBadge status={order.integrationStatus} />
        </div>
      </div>

      <Card
        title={order.salesOrderNumber}
        subtitle={`${order.customerName}${order.customerReference ? ` · PO ${order.customerReference}` : ''}`}
      >
        <div className="grid sm:grid-cols-2 gap-3 text-xs text-slate-700">
          <p>
            <span className="text-slate-500">Ship to</span>
            <br />
            {order.shipTo || '—'}
          </p>
          <p>
            <span className="text-slate-500">Created by</span>
            <br />
            {order.createdBy || '—'}
            {order.createdAt ? ` · ${new Date(order.createdAt).toLocaleString()}` : ''}
          </p>
          <p>
            <span className="text-slate-500">Commitment</span>
            <br />
            <span className="font-mono">
              {order.commitment?.commitmentNumber ||
                (order.orderOrigin === 'DIRECT_MTS' ? 'None (Direct MTS)' : order.commitmentId || '—')}
            </span>
          </p>
          <p>
            <span className="text-slate-500">D365 sales order #</span>
            <br />
            <span className="text-slate-400">{order.d365SalesOrderNumber || 'Not posted (NOT_IMPLEMENTED)'}</span>
          </p>
        </div>
      </Card>

      <TraceabilityRail steps={steps} />

      {agreementId && (
        <Button variant="secondary" size="sm" onClick={() => onOpenAgreement(agreementId)}>
          Open related agreement
        </Button>
      )}

      <Card flushBody title="Lines — cable, drum & cutting">
        <Table>
          <THead>
            <Tr>
              <Th>#</Th>
              <Th>Cable</Th>
              <Th>Qty</Th>
              <Th>Drum / cutting</Th>
              <Th>Eng / BOM</Th>
            </Tr>
          </THead>
          <TBody>
            {(order.lines || []).map((l) => (
              <Tr key={l.id}>
                <Td>{l.lineNumber}</Td>
                <Td>
                  <div className="text-xs">
                    <p className="font-mono font-semibold">{l.materialNumber || '—'}</p>
                    <p className="text-slate-600">{l.itemDescription}</p>
                    {l.customerCableCode && (
                      <p className="text-slate-400">Cust code {l.customerCableCode}</p>
                    )}
                  </div>
                </Td>
                <Td>
                  <QtyCell value={l.quantity} uom={l.quantityUom} />
                </Td>
                <Td>
                  <DrumCuttingSummary
                    cuttingLengthMeters={l.cuttingLengthMeters}
                    numberOfCuts={l.numberOfCuts}
                    drumType={l.drumType}
                    drumQuantity={l.drumQuantity}
                    availableStockQuantity={l.availableStockQuantity}
                  />
                </Td>
                <Td className="text-xs text-slate-600 font-mono">
                  {[l.engineeringRevision, l.bomVersion].filter(Boolean).join(' / ') || '—'}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function AgreementsPane({
  token,
  canRelease,
  detailId,
  onOpen,
  onCloseDetail,
  onOpenOrder,
}: {
  token: string;
  canRelease: boolean;
  detailId: string | null;
  onOpen: (id: string) => void;
  onCloseDetail: () => void;
  onOpenOrder: (id: string) => void;
}) {
  const [agreements, setAgreements] = useState<SalesAgreementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ title: string; message: string } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAgreements(await listSalesAgreementsApi(token));
    } catch (err) {
      setError(formatFulfillmentError(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (detailId) {
    return (
      <SalesAgreementDetailView
        token={token}
        id={detailId}
        canRelease={canRelease}
        onBack={onCloseDetail}
        onOpenOrder={onOpenOrder}
        onUpdated={reload}
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" leadingIcon={RefreshCw} onClick={() => void reload()}>
          Refresh
        </Button>
      </div>
      {error && <FulfillmentExceptionAlert title={error.title} message={error.message} />}
      <Card flushBody title="Sales agreements" subtitle="Committed totals, remaining qty, releases">
        {loading ? (
          <p className="p-4 text-sm text-slate-500">Loading agreements…</p>
        ) : agreements.length === 0 ? (
          <p className="p-4 text-sm text-slate-500">
            No agreements yet. Commercially approve a quotation as Sales Agreement, then create from the inquiry
            workspace.
          </p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Agreement</Th>
                <Th>Customer</Th>
                <Th>Committed</Th>
                <Th>Released</Th>
                <Th>Remaining</Th>
                <Th>Status</Th>
                <Th>Integration</Th>
              </Tr>
            </THead>
            <TBody>
              {agreements.map((a) => (
                <Tr
                  key={a.id}
                  className="cursor-pointer hover:bg-brand-50/40"
                  onClick={() => onOpen(a.id)}
                >
                  <Td>
                    <span className="font-mono font-semibold text-brand-700">{a.agreementNumber}</span>
                  </Td>
                  <Td>{a.customerName}</Td>
                  <Td>
                    <QtyCell value={a.totalCommittedQuantity} uom={a.quantityUom} />
                  </Td>
                  <Td>
                    <QtyCell value={a.totalReleasedQuantity} uom={a.quantityUom} />
                  </Td>
                  <Td>
                    <QtyCell value={a.remainingQuantity} uom={a.quantityUom} />
                  </Td>
                  <Td>
                    <OperationalStatusBadge status={a.status} />
                  </Td>
                  <Td>
                    <IntegrationFutureBadge status={a.integrationStatus} />
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function SalesAgreementDetailView({
  token,
  id,
  canRelease,
  onBack,
  onOpenOrder,
  onUpdated,
}: {
  token: string;
  id: string;
  canRelease: boolean;
  onBack: () => void;
  onOpenOrder: (id: string) => void;
  onUpdated: () => void;
}) {
  const [agreement, setAgreement] = useState<SalesAgreementDto | null>(null);
  const [error, setError] = useState<{ title: string; message: string; kind?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [releaseLineId, setReleaseLineId] = useState<string>('');
  const [releaseQty, setReleaseQty] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastOk, setLastOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const a = await getSalesAgreementApi(token, id);
      setAgreement(a);
      const first = a.lines?.[0];
      if (first) {
        setReleaseLineId(first.id);
        setReleaseQty(String(first.remainingQuantity ?? ''));
      }
    } catch (err) {
      setError(formatFulfillmentError(err));
    } finally {
      setLoading(false);
    }
  }, [token, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const runRelease = async () => {
    if (!agreement || !releaseLineId) return;
    setBusy(true);
    setError(null);
    try {
      const result = await createAgreementReleaseApi(token, agreement.id, [
        { agreementLineId: releaseLineId, quantity: Number(releaseQty) },
      ]);
      setLastOk(
        `Release ${result.release.releaseNumber} → SO ${result.salesOrder.salesOrderNumber} (${result.salesOrder.integrationStatus})`
      );
      setConfirmOpen(false);
      await load();
      onUpdated();
    } catch (err) {
      setError(formatFulfillmentError(err));
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Loading agreement…</p>;
  if (error && !agreement) {
    return (
      <div className="space-y-3">
        <Button variant="tertiary" size="sm" onClick={onBack}>
          ← Back to agreements
        </Button>
        <FulfillmentExceptionAlert title={error.title} message={error.message} />
      </div>
    );
  }
  if (!agreement) return null;

  const selectedLine = agreement.lines?.find((l) => l.id === releaseLineId);
  const steps = buildAgreementTraceability(agreement);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="tertiary" size="sm" onClick={onBack}>
          ← Back to agreements
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <OperationalStatusBadge status={agreement.status} />
          <IntegrationFutureBadge status={agreement.integrationStatus} />
        </div>
      </div>

      <Card title={agreement.agreementNumber} subtitle={agreement.customerName}>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Committed</p>
            <p className="text-lg font-bold font-mono text-slate-900">
              <QtyCell value={agreement.totalCommittedQuantity} />
            </p>
            <p className="text-[10px] text-slate-400">{agreement.quantityUom}</p>
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Released</p>
            <p className="text-lg font-bold font-mono text-slate-900">
              <QtyCell value={agreement.totalReleasedQuantity} />
            </p>
          </div>
          <div className="rounded-lg bg-brand-50 border border-brand-100 p-3">
            <p className="text-[10px] uppercase tracking-wide text-brand-600">Remaining</p>
            <p className="text-lg font-bold font-mono text-brand-800">
              <QtyCell value={agreement.remainingQuantity} />
            </p>
          </div>
        </div>
      </Card>

      <TraceabilityRail steps={steps} title="Inquiry → commitment → releases → SOs" />

      {error && <FulfillmentExceptionAlert title={error.title} message={error.message} kind={error.kind as never} />}
      {lastOk && <p className="text-xs text-success-600 bg-success-50 border border-success-100 rounded-lg px-3 py-2">{lastOk}</p>}

      <Card flushBody title="Commitment lines">
        <Table>
          <THead>
            <Tr>
              <Th>#</Th>
              <Th>Cable</Th>
              <Th>Committed</Th>
              <Th>Released</Th>
              <Th>Remaining</Th>
              <Th>Drum / cutting</Th>
            </Tr>
          </THead>
          <TBody>
            {(agreement.lines || []).map((l) => (
              <Tr key={l.id}>
                <Td>{l.lineNumber}</Td>
                <Td>
                  <p className="font-mono text-xs font-semibold">{l.materialNumber || '—'}</p>
                  <p className="text-xs text-slate-600">{l.itemDescription}</p>
                </Td>
                <Td>
                  <QtyCell value={l.committedQuantity} uom={l.quantityUom} />
                </Td>
                <Td>
                  <QtyCell value={l.releasedQuantity} />
                </Td>
                <Td>
                  <QtyCell value={l.remainingQuantity} />
                </Td>
                <Td>
                  <DrumCuttingSummary
                    cuttingLengthMeters={l.cuttingLengthMeters}
                    numberOfCuts={l.numberOfCuts}
                    drumType={l.drumType}
                  />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>

      {!canRelease && (
        <DisabledActionHint>
          Create release unavailable: internal Sales permissions are required.
        </DisabledActionHint>
      )}

      {canRelease && agreement.status !== 'ACTIVE' && (
        <DisabledActionHint>
          Create release unavailable: agreement status is {agreement.status || 'unknown'} (must be ACTIVE).
        </DisabledActionHint>
      )}

      {canRelease &&
        agreement.status === 'ACTIVE' &&
        !(Number(agreement.remainingQuantity) > 0) && (
          <DisabledActionHint>
            Create release unavailable: remaining quantity is 0 — commitment is fully released.
          </DisabledActionHint>
        )}

      {canRelease && agreement.status === 'ACTIVE' && Number(agreement.remainingQuantity) > 0 && (
        <Card title="Create release" subtitle="Over-release is blocked by the server">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Line" className="min-w-[14rem] flex-1">
              <Select value={releaseLineId} onChange={(e) => setReleaseLineId(e.target.value)}>
                {(agreement.lines || []).map((l) => (
                  <option key={l.id} value={l.id}>
                    L{l.lineNumber} · rem {l.remainingQuantity} · {l.materialNumber || l.itemDescription}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Release qty" className="w-32">
              <Input
                type="number"
                min={0}
                step="any"
                value={releaseQty}
                onChange={(e) => setReleaseQty(e.target.value)}
              />
            </Field>
            <Button
              variant="primary"
              size="sm"
              leadingIcon={Plus}
              disabled={busy || !(Number(releaseQty) > 0)}
              onClick={() => setConfirmOpen(true)}
            >
              Create release
            </Button>
          </div>
          {!(Number(releaseQty) > 0) && (
            <div className="mt-2">
              <DisabledActionHint>
                Create release unavailable: enter a release quantity greater than zero (max remaining{' '}
                {selectedLine?.remainingQuantity ?? agreement.remainingQuantity}).
              </DisabledActionHint>
            </div>
          )}
        </Card>
      )}

      <Card flushBody title="Release history">
        {(agreement.releases || []).length === 0 ? (
          <p className="p-4 text-sm text-slate-500">No releases yet.</p>
        ) : (
          <Table>
            <THead>
              <Tr>
                <Th>Release</Th>
                <Th>Qty</Th>
                <Th>Status</Th>
                <Th>Sales order</Th>
                <Th>When</Th>
              </Tr>
            </THead>
            <TBody>
              {(agreement.releases || []).map((r) => (
                <Tr key={r.id}>
                  <Td className="font-mono font-semibold">{r.releaseNumber}</Td>
                  <Td>
                    <QtyCell value={r.totalReleasedQuantity} uom={r.quantityUom} />
                  </Td>
                  <Td>
                    <OperationalStatusBadge status={r.status} />
                  </Td>
                  <Td>
                    {r.salesOrder ? (
                      <button
                        type="button"
                        className="font-mono text-brand-700 font-semibold hover:underline"
                        onClick={() => onOpenOrder(r.salesOrder!.id)}
                      >
                        {r.salesOrder.salesOrderNumber}
                      </button>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td className="text-xs text-slate-500">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <ConfirmCreateDialog
        open={confirmOpen}
        title="Confirm agreement release"
        confirmLabel="Create release → SO"
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void runRelease()}
        summary={
          <>
            <p>
              Release <strong>{releaseQty}</strong> {agreement.quantityUom} from{' '}
              <span className="font-mono">{agreement.agreementNumber}</span>
              {selectedLine ? (
                <>
                  {' '}
                  line L{selectedLine.lineNumber} (remaining {selectedLine.remainingQuantity}).
                </>
              ) : (
                '.'
              )}
            </p>
            <p>This creates a sales order with origin AGREEMENT_RELEASE.</p>
          </>
        }
      />
    </div>
  );
}

function DirectMtsPane({
  token,
  canCreate,
  onCreated,
}: {
  token: string;
  canCreate: boolean;
  onCreated: (id: string) => void;
}) {
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerReference, setCustomerReference] = useState('');
  const [shipTo, setShipTo] = useState('');
  const [materialNumber, setMaterialNumber] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [cuttingLengthMeters, setCuttingLengthMeters] = useState('');
  const [numberOfCuts, setNumberOfCuts] = useState('');
  const [drumType, setDrumType] = useState('');
  const [drumQuantity, setDrumQuantity] = useState('');
  const [availableStockQuantity, setAvailableStockQuantity] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ title: string; message: string; kind?: string } | null>(null);
  const [lastOk, setLastOk] = useState<string | null>(null);

  if (!canCreate) {
    return (
      <Card>
        <p className="text-sm text-slate-600">Direct MTS requires internal Sales permissions.</p>
      </Card>
    );
  }

  const canSubmit =
    customerId.trim() && materialNumber.trim() && Number(quantity) > 0;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await createDirectMtsSalesOrderApi(token, {
        customerId: customerId.trim(),
        customerName: customerName.trim() || undefined,
        customerReference: customerReference.trim() || undefined,
        shipTo: shipTo.trim() || undefined,
        idempotencyKey: idempotencyKey.trim() || undefined,
        lines: [
          {
            materialNumber: materialNumber.trim(),
            quantity: Number(quantity),
            unitPrice: unitPrice !== '' ? Number(unitPrice) : undefined,
            cuttingLengthMeters: cuttingLengthMeters !== '' ? Number(cuttingLengthMeters) : undefined,
            numberOfCuts: numberOfCuts !== '' ? Number(numberOfCuts) : undefined,
            drumType: drumType.trim() || undefined,
            drumQuantity: drumQuantity !== '' ? Number(drumQuantity) : undefined,
            availableStockQuantity:
              availableStockQuantity !== '' ? Number(availableStockQuantity) : undefined,
          },
        ],
      });
      setLastOk(
        `Created ${result.salesOrder.salesOrderNumber} · origin ${result.salesOrder.orderOrigin} · mode ${result.salesOrder.orderFulfillmentMode} · ${result.salesOrder.integrationStatus}`
      );
      setConfirmOpen(false);
      onCreated(result.salesOrder.id);
    } catch (err) {
      setError(formatFulfillmentError(err));
      setConfirmOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <Card
        title="Direct MTS sales order"
        subtitle="No quotation or commercial commitment. Cable must be MTS or MTO_MTS (server-enforced)."
      >
        <div className="flex items-start gap-2 mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <Package className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            MTO-only cables are rejected with a clear error — use Quotation → commercial approval → sales order
            instead. Stock quantity is an optional snapshot, not live inventory.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Customer ID" required>
            <Input value={customerId} onChange={(e) => setCustomerId(e.target.value)} placeholder="Customer key / code" />
          </Field>
          <Field label="Customer name">
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </Field>
          <Field label="Customer PO / reference">
            <Input value={customerReference} onChange={(e) => setCustomerReference(e.target.value)} />
          </Field>
          <Field label="Ship to">
            <Input value={shipTo} onChange={(e) => setShipTo(e.target.value)} />
          </Field>
          <Field label="Material number" required className="sm:col-span-2">
            <Input
              value={materialNumber}
              onChange={(e) => setMaterialNumber(e.target.value)}
              placeholder="MTS-eligible cable material #"
              className="font-mono"
            />
          </Field>
          <Field label="Quantity" required>
            <Input type="number" min={0} step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Unit price">
            <Input type="number" min={0} step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </Field>
          <Field label="Cutting length (m)">
            <Input
              type="number"
              min={0}
              step="any"
              value={cuttingLengthMeters}
              onChange={(e) => setCuttingLengthMeters(e.target.value)}
            />
          </Field>
          <Field label="Number of cuts">
            <Input type="number" min={0} value={numberOfCuts} onChange={(e) => setNumberOfCuts(e.target.value)} />
          </Field>
          <Field label="Drum type">
            <Input value={drumType} onChange={(e) => setDrumType(e.target.value)} />
          </Field>
          <Field label="Drum quantity">
            <Input type="number" min={0} step="any" value={drumQuantity} onChange={(e) => setDrumQuantity(e.target.value)} />
          </Field>
          <Field label="Available stock snapshot">
            <Input
              type="number"
              min={0}
              step="any"
              value={availableStockQuantity}
              onChange={(e) => setAvailableStockQuantity(e.target.value)}
            />
          </Field>
          <Field label="Idempotency key" hint="Optional — same key returns the same order">
            <Input value={idempotencyKey} onChange={(e) => setIdempotencyKey(e.target.value)} className="font-mono" />
          </Field>
        </div>

        <div className="mt-4 space-y-2">
          {!canSubmit && (
            <DisabledActionHint>
              {!customerId.trim()
                ? 'Direct MTS unavailable: Customer ID is required.'
                : !materialNumber.trim()
                  ? 'Direct MTS unavailable: material number is required. MTO-only cables are rejected by the server — create an approved quotation first for those.'
                  : !(Number(quantity) > 0)
                    ? 'Direct MTS unavailable: quantity must be greater than zero.'
                    : 'Direct MTS unavailable: complete required fields.'}
            </DisabledActionHint>
          )}
          <div className="flex justify-end">
            <Button
              variant="primary"
              size="sm"
              leadingIcon={Plus}
              disabled={!canSubmit || busy}
              onClick={() => setConfirmOpen(true)}
            >
              Create Direct MTS order
            </Button>
          </div>
        </div>
      </Card>

      {error && <FulfillmentExceptionAlert title={error.title} message={error.message} kind={error.kind as never} />}
      {lastOk && <p className="text-xs text-success-600 bg-success-50 border border-success-100 rounded-lg px-3 py-2">{lastOk}</p>}

      <ConfirmCreateDialog
        open={confirmOpen}
        title="Confirm Direct MTS order"
        confirmLabel="Create sales order"
        busy={busy}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => void submit()}
        summary={
          <>
            <p>
              Create MTS order for <span className="font-mono">{materialNumber}</span> × {quantity} for customer{' '}
              <span className="font-mono">{customerId}</span>
              {customerName ? ` (${customerName})` : ''}.
            </p>
            <p>No commercial commitment will be created. MTO-only cables will be rejected by the server.</p>
          </>
        }
      />
    </div>
  );
}
