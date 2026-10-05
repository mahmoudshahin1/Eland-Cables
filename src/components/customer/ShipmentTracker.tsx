import React from 'react';
import { Truck, MapPin, Package, CheckCircle2 } from 'lucide-react';
import { CUSTOMER_HOME_PATH } from '../../app/shellRoutes';
import { CustomerPageHero } from './CustomerPageHero';

export const ShipmentTracker: React.FC = () => {
  const shipments = [
    {
      id: 'shp-101',
      trackingNo: 'EN-TRK-99201',
      salesOrder: 'SO-360502-001',
      destination: 'Jebel Ali Port, Dubai (UAE)',
      carrier: 'Elsewedy Logistics Fleet Heavy Transport',
      drumsCount: 10,
      totalWeight: '14,080 kg',
      status: 'In Transit - On Vessel',
      eta: '08 May 2026',
      progressPercent: 65,
    },
    {
      id: 'shp-102',
      trackingNo: 'EN-TRK-88102',
      salesOrder: 'SO-360502-012',
      destination: 'Cairo Regional Substation 4',
      carrier: 'Energya Direct Overland Truck',
      drumsCount: 4,
      totalWeight: '5,200 kg',
      status: 'Delivered',
      eta: '01 May 2026',
      progressPercent: 100,
    },
  ];

  return (
    <div className="space-y-6">
      <CustomerPageHero
        breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Shipments' }]}
        title="Shipments"
        subtitle="Track cable drum consignments from factory yard to site delivery point."
      />

      <div className="space-y-4">
        {shipments.map((shp) => (
          <div
            key={shp.id}
            className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-lg space-y-4"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <span className="font-mono text-sm font-extrabold text-blue-600 dark:text-blue-400">
                  {shp.trackingNo}
                </span>
                <span className="ml-2 text-xs font-bold text-slate-500">
                  (Ref: {shp.salesOrder})
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium flex items-center mt-0.5">
                  <MapPin className="h-3.5 w-3.5 text-red-500 mr-1" />
                  {shp.destination}
                </p>
              </div>
              <div className="text-left sm:text-right">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                  {shp.status}
                </span>
                <p className="text-xs text-slate-500 mt-1">ETA: {shp.eta}</p>
              </div>
            </div>

            {/* Simulated GPS Map Route Banner */}
            <div className="bg-slate-950 text-white rounded-xl p-4 border border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600/30 border border-blue-500 flex items-center justify-center">
                  <Truck className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">{shp.carrier}</p>
                  <p className="text-[11px] text-slate-400">
                    Consignment: {shp.drumsCount} Drums • Total Net Weight: {shp.totalWeight}
                  </p>
                </div>
              </div>

              <div className="w-full md:w-1/2">
                <div className="flex justify-between text-[11px] text-slate-400 font-semibold mb-1">
                  <span>Factory Gate (Helal Plant)</span>
                  <span>{shp.progressPercent}% Route Completed</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${shp.progressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
