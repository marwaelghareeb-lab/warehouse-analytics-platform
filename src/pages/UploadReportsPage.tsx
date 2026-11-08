import React, { useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Download,
  Info,
  Check,
  Building,
  Calendar,
  Layers,
  FileDown,
} from 'lucide-react';
import {
  parseExcelFile,
  getSheetData,
  autoMapColumns,
  validateImportData,
  normalizeExcelData,
  ParsedSheetData,
  ValidationResult,
  SheetMetadata,
} from '../utils/excelParser';
import { STANDARD_FIELDS_DICTIONARY } from '../data/demoData';
import { storageService } from '../services/storageService';
import { ReportType, StandardField, ColumnMappingResult } from '../types/warehouse';
import { generateSampleExcelTemplate } from '../utils/exportUtils';

interface UploadReportsPageProps {
  onImportSuccess: () => void;
}

export const UploadReportsPage: React.FC<UploadReportsPageProps> = ({ onImportSuccess }) => {
  // Wizard steps: 1: Select & Upload File, 2: Preview & Column Mapping, 3: Validation & Import
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Configuration options
  const [reportType, setReportType] = useState<ReportType>('stock_snapshot');
  const [targetWarehouse, setTargetWarehouse] = useState<string>('WH-01');
  const [reportingPeriod, setReportingPeriod] = useState<string>('2026-10');

  // Parsed file state
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [fileData, setFileData] = useState<ParsedSheetData | null>(null);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [columnMapping, setColumnMapping] = useState<ColumnMappingResult>({});
  const [isAiMapping, setIsAiMapping] = useState<boolean>(false);
  const [aiRationale, setAiRationale] = useState<string | null>(null);

  // Validation state
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'importing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [replaceDemoData, setReplaceDemoData] = useState<boolean>(storageService.getIsDemoMode());

  const warehouses = storageService.getWarehouses();

  // Handle file drop or input
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setErrorMessage(null);
    try {
      const parsed = await parseExcelFile(file);
      setFileData(parsed);
      setSelectedSheet(parsed.activeSheet);

      // Auto map columns initially with rule-based engine
      const initialMapping = autoMapColumns(parsed.headers);
      setColumnMapping(initialMapping);
      setCurrentStep(2);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setErrorMessage(err.message || 'Failed to parse Excel file. Please ensure it is a valid .xlsx or .xls file.');
    } finally {
      setIsParsing(false);
    }
  };

  // Switch sheet
  const handleSheetChange = (sheetName: string) => {
    if (!fileData) return;
    const sheetInfo = getSheetData(fileData.rawWorkbook, sheetName);
    setSelectedSheet(sheetName);
    setFileData({
      ...fileData,
      activeSheet: sheetName,
      headers: sheetInfo.headers,
      sampleRows: sheetInfo.sampleRows,
      totalRows: sheetInfo.totalRows,
    });
    const newMapping = autoMapColumns(sheetInfo.headers);
    setColumnMapping(newMapping);
  };

  // Trigger server-side Gemini AI Column Recognition
  const handleTriggerAiMapping = async () => {
    if (!fileData) return;
    setIsAiMapping(true);
    setAiRationale(null);

    try {
      const res = await fetch('/api/ai/column-mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          headers: fileData.headers,
          sampleRows: fileData.sampleRows,
          reportType,
        }),
      });

      const data = await res.json();
      if (data.mappings && Object.keys(data.mappings).length > 0) {
        setColumnMapping((prev) => ({
          ...prev,
          ...data.mappings,
        }));
        setAiRationale(data.explanation || 'Columns matched using Gemini 3.8 Flash model.');
      } else {
        // Fallback to rule-based
        const fallback = autoMapColumns(fileData.headers);
        setColumnMapping(fallback);
        setAiRationale('Rule-based mapping applied (no AI response).');
      }
    } catch (err) {
      console.warn('AI mapping call failed, using rule-based mapping', err);
      const fallback = autoMapColumns(fileData.headers);
      setColumnMapping(fallback);
      setAiRationale('Rule-based mapping applied (offline fallback).');
    } finally {
      setIsAiMapping(false);
    }
  };

  // Update specific mapping manually
  const handleManualMappingChange = (header: string, standardField: StandardField | 'ignore') => {
    setColumnMapping((prev) => ({
      ...prev,
      [header]: standardField,
    }));
  };

  // Proceed to validation
  const handleProceedToValidation = () => {
    if (!fileData) return;

    // Full validation across ALL actual rows in the uploaded Excel workbook
    const uomRules = storageService.getUOMConversions();
    const result = validateImportData(
      fileData.allRows,
      columnMapping,
      reportType,
      targetWarehouse,
      reportingPeriod,
      uomRules
    );

    setValidationResult(result);
    setCurrentStep(3);
  };

  // Execute Import into persistent database & storage
  const handleConfirmImport = async () => {
    if (!fileData || !validationResult) return;
    setImportStatus('importing');

    try {
      const reportId = `REP-${Date.now()}`;
      const uomRules = storageService.getUOMConversions();
      
      // Normalize ALL data rows based on business rules and UOM conversions
      const normalized = normalizeExcelData(
        fileData.allRows,
        columnMapping,
        reportType,
        targetWarehouse,
        reportingPeriod,
        reportId,
        uomRules
      );

      const newReport = {
        id: reportId,
        filename: fileData.fileName,
        reportType,
        warehouseCode: targetWarehouse,
        reportingPeriod,
        fileSizeBytes: 150000,
        totalRowsImported: validationResult.successfullyImportedRows,
        validationStatus: validationResult.isValid ? ('completed' as const) : ('warnings' as const),
        validationErrors: validationResult.issues.map((i) => i.message),
        uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 19),
        isDemo: false,
      };

      storageService.addImportedData({
        report: newReport,
        stockSnapshots: normalized.stockSnapshots,
        consumptionRecords: normalized.consumptionRecords,
        receivingRecords: normalized.receivingRecords,
        expiryRecords: normalized.expiryRecords,
        replaceDemoData: replaceDemoData,
      });

      // Background sync to Supabase PostgreSQL database
      try {
        fetch('/api/supabase/sync-all', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reports: [newReport],
            stockSnapshots: normalized.stockSnapshots,
            consumptionRecords: normalized.consumptionRecords,
            receivingRecords: normalized.receivingRecords,
            expiryRecords: normalized.expiryRecords,
          }),
        }).catch((e) => console.warn('Background Supabase sync notice:', e));
      } catch (err) {
        // Silently continue
      }

      setImportStatus('success');
      setTimeout(() => {
        onImportSuccess();
      }, 1200);
    } catch (err: any) {
      console.error('Import failed', err);
      setImportStatus('error');
      setErrorMessage(err.message || 'Failed to normalize and save records to database.');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="p-2 rounded-lg bg-teal-50 text-teal-700">
                <UploadCloud className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center space-x-1.5 flex-wrap">
                <span className="font-brand font-black tracking-tight brand-gradient-light text-2xl">Inventra</span>
                <span className="text-slate-900 font-bold">ERP Report Importer</span>
              </h1>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Upload historical and consolidated Excel (.xlsx, .xls) files exported from your existing hospital system.
              <span className="font-brand font-bold text-slate-800 ml-1">Inventra</span> automatically aligns ERP column variations, validates data integrity, and saves to normalized storage.
            </p>
          </div>

          {/* Quick template download buttons */}
          <div className="flex items-center flex-wrap gap-2">
            <span className="text-[11px] text-slate-400 font-medium mr-1">Download Sample:</span>
            <button
              onClick={() => generateSampleExcelTemplate('stock_snapshot')}
              className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded font-semibold transition flex items-center"
              title="Download realistic Stock Snapshot template"
            >
              <FileDown className="w-3 h-3 mr-1" /> Stock
            </button>
            <button
              onClick={() => generateSampleExcelTemplate('consumption')}
              className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded font-semibold transition flex items-center"
              title="Download realistic Consumption Log template"
            >
              <FileDown className="w-3 h-3 mr-1" /> Consumption
            </button>
            <button
              onClick={() => generateSampleExcelTemplate('receiving_grn')}
              className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded font-semibold transition flex items-center"
              title="Download realistic Goods Receiving GRN template"
            >
              <FileDown className="w-3 h-3 mr-1" /> GRN
            </button>
            <button
              onClick={() => generateSampleExcelTemplate('expiry_batch')}
              className="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded font-semibold transition flex items-center"
              title="Download realistic Expiry Batch template"
            >
              <FileDown className="w-3 h-3 mr-1" /> Expiry
            </button>
          </div>
        </div>

        {/* Wizard Step Indicators */}
        <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className={`flex items-center space-x-2 font-semibold ${currentStep >= 1 ? 'text-teal-600' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep >= 1 ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              1
            </span>
            <span>Configure & Upload</span>
          </div>
          <div className="h-0.5 flex-1 mx-4 bg-slate-200">
            <div className={`h-full bg-teal-600 transition-all ${currentStep === 1 ? 'w-0' : currentStep === 2 ? 'w-1/2' : 'w-full'}`} />
          </div>
          <div className={`flex items-center space-x-2 font-semibold ${currentStep >= 2 ? 'text-teal-600' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep >= 2 ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              2
            </span>
            <span>AI Column Mapping</span>
          </div>
          <div className="h-0.5 flex-1 mx-4 bg-slate-200">
            <div className={`h-full bg-teal-600 transition-all ${currentStep <= 2 ? 'w-0' : 'w-full'}`} />
          </div>
          <div className={`flex items-center space-x-2 font-semibold ${currentStep === 3 ? 'text-teal-600' : 'text-slate-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${currentStep === 3 ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
              3
            </span>
            <span>Validation & Save</span>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-600 font-bold hover:underline">
            Dismiss
          </button>
        </div>
      )}

      {/* STEP 1: CONFIGURE & UPLOAD FILE */}
      {currentStep === 1 && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
            <h2 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider">
              1. Report Parameters
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Report Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Report Type / Classification *
                </label>
                <select
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value as ReportType)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
                >
                  <option value="stock_snapshot">Stock Balance Snapshot (Dated Snapshot)</option>
                  <option value="consumption">Monthly Consumption / Issuing Report</option>
                  <option value="receiving_grn">Goods Received Notes (GRN Receiving)</option>
                  <option value="expiry_batch">Near Expiry & Batch Traceability Report</option>
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {reportType === 'stock_snapshot' && 'Captures exact on-hand balances as a dated snapshot.'}
                  {reportType === 'consumption' && 'Tracks patient/ward consumption flows by department.'}
                  {reportType === 'receiving_grn' && 'Inbound goods receiving notes from suppliers.'}
                  {reportType === 'expiry_batch' && 'Batch lot numbers with expiration dates for FEFO.'}
                </p>
              </div>

              {/* Target Warehouse */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Target Hospital Warehouse *
                </label>
                <select
                  value={targetWarehouse}
                  onChange={(e) => setTargetWarehouse(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
                >
                  {warehouses.map((wh) => (
                    <option key={wh.code} value={wh.code}>
                      {wh.code} - {wh.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Store or depot location mapped to this import.
                </p>
              </div>

              {/* Reporting Period */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Reporting Period / Fiscal Month *
                </label>
                <input
                  type="text"
                  value={reportingPeriod}
                  onChange={(e) => setReportingPeriod(e.target.value)}
                  placeholder="e.g. 2026-10"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-teal-500 font-medium"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Prevents double counting repeated uploads.
                </p>
              </div>

              {/* Replace Demo Data Toggle */}
              <div className="md:col-span-3 pt-2 border-t border-slate-200">
                <label className="flex items-start space-x-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={replaceDemoData}
                    onChange={(e) => setReplaceDemoData(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-900 group-hover:text-teal-700 transition">
                      {storageService.getIsDemoMode()
                        ? 'Replace sample demo data with this real report'
                        : 'Reset database and replace all existing reports with this report'}
                    </span>
                    <p className="text-[11px] text-slate-500">
                      {storageService.getIsDemoMode()
                        ? 'Leave checked on your first upload to clear fictional sample records. Once you upload your stock report, UNCHECK this to keep stock and add your consumption / GRN reports alongside it.'
                        : 'Keep UNCHECKED to preserve your previously uploaded reports (e.g. keep Stock Report and add Consumption / GRN side-by-side). Check only if you wish to start completely fresh.'}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Upload Dropzone */}
          <div className="bg-white border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-teal-500 transition group">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center mb-4 group-hover:scale-105 transition">
              <FileSpreadsheet className="w-8 h-8" />
            </div>

            <h3 className="text-base font-bold text-slate-900">
              Select or Drop Excel Report (.xlsx, .xls)
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              Exported from Oracle Health, SAP, Cerner, or in-house hospital ERP inventory systems.
            </p>

            <div className="mt-5">
              <label className="inline-flex items-center px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer transition shadow-xs">
                <span>Browse Local Excel File</span>
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {isParsing && (
              <div className="mt-4 flex items-center justify-center space-x-2 text-xs text-teal-600 font-semibold">
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Reading worksheets and headers...</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: PREVIEW & COLUMN MAPPING */}
      {currentStep === 2 && fileData && (
        <div className="space-y-6">
          {/* File summary & Sheet selector */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div>
              <span className="font-bold text-slate-900 text-sm">{fileData.fileName}</span>
              <div className="text-slate-500 mt-0.5">
                Total Rows in File: <strong className="text-slate-900 font-bold">{fileData.totalRows.toLocaleString()} records</strong> • Target Store:{' '}
                <strong className="text-slate-800">{targetWarehouse}</strong> • Period:{' '}
                <strong className="text-slate-800">{reportingPeriod}</strong>
              </div>
              <div className="text-[11px] text-teal-700 font-medium mt-1 bg-teal-50 px-2.5 py-1 rounded-md border border-teal-200 inline-flex items-center space-x-1.5">
                <Info className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                <span>
                  Displaying preview of first {fileData.sampleRows.length} rows. All {fileData.totalRows.toLocaleString()} actual rows will be validated, aggregated across batches, and saved.
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              {fileData.sheetNames.length > 1 && (
                <div className="flex items-center space-x-2">
                  <span className="text-slate-500 font-medium">Worksheet:</span>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="bg-slate-50 border border-slate-300 rounded px-2.5 py-1 text-xs text-slate-800 font-medium"
                  >
                    {fileData.sheetNames.map((name) => {
                      const meta = fileData.sheetsMetadata?.find((s: SheetMetadata) => s.name === name);
                      return (
                        <option key={name} value={name}>
                          {name} {meta ? `(${meta.rowCount.toLocaleString()} rows)` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <button
                onClick={handleTriggerAiMapping}
                disabled={isAiMapping}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white rounded font-bold shadow-xs transition"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isAiMapping ? 'AI Matching...' : 'AI Auto-Map Columns'}</span>
              </button>
            </div>
          </div>

          {aiRationale && (
            <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
              <span>{aiRationale}</span>
            </div>
          )}

          {/* Column Mapping Table */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm text-slate-900">
                Column Mapping: Align ERP Headers to Standard Data Model
              </h3>
              <span className="text-[11px] text-slate-500">
                Verify and adjust any field mapping manually if needed.
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                <thead className="bg-slate-50 text-slate-700 uppercase tracking-wider font-semibold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3">Excel Header</th>
                    <th className="py-2.5 px-3">Sample Value</th>
                    <th className="py-2.5 px-3">Mapped Standard Field</th>
                    <th className="py-2.5 px-3">Requirement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fileData.headers.map((header) => {
                    const sampleVal = fileData.sampleRows[0] ? String(fileData.sampleRows[0][header] || '') : '—';
                    const currentStandard = columnMapping[header] || 'ignore';
                    const isRequired = STANDARD_FIELDS_DICTIONARY.find((d) => d.key === currentStandard)?.requiredFor.includes(reportType);

                    return (
                      <tr key={header} className="hover:bg-slate-50/80 transition">
                        <td className="py-2.5 px-3 font-semibold text-slate-900 font-mono text-[11px]">
                          {header}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-[200px] truncate" title={sampleVal}>
                          {sampleVal}
                        </td>
                        <td className="py-2.5 px-3">
                          <select
                            value={currentStandard}
                            onChange={(e) =>
                              handleManualMappingChange(header, e.target.value as StandardField | 'ignore')
                            }
                            className={`w-full max-w-[260px] rounded px-2.5 py-1 text-xs border font-medium ${
                              currentStandard !== 'ignore'
                                ? 'bg-teal-50 border-teal-300 text-teal-900'
                                : 'bg-slate-50 border-slate-300 text-slate-500'
                            }`}
                          >
                            <option value="ignore">— Ignore this column —</option>
                            <optgroup label="Standard Fields">
                              {STANDARD_FIELDS_DICTIONARY.map((field) => (
                                <option key={field.key} value={field.key}>
                                  {field.label} {field.requiredFor.includes(reportType) ? '(Required)' : ''}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </td>
                        <td className="py-2.5 px-3">
                          {isRequired ? (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              Required
                            </span>
                          ) : currentStandard !== 'ignore' ? (
                            <span className="text-[10px] text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              Matched
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">Ignored</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Navigation buttons */}
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg hover:bg-slate-50 transition flex items-center space-x-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to File Upload</span>
              </button>

              <button
                onClick={handleProceedToValidation}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg transition flex items-center space-x-1.5 shadow-xs"
              >
                <span>Validate & Preview Records</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STEP 3: VALIDATION & IMPORT CONFIRMATION */}
      {currentStep === 3 && validationResult && fileData && (
        <div className="space-y-6">
          {/* Validation Status Card */}
          <div
            className={`border rounded-2xl p-6 shadow-xs ${
              validationResult.isValid
                ? 'bg-emerald-50/60 border-emerald-200'
                : 'bg-amber-50/60 border-amber-200'
            }`}
          >
            <div className="flex items-start space-x-3">
              <div
                className={`p-2 rounded-xl text-white ${
                  validationResult.isValid ? 'bg-emerald-600' : 'bg-amber-600'
                }`}
              >
                {validationResult.isValid ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>
              <div className="flex-1">
                <h3
                  className={`text-base font-bold ${
                    validationResult.isValid ? 'text-emerald-900' : 'text-amber-900'
                  }`}
                >
                  {validationResult.isValid
                    ? 'All Rows Validated Successfully'
                    : 'Validation Issues Detected in Dataset'}
                </h3>
                <p className="text-xs text-slate-600 mt-1">
                  Validated <strong>{validationResult.totalRowsValidated.toLocaleString()}</strong> actual data records from <strong>{fileData.fileName}</strong> against hospital ERP rules.
                  Multi-batch items recognized and ready for smart aggregation and Supabase persistence.
                </p>

                {/* 6 Key Statistics Required by User */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-3 border-t border-slate-200/60 text-xs">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Rows Read</span>
                    <strong className="text-sm font-black text-slate-900">{validationResult.totalRowsRead.toLocaleString()}</strong>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Rows Validated</span>
                    <strong className="text-sm font-black text-slate-900">{validationResult.totalRowsValidated.toLocaleString()}</strong>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-emerald-200">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">Clean Rows</span>
                    <strong className="text-sm font-black text-emerald-700">{validationResult.cleanRows.toLocaleString()}</strong>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-rose-200">
                    <span className="text-[10px] uppercase font-bold text-rose-700 block">Rows with Errors</span>
                    <strong className="text-sm font-black text-rose-700">{validationResult.rowsWithErrors.toLocaleString()}</strong>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-amber-200">
                    <span className="text-[10px] uppercase font-bold text-amber-700 block">Rows with Warnings</span>
                    <strong className="text-sm font-black text-amber-700">{validationResult.rowsWithWarnings.toLocaleString()}</strong>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-teal-300">
                    <span className="text-[10px] uppercase font-bold text-teal-800 block">Ready to Import</span>
                    <strong className="text-sm font-black text-teal-800">{validationResult.successfullyImportedRows.toLocaleString()}</strong>
                  </div>
                </div>

                {/* Smart Aggregation & UOM Insights */}
                <div className="mt-3 flex items-center flex-wrap gap-2 text-[11px]">
                  <span className="px-2.5 py-1 rounded bg-teal-100/70 text-teal-900 border border-teal-300 font-semibold inline-flex items-center space-x-1">
                    <span>Multi-Batch Items:</span>
                    <strong className="ml-1 text-teal-950 font-black">{validationResult.multiBatchItemsCount}</strong>
                  </span>
                  <span className="px-2.5 py-1 rounded bg-indigo-100/70 text-indigo-900 border border-indigo-300 font-semibold inline-flex items-center space-x-1">
                    <span>UOM Standardized:</span>
                    <strong className="ml-1 text-indigo-950 font-black">{validationResult.uomConvertedItemsCount}</strong>
                  </span>
                  {validationResult.uomConversionRequiredCount > 0 && (
                    <span className="px-2.5 py-1 rounded bg-amber-100 text-amber-900 border border-amber-300 font-bold inline-flex items-center space-x-1">
                      <span>UOM Configuration Needed:</span>
                      <strong className="ml-1 text-amber-950 font-black">{validationResult.uomConversionRequiredCount}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Validation Issues Log if any */}
          {validationResult.issues.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800 mb-3">
                Validation Feedback & Integrity Audit
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-2">
                {validationResult.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className={`p-2.5 rounded-lg text-xs flex items-center justify-between ${
                      issue.type === 'error'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    <span>{issue.message}</span>
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-white">
                      {issue.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <button
              onClick={() => setCurrentStep(2)}
              className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold text-xs rounded-lg hover:bg-slate-50 transition flex items-center space-x-1.5 self-start sm:self-auto"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Column Mapping</span>
            </button>

            <div className="flex items-center space-x-4">
              <label className="flex items-center space-x-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={replaceDemoData}
                  onChange={(e) => setReplaceDemoData(e.target.checked)}
                  className="w-4 h-4 rounded text-teal-600 focus:ring-teal-500 border-slate-300 cursor-pointer"
                />
                <span>
                  {storageService.getIsDemoMode()
                    ? 'Replace sample demo data with this upload'
                    : 'Reset and replace previous reports (uncheck to keep existing reports)'}
                </span>
              </label>

              <button
                onClick={handleConfirmImport}
                disabled={
                  importStatus === 'importing' ||
                  validationResult.successfullyImportedRows === 0 ||
                  validationResult.missingRequiredFields.length > 0
                }
                className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-slate-950 font-extrabold text-xs rounded-lg transition flex items-center space-x-2 shadow-sm disabled:opacity-50"
              >
                {importStatus === 'importing' ? (
                  <>
                    <RotateCcw className="w-4 h-4 animate-spin" />
                    <span>Saving to Supabase Postgres...</span>
                  </>
                ) : importStatus === 'success' ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Import Completed!</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Import Records</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
