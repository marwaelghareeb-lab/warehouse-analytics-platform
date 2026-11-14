import React, { useState, useEffect } from 'react';
import {
  TrendingDown,
  DollarSign,
  Activity,
  Layers,
  ArrowUpDown,
  Search,
  Building2,
  Clock,
  Sparkles,
  BarChart3,
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
import { ConsumptionRecord, StockSnapshot } from '../types/warehouse';

export const ConsumptionAnalysisPage: React.FC = () => {
  const [consumptions, setConsumptions] = useState<ConsumptionRecord[]>(storageService.getConsumptionRecords());
  const [stocks, setStocks] = useState<StockSnapshot[]>(storageService.getStockSnapshots());
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const update = () => {
      setConsumptions(storageService.getConsumptionRecords());
      setStocks(storageService.getStockSnapshots());
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

  // Unique departments
  const departments = Array.from(new Set(consumptions.map((c) => c.department).filter(Boolean)));

  // Filtered consumptions
  const filtered = consumptions.filter((c) => {
    const matchDept = departmentFilter === 'ALL' || c.department === departmentFilter;
    const matchSearch =
      searchQuery === '' ||
      c.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.itemDescription.toLowerCase().includes(searchQuery.toLowerCase());
    return matchDept && matchSearch;
  });

  // Total consumption valuation & volume
  const totalConsumptionSAR = filtered.reduce((sum, c) => sum + (Number(c.totalConsumptionValue) || 0), 0);
  const totalVolumeUnits = filtered.reduce((sum, c) => sum + (Number(c.quantityConsumed) || 0), 0);

  // Top 10 consumed items by Value (SAR)
  const itemValueMap = new Map<string, { code: string; desc: string; category: string; valueSAR: number; qty: number; unit: string }>();
  consumptions.forEach((c) => {
    const qty = Number(c.quantityConsumed) || 0;
    const valSAR = Number(c.totalConsumptionValue) || 0;
    const existing = itemValueMap.get(c.itemCode);
    if (!existing) {
      itemValueMap.set(c.itemCode, {
        code: c.itemCode,
        desc: c.itemDescription,
        category: c.category,
        valueSAR: valSAR,
        qty,
        unit: c.unit,
      });
    } else {
      existing.valueSAR += valSAR;
      existing.qty += qty;
    }
  });

  const top10ByValue = Array.from(itemValueMap.values())
    .sort((a, b) => b.valueSAR - a.valueSAR)
    .slice(0, 10);

  // Top 10 consumed items by Quantity (Volume) - Transferred from Inventory Analysis as requested
  const itemQtyMap = new Map<string, { code: string; desc: string; category: string; quantity: number; unit: string; valueSAR: number }>();
  consumptions.forEach((c) => {
    const qty = Number(c.quantityConsumed) || 0;
    const valSAR = Number(c.totalConsumptionValue) || 0;
    const existing = itemQtyMap.get(c.itemCode);
    if (!existing) {
      itemQtyMap.set(c.itemCode, {
        code: c.itemCode,
        desc: c.itemDescription || c.itemCode,
        category: c.category || 'General',
        quantity: qty,
        unit: c.unit || 'Unit',
        valueSAR: valSAR,
      });
    } else {
      existing.quantity += qty;
      existing.valueSAR += valSAR;
    }
  });

  const top10ByQuantity = Array.from(itemQtyMap.values())
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10);

  // Department Distribution for Chart
  const deptMap = new Map<string, number>();
  consumptions.forEach((c) => {
    const d = c.department || 'General';
    deptMap.set(d, (deptMap.get(d) || 0) + (c.totalConsumptionValue || 0));
  });

  const deptData = Array.from(deptMap.entries()).map(([name, value]) => ({
    name,
    value,
  }));
  const COLORS = ['#0d9488', '#0284c7', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6'];

  // Slow-moving / Non-moving items analysis:
  // Items in stock that had ZERO or very low consumption in this period
  const consumedItemCodes = new Set(consumptions.map((c) => c.itemCode));
  const slowMovingItems = stocks
    .filter((s) => !consumedItemCodes.has(s.itemCode) || s.quantityOnHand > 5000)
    .slice(0, 6);

  const pageTitle = storageService.getCustomPageTitle() || 'Clinical Consumption Analysis';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <TrendingDown className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-1.5 flex-wrap">
              <span className="font-brand font-black tracking-tight brand-gradient-light text-2xl">Inventra</span>
              <span className="text-slate-900 font-bold">{pageTitle}</span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Tracks historical ward issues, department burn rate, and top pharmaceutical/surgical cost and volume drivers.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-400 font-semibold uppercase">Total Period Consumption</div>
          <div className="text-xl font-black text-teal-800">{formatSAR(totalConsumptionSAR)}</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Consumption (SAR)</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2 truncate">
            {formatSAR(totalConsumptionSAR)}
          </div>
          <span className="text-[11px] text-teal-600 font-medium">Direct hospital utilization</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Units Dispensed</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {totalVolumeUnits.toLocaleString()} Units
          </div>
          <span className="text-[11px] text-slate-500">Across all clinical wards</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Issuing Transactions</span>
          <div className="text-2xl font-extrabold text-slate-900 mt-2">
            {filtered.length} Vouchers
          </div>
          <span className="text-[11px] text-slate-500">Documented issue vouchers</span>
        </div>
      </div>

      {/* Dual Ranking Charts: Top 10 by Quantity (Transferred) & Top 10 by Value (SAR) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Top 10 Consumed Items by Quantity (Transferred as requested) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                  Top 10 Consumed Items by Quantity
                </h2>
                <span className="text-[10px] bg-sky-100 text-sky-800 font-extrabold px-1.5 py-0.5 rounded uppercase">
                  Volume Basis
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Highest physical turnover items issued across hospital wards
              </p>
            </div>
            <span className="text-xs bg-sky-50 text-sky-700 border border-sky-200 px-2 py-0.5 rounded font-semibold">
              Dispensed Units
            </span>
          </div>

          <div className="h-72 w-full">
            {top10ByQuantity.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={top10ByQuantity}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 35, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(val) => (val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val)}
                  />
                  <YAxis
                    type="category"
                    dataKey="code"
                    tick={{ fontSize: 10, fill: '#334155', fontWeight: 600 }}
                    width={65}
                  />
                  <Tooltip
                    formatter={(val: any, _name: any, item: any) => [
                      `${Number(val).toLocaleString()} ${item.payload.unit} (${formatSAR(item.payload.valueSAR)})`,
                      'Consumed Quantity',
                    ]}
                    labelFormatter={(label) => {
                      const found = top10ByQuantity.find((i) => i.code === label);
                      return `${label}: ${found?.desc || ''}`;
                    }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px', fontSize: '11px' }}
                  />
                  <Bar dataKey="quantity" name="Consumed Quantity" fill="#0284c7" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center p-4 text-xs text-slate-400">
                No consumption records available
              </div>
            )}
          </div>
        </div>

        {/* Chart 2: Top 10 Consumed Items by Value (SAR) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                  Top 10 Consumed Items by Value (SAR)
                </h2>
                <span className="text-[10px] bg-teal-100 text-teal-800 font-extrabold px-1.5 py-0.5 rounded uppercase">
                  Expenditure
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Highest financial expenditure lines consumed during the reporting period
              </p>
            </div>
            <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-2 py-0.5 rounded font-semibold">
              Currency: SAR
            </span>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={top10ByValue}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 35, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                <XAxis
                  type="number"
                  stroke="#64748b"
                  fontSize={10}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <YAxis
                  type="category"
                  dataKey="code"
                  stroke="#64748b"
                  fontSize={10}
                  tickLine={false}
                  width={65}
                />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toLocaleString()} SAR`, 'Total Value']}
                  labelFormatter={(code) => {
                    const item = top10ByValue.find((i) => i.code === code);
                    return item ? `${item.code} - ${item.desc}` : code;
                  }}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px', fontSize: '11px' }}
                />
                <Bar dataKey="valueSAR" name="Expenditure (SAR)" fill="#0d9488" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Row: Department Utilization Distribution */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <Building2 className="w-4 h-4 text-teal-600" />
            <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
              Department Clinical Utilization
            </h2>
          </div>
          <span className="text-[11px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded font-semibold border border-teal-200">
            Ward Breakdown
          </span>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Clinical consumption distribution and expenditure across hospital departments
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
          <div className="lg:col-span-1 h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={deptData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {deptData.map((_entry, index) => (
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

          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {deptData.map((d, idx) => (
              <div key={d.name} className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs text-slate-600">
                <div className="flex items-center space-x-2 truncate mr-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <span className="truncate font-medium text-slate-800">{d.name}</span>
                </div>
                <span className="font-mono font-bold text-teal-800 shrink-0">{formatSAR(d.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Slow-Moving / Inactive Items Warning Panel */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex items-center space-x-2 text-indigo-900 mb-1">
          <Clock className="w-4 h-4 text-indigo-600" />
          <h2 className="font-bold text-sm uppercase tracking-wider">
            Slow-Moving & Zero-Movement Stock Detection
          </h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Items currently residing in warehouses with minimal or zero clinical issues during this reporting period.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {slowMovingItems.map((item) => (
            <div
              key={item.id}
              className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">{item.itemCode}</span>
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                    {item.warehouseCode}
                  </span>
                </div>
                <div className="font-medium text-slate-800 mt-1 line-clamp-2">
                  {item.itemDescription}
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                <span>On-hand: <strong>{item.quantityOnHand} {item.unit}</strong></span>
                <span className="font-bold text-indigo-700">{formatSAR(item.totalStockValue)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Consumption Table with Filters */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by Item Code or Medical Description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-semibold">Department:</span>
            <select
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
            >
              <option value="ALL">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Item Code</th>
                <th className="py-3 px-4">Item Description</th>
                <th className="py-3 px-4">Consuming Department</th>
                <th className="py-3 px-4 text-right">Quantity Consumed</th>
                <th className="py-3 px-4">UOM</th>
                <th className="py-3 px-4 text-right">Unit Cost (SAR)</th>
                <th className="py-3 px-4 text-right">Total Expenditure (SAR)</th>
                <th className="py-3 px-4">Voucher #</th>
                <th className="py-3 px-4">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {item.itemCode}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800 max-w-[260px]">
                      {item.itemDescription}
                    </td>
                    <td className="py-3 px-4 text-teal-800 font-medium">
                      {item.department}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                      {(Number(item.quantityConsumed) || 0).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {item.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-slate-700">
                      {(Number(item.unitCost) || 0).toFixed(2)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-teal-700">
                      {formatSAR(Number(item.totalConsumptionValue) || 0)}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {item.issueVoucherNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {item.transactionDate}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                    No consumption records match the filter.
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
