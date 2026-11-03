import React, { useState, useEffect } from 'react';
import {
  ClockAlert,
  AlertOctagon,
  ShieldAlert,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Search,
  CheckCircle2,
  Package,
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
import { ExpiryRecord, ExpiryRiskLevel } from '../types/warehouse';

export const ExpiryManagementPage: React.FC = () => {
  const [expiries, setExpiries] = useState<ExpiryRecord[]>(storageService.getExpiryRecords());
  const [selectedRisk, setSelectedRisk] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const update = () => {
      setExpiries(storageService.getExpiryRecords());
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

  // Groupings
  const expiredItems = expiries.filter((e) => e.daysUntilExpiry <= 0);
  const items30 = expiries.filter((e) => e.daysUntilExpiry > 0 && e.daysUntilExpiry <= 30);
  const items60 = expiries.filter((e) => e.daysUntilExpiry > 30 && e.daysUntilExpiry <= 60);
  const items90 = expiries.filter((e) => e.daysUntilExpiry > 60 && e.daysUntilExpiry <= 90);
  const itemsSafe = expiries.filter((e) => e.daysUntilExpiry > 90);

  // Financial sums at risk
  const expiredValSAR = expiredItems.reduce((sum, e) => sum + (e.totalValueAtRisk || 0), 0);
  const val30SAR = items30.reduce((sum, e) => sum + (e.totalValueAtRisk || 0), 0);
  const val60SAR = items60.reduce((sum, e) => sum + (e.totalValueAtRisk || 0), 0);
  const val90SAR = items90.reduce((sum, e) => sum + (e.totalValueAtRisk || 0), 0);
  const totalRiskSAR = expiredValSAR + val30SAR + val60SAR + val90SAR;

  // Chart data
  const riskChartData = [
    {
      category: 'Expired',
      valueSAR: expiredValSAR,
      batches: expiredItems.length,
      fill: '#e11d48',
    },
    {
      category: '≤ 30 Days',
      valueSAR: val30SAR,
      batches: items30.length,
      fill: '#f97316',
    },
    {
      category: '31 - 60 Days',
      valueSAR: val60SAR,
      batches: items60.length,
      fill: '#f59e0b',
    },
    {
      category: '61 - 90 Days',
      valueSAR: val90SAR,
      batches: items90.length,
      fill: '#3b82f6',
    },
  ];

  // Filtered list
  const filtered = expiries.filter((e) => {
    const matchSearch =
      searchQuery === '' ||
      e.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.itemDescription.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.batchNumber.toLowerCase().includes(searchQuery.toLowerCase());

    const matchRisk =
      selectedRisk === 'ALL' ||
      (selectedRisk === 'expired' && e.daysUntilExpiry <= 0) ||
      (selectedRisk === 'critical_30' && e.daysUntilExpiry > 0 && e.daysUntilExpiry <= 30) ||
      (selectedRisk === 'warning_60' && e.daysUntilExpiry > 30 && e.daysUntilExpiry <= 60) ||
      (selectedRisk === 'notice_90' && e.daysUntilExpiry > 60 && e.daysUntilExpiry <= 90) ||
      (selectedRisk === 'safe' && e.daysUntilExpiry > 90);

    return matchSearch && matchRisk;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-rose-50 text-rose-700">
              <ClockAlert className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Hospital Expiry & FEFO Risk Management
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            First-Expired, First-Out (FEFO) batch traceability, shelf-life monitoring, and expiration write-off prevention.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-400 font-semibold uppercase">Total Valuation at Risk (≤90d)</div>
          <div className="text-xl font-black text-rose-700">{formatSAR(totalRiskSAR)}</div>
        </div>
      </div>

      {/* KPI Severity Buckets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Expired */}
        <div
          onClick={() => setSelectedRisk('expired')}
          className="bg-white border border-rose-300 rounded-xl p-4 shadow-xs hover:border-rose-500 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-900 uppercase">Already Expired</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-800">
              Quarantine
            </span>
          </div>
          <div className="text-2xl font-black text-rose-900 mt-2">
            {expiredItems.length} Batches
          </div>
          <div className="text-xs font-semibold text-rose-700 mt-1">
            {formatSAR(expiredValSAR)} Write-off Loss
          </div>
        </div>

        {/* Expiring <= 30 Days */}
        <div
          onClick={() => setSelectedRisk('critical_30')}
          className="bg-white border border-amber-300 rounded-xl p-4 shadow-xs hover:border-amber-500 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900 uppercase">Expiring in ≤ 30 Days</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-800">
              Critical
            </span>
          </div>
          <div className="text-2xl font-black text-amber-900 mt-2">
            {items30.length} Batches
          </div>
          <div className="text-xs font-semibold text-amber-700 mt-1">
            {formatSAR(val30SAR)} at Imminent Risk
          </div>
        </div>

        {/* Expiring 31-60 Days */}
        <div
          onClick={() => setSelectedRisk('warning_60')}
          className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs hover:border-amber-400 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 uppercase">Expiring in 31 - 60 Days</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-50 text-amber-800">
              Warning
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {items60.length} Batches
          </div>
          <div className="text-xs font-semibold text-slate-600 mt-1">
            {formatSAR(val60SAR)} at Risk
          </div>
        </div>

        {/* Expiring 61-90 Days */}
        <div
          onClick={() => setSelectedRisk('notice_90')}
          className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs hover:border-slate-300 cursor-pointer transition"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700 uppercase">Expiring in 61 - 90 Days</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-slate-100 text-slate-700">
              Notice
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {items90.length} Batches
          </div>
          <div className="text-xs font-semibold text-slate-600 mt-1">
            {formatSAR(val90SAR)} at Risk
          </div>
        </div>
      </div>

      {/* FEFO Strategy & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Distribution Chart */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                Financial Value at Risk by Expiry Horizon (SAR)
              </h2>
              <p className="text-xs text-slate-500">
                Identifies critical windows where inventory will expire without proactive issuing
              </p>
            </div>
            <span className="text-xs bg-rose-50 text-rose-800 border border-rose-200 px-2 py-0.5 rounded font-semibold">
              FEFO Timeline
            </span>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={riskChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="category" stroke="#64748b" fontSize={11} />
                <YAxis
                  stroke="#64748b"
                  fontSize={11}
                  tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  formatter={(val: any) => [`${Number(val).toLocaleString()} SAR`]}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', borderRadius: '8px' }}
                />
                <Bar dataKey="valueSAR" name="Valuation at Risk (SAR)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* FEFO Mandatory Directives Box */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 text-white flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2 text-teal-400 mb-2">
              <ShieldAlert className="w-4 h-4" />
              <h2 className="font-bold text-sm text-white">FEFO Protocol Directive</h2>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              First-Expired, First-Out (FEFO) is mandatory under hospital stock control policies. Never dispense newer batches when near-expiry lots are available in stock.
            </p>

            <div className="space-y-2 text-xs">
              <div className="p-2.5 bg-slate-800 border border-slate-700 rounded-lg">
                <span className="font-bold text-rose-400 block">1. Immediate Quarantine</span>
                <span className="text-slate-300 text-[11px]">
                  Lock {expiredItems.length} expired batches from dispensing. Move to designated scrap return room.
                </span>
              </div>

              <div className="p-2.5 bg-slate-800 border border-slate-700 rounded-lg">
                <span className="font-bold text-amber-400 block">2. High-Turnover Allocation</span>
                <span className="text-slate-300 text-[11px]">
                  Dispatch ≤30 day items to ICU and Emergency units where consumption speed is fastest.
                </span>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800 mt-3 text-[11px] text-teal-400 font-semibold flex items-center justify-between">
            <span>Hospital Compliance Policy</span>
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>

      {/* Expiry Details Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by Item Code, Name, or Batch Number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-500 font-semibold">Horizon:</span>
            <select
              value={selectedRisk}
              onChange={(e) => setSelectedRisk(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
            >
              <option value="ALL">All Expiry Horizons</option>
              <option value="expired">Expired Batches</option>
              <option value="critical_30">Critical (≤ 30 Days)</option>
              <option value="warning_60">Warning (31 - 60 Days)</option>
              <option value="notice_90">Notice (61 - 90 Days)</option>
              <option value="safe">Safe (&gt; 90 Days)</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Batch / Lot #</th>
                <th className="py-3 px-4">Item Code</th>
                <th className="py-3 px-4">Item Description</th>
                <th className="py-3 px-4">Warehouse</th>
                <th className="py-3 px-4">Expiry Date</th>
                <th className="py-3 px-4 text-center">Days Remaining</th>
                <th className="py-3 px-4 text-right">Remaining Qty</th>
                <th className="py-3 px-4 text-right">Valuation at Risk (SAR)</th>
                <th className="py-3 px-4 text-center">FEFO Priority</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length > 0 ? (
                filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {item.batchNumber}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-700">
                      {item.itemCode}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800 max-w-[240px]">
                      {item.itemDescription}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold text-[11px]">
                        {item.warehouseCode}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                      {item.expiryDate}
                    </td>
                    <td className="py-3 px-4 text-center font-bold">
                      {item.daysUntilExpiry <= 0 ? (
                        <span className="text-rose-600 font-extrabold">Expired</span>
                      ) : (
                        <span
                          className={
                            item.daysUntilExpiry <= 30
                              ? 'text-amber-600'
                              : item.daysUntilExpiry <= 60
                              ? 'text-amber-500'
                              : 'text-slate-700'
                          }
                        >
                          {item.daysUntilExpiry} days
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                      {item.quantityRemaining.toLocaleString()} {item.unit}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-rose-800">
                      {formatSAR(item.totalValueAtRisk)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.daysUntilExpiry <= 0 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                          Quarantine
                        </span>
                      ) : item.daysUntilExpiry <= 30 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          Issue Immediately
                        </span>
                      ) : item.daysUntilExpiry <= 60 ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Priority 2
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-500 text-xs">
                    No batches match the selected expiry criteria.
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
