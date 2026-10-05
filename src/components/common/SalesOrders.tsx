import React, { useState, useMemo, useEffect } from 'react';
import { SalesOrder, SalesOrderStatus } from '../../types';
import { INITIAL_SALES_ORDERS } from '../../data/mockData';
import { useAuth } from '../../context/AuthContext';
import {
  ShoppingCart,
  Search,
  Filter,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Receipt,
  Download,
  Eye,
  Plus,
  Building2,
  Calendar,
  DollarSign,
  Package,
  ArrowUpRight,
  Sparkles,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  X,
  Printer,
  ChevronDown,
} from 'lucide-react';
import { DashboardStatCard } from './DashboardStatCard';
import { CustomerPageHero } from '../customer/CustomerPageHero';
import { CUSTOMER_HOME_PATH } from '../../app/shellRoutes';

interface SalesOrdersProps {
  defaultStatusFilter?: SalesOrderStatus | 'All';
  onNavigateTab?: (tab: string) => void;
}

export const SalesOrders: React.FC<SalesOrdersProps> = ({
  defaultStatusFilter = 'All',
  onNavigateTab,
}) => {
  const { currentUser } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>(INITIAL_SALES_ORDERS);

  // Filters state
  const [activeStatusTab, setActiveStatusTab] = useState<SalesOrderStatus | 'All'>(defaultStatusFilter);

  useEffect(() => {
    setActiveStatusTab(defaultStatusFilter);
  }, [defaultStatusFilter]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCustomerFilter, setSelectedCustomerFilter] = useState<string>('All');
  const [selectedOrder, setSelectedOrder] = useState<SalesOrder | null>(null);
  const [showNewOrderModal, setShowNewOrderModal] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Status update dropdown in modal
  const [editingStatus, setEditingStatus] = useState<SalesOrderStatus | null>(null);

  // Filter orders by Customer if customer logged in
  const customerFilteredOrders = useMemo(() => {
    if (currentUser?.userType === 'customer') {
      const userCompany = currentUser.companyName?.toLowerCase() || '';
      const userEmail = currentUser.email.toLowerCase();
      return orders.filter((o) => {
        if (userCompany && o.customerName.toLowerCase().includes(userCompany)) return true;
        if (userEmail.includes('madkour') && o.customerName.toLowerCase().includes('madkour')) return true;
        if (userEmail.includes('se.com') && (o.customerName.includes('SEC') || o.customerName.includes('Saudi Electricity'))) return true;
        if (userEmail.includes('global') && o.customerName.toLowerCase().includes('global')) return true;
        if (userEmail.includes('dewa') && o.customerName.toLowerCase().includes('dewa')) return true;
        return true; // default show demo list
      });
    }
    return orders;
  }, [orders, currentUser]);

  // Final Filtered list
  const filteredOrders = useMemo(() => {
    return customerFilteredOrders.filter((order) => {
      // Status filter
      if (activeStatusTab !== 'All' && order.status !== activeStatusTab) {
        return false;
      }
      // Customer filter dropdown
      if (selectedCustomerFilter !== 'All' && order.customerName !== selectedCustomerFilter) {
        return false;
      }
      // Search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const matchSo = order.soNumber.toLowerCase().includes(q);
        const matchPo = order.customerPoRef.toLowerCase().includes(q);
        const matchCust = order.customerName.toLowerCase().includes(q);
        const matchProj = order.projectName.toLowerCase().includes(q);
        const matchItem = order.items.some((i) =>
          i.description.toLowerCase().includes(q) || i.cableCode.toLowerCase().includes(q)
        );
        return matchSo || matchPo || matchCust || matchProj || matchItem;
      }
      return true;
    });
  }, [customerFilteredOrders, activeStatusTab, selectedCustomerFilter, searchQuery]);

  // Status counts
  const statusCounts = useMemo(() => {
    const counts = {
      All: customerFilteredOrders.length,
      Open: 0,
      Invoiced: 0,
      Delivered: 0,
      Closed: 0,
      Canceled: 0,
    };
    customerFilteredOrders.forEach((o) => {
      if (counts[o.status] !== undefined) {
        counts[o.status]++;
      }
    });
    return counts;
  }, [customerFilteredOrders]);

  // Unique customers list for filter dropdown
  const customerList = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => set.add(o.customerName));
    return Array.from(set);
  }, [orders]);

  // Financial Summary
  const financialSummary = useMemo(() => {
    const totalVal = filteredOrders.reduce((sum, o) => sum + o.totalAmountUsd, 0);
    const openVal = customerFilteredOrders
      .filter((o) => o.status === 'Open')
      .reduce((sum, o) => sum + o.totalAmountUsd, 0);
    const invoicedVal = customerFilteredOrders
      .filter((o) => o.status === 'Invoiced')
      .reduce((sum, o) => sum + o.totalAmountUsd, 0);
    const deliveredVal = customerFilteredOrders
      .filter((o) => o.status === 'Delivered')
      .reduce((sum, o) => sum + o.totalAmountUsd, 0);

    return { totalVal, openVal, invoicedVal, deliveredVal };
  }, [filteredOrders, customerFilteredOrders]);

  // Trigger Toast
  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Change Order Status
  const handleUpdateStatus = (orderId: string, newStatus: SalesOrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id === orderId) {
          return {
            ...o,
            status: newStatus,
            invoiceRef: newStatus === 'Invoiced' && !o.invoiceRef ? `INV-2026-00${Math.floor(Math.random() * 90 + 10)}` : o.invoiceRef,
          };
        }
        return o;
      })
    );
    if (selectedOrder && selectedOrder.id === orderId) {
      setSelectedOrder((prev) => prev ? { ...prev, status: newStatus } : null);
    }
    triggerToast(`Sales Order status updated to "${newStatus}" successfully.`);
  };

  // Helper badge renderer
  const renderStatusBadge = (status: SalesOrderStatus) => {
    switch (status) {
      case 'Open':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
            <Clock className="w-3 h-3 mr-1 text-blue-600 dark:text-blue-400 animate-pulse" />
            Open Order
          </span>
        );
      case 'Invoiced':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
            <Receipt className="w-3 h-3 mr-1 text-purple-600 dark:text-purple-400" />
            Invoiced
          </span>
        );
      case 'Delivered':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <Truck className="w-3 h-3 mr-1 text-emerald-600 dark:text-emerald-400" />
            Delivered
          </span>
        );
      case 'Closed':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
            <CheckCircle2 className="w-3 h-3 mr-1 text-slate-500" />
            Closed
          </span>
        );
      case 'Canceled':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold bg-red-100 text-red-800 dark:bg-red-950/80 dark:text-red-300 border border-red-300 dark:border-red-800">
            <XCircle className="w-3 h-3 mr-1 text-red-600 dark:text-red-400" />
            Canceled
          </span>
        );
      default:
        return null;
    }
  };

  const isCustomer = currentUser?.userType === 'customer';

  const headerActions = (
    <div className="flex items-center space-x-3">
      {!isCustomer && (
        <button
          onClick={() => triggerToast('Sales Order Creation Wizard opened.')}
          className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-lg transition-all flex items-center space-x-1.5"
        >
          <Plus className="h-4 w-4" />
          <span>New Sales Order</span>
        </button>
      )}
      <button
        onClick={() => triggerToast('Exporting Sales Orders to Excel format...')}
        className={
          isCustomer
            ? 'px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs border border-slate-200 transition-all flex items-center space-x-1.5'
            : 'px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs border border-slate-700 transition-all flex items-center space-x-1.5'
        }
      >
        <Download className={`h-4 w-4 ${isCustomer ? 'text-emerald-600' : 'text-emerald-400'}`} />
        <span>Export Excel</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-amber-500/40 flex items-center space-x-3 animate-slideUp">
          <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
          <span className="text-xs font-semibold">{toastMessage}</span>
        </div>
      )}

      {isCustomer ? (
        <CustomerPageHero
          breadcrumbs={[{ label: 'Home', to: CUSTOMER_HOME_PATH }, { label: 'Orders' }]}
          title="Sales Orders Management & Lifecycle"
          subtitle="Track sales orders by status: Open, Invoiced, Delivered, Closed, and Canceled with full ERP trace."
          actions={headerActions}
        />
      ) : (
        <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-blue-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <span className="bg-blue-600/80 text-blue-100 text-xs px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider border border-blue-400/30">
                COMMERCIAL SALES ORDERS REGISTER
              </span>
              <span className="text-xs text-slate-300">Total Orders: {customerFilteredOrders.length}</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <ShoppingCart className="h-7 w-7 text-blue-400" />
              <span>Sales Orders Management & Lifecycle</span>
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              Track sales orders by status: Open, Invoiced, Delivered, Closed, and Canceled with full ERP trace.
            </p>
          </div>
          {headerActions}
        </div>
      )}

      {/* Financial Summary Top KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'All Orders',
            value: statusCounts.All,
            icon: ShoppingCart,
            status: 'All' as const,
          },
          {
            label: 'Open Orders',
            value: statusCounts.Open,
            icon: Clock,
            status: 'Open' as const,
          },
          {
            label: 'Invoiced Orders',
            value: statusCounts.Invoiced,
            icon: Receipt,
            status: 'Invoiced' as const,
          },
          {
            label: 'Delivered Orders',
            value: statusCounts.Delivered,
            icon: Truck,
            status: 'Delivered' as const,
          },
        ].map((card) => (
          <DashboardStatCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            onViewAll={() => setActiveStatusTab(card.status)}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Total Filtered Value',
            amount: financialSummary.totalVal,
            icon: DollarSign,
            labelClass: 'text-slate-500',
            valueClass: 'text-slate-900 dark:text-white',
            iconClass: 'text-slate-400',
            subtitle: `Across ${filteredOrders.length} orders`,
            status: 'All' as const,
          },
          {
            label: 'Open Orders Value',
            amount: financialSummary.openVal,
            icon: Clock,
            labelClass: 'text-blue-600 dark:text-blue-400',
            valueClass: 'text-blue-700 dark:text-blue-300',
            iconClass: 'text-blue-500',
            subtitle: `${statusCounts.Open} Open Orders`,
            status: 'Open' as const,
          },
          {
            label: 'Invoiced Orders Value',
            amount: financialSummary.invoicedVal,
            icon: Receipt,
            labelClass: 'text-purple-600 dark:text-purple-400',
            valueClass: 'text-purple-700 dark:text-purple-300',
            iconClass: 'text-purple-500',
            subtitle: `${statusCounts.Invoiced} Invoiced Orders`,
            status: 'Invoiced' as const,
          },
          {
            label: 'Delivered Orders Value',
            amount: financialSummary.deliveredVal,
            icon: Truck,
            labelClass: 'text-emerald-600 dark:text-emerald-400',
            valueClass: 'text-emerald-700 dark:text-emerald-300',
            iconClass: 'text-emerald-500',
            subtitle: `${statusCounts.Delivered} Delivered Orders`,
            status: 'Delivered' as const,
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => setActiveStatusTab(card.status)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)] flex flex-col min-h-[112px] text-left hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-[13px] font-semibold leading-tight ${card.labelClass}`}>{card.label}</span>
                <Icon className={`h-3.5 w-3.5 shrink-0 ${card.iconClass}`} aria-hidden />
              </div>
              <p className={`text-[24px] leading-none font-bold mt-2 break-words ${card.valueClass}`}>
                ${card.amount.toLocaleString()}
              </p>
              <p className="text-[12px] text-slate-500 mt-1.5">{card.subtitle}</p>
            </button>
          );
        })}
      </div>

      {/* Main Status Tabs Navigation Bar (as explicitly requested: Open, Invoiced, Closed, Canceled, Delivered) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-2 border border-slate-200 dark:border-slate-800 shadow-md flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* ALL */}
          <button
            onClick={() => setActiveStatusTab('All')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeStatusTab === 'All'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <span>All Orders</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeStatusTab === 'All'
                  ? 'bg-slate-700 text-white dark:bg-slate-300 dark:text-slate-900'
                  : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {statusCounts.All}
            </span>
          </button>

          {/* OPEN */}
          <button
            onClick={() => setActiveStatusTab('Open')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeStatusTab === 'Open'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Open</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeStatusTab === 'Open' ? 'bg-blue-800 text-white' : 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200'
              }`}
            >
              {statusCounts.Open}
            </span>
          </button>

          {/* INVOICED */}
          <button
            onClick={() => setActiveStatusTab('Invoiced')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeStatusTab === 'Invoiced'
                ? 'bg-purple-600 text-white shadow-md'
                : 'text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Invoiced</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeStatusTab === 'Invoiced' ? 'bg-purple-800 text-white' : 'bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200'
              }`}
            >
              {statusCounts.Invoiced}
            </span>
          </button>

          {/* DELIVERED */}
          <button
            onClick={() => setActiveStatusTab('Delivered')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeStatusTab === 'Delivered'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Delivered</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeStatusTab === 'Delivered' ? 'bg-emerald-800 text-white' : 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200'
              }`}
            >
              {statusCounts.Delivered}
            </span>
          </button>

          {/* CLOSED */}
          <button
            onClick={() => setActiveStatusTab('Closed')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeStatusTab === 'Closed'
                ? 'bg-slate-700 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Closed</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeStatusTab === 'Closed' ? 'bg-slate-900 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200'
              }`}
            >
              {statusCounts.Closed}
            </span>
          </button>

          {/* CANCELED */}
          <button
            onClick={() => setActiveStatusTab('Canceled')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
              activeStatusTab === 'Canceled'
                ? 'bg-red-600 text-white shadow-md'
                : 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40'
            }`}
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>Canceled</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeStatusTab === 'Canceled' ? 'bg-red-800 text-white' : 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200'
              }`}
            >
              {statusCounts.Canceled}
            </span>
          </button>
        </div>

        {/* Filter / Search Controls */}
        <div className="flex items-center space-x-2 w-full md:w-auto mt-2 md:mt-0">
          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search SO#, Customer, Project..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:ring-2 focus:ring-blue-500 dark:text-white"
            />
          </div>

          {currentUser?.userType !== 'customer' && (
            <select
              value={selectedCustomerFilter}
              onChange={(e) => setSelectedCustomerFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl py-2 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="All">All Customers</option>
              {customerList.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Sales Orders Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
                <th className="py-3.5 px-4">Sales Order #</th>
                <th className="py-3.5 px-4">Customer & Project</th>
                <th className="py-3.5 px-4">Order Specs & Line Items</th>
                <th className="py-3.5 px-4">Dates (Order / Delivery)</th>
                <th className="py-3.5 px-4">Total Amount</th>
                <th className="py-3.5 px-4">Order Status</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <ShoppingCart className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-bold text-sm">No sales orders found matching selected filters.</p>
                    <p className="text-xs mt-1">Try switching tabs or clearing the search box.</p>
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    {/* SO Number & Ref */}
                    <td className="py-4 px-4 align-top">
                      <div className="font-extrabold text-blue-600 dark:text-blue-400 text-xs group-hover:underline flex items-center space-x-1">
                        <span>{order.soNumber}</span>
                      </div>
                      <div className="text-[10px] font-semibold text-slate-500 mt-0.5">
                        PO Ref: <span className="text-slate-700 dark:text-slate-300 font-bold">{order.customerPoRef}</span>
                      </div>
                      {order.invoiceRef && (
                        <span className="inline-block mt-1 text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/60 px-1.5 py-0.5 rounded font-mono font-bold">
                          {order.invoiceRef}
                        </span>
                      )}
                    </td>

                    {/* Customer & Project */}
                    <td className="py-4 px-4 align-top">
                      <div className="font-bold text-slate-900 dark:text-white flex items-center space-x-1">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{order.customerName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate max-w-xs">
                        {order.projectName}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        Sales Rep: {order.salesAgent}
                      </div>
                    </td>

                    {/* Order Specs & Line items */}
                    <td className="py-4 px-4 align-top">
                      <div className="space-y-1">
                        {order.items.slice(0, 2).map((item, idx) => (
                          <div key={idx} className="text-[11px]">
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {item.cableCode}
                            </span>
                            <span className="text-slate-500 ml-1.5">
                              ({item.qty} {item.uom})
                            </span>
                          </div>
                        ))}
                        {order.items.length > 2 && (
                          <span className="text-[10px] text-blue-500 font-bold">
                            + {order.items.length - 2} more items
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Dates */}
                    <td className="py-4 px-4 align-top whitespace-nowrap">
                      <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center space-x-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        <span>Order: {order.orderDate}</span>
                      </div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 font-bold mt-1">
                        Delivery: {order.deliveryDate}
                      </div>
                    </td>

                    {/* Total Amount */}
                    <td className="py-4 px-4 align-top whitespace-nowrap">
                      <div className="font-extrabold text-slate-900 dark:text-white text-sm">
                        ${order.totalAmountUsd.toLocaleString()}
                      </div>
                      <div className="text-[10px] text-slate-400 font-semibold uppercase">
                        {order.currency} Equivalent
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-4 px-4 align-top whitespace-nowrap">
                      {renderStatusBadge(order.status)}
                    </td>

                    {/* Actions */}
                    <td className="py-4 px-4 align-top text-right whitespace-nowrap">
                      <button
                        onClick={() => {
                          setSelectedOrder(order);
                          setEditingStatus(order.status);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow transition-all inline-flex items-center space-x-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View Order</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Order Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-slate-900 text-white p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 rounded-2xl bg-blue-600 text-white shadow-lg">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-lg font-black">{selectedOrder.soNumber}</h2>
                    {renderStatusBadge(selectedOrder.status)}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Customer PO: <span className="text-amber-400 font-bold">{selectedOrder.customerPoRef}</span> • {selectedOrder.customerName}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Internal Status Modifier Panel */}
              {currentUser?.userType !== 'customer' && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-amber-800 dark:text-amber-300 text-xs uppercase tracking-wider flex items-center space-x-1">
                      <ShieldCheck className="w-4 h-4 text-amber-500" />
                      <span>ERP Sales Order Status Workflow</span>
                    </p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      Update order state directly across the portal: Open → Invoiced → Delivered → Closed / Canceled
                    </p>
                  </div>

                  <div className="flex items-center space-x-2">
                    <select
                      value={editingStatus || selectedOrder.status}
                      onChange={(e) => setEditingStatus(e.target.value as SalesOrderStatus)}
                      className="bg-white dark:bg-slate-900 border border-amber-500/40 rounded-xl px-3 py-2 text-xs font-extrabold text-slate-900 dark:text-amber-200 outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                    >
                      <option value="Open">Open</option>
                      <option value="Invoiced">Invoiced</option>
                      <option value="Delivered">Delivered</option>
                      <option value="Closed">Closed</option>
                      <option value="Canceled">Canceled</option>
                    </select>

                    <button
                      onClick={() => {
                        if (editingStatus) {
                          handleUpdateStatus(selectedOrder.id, editingStatus);
                        }
                      }}
                      className="px-3.5 py-2 rounded-xl bg-accent-600 hover:bg-accent-700 text-white font-extrabold text-xs shadow transition-all"
                    >
                      Apply Change
                    </button>
                  </div>
                </div>
              )}

              {/* Order Key Information Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-slate-50 dark:bg-slate-950/60 rounded-2xl border border-slate-200 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Customer Name</span>
                  <p className="font-extrabold text-slate-900 dark:text-white mt-0.5 text-xs">
                    {selectedOrder.customerName}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Project Reference</span>
                  <p className="font-extrabold text-slate-900 dark:text-white mt-0.5 text-xs">
                    {selectedOrder.projectName}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Order / Delivery Date</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5 text-xs">
                    {selectedOrder.orderDate} → <span className="text-amber-600 dark:text-amber-400">{selectedOrder.deliveryDate}</span>
                  </p>
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-slate-500 uppercase">Total Order Value</span>
                  <p className="font-black text-blue-600 dark:text-blue-400 mt-0.5 text-sm">
                    ${selectedOrder.totalAmountUsd.toLocaleString()} {selectedOrder.currency}
                  </p>
                </div>
              </div>

              {/* Order Items Table */}
              <div>
                <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
                  <Package className="w-4 h-4 text-blue-500" />
                  <span>Order Cable Items & Line Details</span>
                </h3>

                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800 text-[11px]">
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Item Code</th>
                        <th className="py-2.5 px-3">Cable Description</th>
                        <th className="py-2.5 px-3 text-right">Quantity</th>
                        <th className="py-2.5 px-3 text-right">Unit Price</th>
                        <th className="py-2.5 px-3 text-right">Total USD</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {selectedOrder.items.map((item) => (
                        <tr key={item.serial} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-3 font-bold text-slate-500">{item.serial}</td>
                          <td className="py-3 px-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                            {item.itemCode}
                          </td>
                          <td className="py-3 px-3">
                            <p className="font-bold text-slate-900 dark:text-white">{item.cableCode}</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">{item.description}</p>
                          </td>
                          <td className="py-3 px-3 text-right font-extrabold text-slate-900 dark:text-white">
                            {item.qty} {item.uom}
                          </td>
                          <td className="py-3 px-3 text-right font-medium text-slate-600 dark:text-slate-400">
                            ${item.unitPriceUsd.toLocaleString()}
                          </td>
                          <td className="py-3 px-3 text-right font-black text-slate-900 dark:text-white">
                            ${item.totalPriceUsd.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Delivery Address & Remarks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Delivery Address & Site Location
                  </span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedOrder.deliveryAddress || 'Energya Central Distribution Warehouse / Client Project Site'}
                  </p>
                </div>

                <div className="p-3.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Commercial Remarks & Notes
                  </span>
                  <p className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedOrder.remarks || 'Standard commercial contract terms apply. Subject to LME copper fixing.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-100 dark:bg-slate-950 p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <button
                onClick={() => triggerToast(`Sales Order ${selectedOrder.soNumber} PDF printed successfully.`)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center space-x-1.5"
              >
                <Printer className="w-4 h-4 text-amber-400" />
                <span>Print Official Sales Order PDF</span>
              </button>

              <button
                onClick={() => setSelectedOrder(null)}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow transition-all"
              >
                Close View
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
