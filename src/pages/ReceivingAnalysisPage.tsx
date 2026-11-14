import React, { useState, useEffect } from 'react';
import {
  Truck,
  DollarSign,
  FileCheck2,
  FileText,
  PackageCheck,
  Search,
  Filter,
  CheckCircle,
  Clock,
  Building,
  Calendar,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { storageService } from '../services/storageService';
import { ReceivingRecord } from '../types/warehouse';

export const ReceivingAnalysisPage: React.FC = () => {
  const [receivings, setReceivings] = useState<ReceivingRecord[]>(storageService.getReceivingRecords());
  const [supplierFilter, setSupplierFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [distributorSearchInput, setDistributorSearchInput] = useState('');
  const [distributorSearchQuery, setDistributorSearchQuery] = useState('');
  const [showAllDistributors, setShowAllDistributors] = useState(false);

  useEffect(() => {
    const update = () => {
      setReceivings(storageService.getReceivingRecords());
    };
    update();
    const unsub = storageService.subscribe(update);
    return unsub;
  }, []);

  const formatSAR = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SAR',
      maximumFractionDigits: 0,
    }).format(val).replace('SAR', 'SAR ');
  };

  // Suppliers list
  const suppliers = Array.from(new Set(receivings.map((r) => r.supplierName).filter(Boolean)));

  // Filtered receivings
  const filtered = receivings.filter((r) => {
    const q = searchQuery.trim().toLowerCase();
    const matchSupplier = supplierFilter === 'ALL' || r.supplierName === supplierFilter;
    const matchSearch =
      q === '' ||
      (r.itemCode || '').toLowerCase().includes(q) ||
      (r.itemDescription || '').toLowerCase().includes(q) ||
      (r.grnNumber || '').toLowerCase().includes(q) ||
      (r.prNumber || '').toLowerCase().includes(q) ||
      (r.supplierName || '').toLowerCase().includes(q);

    return matchSupplier && matchSearch;
  });

  // Totals
  const totalReceivedValueSAR = filtered.reduce((sum, r) => sum + (Number(r.totalReceivedValue) || 0), 0);
  const totalItemsReceived = filtered.reduce((sum, r) => sum + (Number(r.quantityReceived) || 0), 0);
  const uniqueGRNs = new Set(filtered.map((r) => r.grnNumber)).size;
  const uniquePRs = new Set(filtered.filter((r) => r.prNumber).map((r) => r.prNumber)).size;

  // Supplier performance aggregation
  const supplierSpendMap = new Map<string, { supplier: string; totalSAR: number; shipments: number; itemsCount: number }>();
  receivings.forEach((r) => {
    const s = r.supplierName || 'Unknown Vendor';
    const val = Number(r.totalReceivedValue) || 0;
    const qty = Number(r.quantityReceived) || 0;
    const existing = supplierSpendMap.get(s);
    if (!existing) {
      supplierSpendMap.set(s, {
        supplier: s,
        totalSAR: val,
        shipments: 1,
        itemsCount: qty,
      });
    } else {
      existing.totalSAR += val;
      existing.shipments += 1;
      existing.itemsCount += qty;
    }
  });

  const supplierData = Array.from(supplierSpendMap.values())
    .sort((a, b) => b.totalSAR - a.totalSAR);

  const activeDistributorQuery = distributorSearchQuery.trim().toLowerCase();
  const filteredDistributorData = activeDistributorQuery
    ? supplierData.filter((s) => s.supplier.toLowerCase().includes(activeDistributorQuery))
    : showAllDistributors
      ? supplierData
      : supplierData.slice(0, 4);

  const handleDistributorSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDistributorSearchQuery(distributorSearchInput);
  };

  const COLORS = ['#0d9488', '#0284c7', '#6366f1', '#f59e0b', '#ec4899', '#10b981'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <Truck className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-1.5 flex-wrap">
              <span className="font-brand font-black tracking-tight brand-gradient-light text-2xl">Inventra</span>
              <span className="text-slate-900 font-bold">Receiving & Vendor Performance</span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tracks inbound logistics flows, Goods Received Notes, Purchase Requisition fulfillment, and supplier delivery volumes.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-400 font-semibold uppercase">Total Inbound Receipt Value</div>
          <div className="text-xl font-black text-teal-800">{formatSAR(totalReceivedValueSAR)}</div>
        </div>
      </div>

      {/* KPI 4 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Received Value (SAR)</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 truncate">
            {formatSAR(totalReceivedValueSAR)}
          </div>
          <span className="text-[11px] text-teal-600 font-medium">Inbound GRN total</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">GRNs Done</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {uniqueGRNs} Notes
          </div>
          <span className="text-[11px] text-slate-500">Processed warehouse deliveries</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">PRs Linked</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {uniquePRs} PRs
          </div>
          <span className="text-[11px] text-indigo-600 font-medium">Purchase requisitions matched</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Items Received</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {totalItemsReceived.toLocaleString()} Units
          </div>
          <span className="text-[11px] text-slate-500">Clinical units accepted</span>
        </div>
      </div>

      {/* Supplier Spend & Distribution Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Supplier Spend Bar Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                Supplier Spend Breakdown (SAR)
              </h2>
              <p className="text-xs text-slate-500">
                Inbound procurement allocation by authorized medical distributor
              </p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold">
              Top Vendors
            </span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={supplierData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="supplier"
                  stroke="#64748b"
                  fontSize={11}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toLocaleString()} SAR`]}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                />
                <Bar dataKey="totalSAR" name="Received Value (SAR)" fill="#0f766e" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Vendor Summary Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-1">
              <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                Distributor Highlights
              </h2>
              {supplierData.length > 4 && !activeDistributorQuery && (
                <button
                  type="button"
                  onClick={() => setShowAllDistributors((prev) => !prev)}
                  className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 hover:underline shrink-0"
                >
                  {showAllDistributors ? 'Top 4' : `View All (${supplierData.length})`}
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Search any supplier to view total receiving amount during the month
            </p>

            {/* Distributor Search Bar with Search Button */}
            <form onSubmit={handleDistributorSearchSubmit} className="flex items-center gap-1.5 mb-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Supplier name..."
                  value={distributorSearchInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDistributorSearchInput(val);
                    setDistributorSearchQuery(val);
                  }}
                  className="w-full pl-8 pr-7 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
                />
                {distributorSearchInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setDistributorSearchInput('');
                      setDistributorSearchQuery('');
                    }}
                    title="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition inline-flex items-center gap-1 shrink-0"
              >
                <Search className="w-3 h-3" />
                <span>Search</span>
              </button>
            </form>

            <div className="space-y-2.5 max-h-[250px] overflow-y-auto pr-1">
              {filteredDistributorData.length > 0 ? (
                filteredDistributorData.map((s) => {
                  const isSelected = supplierFilter === s.supplier;
                  return (
                    <button
                      type="button"
                      key={s.supplier}
                      onClick={() => setSupplierFilter(isSelected ? 'ALL' : s.supplier)}
                      title="Click to filter receiving log by this supplier"
                      className={`w-full text-left p-3 rounded-lg text-xs flex items-center justify-between border transition ${
                        isSelected
                          ? 'bg-teal-50 border-teal-400 ring-1 ring-teal-400'
                          : 'bg-slate-50 border-slate-200 hover:border-teal-300 hover:bg-slate-100/70'
                      }`}
                    >
                      <div className="max-w-[165px]">
                        <div className="font-bold text-slate-900 truncate" title={s.supplier}>
                          {s.supplier}
                        </div>
                        <div className="text-[10px] text-slate-500">{s.shipments} GRN Deliveries</div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="font-bold text-teal-800">{formatSAR(s.totalSAR)}</div>
                        <div className="text-[10px] text-slate-500">{s.itemsCount.toLocaleString()} units</div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg">
                  No supplier found matching "{distributorSearchQuery}".
                </div>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 mt-4 text-[11px] text-slate-500 flex items-center justify-between">
            <span>
              {activeDistributorQuery
                ? `${filteredDistributorData.length} matching supplier(s)`
                : `Total Active Suppliers: ${supplierData.length}`}
            </span>
            <CheckCircle className="w-4 h-4 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Receiving Log Table with Filters */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by GRN #, Item Code, Description, or Supplier..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-semibold">Supplier Name:</span>
            <select
              value={supplierFilter}
              onChange={(e) => setSupplierFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
            >
              <option value="ALL">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">GRN #</th>
                <th className="py-3 px-4">PR #</th>
                <th className="py-3 px-4">Item Code</th>
                <th className="py-3 px-4">Item Description</th>
                <th className="py-3 px-4">Warehouse</th>
                <th className="py-3 px-4 text-right">Received Qty</th>
                <th className="py-3 px-4">UOM</th>
                <th className="py-3 px-4 text-right">Unit Cost (SAR)</th>
                <th className="py-3 px-4 text-right">Total GRN (SAR)</th>
                <th className="py-3 px-4">Supplier Name</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-teal-700">
                      {item.grnNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500">
                      {item.prNumber}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {item.itemCode}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 max-w-[220px]">
                      {item.itemDescription}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                        {item.warehouseCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                      {(Number(item.quantityReceived) || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-medium">
                      {item.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {(Number(item.unitCost) || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-teal-800">
                      {formatSAR(Number(item.totalReceivedValue) || 0)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800 min-w-[160px]">
                      {item.supplierName || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                      {item.receiptDate}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500 text-xs">
                    No receiving records found for the selected supplier.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
