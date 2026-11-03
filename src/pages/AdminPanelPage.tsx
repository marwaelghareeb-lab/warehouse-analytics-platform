import React, { useState, useEffect } from 'react';
import {
  Database,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  RotateCcw,
  UploadCloud,
  Copy,
  Check,
  Download,
  Trash2,
  Eye,
  Layers,
  FileSpreadsheet,
  Building,
  Key,
  Server,
  Sparkles,
  FileText,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { storageService } from '../services/storageService';
import { exportPDFExecutiveBrief } from '../utils/exportUtils';

interface SupabaseStatus {
  isConfigured: boolean;
  isConnected: boolean;
  hasAnonKey: boolean;
  hasServiceKey: boolean;
  maskedUrl?: string;
  tableChecks?: Record<string, boolean>;
  allTablesReady?: boolean;
  bucketExists?: boolean;
  message: string;
  savedOutputsCount?: number;
}

export const AdminPanelPage: React.FC = () => {
  const [status, setStatus] = useState<SupabaseStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [copiedSchema, setCopiedSchema] = useState(false);

  // Saved analytical outputs
  const [savedOutputs, setSavedOutputs] = useState<any[]>([]);
  const [isLoadingOutputs, setIsLoadingOutputs] = useState(false);
  const [viewingOutput, setViewingOutput] = useState<any | null>(null);

  // Tab
  const [activeTab, setActiveTab] = useState<'connection' | 'outputs' | 'schema' | 'master'>('connection');

  // Load status
  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await fetch('/api/supabase/status');
      const data = await res.json();
      setStatus(data);
    } catch (e: any) {
      console.error('Failed to get Supabase status:', e);
      setStatus({
        isConfigured: false,
        isConnected: false,
        hasAnonKey: false,
        hasServiceKey: false,
        message: 'Could not connect to server status endpoint.',
      });
    } finally {
      setIsLoadingStatus(false);
    }
  };

  // Load saved outputs
  const fetchSavedOutputs = async () => {
    setIsLoadingOutputs(true);
    try {
      const res = await fetch('/api/supabase/analytical-outputs');
      const data = await res.json();
      if (data.outputs) {
        setSavedOutputs(data.outputs);
      }
    } catch (e) {
      console.warn('Failed to load saved outputs', e);
    } finally {
      setIsLoadingOutputs(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchSavedOutputs();
  }, []);

  // Synchronize all local reports and data into Supabase
  const handleSyncAllToSupabase = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);

    try {
      const payload = {
        warehouses: storageService.getWarehouses(),
        reports: storageService.getUploadedReports(),
        stockSnapshots: storageService.getStockSnapshots(),
        consumptionRecords: storageService.getConsumptionRecords(),
        receivingRecords: storageService.getReceivingRecords(),
        expiryRecords: storageService.getExpiryRecords(),
        analyticalOutputs: savedOutputs,
      };

      const res = await fetch('/api/supabase/sync-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setSyncFeedback('Successfully synchronized all inventory records, reports, and analytical outputs with Supabase Postgres!');
        fetchStatus();
        fetchSavedOutputs();
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (err: any) {
      console.error('Sync failed:', err);
      setSyncFeedback(`Sync notice: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Delete output
  const handleDeleteOutput = async (id: string) => {
    if (confirm('Delete this saved analytical output?')) {
      try {
        await fetch(`/api/supabase/analytical-outputs/${id}`, { method: 'DELETE' });
        setSavedOutputs((prev) => prev.filter((o) => o.id !== id));
        if (viewingOutput?.id === id) setViewingOutput(null);
      } catch (e) {
        console.error('Delete error', e);
      }
    }
  };

  // Copy SQL Schema
  const handleCopySchema = () => {
    const sql = `-- ==========================================================
-- WAREHOUSE ANALYTICS PLATFORM - SUPABASE POSTGRES SCHEMA
-- Designed for Hospital Warehouse Management & Historical ERP Reports
-- ==========================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. WAREHOUSES TABLE
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL,
    location VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. UPLOADED REPORTS
CREATE TABLE IF NOT EXISTS public.uploaded_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    original_storage_path TEXT,
    report_type VARCHAR(50) NOT NULL,
    warehouse_code VARCHAR(50) REFERENCES public.warehouses(code) ON DELETE SET NULL,
    reporting_period VARCHAR(50) NOT NULL,
    file_size_bytes BIGINT,
    total_rows_imported INTEGER DEFAULT 0,
    validation_status VARCHAR(50) DEFAULT 'completed',
    validation_errors JSONB DEFAULT '[]'::jsonb,
    column_mappings JSONB DEFAULT '{}'::jsonb,
    uploaded_by VARCHAR(255) DEFAULT 'Warehouse Manager',
    is_demo BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ITEM MASTER
CREATE TABLE IF NOT EXISTS public.item_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_code VARCHAR(100) UNIQUE NOT NULL,
    item_description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    unit VARCHAR(50) DEFAULT 'Units',
    standard_unit_cost NUMERIC(15, 2) DEFAULT 0.00,
    min_safety_stock NUMERIC(15, 2) DEFAULT 0,
    max_stock_level NUMERIC(15, 2) DEFAULT 0,
    reorder_point NUMERIC(15, 2) DEFAULT 0,
    lead_time_days INTEGER DEFAULT 14,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. STOCK SNAPSHOTS (DATED SNAPSHOTS)
CREATE TABLE IF NOT EXISTS public.stock_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES public.uploaded_reports(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    reporting_period VARCHAR(50) NOT NULL,
    warehouse_code VARCHAR(50) NOT NULL REFERENCES public.warehouses(code) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL REFERENCES public.item_master(item_code) ON DELETE CASCADE,
    quantity_on_hand NUMERIC(15, 2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_stock_value NUMERIC(18, 2) GENERATED ALWAYS AS (quantity_on_hand * unit_cost) STORED,
    stock_status VARCHAR(50) DEFAULT 'normal',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_item_warehouse_period UNIQUE (item_code, warehouse_code, reporting_period)
);

-- 5. CONSUMPTION / ISSUING DATA
CREATE TABLE IF NOT EXISTS public.consumption_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES public.uploaded_reports(id) ON DELETE CASCADE,
    transaction_date DATE,
    reporting_period VARCHAR(50) NOT NULL,
    warehouse_code VARCHAR(50) NOT NULL REFERENCES public.warehouses(code) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL REFERENCES public.item_master(item_code) ON DELETE CASCADE,
    department VARCHAR(100) NOT NULL,
    quantity_consumed NUMERIC(15, 2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_consumption_value NUMERIC(18, 2) GENERATED ALWAYS AS (quantity_consumed * unit_cost) STORED,
    issue_voucher_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RECEIVING DATA (GRN)
CREATE TABLE IF NOT EXISTS public.receiving_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES public.uploaded_reports(id) ON DELETE CASCADE,
    grn_number VARCHAR(100) NOT NULL,
    pr_number VARCHAR(100),
    po_number VARCHAR(100),
    receipt_date DATE NOT NULL,
    reporting_period VARCHAR(50) NOT NULL,
    warehouse_code VARCHAR(50) NOT NULL REFERENCES public.warehouses(code) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL REFERENCES public.item_master(item_code) ON DELETE CASCADE,
    supplier_name VARCHAR(255) NOT NULL,
    quantity_received NUMERIC(15, 2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_received_value NUMERIC(18, 2) GENERATED ALWAYS AS (quantity_received * unit_cost) STORED,
    inspection_status VARCHAR(50) DEFAULT 'Accepted',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. EXPIRY & BATCH DATA (FEFO)
CREATE TABLE IF NOT EXISTS public.expiry_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES public.uploaded_reports(id) ON DELETE CASCADE,
    warehouse_code VARCHAR(50) NOT NULL REFERENCES public.warehouses(code) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL REFERENCES public.item_master(item_code) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    quantity_remaining NUMERIC(15, 2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_value_at_risk NUMERIC(18, 2) GENERATED ALWAYS AS (quantity_remaining * unit_cost) STORED,
    reporting_period VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. ANALYTICAL OUTPUTS & SAVED EXECUTIVE REPORTS
CREATE TABLE IF NOT EXISTS public.analytical_outputs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(255) NOT NULL,
    report_scope VARCHAR(100) DEFAULT 'All Warehouses',
    reporting_period VARCHAR(50) NOT NULL,
    summary_type VARCHAR(50) DEFAULT 'executive_summary',
    kpi_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
    executive_narrative TEXT,
    high_consumption_highlights JSONB DEFAULT '[]'::jsonb,
    stock_risk_alerts JSONB DEFAULT '[]'::jsonb,
    fefo_action_points JSONB DEFAULT '[]'::jsonb,
    procurement_recommendations JSONB DEFAULT '[]'::jsonb,
    generated_by VARCHAR(100) DEFAULT 'AI Warehouse Engine',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expiry_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytical_outputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all on warehouses" ON public.warehouses FOR ALL USING (true);
CREATE POLICY "Allow public all on uploaded_reports" ON public.uploaded_reports FOR ALL USING (true);
CREATE POLICY "Allow public all on item_master" ON public.item_master FOR ALL USING (true);
CREATE POLICY "Allow public all on stock_snapshots" ON public.stock_snapshots FOR ALL USING (true);
CREATE POLICY "Allow public all on consumption_data" ON public.consumption_data FOR ALL USING (true);
CREATE POLICY "Allow public all on receiving_data" ON public.receiving_data FOR ALL USING (true);
CREATE POLICY "Allow public all on expiry_data" ON public.expiry_data FOR ALL USING (true);
CREATE POLICY "Allow public all on analytical_outputs" ON public.analytical_outputs FOR ALL USING (true);
`;
    navigator.clipboard.writeText(sql);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <Database className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">
              Warehouse Administration & Supabase Control Panel
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Manage Supabase PostgreSQL connection, batch data synchronization, storage bucket, and archive of saved analytical outputs.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchStatus}
            disabled={isLoadingStatus}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs rounded-lg transition flex items-center space-x-1.5"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin' : ''}`} />
            <span>Check Connection</span>
          </button>

          <button
            onClick={handleSyncAllToSupabase}
            disabled={isSyncing}
            className="px-4 py-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-slate-950 font-black text-xs rounded-lg transition flex items-center space-x-1.5 shadow-xs disabled:opacity-50"
          >
            <UploadCloud className="w-4 h-4" />
            <span>{isSyncing ? 'Syncing to Supabase...' : 'Sync All to Supabase'}</span>
          </button>
        </div>
      </div>

      {syncFeedback && (
        <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900 flex items-center justify-between">
          <span>{syncFeedback}</span>
          <button onClick={() => setSyncFeedback(null)} className="font-bold text-teal-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-2 text-xs font-semibold">
        <button
          onClick={() => setActiveTab('connection')}
          className={`py-2.5 px-4 border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'connection'
              ? 'border-teal-600 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>Supabase Cloud Status</span>
        </button>

        <button
          onClick={() => setActiveTab('outputs')}
          className={`py-2.5 px-4 border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'outputs'
              ? 'border-teal-600 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Saved Analytical Outputs ({savedOutputs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('schema')}
          className={`py-2.5 px-4 border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'schema'
              ? 'border-teal-600 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>SQL Schema & Deployment Guide</span>
        </button>

        <button
          onClick={() => setActiveTab('master')}
          className={`py-2.5 px-4 border-b-2 transition flex items-center space-x-2 ${
            activeTab === 'master'
              ? 'border-teal-600 text-teal-800'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>Warehouses & Catalog Directory</span>
        </button>
      </div>

      {/* TAB 1: CONNECTION DIAGNOSTIC */}
      {activeTab === 'connection' && (
        <div className="space-y-6">
          {/* Main Status Banner */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div className="flex items-center space-x-4">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold ${
                    status?.isConnected ? 'bg-emerald-600' : 'bg-slate-800'
                  }`}
                >
                  <Cloud className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-base font-extrabold text-slate-900">
                      {status?.isConnected ? 'Supabase PostgreSQL: Connected' : 'Supabase Mode: Local Store Ready'}
                    </h2>
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        status?.isConnected
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border border-amber-300'
                      }`}
                    >
                      {status?.isConnected ? 'Cloud Online' : 'Local Fallback Active'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {status?.message || 'Checking database and storage connection...'}
                  </p>
                </div>
              </div>

              <div className="text-right text-xs">
                <div className="text-slate-400 font-semibold uppercase">Project Endpoint</div>
                <div className="font-mono text-slate-800 font-bold mt-0.5">
                  {status?.maskedUrl || 'Local Emulated Database'}
                </div>
              </div>
            </div>

            {/* Keys and Storage status grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 text-xs">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600">Public Anon Key</span>
                  {status?.hasAnonKey ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="font-bold text-slate-900 mt-1">
                  {status?.hasAnonKey ? 'Configured in Environment' : 'Not Set'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">For client public reads & auth</div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600">Service Role Key</span>
                  {status?.hasServiceKey ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <XCircle className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="font-bold text-slate-900 mt-1">
                  {status?.hasServiceKey ? 'Active (Admin RLS Bypass)' : 'Not Set (Using Anon Key)'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Secure server-side batch sync</div>
              </div>

              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600">Storage Bucket</span>
                  {status?.bucketExists ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                </div>
                <div className="font-bold text-slate-900 mt-1">
                  {status?.bucketExists ? 'warehouse-reports Ready' : 'warehouse-reports Pending'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">Preserves raw ERP Excel files</div>
              </div>
            </div>
          </div>

          {/* Database Table Diagnostic Matrix */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                  PostgreSQL Tables & Schema Diagnostic
                </h3>
                <p className="text-xs text-slate-500">
                  Verifies existence and read/write accessibility of all 8 core warehouse tables
                </p>
              </div>
              <span className="text-xs bg-slate-100 text-slate-700 px-2.5 py-1 rounded font-semibold">
                8 Tables Defined
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { name: 'warehouses', label: 'Warehouses', desc: 'Depots & stores' },
                { name: 'uploaded_reports', label: 'Uploaded Reports', desc: 'ERP audit history' },
                { name: 'item_master', label: 'Item Master', desc: 'Hospital catalog' },
                { name: 'stock_snapshots', label: 'Stock Snapshots', desc: 'Dated on-hand balances' },
                { name: 'consumption_data', label: 'Consumption Data', desc: 'Ward issue vouchers' },
                { name: 'receiving_data', label: 'Receiving Data', desc: 'GRN vendor receipts' },
                { name: 'expiry_data', label: 'Expiry & FEFO Data', desc: 'Batch expiration lots' },
                { name: 'analytical_outputs', label: 'Analytical Outputs', desc: 'Saved AI executive summaries' },
              ].map((tbl) => {
                const isReady = status?.tableChecks?.[tbl.name];
                return (
                  <div
                    key={tbl.name}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{tbl.label}</div>
                      <div className="text-[10px] text-slate-500">{tbl.desc}</div>
                    </div>
                    {status?.isConnected ? (
                      isReady ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                      )
                    ) : (
                      <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                        Local
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: SAVED ANALYTICAL OUTPUTS */}
      {activeTab === 'outputs' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                  Archived Management Briefs & Analytical Outputs
                </h3>
                <p className="text-xs text-slate-500">
                  Permanent repository of generated executive summaries, FEFO risk briefs, and KPI snapshots saved into Supabase.
                </p>
              </div>

              <button
                onClick={fetchSavedOutputs}
                disabled={isLoadingOutputs}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition flex items-center space-x-1"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${isLoadingOutputs ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {savedOutputs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">Title / Brief Name</th>
                      <th className="py-3 px-4">Scope</th>
                      <th className="py-3 px-4">Period</th>
                      <th className="py-3 px-4">Generated By</th>
                      <th className="py-3 px-4">Date Saved</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {savedOutputs.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-bold text-slate-900 max-w-[280px] truncate" title={item.title}>
                          {item.title}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {item.report_scope || item.reportScope || 'All Warehouses'}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-teal-800">
                          {item.reporting_period || item.reportingPeriod}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {item.generated_by || item.generatedBy || 'AI Engine'}
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Recent'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => setViewingOutput(item)}
                              title="View full briefing"
                              className="p-1.5 text-slate-600 hover:text-teal-700 hover:bg-slate-100 rounded transition"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteOutput(item.id)}
                              title="Delete from Supabase"
                              className="p-1.5 text-slate-600 hover:text-rose-700 hover:bg-rose-50 rounded transition"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-slate-400">
                No analytical outputs saved yet. Go to <strong className="text-slate-700">Reports Center</strong>, generate an executive summary, and click "Save to Supabase Analytical Outputs".
              </div>
            )}
          </div>

          {/* Modal / Viewer for selected output */}
          {viewingOutput && (
            <div className="bg-white border-2 border-teal-500 rounded-2xl p-6 shadow-md space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h4 className="font-extrabold text-base text-slate-900">{viewingOutput.title}</h4>
                  <p className="text-xs text-slate-500">
                    Period: {viewingOutput.reporting_period} • Scope: {viewingOutput.report_scope}
                  </p>
                </div>
                <button
                  onClick={() => setViewingOutput(null)}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded"
                >
                  Close Viewer
                </button>
              </div>

              <div className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-200">
                <strong className="block text-slate-900 mb-1">Executive Situation Narrative:</strong>
                {viewingOutput.executive_narrative}
              </div>

              {viewingOutput.high_consumption_highlights?.length > 0 && (
                <div className="text-xs">
                  <strong className="text-slate-900 block mb-1">High-Consumption Highlights:</strong>
                  <ul className="list-disc list-inside space-y-1 text-slate-600">
                    {viewingOutput.high_consumption_highlights.map((h: string, idx: number) => (
                      <li key={idx}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}

              {viewingOutput.procurement_recommendations?.length > 0 && (
                <div className="text-xs bg-teal-50/60 border border-teal-200 p-3.5 rounded-xl">
                  <strong className="text-teal-950 block mb-1">Procurement Recommendations:</strong>
                  <ul className="list-disc list-inside space-y-1 text-teal-900">
                    {viewingOutput.procurement_recommendations.map((p: string, idx: number) => (
                      <li key={idx}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SQL SCHEMA & SETUP GUIDE */}
      {activeTab === 'schema' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider">
                  Supabase PostgreSQL Setup Instructions
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Follow these 3 quick steps in your Supabase Project Dashboard to configure all tables and storage.
                </p>
              </div>

              <button
                onClick={handleCopySchema}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition flex items-center space-x-1.5 shadow-xs shrink-0"
              >
                {copiedSchema ? <Check className="w-3.5 h-3.5 text-teal-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSchema ? 'SQL Copied!' : 'Copy Complete SQL Schema'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs mb-6">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-[10px]">
                  1
                </span>
                <div className="font-bold text-slate-900">Execute SQL in Supabase</div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Open Supabase Studio &gt; <strong>SQL Editor</strong> &gt; New Query. Paste the copied SQL script and click <strong>Run</strong>.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-[10px]">
                  2
                </span>
                <div className="font-bold text-slate-900">Create Storage Bucket</div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  Go to <strong>Storage</strong> &gt; New Bucket. Name it <code>warehouse-reports</code> (private bucket) to store original imported Excel workbooks.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-[10px]">
                  3
                </span>
                <div className="font-bold text-slate-900">Configure Secrets</div>
                <p className="text-slate-600 leading-relaxed text-[11px]">
                  In your hosting / AI Studio secrets panel, set <code>SUPABASE_URL</code>, <code>SUPABASE_ANON_KEY</code>, and <code>SUPABASE_SERVICE_ROLE_KEY</code>.
                </p>
              </div>
            </div>

            {/* SQL Display Box */}
            <div className="relative">
              <div className="bg-slate-950 text-slate-200 rounded-xl p-4 font-mono text-[11px] max-h-72 overflow-y-auto leading-relaxed border border-slate-800">
                <pre>{`-- 8 Hospital Warehouse Tables:
-- 1. warehouses (Depot locations)
-- 2. uploaded_reports (Excel file tracking)
-- 3. item_master (Standard hospital items)
-- 4. stock_snapshots (Physical balances)
-- 5. consumption_data (Ward issues)
-- 6. receiving_data (Goods Received Notes)
-- 7. expiry_data (FEFO batches)
-- 8. analytical_outputs (Saved management briefs)

Click "Copy Complete SQL Schema" above for the full production-ready DDL script with RLS policies.`}</pre>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: WAREHOUSES & CATALOG DIRECTORY */}
      {activeTab === 'master' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <h3 className="font-bold text-sm text-slate-900 uppercase tracking-wider mb-2">
              Registered Hospital Warehouses & Depots
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Master storage locations synchronized across all dated stock snapshots and flow logs.
            </p>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="py-3 px-4">Warehouse Code</th>
                    <th className="py-3 px-4">Warehouse Name</th>
                    <th className="py-3 px-4">Storage Type</th>
                    <th className="py-3 px-4">Physical Location</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {storageService.getWarehouses().map((wh) => (
                    <tr key={wh.code} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">
                        {wh.code}
                      </td>
                      <td className="py-3 px-4 font-bold text-slate-800">
                        {wh.name}
                      </td>
                      <td className="py-3 px-4 text-slate-600">
                        {wh.type}
                      </td>
                      <td className="py-3 px-4 text-slate-500">
                        {wh.location}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          Active
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
