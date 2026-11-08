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
  ChevronDown,
  ChevronRight,
  ClockAlert,
  Sparkles,
  Settings2,
  Calendar,
  Package,
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
import {
  AggregatedInventoryItem,
  StockSnapshot,
  Warehouse,
  UOMConversionRule,
} from '../types/warehouse';
import { exportComprehensiveExcelReport } from '../utils/exportUtils';
import { normalizeUOMName } from '../utils/uomConverter';

export const InventoryAnalysisPage: React.FC = () => {
  const [aggregatedItems, setAggregatedItems] = useState<AggregatedInventoryItem[]>(
    storageService.getAggregatedInventory()
  );
  const [warehouses, setWarehouses] = useState<Warehouse[]>(storageService.getWarehouses());
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [warehouseFilter, setWarehouseFilter] = useState('ALL');

  // Set of expanded item codes for batch-level accordion view
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Quick UOM Conversion modal state
  const [modalItem, setModalItem] = useState<AggregatedInventoryItem | null>(null);
  const [modalFromUnit, setModalFromUnit] = useState('Box');
  const [modalToUnit, setModalToUnit] = useState('Piece');
  const [modalFactor, setModalFactor] = useState('10');

  useEffect(() => {
    const update = () => {
      setAggregatedItems(storageService.getAggregatedInventory());
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
    })
      .format(val)
      .replace('SAR', 'SAR ');
  };

  // Toggle expansion of an item
  const toggleExpand = (itemCode: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemCode)) {
        next.delete(itemCode);
      } else {
        next.add(itemCode);
      }
      return next;
    });
  };

  // Expand / collapse all
  const handleToggleExpandAll = () => {
    if (expandedItems.size > 0) {
      setExpandedItems(new Set());
    } else {
      setExpandedItems(new Set(filteredItems.map((i) => i.itemCode)));
    }
  };

  // Categories list
  const categories = Array.from(new Set(aggregatedItems.map((s) => s.category).filter(Boolean)));

  // Filtered items
  const filteredItems = aggregatedItems.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    const matchSearch =
      query === '' ||
      item.itemCode.toLowerCase().includes(query) ||
      item.itemDescription.toLowerCase().includes(query) ||
      item.batches.some((b) => b.batchNumber.toLowerCase().includes(query));

    const matchCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
    const matchStatus = statusFilter === 'ALL' || item.stockStatus === statusFilter;
    const matchWarehouse = warehouseFilter === 'ALL' || item.warehouseCode === warehouseFilter;

    return matchSearch && matchCategory && matchStatus && matchWarehouse;
  });

  // Totals based on aggregated normalized data
  const totalValuation = filteredItems.reduce((sum, s) => sum + (s.totalStockValueSAR || 0), 0);
  const totalQuantity = filteredItems.reduce((sum, s) => sum + (s.totalQuantity || 0), 0);
  const lowStockCount = filteredItems.filter(
    (s) => s.stockStatus === 'low_stock' || s.stockStatus === 'stockout'
  ).length;
  const multiBatchCount = filteredItems.filter((s) => s.batchCount > 1).length;
  const uomConversionNeededCount = filteredItems.filter((s) => s.conversionRequired).length;

  // Multi-warehouse comparison chart data
  const comparisonData = warehouses.map((wh) => {
    const whItems = aggregatedItems.filter((s) => s.warehouseCode === wh.code);
    return {
      name: wh.code,
      fullName: wh.name,
      totalSAR: whItems.reduce((acc, s) => acc + (s.totalStockValueSAR || 0), 0),
      itemsCount: whItems.length,
    };
  });

  // Handle saving UOM conversion rule from modal
  const handleSaveModalUOM = () => {
    if (!modalItem) return;
    const factorNum = parseFloat(modalFactor);
    if (isNaN(factorNum) || factorNum <= 0) {
      alert('Please enter a valid positive conversion factor.');
      return;
    }

    const newRule: UOMConversionRule = {
      id: `UOM-${modalItem.itemCode}-${Date.now()}`,
      itemCode: modalItem.itemCode,
      itemDescription: modalItem.itemDescription,
      fromUnit: normalizeUOMName(modalFromUnit),
      toUnit: normalizeUOMName(modalToUnit),
      factor: factorNum,
      source: 'admin',
      updatedAt: new Date().toISOString().split('T')[0],
    };

    storageService.saveUOMConversion(newRule);
    setAggregatedItems(storageService.getAggregatedInventory());
    setModalItem(null);
  };

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
            Aggregated item-level inventory valuation with full batch traceability and automatic UOM standardization.
          </p>
        </div>

        <button
          onClick={() => {
            const kpi = storageService.getKPISummary();
            exportComprehensiveExcelReport(
              kpi,
              storageService.getStockSnapshots(),
              storageService.getConsumptionRecords(),
              storageService.getReceivingRecords(),
              storageService.getExpiryRecords(),
              storageService.getSelectedPeriod(),
              warehouseFilter === 'ALL' ? 'All Warehouses' : warehouseFilter
            );
          }}
          className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition flex items-center space-x-2 shadow-xs shrink-0 self-start md:self-auto"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export Excel Report</span>
        </button>
      </div>

      {/* KPI Cards (All based on aggregated normalized data) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Active SKUs</span>
          <div className="text-2xl font-black text-slate-900 mt-2">{filteredItems.length} Items</div>
          <span className="text-[11px] text-teal-700 font-medium">Aggregated item master</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Stock Value</span>
          <div className="text-2xl font-black text-teal-800 mt-2">{formatSAR(totalValuation)}</div>
          <span className="text-[11px] text-slate-400 font-medium">Verified snapshot valuation</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Multi-Batch SKUs</span>
          <div className="text-2xl font-black text-indigo-700 mt-2">{multiBatchCount} Items</div>
          <span className="text-[11px] text-indigo-600 font-medium">Traceable batch lots</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Low Stock / Stockout</span>
          <div className="text-2xl font-black text-amber-600 mt-2">{lowStockCount} Items</div>
          <span className="text-[11px] text-amber-700 font-medium">Immediate reorder alert</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">UOM Conversions</span>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {uomConversionNeededCount > 0 ? (
              <span className="text-amber-600">{uomConversionNeededCount} Needed</span>
            ) : (
              <span className="text-emerald-700">Standardized</span>
            )}
          </div>
          <span className="text-[11px] text-slate-400 font-medium">Base unit alignment</span>
        </div>
      </div>

      {/* Warehouse Comparison Chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Consolidated Inventory Value by Warehouse</h3>
            <p className="text-xs text-slate-400">Total stock valuation (SAR) distributed across hospital pharmacy and supply locations</p>
          </div>
          <span className="text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-md font-medium">
            Currency: SAR
          </span>
        </div>
        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis
                tick={{ fontSize: 11 }}
                tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip
                formatter={(val: any) => [formatSAR(Number(val)), 'Stock Value']}
                labelFormatter={(label) => {
                  const wh = warehouses.find((w) => w.code === label);
                  return `${label} - ${wh?.name || ''}`;
                }}
              />
              <Bar dataKey="totalSAR" fill="#0d9488" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center flex-wrap gap-2.5 flex-1 min-w-[280px]">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Item Code, Description, or Batch #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-teal-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Warehouse Filter */}
          <select
            value={warehouseFilter}
            onChange={(e) => setWarehouseFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium cursor-pointer"
          >
            <option value="ALL">All Warehouses</option>
            {warehouses.map((w) => (
              <option key={w.code} value={w.code}>
                {w.code} - {w.name}
              </option>
            ))}
          </select>

          {/* Stock status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium cursor-pointer"
          >
            <option value="ALL">All Statuses</option>
            <option value="normal">Normal</option>
            <option value="low_stock">Low Stock (Critical)</option>
            <option value="overstock">Overstock</option>
            <option value="stockout">Stockout (Zero)</option>
          </select>
        </div>

        {/* Expand / Collapse All CTA */}
        <button
          onClick={handleToggleExpandAll}
          className="text-xs font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 px-3 py-1.5 rounded-lg transition flex items-center space-x-1"
        >
          <span>{expandedItems.size > 0 ? 'Collapse All Batches' : 'Expand All Batches'}</span>
        </button>
      </div>

      {/* Aggregated Inventory Table with Expandable Batches */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-3 w-8 text-center"></th>
                <th className="py-3 px-3">Item Code</th>
                <th className="py-3 px-4">Item Description</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Warehouse</th>
                <th className="py-3 px-4 text-right">Available Qty</th>
                <th className="py-3 px-3">Standard UOM</th>
                <th className="py-3 px-3 text-center">Batches</th>
                <th className="py-3 px-4 text-right">Stock Value (SAR)</th>
                <th className="py-3 px-3">Earliest Expiry</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const isExpanded = expandedItems.has(item.itemCode);

                  return (
                    <React.Fragment key={`${item.itemCode}-${item.warehouseCode}`}>
                      {/* Parent Item Row (Aggregated) */}
                      <tr
                        onClick={() => toggleExpand(item.itemCode)}
                        className={`hover:bg-slate-50 transition cursor-pointer ${
                          isExpanded ? 'bg-slate-50/80 font-medium' : ''
                        }`}
                      >
                        <td className="py-3 px-3 text-center text-slate-400">
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4 text-teal-600" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">
                          {item.itemCode}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-800 max-w-[280px]">
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span>{item.itemDescription}</span>
                            {item.namePatternFactor !== undefined && (
                              <span
                                title={`Detected (#${item.namePatternFactor}) in item name: 1 Box = ${item.namePatternFactor} ${item.standardUnit}`}
                                className="bg-emerald-50 text-emerald-800 border border-emerald-300 text-[10px] px-1.5 py-0.2 rounded font-bold"
                              >
                                #{item.namePatternFactor}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-600">
                          {item.category}
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                            {item.warehouseCode}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold text-slate-900 text-sm">
                          {item.totalQuantity.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 text-slate-600 font-medium">
                          {item.standardUnit}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                              item.batchCount > 1
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.batchCount} {item.batchCount === 1 ? 'Batch' : 'Batches'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-teal-800">
                          {formatSAR(item.totalStockValueSAR)}
                        </td>
                        <td className="py-3 px-3">
                          {item.earliestExpiryDate ? (
                            <span
                              className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                item.earliestExpiryDays !== undefined && item.earliestExpiryDays <= 0
                                  ? 'bg-rose-100 text-rose-800'
                                  : item.earliestExpiryDays !== undefined && item.earliestExpiryDays <= 30
                                  ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                  : item.earliestExpiryDays !== undefined && item.earliestExpiryDays <= 90
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'text-slate-700'
                              }`}
                            >
                              <Calendar className="w-3 h-3 shrink-0" />
                              <span>{item.earliestExpiryDate}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {item.stockStatus === 'low_stock' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                              Low Stock
                            </span>
                          ) : item.stockStatus === 'overstock' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                              Overstock
                            </span>
                          ) : item.stockStatus === 'stockout' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              Stockout
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              Normal
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => {
                              setModalItem(item);
                              const fromUnitCandidate =
                                item.batches.find((b) => b.originalUnit !== item.standardUnit)?.originalUnit ||
                                item.batches[0]?.originalUnit ||
                                'Box';
                              setModalFromUnit(fromUnitCandidate);
                              setModalToUnit(item.standardUnit);
                              setModalFactor(String(item.namePatternFactor || 10));
                            }}
                            title={`Configure UOM Conversion factor for ${item.itemCode}`}
                            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-100 hover:bg-teal-50 text-slate-700 hover:text-teal-800 border border-slate-300 hover:border-teal-400 transition shadow-2xs"
                          >
                            <Settings2 className="w-3.5 h-3.5 text-teal-600" />
                            <span>Set UOM</span>
                          </button>
                        </td>
                      </tr>

                      {/* Expandable Batch-Level Traceability Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-50/90 border-t border-b border-teal-100">
                          <td colSpan={12} className="py-3 px-6">
                            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
                              <div className="flex items-center justify-between text-xs border-b border-slate-100 pb-2">
                                <div className="flex items-center space-x-2 text-slate-800 font-bold">
                                  <Package className="w-4 h-4 text-teal-600" />
                                  <span>Batch Traceability Breakdown for Item {item.itemCode}</span>
                                  <span className="text-slate-400 font-normal">({item.batches.length} individual batch lot records)</span>
                                </div>
                                <span className="text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200 font-medium">
                                  Standardized Base Unit: <strong>{item.standardUnit}</strong>
                                </span>
                              </div>

                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-slate-100 text-slate-600 font-semibold uppercase text-[10px]">
                                    <tr>
                                      <th className="py-2 px-3">Batch / Lot #</th>
                                      <th className="py-2 px-3 text-right">Original Qty</th>
                                      <th className="py-2 px-3">Original UOM</th>
                                      <th className="py-2 px-3 text-center">Conversion Applied</th>
                                      <th className="py-2 px-3 text-right">Converted Qty</th>
                                      <th className="py-2 px-3">Expiry Date</th>
                                      <th className="py-2 px-3 text-right">Unit Cost (SAR)</th>
                                      <th className="py-2 px-3 text-right">Batch Value (SAR)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {item.batches.map((batch, bIdx) => (
                                      <tr key={batch.id || bIdx} className="hover:bg-slate-50/70">
                                        <td className="py-2 px-3 font-mono font-bold text-slate-900">
                                          {batch.batchNumber || 'Unassigned'}
                                        </td>
                                        <td className="py-2 px-3 text-right font-semibold text-slate-800">
                                          {batch.originalQuantity.toLocaleString()}
                                        </td>
                                        <td className="py-2 px-3 text-slate-600 font-medium">
                                          {batch.originalUnit}
                                        </td>
                                        <td className="py-2 px-3 text-center">
                                          {batch.conversionStatus === 'same_unit' ? (
                                            <span className="text-slate-400 text-[10px]">1:1 (Same Unit)</span>
                                          ) : batch.conversionStatus === 'name_pattern_detected' ? (
                                            <span className="bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200 text-[10px] font-bold">
                                              1 {batch.originalUnit} = {batch.conversionFactor} {batch.standardUnit} (Name Pattern)
                                            </span>
                                          ) : batch.conversionStatus === 'converted' ? (
                                            <span className="bg-teal-50 text-teal-800 px-1.5 py-0.5 rounded border border-teal-200 text-[10px] font-bold">
                                              1 {batch.originalUnit} = {batch.conversionFactor} {batch.standardUnit} (Admin Rule)
                                            </span>
                                          ) : (
                                            <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300 text-[10px] font-bold">
                                              Conversion Required
                                            </span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-right font-extrabold text-teal-900">
                                          {batch.convertedQuantity.toLocaleString()} {batch.standardUnit}
                                        </td>
                                        <td className="py-2 px-3">
                                          {batch.expiryDate ? (
                                            <span
                                              className={`font-semibold ${
                                                batch.daysUntilExpiry !== undefined && batch.daysUntilExpiry <= 30
                                                  ? 'text-rose-700'
                                                  : batch.daysUntilExpiry !== undefined && batch.daysUntilExpiry <= 90
                                                  ? 'text-amber-700'
                                                  : 'text-slate-700'
                                              }`}
                                            >
                                              {batch.expiryDate}
                                              {batch.daysUntilExpiry !== undefined && (
                                                <span className="text-[10px] text-slate-400 font-normal ml-1">
                                                  ({batch.daysUntilExpiry}d)
                                                </span>
                                              )}
                                            </span>
                                          ) : (
                                            <span className="text-slate-400">—</span>
                                          )}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono text-slate-700">
                                          {batch.unitCost.toFixed(2)}
                                        </td>
                                        <td className="py-2 px-3 text-right font-mono font-bold text-teal-800">
                                          {formatSAR(batch.totalValueSAR)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={11} className="py-8 text-center text-slate-500 text-xs">
                    No items match the selected filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick UOM Conversion Modal */}
      {modalItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2 text-slate-900 font-bold text-sm">
                <Settings2 className="w-4 h-4 text-teal-600" />
                <span>Configure UOM Conversion Factor</span>
              </div>
              <button
                onClick={() => setModalItem(null)}
                className="text-slate-400 hover:text-slate-600 text-lg leading-none"
              >
                ✕
              </button>
            </div>

            <div>
              <div className="font-bold text-slate-900 text-sm">{modalItem.itemCode}</div>
              <div className="text-xs text-slate-500 mt-0.5">{modalItem.itemDescription}</div>
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-3">
              <p>
                Define how many base units (e.g. Pieces, Tablets, Vials) are contained in one packaging unit for this specific item.
              </p>
              <div className="flex flex-wrap items-center gap-2 text-slate-900 font-semibold bg-white p-2.5 rounded-lg border border-slate-200">
                <span>1</span>
                <input
                  type="text"
                  value={modalFromUnit}
                  onChange={(e) => setModalFromUnit(e.target.value)}
                  placeholder="Packaging UOM (e.g. Box, Pack)"
                  className="w-24 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-900 text-xs focus:ring-1 focus:ring-teal-500"
                />
                <span>=</span>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={modalFactor}
                  onChange={(e) => setModalFactor(e.target.value)}
                  className="w-24 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-extrabold text-teal-800 text-xs focus:ring-1 focus:ring-teal-500"
                />
                <input
                  type="text"
                  value={modalToUnit}
                  onChange={(e) => setModalToUnit(e.target.value)}
                  placeholder="Base UOM (e.g. Piece, Vial)"
                  className="w-24 bg-slate-50 border border-slate-300 rounded px-2 py-1 text-center font-bold text-slate-900 text-xs focus:ring-1 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setModalItem(null)}
                className="px-3.5 py-1.5 border border-slate-300 text-slate-700 text-xs rounded-lg hover:bg-slate-50 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveModalUOM}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs rounded-lg font-bold shadow-xs transition"
              >
                Save & Recalculate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
