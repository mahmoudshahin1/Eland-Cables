import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchCustomerContainerStudyVisibility } from '../../services/customerFinancialOfferApiService';
import type { CustomerContainerStudyVisibility } from '../../domain/financialOfferCustomerProjection';
import {
  CS_PRESENTATION,
  CS_REQUIRED_TITLE,
  customerContainerStudyContextBanner,
  formatCustomerContainerChargePair,
  formatCustomerShipmentTotalPresentation,
} from '../../domain/financialOfferCustomerProjection';
import { Package } from 'lucide-react';

export const CustomerContainerStudyStatus: React.FC<{ inquiryId: string }> = ({ inquiryId }) => {
  const { jwtToken } = useAuth();
  const [view, setView] = useState<CustomerContainerStudyVisibility | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jwtToken) return;
    let cancelled = false;
    void fetchCustomerContainerStudyVisibility(jwtToken, inquiryId)
      .then((next) => {
        if (!cancelled) setView(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load shipment status.');
      });
    return () => {
      cancelled = true;
    };
  }, [jwtToken, inquiryId]);

  const banner = view
    ? customerContainerStudyContextBanner({
        shipmentCalculationRequired: view.shipmentCalculationRequired,
        groups: view.groups,
      })
    : null;

  return (
    <div className="space-y-3 text-xs">
      <div>
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <Package className="h-4 w-4 text-blue-600" />
          Shipment status
        </h3>
        <p className="text-slate-500 text-[11px] mt-0.5">
          Read-only governed container study status and persisted shipment results for this inquiry.
        </p>
      </div>
      {error ? <p className="text-red-700">{error}</p> : null}
      {banner ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800">
          <span className="font-semibold">{banner.title}</span>
          {banner.message ? <span className="block text-slate-600 mt-0.5">{banner.message}</span> : null}
        </p>
      ) : null}
      {view && view.groups.length === 0 && view.shipmentCalculationRequired ? (
        <p className="text-slate-700">
          <span className="font-semibold">{CS_REQUIRED_TITLE}</span>
          <span className="block text-slate-600 mt-0.5">
            Create a shipment group and select/confirm a container configuration to calculate shipment.
          </span>
        </p>
      ) : null}
      {view && view.groups.length === 0 && !view.shipmentCalculationRequired ? (
        <p className="text-slate-500">No shipment groups are configured yet.</p>
      ) : null}
      {view?.groups.map((group) => {
        const shipmentPresentation = formatCustomerShipmentTotalPresentation(group);
        const showChargeColumn = group.containers.some((row) => row.rate != null || row.total != null);
        return (
          <div key={group.shipmentGroupId} className="rounded-xl border border-slate-200 p-3 space-y-2">
            <div className="flex justify-between gap-2 items-start">
              <p className="font-semibold text-slate-800">
                {group.destination || 'Not Set'} · {group.incoterm || 'Not Set'}
              </p>
              <div className="text-right space-y-0.5">
                <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {group.presentationLabel || group.governedStatus}
                </span>
                {group.presentationLabel && group.governedStatus && group.presentationLabel !== group.governedStatus ? (
                  <p className="text-[10px] text-slate-500 font-medium">Lifecycle {group.governedStatus}</p>
                ) : null}
              </div>
            </div>
            {group.presentationLabel === CS_PRESENTATION.SHIPMENT_CONFIGURATION_REQUIRED ? (
              <p className="text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                <span className="font-semibold">{CS_REQUIRED_TITLE}. </span>
                {group.information}
              </p>
            ) : group.information ? (
              <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                {group.information}
              </p>
            ) : null}
            {group.containers.length === 0 ? (
              group.presentationLabel === CS_PRESENTATION.SHIPMENT_CONFIGURATION_REQUIRED ||
              group.presentationLabel === CS_PRESENTATION.READY_TO_CALCULATE ? null : (
                <p className="text-slate-500">
                  {group.hasPersistedShipmentSnapshot
                    ? 'No container lines on the pinned shipment snapshot.'
                    : group.information ||
                      'Packing has no container lines. Missing physical inputs must be supplied before packing can calculate.'}
                </p>
              )
            ) : (
              <ul className="space-y-1">
                {group.containers.map((row, index) => {
                  const chargePair = formatCustomerContainerChargePair({
                    rate: row.rate,
                    total: row.total,
                    currency: group.currency,
                  });
                  return (
                    <li key={`${row.containerType}-${index}`} className="flex justify-between font-mono">
                      <span>
                        {row.containerType} × {row.quantity}
                      </span>
                      {showChargeColumn && chargePair ? <span>{chargePair}</span> : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {shipmentPresentation.amountLine ? (
              <div className="text-right space-y-0.5">
                <p className="font-semibold">{shipmentPresentation.amountLine}</p>
                {shipmentPresentation.reason ? (
                  <p className="text-[10px] font-medium text-amber-800">{shipmentPresentation.reason}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
