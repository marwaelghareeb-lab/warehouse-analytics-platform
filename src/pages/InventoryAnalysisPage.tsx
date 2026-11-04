import React, { useState, useEffect } from 'react';
import {
  Boxes,
  DollarSign,
  Search,
  Filter,
  ArrowUpDown,
  Building,
  CheckCircle,
  AlertTriangle,
  AlertOctagon,
  Archive,
  Download,
  Layers,
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
} from 'recharts';
import { storageService } from '../services/storageService';
import { StockSnapshot, Warehouse } from '../types/warehouse';
import { exportComprehensiveExcelReport } from '../utils/exportUtils';

export const InventoryAnalysisPage: React.FC = () => {
  const [stocks, setStocks] = useState<StockSnapshot[]>(storageService.getStockSnapshots());
  const [warehouses, setWarehouses] = useState<Warehouse[]>(storageService.getWarehouses());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');

  useEffect(() => {
    const update = () => {
      setStocks(storageService.getStockSnapshots());
      setWarehouses(storageService.getWarehouses());
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

  // Categories list
  const categories = Array.from(new Set(stocks.map((s) => s.category).filter(Boolean)));

  // Filtered stocks
  const filteredStocks = stocks.filter((s) => {
    const matchSearch =
      searchQuery === '' ||
      s.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.itemDescription.toLowerCase().includes(searchQuery.toLowerCase());

    const matchCategory = categoryFilter === 'ALL' || s.category === categoryFilter;
    const matchStatus = statusFilter === 'ALL' || s.stockStatus === statusFilter;
    const matchWarehouse = warehouseFilter === 'ALL' || s.warehouseCode === warehouseFilter;

    return matchSearch && matchCategory && matchStatus && matchWarehouse;
  });

  // Calculate totals
  const totalValuation = filteredStocks.reduce((sum, s) => sum + (s.totalStockValue || 0), 0);
  const totalQuantity = filteredStocks.reduce((sum, s) => sum + (s.quantityOnHand || 0), 0);
  const lowStockCount = filteredStocks.filter((s) => s.stockStatus === 'low_stock' || s.stockStatus === 'stockout').length;
  const overstockCount = filteredStocks.filter((s) => s.stockStatus === 'overstock').length;

  // Multi-warehouse comparison chart data
  const comparisonData = warehouses.map((wh) => {
    const whStocks = stocks.filter((s) => s.warehouseCode === wh.code);
    return {
      name: wh.code,
      fullName: wh.name,
      totalSAR: whStocks.reduce((acc, s) => acc + (s.totalStockValue || 0), 0),
      itemsCount: whStocks.length,
    };
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <Boxes className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-1.5 flex-wrap">
              <span className="font-brand font-black tracking-tight brand-gradient-light text-2xl">Inventra</span>
              <span className="text-slate-900 font-bold">Stock Balance & Inventory Analysis</span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Dated snapshot analysis of physical stock balances, valuation, and multi-depot distribution.
          </p>
        </div>

        <button
          onClick={() => {
            const kpi = storageService.getKPISummary();
            exportComprehensiveExcelReport(
              kpi,
              filteredStocks,
              storageService.getConsumptionRecords(),
              storageService.getReceivingRecords(),
              storageService.getExpiryRecords(),
              storageService.getSelectedPeriod(),
              warehouseFilter === 'ALL' ? 'All Warehouses' : warehouseFilter
            );
          }}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition flex items-center space-x-1.5 shadow-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Excel Report</span>
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Valuation</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 truncate">
            {formatSAR(totalValuation)}
          </div>
          <span className="text-[11px] text-teal-600 font-medium">Filtered items valuation</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Filtered Items</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {filteredStocks.length.toLocaleString()}
          </div>
          <span className="text-[11px] text-slate-500">Across selected criteria</span>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-amber-800 uppercase">Low Stock Alerts</span>
          <div className="text-2xl font-extrabold text-amber-900 mt-2">
            {lowStockCount}
          </div>
          <span className="text-[11px] text-amber-700 font-medium">Critical buffer deficit</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Overstock Items</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {overstockCount}
          </div>
          <span className="text-[11px] text-indigo-600 font-medium">Exceeds max stock level</span>
        </div>
      </div>

      {/* Warehouse Comparison Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
              Warehouse Comparison: Stock Value by Facility (SAR)
            </h2>
            <p className="text-xs text-slate-500">
              Evaluates inventory balance and capital concentration among storage locations
            </p>
          </div>
          <span className="text-xs bg-teal-50 text-teal-800 border border-teal-200 px-2 py-0.5 rounded font-semibold">
            {warehouses.length} Facilities Monitored
          </span>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
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
                  const w = comparisonData.find((x) => x.name === name);
                  return w ? `${w.name} - ${w.fullName}` : name;
                }}
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
              />
              <Bar dataKey="totalSAR" name="Valuation (SAR)" fill="#0f766e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search */}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Item Code or Medical Description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
          />
        </div>

        {/* Category filter */}
        <div className="flex items-center space-x-2">
          <span className="text-slate-500 font-semibold">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Warehouse filter */}
        <div className="flex items-center space-x-2">
          <span className="text-slate-500 font-semibold">Warehouse:</span>
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
          >
            <option value="ALL">All Warehouses</option>
            {warehouses.map((wh) => (
              <option key={wh.code} value={wh.code}>
                {wh.code}
              </option>
            ))}
          </select>
        </div>

        {/* Stock status filter */}
        <div className="flex items-center space-x-2">
          <span className="text-slate-500 font-semibold">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
          >
            <option value="ALL">All Statuses</option>
            <option value="normal">Normal</option>
            <option value="low_stock">Low Stock (Critical)</option>
            <option value="overstock">Overstock</option>
            <option value="stockout">Stockout (Zero)</option>
          </select>
        </div>
      </div>

      {/* Stock Snapshot Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Item Code</th>
                <th className="py-3 px-4">Item Description</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4">Warehouse</th>
                <th className="py-3 px-4 text-right">Quantity on Hand</th>
                <th className="py-3 px-4">UOM</th>
                <th className="py-3 px-4 text-right">Unit Cost (SAR)</th>
                <th className="py-3 px-4 text-right">Total Value (SAR)</th>
                <th className="py-3 px-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredStocks.length > 0 ? (
                filteredStocks.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {item.itemCode}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800 max-w-[260px]">
                      {item.itemDescription}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {item.category}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                        {item.warehouseCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                      {item.quantityOnHand.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-medium">
                      {item.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {item.unitCost?.toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-teal-800">
                      {formatSAR(item.totalStockValue)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.stockStatus === 'low_stock' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Low Stock
                        </span>
                      )}
                      {item.stockStatus === 'overstock' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                          Overstock
                        </span>
                      )}
                      {item.stockStatus === 'stockout' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          Stockout
                        </span>
                      )}
                      {item.stockStatus === 'normal' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                    No items match the selected filter criteria.
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
