import React, { useState, useEffect } from 'react';
import {
  History,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  RotateCcw,
  UploadCloud,
  Layers,
  Calendar,
  Building,
  Sparkles,
  Info,
} from 'lucide-react';
import { storageService } from '../services/storageService';
import { UploadedReport } from '../types/warehouse';

interface UploadHistoryPageProps {
  onNavigateToUpload: () => void;
}

export const UploadHistoryPage: React.FC<UploadHistoryPageProps> = ({ onNavigateToUpload }) => {
  const [reports, setReports] = useState<UploadedReport[]>(storageService.getUploadedReports());
  const [isDemo, setIsDemo] = useState<boolean>(storageService.getIsDemoMode());
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [reportToDelete, setReportToDelete] = useState<UploadedReport | null>(null);

  useEffect(() => {
    const update = () => {
      setReports(storageService.getUploadedReports());
      setIsDemo(storageService.getIsDemoMode());
    };
    update();
    const unsub = storageService.subscribe(update);
    return unsub;
  }, []);

  const executeDeleteReport = (report: UploadedReport) => {
    storageService.deleteReport(report.id);
    setReportToDelete(null);
    setActionNotice(`Report "${report.filename}" was successfully removed.`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleReprocessReport = (report: UploadedReport) => {
    storageService.reprocessReport(report.id);
    setActionNotice(`Report "${report.filename}" was re-processed and validated.`);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleResetDemo = () => {
    if (confirm('Reload realistic fictional hospital sample dataset?')) {
      storageService.loadDemoData();
      setActionNotice('Sample medical warehouse dataset restored.');
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  const handleClearAll = () => {
    if (confirm('Clear all datasets to start with a blank platform for your real hospital ERP exports?')) {
      storageService.clearAllData();
      setActionNotice('All reports and demo records have been cleared. Platform is ready for fresh imports.');
      setTimeout(() => setActionNotice(null), 3500);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
              <History className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-1.5 flex-wrap">
              <span className="font-brand font-black tracking-tight brand-gradient-light text-2xl">Inventra</span>
              <span className="text-slate-900 font-bold">Import Audit History</span>
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Audit log of imported ERP Excel workbooks, reporting periods, warehouses, and processing integrity.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onNavigateToUpload}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition flex items-center space-x-1.5 shadow-xs"
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Import Another Report</span>
          </button>
        </div>
      </div>

      {actionNotice && (
        <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl text-xs text-teal-900 flex items-center justify-between">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="font-bold text-teal-700 hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Dataset Mode Management Box */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="font-bold text-slate-900 text-sm">Platform Dataset Status</div>
          <p className="text-slate-500 mt-0.5">
            {isDemo
              ? 'Currently presenting realistic sample medical warehouse data for demonstration.'
              : 'Active with production/imported hospital reports.'}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleResetDemo}
            className="px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg transition flex items-center space-x-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reload Demo Data</span>
          </button>
          <button
            onClick={handleClearAll}
            className="px-3.5 py-1.5 bg-rose-50 border border-rose-300 hover:bg-rose-100 text-rose-700 font-semibold rounded-lg transition flex items-center space-x-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear All Data</span>
          </button>
        </div>
      </div>

      {/* Reports Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Filename</th>
                <th className="py-3 px-4">Report Type</th>
                <th className="py-3 px-4">Warehouse</th>
                <th className="py-3 px-4">Reporting Period</th>
                <th className="py-3 px-4 text-right">Rows Imported</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4">Upload Timestamp</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reports.length > 0 ? (
                reports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-bold text-slate-900 flex items-center space-x-2">
                      <FileSpreadsheet className="w-4 h-4 text-teal-600 shrink-0" />
                      <span className="truncate max-w-[220px]" title={report.filename}>
                        {report.filename}
                      </span>
                      {report.isDemo && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-bold">
                          Sample
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">
                      {report.reportType === 'stock_snapshot' && 'Stock Balance Snapshot'}
                      {report.reportType === 'consumption' && 'Consumption / Issuing'}
                      {report.reportType === 'receiving_grn' && 'GRN Goods Receiving'}
                      {report.reportType === 'expiry_batch' && 'Near Expiry Batch'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {report.warehouseCode}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-teal-800">
                      {report.reportingPeriod}
                    </td>
                    <td className="py-3 px-4 text-right font-extrabold text-slate-900">
                      {report.totalRowsImported.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {report.validationStatus === 'completed' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                          <CheckCircle2 className="w-3 h-3 mr-1" /> Verified
                        </span>
                      )}
                      {report.validationStatus === 'warnings' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          <AlertTriangle className="w-3 h-3 mr-1" /> Notices
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {report.uploadedAt}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => handleReprocessReport(report)}
                          title="Reprocess report rules and validation"
                          className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-slate-100 rounded-lg transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setReportToDelete(report)}
                          title="Delete report and associated records"
                          className="inline-flex items-center space-x-1 px-2.5 py-1 text-rose-700 hover:text-white bg-rose-50 hover:bg-rose-600 border border-rose-200 hover:border-rose-600 rounded-lg text-xs font-semibold transition shadow-2xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 text-xs">
                    No imported reports found. Click "Import Report" to add your first ERP Excel report.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal for Deletion (Guarantees elimination of browser alert blockage) */}
      {reportToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start space-x-3">
              <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Delete Report & Associated Records?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to remove <strong>"{reportToDelete.filename}"</strong>?
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div>• Report Period: <strong className="text-slate-800">{reportToDelete.reportingPeriod}</strong></div>
              <div>• Target Warehouse: <strong className="text-slate-800">{reportToDelete.warehouseCode}</strong></div>
              <div>• Rows to be removed: <strong className="text-slate-800">{reportToDelete.totalRowsImported.toLocaleString()} records</strong></div>
              <p className="text-[11px] text-rose-700 font-semibold pt-1">
                All records attached to this upload will be removed from stock valuation, consumption, and dashboards.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setReportToDelete(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 text-xs rounded-lg hover:bg-slate-50 font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={() => executeDeleteReport(reportToDelete)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs rounded-lg font-bold shadow-xs transition flex items-center space-x-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
