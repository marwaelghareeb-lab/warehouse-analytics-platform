import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  TrendingDown,
  ArrowRightLeft,
  CheckCircle2,
  Clock,
  Sparkles,
  ArrowRight,
  Filter,
  DollarSign,
  AlertTriangle,
  Building,
} from 'lucide-react';
import { storageService } from '../services/storageService';
import { StockRecommendation } from '../types/warehouse';

export const StockRiskRecommendationsPage: React.FC = () => {
  const [recommendations, setRecommendations] = useState<StockRecommendation[]>(
    storageService.getRecommendations()
  );
  const [severityFilter, setSeverityFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const update = () => {
      setRecommendations(storageService.getRecommendations());
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

  const handleAcknowledge = (id: string) => {
    setAcknowledged((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = recommendations.filter((r) => {
    const matchSeverity = severityFilter === 'ALL' || r.severity === severityFilter;
    const matchType = typeFilter === 'ALL' || r.type === typeFilter;
    return matchSeverity && matchType;
  });

  const criticalCount = recommendations.filter((r) => r.severity === 'critical').length;
  const highCount = recommendations.filter((r) => r.severity === 'high').length;
  const totalImpactSAR = recommendations.reduce((sum, r) => sum + (r.impactSAR || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-amber-50 text-amber-700">
              <ShieldAlert className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Stock Risk & Actionable Recommendations Engine
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Deterministic stockout forecasting, surplus capital detection, and inter-warehouse balance directives.
          </p>
        </div>

        <div className="text-right">
          <div className="text-xs text-slate-400 font-semibold uppercase">Total Financial Impact</div>
          <div className="text-xl font-black text-amber-700">{formatSAR(totalImpactSAR)}</div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-rose-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-rose-800 uppercase">Critical Risks (≤7 Days)</span>
          <div className="text-2xl font-black text-rose-900 mt-2">
            {criticalCount} Directives
          </div>
          <span className="text-[11px] text-rose-700 font-medium">Imminent stockout warning</span>
        </div>

        <div className="bg-white border border-amber-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-amber-800 uppercase">High Priority Actions</span>
          <div className="text-2xl font-black text-amber-900 mt-2">
            {highCount} Directives
          </div>
          <span className="text-[11px] text-amber-700 font-medium">FEFO dispatch & transfers</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <span className="text-xs font-semibold text-slate-500 uppercase">Total Value Impact (SAR)</span>
          <div className="text-2xl font-black text-slate-900 mt-2 truncate">
            {formatSAR(totalImpactSAR)}
          </div>
          <span className="text-[11px] text-teal-600 font-medium">Prevented waste & stockouts</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center space-x-2">
          <span className="text-slate-500 font-semibold">Filter Severity:</span>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
          >
            <option value="ALL">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
          </select>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-slate-500 font-semibold">Recommendation Type:</span>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium"
          >
            <option value="ALL">All Types</option>
            <option value="urgent_reorder">Urgent Reorder</option>
            <option value="fefo_priority_dispatch">FEFO Priority Dispatch</option>
            <option value="inter_warehouse_transfer">Inter-Warehouse Transfer</option>
            <option value="overstock_liquidation">Overstock Mitigation</option>
          </select>
        </div>
      </div>

      {/* Recommendation Cards */}
      <div className="space-y-4">
        {filtered.length > 0 ? (
          filtered.map((rec) => {
            const isAck = acknowledged.has(rec.id);

            return (
              <div
                key={rec.id}
                className={`bg-white border rounded-2xl p-6 shadow-xs transition ${
                  isAck
                    ? 'border-emerald-300 bg-emerald-50/20 opacity-80'
                    : rec.severity === 'critical'
                    ? 'border-rose-300 hover:border-rose-400'
                    : rec.severity === 'high'
                    ? 'border-amber-300 hover:border-amber-400'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center space-x-2.5">
                      <span
                        className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full ${
                          rec.severity === 'critical'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : rec.severity === 'high'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {rec.severity}
                      </span>
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono font-bold">
                        {rec.warehouseCode}
                      </span>
                      <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-mono">
                        {rec.itemCode}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-slate-900">{rec.title}</h3>
                    <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
                      {rec.details}
                    </p>

                    {/* Action Step Box */}
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-start space-x-2 text-slate-800">
                      <Sparkles className="w-4 h-4 text-teal-600 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-teal-900 block mb-0.5">Recommended Manager Action:</strong>
                        <span>{rec.actionableStep}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right side metrics & Action */}
                  <div className="shrink-0 md:text-right flex flex-col justify-between space-y-3 min-w-[160px]">
                    <div>
                      <div className="text-[11px] text-slate-500 font-semibold uppercase">Impact Value</div>
                      <div className="text-lg font-black text-slate-900">{formatSAR(rec.impactSAR)}</div>
                      {rec.metrics.daysCoverage !== undefined && (
                        <div className="text-[11px] text-slate-500 mt-1">
                          Coverage: <strong className="text-slate-800">{rec.metrics.daysCoverage} days</strong>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => handleAcknowledge(rec.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center space-x-1.5 ${
                        isAck
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isAck ? 'Actioned / Completed' : 'Mark as Actioned'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-xs">
            No recommendations match the chosen criteria.
          </div>
        )}
      </div>
    </div>
  );
};
