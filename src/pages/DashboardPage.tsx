import React, { useState, useEffect } from 'react';
import {
  Boxes,
  DollarSign,
  AlertOctagon,
  ClockAlert,
  Archive,
  TrendingDown,
  TrendingUp,
  FileCheck2,
  FileText,
  PackageCheck,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Building,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
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
import { KPISummary, StockSnapshot, ConsumptionRecord, ReceivingRecord } from '../types/warehouse';

interface DashboardPageProps {
  onNavigate: (page: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const [kpi, setKpi] = useState<KPISummary>(storageService.getKPISummary());
  const [stocks, setStocks] = useState<StockSnapshot[]>(storageService.getStockSnapshots());
  const [consumptions, setConsumptions] = useState<ConsumptionRecord[]>(storageService.getConsumptionRecords());
  const [receivings, setReceivings] = useState<ReceivingRecord[]>(storageService.getReceivingRecords());
  const [isDemo, setIsDemo] = useState(storageService.getIsDemoMode());
  const [selectedWarehouse, setSelectedWarehouse] = useState(storageService.getSelectedWarehouse());
  const [selectedPeriod, setSelectedPeriod] = useState(storageService.getSelectedPeriod());

  useEffect(() => {
    const update = () => {
      setKpi(storageService.getKPISummary());
      setStocks(storageService.getStockSnapshots());
      setConsumptions(storageService.getConsumptionRecords());
      setReceivings(storageService.getReceivingRecords());
      setIsDemo(storageService.getIsDemoMode());
      setSelectedWarehouse(storageService.getSelectedWarehouse());
      setSelectedPeriod(storageService.getSelectedPeriod());
    };
    update();
    const unsub = storageService.subscribe(update);
    return unsub;
  }, []);

  // Format currency SAR
  const formatSAR = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'SAR',
      maximumFractionDigits: 0,
    }).format(val).replace('SAR', 'SAR ');
  };

  // Warehouse breakdown data for charts
  const warehouseBreakdown = storageService.getWarehouses().map((wh) => {
    const whStocks = stocks.filter((s) => s.warehouseCode === wh.code);
    const value = whStocks.reduce((sum, s) => sum + (s.totalStockValue || 0), 0);
    const count = whStocks.length;
    return {
      name: wh.code,
      fullName: wh.name,
      valueSAR: value,
      itemsCount: count,
    };
  });

  // Receiving vs Issuing comparison monthly data (realistic historical trend points)
  const flowTrendData = [
    {
      month: 'Jul 2026',
      Receiving: 295000,
      Issuing: 268000,
    },
    {
      month: 'Aug 2026',
      Receiving: 340000,
      Issuing: 312000,
    },
    {
      month: 'Sep 2026',
      Receiving: 390000,
      Issuing: 345000,
    },
    {
      month: 'Oct 2026',
      Receiving: kpi.monthlyReceivingAmountSAR || 440000,
      Issuing: kpi.monthlyIssuingAmountSAR || 382000,
    },
  ];

  // Category breakdown
  const categoryMap = new Map<string, number>();
  stocks.forEach((s) => {
    const cat = s.category || 'General Supplies';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + (s.totalStockValue || 0));
  });
  const categoryData = Array.from(categoryMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));
  const COLORS = ['#0d9488', '#0284c7', '#6366f1', '#f59e0b', '#ec4899', '#10b981'];

  // Top low stock items for quick action list
  const lowStockPreview = stocks
    .filter((s) => s.stockStatus === 'low_stock' || s.stockStatus === 'stockout')
    .slice(0, 4);

  return (
    <div className="space-y-6">
      {/* Scope banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-2xl p-5 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white flex items-center space-x-2 flex-wrap">
              <span className="font-brand font-black tracking-tight brand-gradient text-2xl md:text-3xl">Inventra</span>
              <span className="text-slate-100 font-bold">Executive Dashboard</span>
            </h1>
            <span className="bg-teal-500/20 text-teal-300 text-xs px-2.5 py-0.5 rounded-full border border-teal-500/30 font-semibold">
              {selectedPeriod === 'ALL' ? 'All Periods' : `Period: ${selectedPeriod}`}
            </span>
          </div>
          <p className="text-xs text-slate-300 mt-1">
            Welcome to <span className="font-brand font-bold text-teal-300 tracking-tight">Inventra</span> • Consolidated stock valuation, clinical consumption burn rate, and inventory risk oversight.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => onNavigate('upload')}
            className="px-3.5 py-2 bg-teal-500 hover:bg-teal-600 text-slate-950 font-bold text-xs rounded-lg transition shadow-sm flex items-center space-x-1.5"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Import New ERP File</span>
          </button>
          <button
            onClick={() => onNavigate('reports')}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 font-semibold text-xs rounded-lg transition"
          >
            Generate Briefing
          </button>
        </div>
      </div>

      {/* Row 1: Primary Snapshot KPI Cards (5 Cards as requested) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Total Items */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Items</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900">
              {kpi.totalItems.toLocaleString()}
            </div>
            <div className="flex items-center text-[11px] text-slate-500 mt-1">
              <span>Catalogued hospital SKUs</span>
            </div>
          </div>
        </div>

        {/* 2. Total Stock Value (SAR) */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock Value (SAR)</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900 truncate" title={formatSAR(kpi.totalStockValueSAR)}>
              {formatSAR(kpi.totalStockValueSAR)}
            </div>
            <div className="flex items-center text-[11px] text-emerald-600 font-medium mt-1">
              <span>On-hand valuation</span>
            </div>
          </div>
        </div>

        {/* 3. Low Stock Items */}
        <div
          onClick={() => onNavigate('risks')}
          className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs hover:border-amber-400 cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800 uppercase tracking-wider">Low Stock Items</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center group-hover:scale-105 transition">
              <AlertOctagon className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-amber-900">
              {kpi.lowStockItemsCount}
            </div>
            <div className="flex items-center text-[11px] text-amber-700 font-semibold mt-1">
              <span>Under minimum buffer stock</span>
            </div>
          </div>
        </div>

        {/* 4. Near Expiry Items */}
        <div
          onClick={() => onNavigate('expiry')}
          className="bg-white border border-rose-200 rounded-xl p-4 shadow-xs hover:border-rose-400 cursor-pointer transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800 uppercase tracking-wider">Near Expiry (≤90d)</span>
            <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-700 flex items-center justify-center group-hover:scale-105 transition">
              <ClockAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-rose-900">
              {kpi.nearExpiryItemsCount}
            </div>
            <div className="flex items-center text-[11px] text-rose-700 font-semibold mt-1">
              <span>Requires FEFO dispatch</span>
            </div>
          </div>
        </div>

        {/* 5. Overstock Items */}
        <div
          onClick={() => onNavigate('risks')}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Overstock Items</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <Archive className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold text-slate-900">
              {kpi.overstockItemsCount}
            </div>
            <div className="flex items-center text-[11px] text-indigo-600 font-medium mt-1">
              <span>Excess capital tied</span>
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Secondary Monthly Flow Metrics (Specific user requested items) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Monthly Receiving Amount */}
        <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase">Monthly Receiving</span>
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-white truncate" title={formatSAR(kpi.monthlyReceivingAmountSAR)}>
            {formatSAR(kpi.monthlyReceivingAmountSAR)}
          </div>
          <div className="text-[11px] text-teal-400 font-medium mt-1">
            Inbound vendor GRN value
          </div>
        </div>

        {/* Monthly Issuing Amount */}
        <div className="bg-slate-900 text-white rounded-xl p-4 border border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-semibold uppercase">Monthly Issuing</span>
            <TrendingDown className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-2 text-xl font-bold text-white truncate" title={formatSAR(kpi.monthlyIssuingAmountSAR)}>
            {formatSAR(kpi.monthlyIssuingAmountSAR)}
          </div>
          <div className="text-[11px] text-sky-400 font-medium mt-1">
            Ward & clinical consumption
          </div>
        </div>

        {/* GRNs Done per Month */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase">GRNs Processed</span>
            <FileCheck2 className="w-4 h-4 text-teal-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {kpi.grnDoneCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Goods Received Notes
          </div>
        </div>

        {/* PRs Raised */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase">PRs Raised</span>
            <FileText className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {kpi.prRaisedCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Purchase Requisitions
          </div>
        </div>

        {/* Number of Items Received */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold uppercase">Items Received</span>
            <PackageCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-xl font-bold text-slate-900">
            {kpi.itemsReceivedCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Total units accepted
          </div>
        </div>
      </div>

      {/* Row 3: Interactive Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Receiving vs Issuing Flow Comparison Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900">
                Receiving vs. Issuing Flow (SAR)
              </h2>
              <p className="text-xs text-slate-500">
                Period-based inventory inflows (GRN) vs. clinical outflows (Consumption)
              </p>
            </div>
            <span className="text-xs bg-slate-100 text-slate-700 px-2 py-1 rounded font-medium">
              Monthly Trend
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={flowTrendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="receivingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0d9488" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0d9488" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="issuingGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toLocaleString()} SAR`]}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                <Area
                  type="monotone"
                  dataKey="Receiving"
                  name="Receiving Amount (SAR)"
                  stroke="#0d9488"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#receivingGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="Issuing"
                  name="Issuing / Consumption (SAR)"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#issuingGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Stock Valuation by Category Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-bold text-base text-slate-900">
                Stock Value by Category
              </h2>
              <span className="text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded font-semibold">
                SAR Share
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Financial concentration across medical classes
            </p>
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(val: any) => [`${Number(val).toLocaleString()} SAR`]}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            {categoryData.slice(0, 4).map((cat, idx) => (
              <div key={cat.name} className="flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center space-x-1.5 truncate max-w-[170px]">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <span className="truncate">{cat.name}</span>
                </div>
                <span className="font-semibold text-slate-800">{formatSAR(cat.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Row 4: Multi-Warehouse Inventory Comparison & Critical Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Warehouse Comparison Bar Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-base text-slate-900">
                Inventory Valuation by Warehouse (SAR)
              </h2>
              <p className="text-xs text-slate-500">
                Comparison of capital allocation across storage depots
              </p>
            </div>
            <button
              onClick={() => onNavigate('inventory')}
              className="text-xs text-teal-600 hover:text-teal-700 font-semibold flex items-center"
            >
              <span>Detailed Comparison</span>
              <ArrowUpRight className="w-3.5 h-3.5 ml-0.5" />
            </button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={warehouseBreakdown} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toLocaleString()} SAR`]}
                  labelFormatter={(name) => {
                    const found = warehouseBreakdown.find((w) => w.name === name);
                    return found ? `${found.name} - ${found.fullName}` : name;
                  }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                />
                <Bar dataKey="valueSAR" name="Stock Value (SAR)" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Immediate Action Items Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2 text-rose-400">
                <ShieldAlert className="w-4 h-4" />
                <h2 className="font-bold text-sm text-white">Stock Control Priority</h2>
              </div>
              <span className="text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded font-semibold">
                Action Required
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Items under safety stock or expiring lot numbers requiring dispatch.
            </p>

            <div className="space-y-2.5">
              {lowStockPreview.length > 0 ? (
                lowStockPreview.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 bg-slate-800/80 border border-slate-700 rounded-lg flex items-center justify-between text-xs"
                  >
                    <div className="max-w-[170px] truncate">
                      <div className="font-semibold text-slate-200 truncate">{item.itemDescription}</div>
                      <div className="text-[10px] text-slate-400">
                        {item.warehouseCode} • On-hand: <strong className="text-amber-400">{item.quantityOnHand} {item.unit}</strong>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded text-[10px] font-bold">
                      Low Buffer
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-4 text-center text-xs text-slate-400">
                  All items currently above safety threshold.
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-800 mt-4">
            <button
              onClick={() => onNavigate('risks')}
              className="w-full py-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-slate-950 font-bold text-xs rounded-lg transition"
            >
              Open Recommendations Engine
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
