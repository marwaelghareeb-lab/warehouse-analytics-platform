import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Sparkles,
  Download,
  Copy,
  Check,
  RotateCcw,
  ShieldCheck,
  TrendingDown,
  ClockAlert,
  Archive,
  Printer,
  Layers,
  Database,
} from 'lucide-react';
import { storageService } from '../services/storageService';
import { ExecutiveSummaryResponse, KPISummary } from '../types/warehouse';
import { exportComprehensiveExcelReport, exportPDFExecutiveBrief } from '../utils/exportUtils';

export const ReportsCenterPage: React.FC = () => {
  const [kpi, setKpi] = useState<KPISummary>(storageService.getKPISummary());
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);
  const [aiSummary, setAiSummary] = useState<ExecutiveSummaryResponse | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setKpi(storageService.getKPISummary());
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

  // Trigger Gemini API executive summary endpoint
  const handleGenerateAiSummary = async () => {
    setIsGeneratingAi(true);
    setErrorMsg(null);

    try {
      const stocks = storageService.getStockSnapshots();
      const consumptions = storageService.getConsumptionRecords();
      const expiries = storageService.getExpiryRecords();
      const currentPeriod = storageService.getSelectedPeriod();
      const currentWarehouse = storageService.getSelectedWarehouse();

      const topConsumed = consumptions.slice(0, 5);
      const lowStockItems = stocks.filter((s) => s.stockStatus === 'low_stock' || s.stockStatus === 'stockout').slice(0, 5);
      const nearExpiryBatches = expiries.filter((e) => e.daysUntilExpiry <= 90).slice(0, 5);
      const overstockItems = stocks.filter((s) => s.stockStatus === 'overstock').slice(0, 5);

      const res = await fetch('/api/ai/executive-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpi,
          topConsumed,
          lowStockItems,
          nearExpiryBatches,
          overstockItems,
          reportingPeriod: currentPeriod === 'ALL' ? 'Consolidated Period' : currentPeriod,
          warehouseName: currentWarehouse === 'ALL' ? 'All Hospital Warehouses' : currentWarehouse,
        }),
      });

      const data = await res.json();
      if (data.summary) {
        setAiSummary(data.summary);
      } else {
        throw new Error(data.error || 'Failed to generate executive summary');
      }
    } catch (err: any) {
      console.error('AI generation error:', err);
      setErrorMsg(err.message || 'Unable to generate AI summary at this time.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleCopyNarrative = () => {
    if (!aiSummary) return;
    const text = `
${aiSummary.summaryTitle}
Generated: ${new Date(aiSummary.generatedAt).toLocaleString()}
Scope: ${storageService.getSelectedWarehouse()} | Period: ${storageService.getSelectedPeriod()}

KEY FACTS:
- Total Inventory Valuation: ${aiSummary.keyFacts.totalValuationSAR.toLocaleString()} SAR
- Low Stock Critical Items: ${aiSummary.keyFacts.criticalLowStockItems}
- Near Expiry Risk Valuation: ${aiSummary.keyFacts.expiryRiskValuationSAR.toLocaleString()} SAR
- Monthly Clinical Consumption: ${aiSummary.keyFacts.monthlyBurnRateSAR.toLocaleString()} SAR

EXECUTIVE NARRATIVE:
${aiSummary.executiveNarrative}

HIGH CONSUMPTION:
${aiSummary.highConsumptionHighlights.map((h) => `• ${h}`).join('\n')}

STOCK RISKS:
${aiSummary.stockRiskAlerts.map((r) => `• ${r}`).join('\n')}

FEFO ACTION POINTS:
${aiSummary.fefoActionPoints.map((f) => `• ${f}`).join('\n')}

RECOMMENDATIONS:
${aiSummary.procurementRecommendations.map((p) => `• ${p}`).join('\n')}
    `.trim();

    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadExcel = () => {
    exportComprehensiveExcelReport(
      kpi,
      storageService.getStockSnapshots(),
      storageService.getConsumptionRecords(),
      storageService.getReceivingRecords(),
      storageService.getExpiryRecords(),
      storageService.getSelectedPeriod(),
      storageService.getSelectedWarehouse()
    );
  };

  const handleDownloadPDF = () => {
    exportPDFExecutiveBrief(
      kpi,
      aiSummary,
      storageService.getSelectedPeriod(),
      storageService.getSelectedWarehouse()
    );
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <FileSpreadsheet className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-1.5 flex-wrap">
              <span className="font-brand font-black tracking-tight brand-gradient-light text-2xl">Inventra</span>
              <span className="text-slate-900 font-bold">Reports & Executive Briefing Center</span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Export formatted multi-tab Excel workbooks, PDF executive briefings, and generate AI management summaries grounded strictly in verified data.
          </p>
        </div>

        {/* Quick export actions */}
        <div className="flex items-center space-x-3">
          <button
            onClick={handleDownloadExcel}
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center space-x-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Excel (.xlsx)</span>
          </button>
          <button
            onClick={handleDownloadPDF}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition shadow-xs flex items-center space-x-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Export PDF Briefing</span>
          </button>
        </div>
      </div>

      {/* AI Summary Generator Card */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border border-slate-700 rounded-2xl p-6 text-white shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-teal-400" />
              <h2 className="text-lg font-black tracking-tight text-white">
                AI-Powered Management Executive Summary
              </h2>
            </div>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Synthesizes high-consumption items, low stock deficits, near-expiry FEFO risks, and overstock capital into an executive-ready brief for hospital leadership. Zero hallucinations—strictly grounded on verified facts.
            </p>
          </div>

          <button
            onClick={handleGenerateAiSummary}
            disabled={isGeneratingAi}
            className="px-5 py-2.5 bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-500 hover:to-teal-600 text-slate-950 font-black text-xs rounded-lg transition flex items-center space-x-2 shrink-0 shadow-sm disabled:opacity-50"
          >
            {isGeneratingAi ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin text-slate-950" />
                <span>Analyzing Verified Data...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 text-slate-950" />
                <span>{aiSummary ? 'Regenerate AI Briefing' : 'Generate AI Summary'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Generated AI Executive Summary Content */}
      {aiSummary && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">{aiSummary.summaryTitle}</h3>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Period: {aiSummary.reportingPeriod} • Generated: {new Date(aiSummary.generatedAt).toLocaleString()}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleCopyNarrative}
                className="px-3 py-1.5 border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-lg transition flex items-center space-x-1"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-teal-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>

              <button
                onClick={async () => {
                  if (!aiSummary) return;
                  try {
                    const res = await fetch('/api/supabase/save-analysis', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        title: aiSummary.summaryTitle,
                        report_scope: storageService.getSelectedWarehouse(),
                        reporting_period: aiSummary.reportingPeriod,
                        summary_type: 'executive_summary',
                        kpi_metrics: aiSummary.keyFacts,
                        executive_narrative: aiSummary.executiveNarrative,
                        high_consumption_highlights: aiSummary.highConsumptionHighlights,
                        stock_risk_alerts: aiSummary.stockRiskAlerts,
                        fefo_action_points: aiSummary.fefoActionPoints,
                        procurement_recommendations: aiSummary.procurementRecommendations,
                      }),
                    });
                    const d = await res.json();
                    alert(d.persistedToSupabase ? 'Saved to Supabase PostgreSQL database!' : 'Saved to Analytical Outputs archive (Local mode).');
                  } catch (e: any) {
                    alert('Save notice: ' + e.message);
                  }
                }}
                className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1"
                title="Persist this report to Supabase analytical_outputs table"
              >
                <Database className="w-3.5 h-3.5" />
                <span>Save to Supabase</span>
              </button>

              <button
                onClick={handleDownloadPDF}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save PDF</span>
              </button>
            </div>
          </div>

          {/* Section 1: Verified Deterministic Facts */}
          <div>
            <span className="text-[11px] font-bold text-teal-800 uppercase tracking-wider bg-teal-50 px-2 py-0.5 rounded">
              Verified Calculated Facts (Deterministic)
            </span>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-500 font-semibold block">Inventory Valuation</span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatSAR(aiSummary.keyFacts.totalValuationSAR)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-500 font-semibold block">Low Stock Buffer Deficit</span>
                <span className="text-base font-extrabold text-amber-700">
                  {aiSummary.keyFacts.criticalLowStockItems} SKUs
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-500 font-semibold block">Expiry Risk Valuation</span>
                <span className="text-base font-extrabold text-rose-700">
                  {formatSAR(aiSummary.keyFacts.expiryRiskValuationSAR)}
                </span>
              </div>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <span className="text-slate-500 font-semibold block">Monthly Clinical Burn Rate</span>
                <span className="text-base font-extrabold text-slate-900">
                  {formatSAR(aiSummary.keyFacts.monthlyBurnRateSAR)}
                </span>
              </div>
            </div>
          </div>

          {/* Section 2: Executive Narrative */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              Executive Situation Narrative
            </h4>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50/70 p-4 rounded-xl border border-slate-200">
              {aiSummary.executiveNarrative}
            </p>
          </div>

          {/* Section 3: High Consumption & Stock Risk Lists */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <h5 className="font-bold text-slate-900 flex items-center space-x-1.5">
                <TrendingDown className="w-4 h-4 text-teal-600" />
                <span>High-Consumption Highlights</span>
              </h5>
              <ul className="space-y-1.5 text-slate-600 list-disc list-inside">
                {aiSummary.highConsumptionHighlights.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">{item}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
              <h5 className="font-bold text-slate-900 flex items-center space-x-1.5">
                <ClockAlert className="w-4 h-4 text-rose-600" />
                <span>Critical Stockout & Expiry Alerts</span>
              </h5>
              <ul className="space-y-1.5 text-slate-600 list-disc list-inside">
                {aiSummary.stockRiskAlerts.map((item, idx) => (
                  <li key={idx} className="leading-relaxed">{item}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Section 4: AI Strategic Supply Chain Recommendations */}
          <div className="p-4 bg-teal-50/60 border border-teal-200 rounded-xl text-xs space-y-2">
            <div className="flex items-center justify-between">
              <h5 className="font-bold text-teal-950 flex items-center space-x-1.5">
                <Sparkles className="w-4 h-4 text-teal-700" />
                <span>AI Strategic Recommendations (For Stock Controller Review)</span>
              </h5>
              <span className="text-[10px] uppercase font-bold text-teal-800 bg-teal-100 px-2 py-0.5 rounded">
                Advisory Only
              </span>
            </div>
            <ul className="space-y-1.5 text-teal-900 list-disc list-inside">
              {aiSummary.procurementRecommendations.map((item, idx) => (
                <li key={idx} className="leading-relaxed">{item}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};
