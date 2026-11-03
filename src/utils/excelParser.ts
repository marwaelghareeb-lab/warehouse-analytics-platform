import * as XLSX from 'xlsx';
import {
  ReportType,
  StandardField,
  StockSnapshot,
  ConsumptionRecord,
  ReceivingRecord,
  ExpiryRecord,
  ColumnMappingResult,
} from '../types/warehouse';
import { STANDARD_FIELDS_DICTIONARY } from '../data/demoData';

export interface ParsedSheetData {
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  sampleRows: Record<string, any>[];
  totalRows: number;
  rawWorkbook: XLSX.WorkBook;
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  rowNumber?: number;
  field?: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  totalRowsChecked: number;
  validRowCount: number;
  issues: ValidationIssue[];
  missingRequiredFields: StandardField[];
}

/**
 * Reads an uploaded Excel file and returns sheets, headers and sample rows
 */
export async function parseExcelFile(file: File): Promise<ParsedSheetData> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The uploaded Excel file contains no worksheets.');
  }

  const activeSheet = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[activeSheet];
  
  // Read as array of objects
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
  });

  // Extract headers
  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    activeSheet,
    headers,
    sampleRows: rawRows.slice(0, 10),
    totalRows: rawRows.length,
    rawWorkbook: workbook,
  };
}

/**
 * Switch active sheet and get its headers and sample rows
 */
export function getSheetData(workbook: XLSX.WorkBook, sheetName: string): {
  headers: string[];
  sampleRows: Record<string, any>[];
  totalRows: number;
} {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return { headers: [], sampleRows: [], totalRows: 0 };
  }
  const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
    raw: false,
    dateNF: 'yyyy-mm-dd',
    defval: '',
  });
  const headers = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  return {
    headers,
    sampleRows: rawRows.slice(0, 10),
    totalRows: rawRows.length,
  };
}

/**
 * Heuristic/rule-based column auto-mapping based on aliases
 */
export function autoMapColumns(headers: string[]): ColumnMappingResult {
  const mapping: ColumnMappingResult = {};

  headers.forEach((header) => {
    const clean = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matchedField: StandardField | 'ignore' = 'ignore';

    for (const def of STANDARD_FIELDS_DICTIONARY) {
      const match = def.aliases.some((alias) => {
        const cleanAlias = alias.toLowerCase().replace(/[^a-z0-9]/g, '');
        return clean === cleanAlias || clean.includes(cleanAlias) || cleanAlias.includes(clean);
      });
      if (match) {
        matchedField = def.key;
        break;
      }
    }
    mapping[header] = matchedField;
  });

  return mapping;
}

/**
 * Validates the mapped Excel rows according to report type and hospital business rules
 */
export function validateImportData(
  rows: Record<string, any>[],
  columnMapping: ColumnMappingResult,
  reportType: ReportType,
  targetWarehouse: string,
  reportingPeriod: string
): ValidationResult {
  const issues: ValidationIssue[] = [];
  
  // Find which standard fields are mapped
  const mappedStandardFields = new Set(Object.values(columnMapping).filter((v) => v !== 'ignore'));

  // 1. Check required fields for this report type
  const requiredFields = STANDARD_FIELDS_DICTIONARY
    .filter((def) => def.requiredFor.includes(reportType))
    .map((def) => def.key);

  const missingRequired = requiredFields.filter((req) => !mappedStandardFields.has(req));
  
  missingRequired.forEach((fieldKey) => {
    const def = STANDARD_FIELDS_DICTIONARY.find((d) => d.key === fieldKey);
    issues.push({
      type: 'error',
      field: fieldKey,
      message: `Required column "${def?.label || fieldKey}" is not mapped.`,
    });
  });

  // Inverse mapping: StandardField -> source header
  const standardToSource: Partial<Record<StandardField, string>> = {};
  for (const [sourceHeader, standardField] of Object.entries(columnMapping)) {
    if (standardField !== 'ignore') {
      standardToSource[standardField] = sourceHeader;
    }
  }

  // 2. Row by row validation
  let validRowCount = 0;
  const seenItemCodes = new Set<string>();

  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based index accounting for header
    let rowHasFatalError = false;

    // Check Item Code
    const itemCodeHeader = standardToSource['itemCode'];
    const itemCode = itemCodeHeader ? String(row[itemCodeHeader] || '').trim() : '';

    if (itemCodeHeader && !itemCode) {
      issues.push({
        type: 'error',
        rowNumber: rowNum,
        field: 'itemCode',
        message: `Row ${rowNum}: Item Code is missing or empty.`,
      });
      rowHasFatalError = true;
    }

    // Check duplicates in snapshot
    if (reportType === 'stock_snapshot' && itemCode) {
      if (seenItemCodes.has(itemCode)) {
        issues.push({
          type: 'warning',
          rowNumber: rowNum,
          field: 'itemCode',
          message: `Row ${rowNum}: Duplicate item code "${itemCode}" found in the same snapshot. Latest record will be retained.`,
        });
      }
      seenItemCodes.add(itemCode);
    }

    // Check Quantity
    const qtyHeader = standardToSource['quantity'];
    if (qtyHeader) {
      const val = row[qtyHeader];
      const numVal = parseFloat(String(val).replace(/,/g, ''));
      if (isNaN(numVal)) {
        issues.push({
          type: 'error',
          rowNumber: rowNum,
          field: 'quantity',
          message: `Row ${rowNum}: Quantity "${val}" is not a valid number.`,
        });
        rowHasFatalError = true;
      } else if (numVal < 0) {
        issues.push({
          type: 'warning',
          rowNumber: rowNum,
          field: 'quantity',
          message: `Row ${rowNum}: Negative quantity (${numVal}) detected. Please verify ERP return/adjustment.`,
        });
      }
    }

    // Check Dates for consumption, receiving, expiry
    if (reportType === 'expiry_batch') {
      const expHeader = standardToSource['expiryDate'];
      if (expHeader) {
        const expVal = row[expHeader];
        if (!expVal || isNaN(Date.parse(String(expVal)))) {
          issues.push({
            type: 'error',
            rowNumber: rowNum,
            field: 'expiryDate',
            message: `Row ${rowNum}: Invalid or missing expiry date "${expVal}".`,
          });
          rowHasFatalError = true;
        }
      }
    }

    // Unit Cost check
    const costHeader = standardToSource['unitCost'];
    if (costHeader && row[costHeader] !== undefined && row[costHeader] !== '') {
      const costVal = parseFloat(String(row[costHeader]).replace(/,/g, ''));
      if (isNaN(costVal) || costVal < 0) {
        issues.push({
          type: 'warning',
          rowNumber: rowNum,
          field: 'unitCost',
          message: `Row ${rowNum}: Invalid unit cost "${row[costHeader]}". Defaulting to 0.00 SAR.`,
        });
      }
    }

    if (!rowHasFatalError) {
      validRowCount++;
    }
  });

  const hasFatalErrors = issues.some((i) => i.type === 'error');

  return {
    isValid: !hasFatalErrors,
    totalRowsChecked: rows.length,
    validRowCount,
    issues: issues.slice(0, 50), // keep display fast
    missingRequiredFields: missingRequired,
  };
}

/**
 * Normalizes validated rows into structured records
 */
export function normalizeExcelData(
  rows: Record<string, any>[],
  columnMapping: ColumnMappingResult,
  reportType: ReportType,
  targetWarehouse: string,
  reportingPeriod: string,
  reportId: string
): {
  stockSnapshots?: StockSnapshot[];
  consumptionRecords?: ConsumptionRecord[];
  receivingRecords?: ReceivingRecord[];
  expiryRecords?: ExpiryRecord[];
} {
  const standardToSource: Partial<Record<StandardField, string>> = {};
  for (const [sourceHeader, standardField] of Object.entries(columnMapping)) {
    if (standardField !== 'ignore') {
      standardToSource[standardField] = sourceHeader;
    }
  }

  const getStr = (f: StandardField, fallback = ''): string => {
    const src = standardToSource[f];
    if (!src) return fallback;
    const v = rows[0] && rows[0][src] !== undefined ? String(rows[0][src]).trim() : fallback;
    return v;
  };

  const getRowStr = (row: Record<string, any>, f: StandardField, fallback = ''): string => {
    const src = standardToSource[f];
    if (!src || row[src] === undefined || row[src] === null) return fallback;
    return String(row[src]).trim();
  };

  const getRowNum = (row: Record<string, any>, f: StandardField, fallback = 0): number => {
    const src = standardToSource[f];
    if (!src || row[src] === undefined || row[src] === null) return fallback;
    const n = parseFloat(String(row[src]).replace(/,/g, ''));
    return isNaN(n) ? fallback : n;
  };

  if (reportType === 'stock_snapshot') {
    const snapshots: StockSnapshot[] = rows
      .filter((r) => getRowStr(r, 'itemCode'))
      .map((row, idx) => {
        const itemCode = getRowStr(row, 'itemCode');
        const itemDescription = getRowStr(row, 'itemDescription', itemCode);
        const category = getRowStr(row, 'category', 'General Medical Supplies');
        const quantityOnHand = getRowNum(row, 'quantity', 0);
        const unit = getRowStr(row, 'unit', 'Units');
        const unitCost = getRowNum(row, 'unitCost', 0);
        const totalStockValue = getRowNum(row, 'totalValue', quantityOnHand * unitCost);
        
        let stockStatus: 'normal' | 'low_stock' | 'overstock' | 'stockout' = 'normal';
        if (quantityOnHand <= 0) stockStatus = 'stockout';
        else if (quantityOnHand < 300) stockStatus = 'low_stock';
        else if (quantityOnHand > 6000) stockStatus = 'overstock';

        return {
          id: `IMP-SS-${reportId}-${idx}`,
          reportId,
          snapshotDate: getRowStr(row, 'transactionDate', new Date().toISOString().split('T')[0]),
          reportingPeriod,
          warehouseCode: getRowStr(row, 'warehouse', targetWarehouse),
          itemCode,
          itemDescription,
          category,
          quantityOnHand,
          unit,
          unitCost,
          totalStockValue,
          stockStatus,
        };
      });
    return { stockSnapshots: snapshots };
  }

  if (reportType === 'consumption') {
    const records: ConsumptionRecord[] = rows
      .filter((r) => getRowStr(r, 'itemCode'))
      .map((row, idx) => {
        const itemCode = getRowStr(row, 'itemCode');
        const itemDescription = getRowStr(row, 'itemDescription', itemCode);
        const category = getRowStr(row, 'category', 'General Medical Supplies');
        const quantityConsumed = getRowNum(row, 'quantity', 0);
        const unitCost = getRowNum(row, 'unitCost', 0);
        const totalVal = getRowNum(row, 'totalValue', quantityConsumed * unitCost);

        return {
          id: `IMP-CON-${reportId}-${idx}`,
          reportId,
          transactionDate: getRowStr(row, 'transactionDate', new Date().toISOString().split('T')[0]),
          reportingPeriod,
          warehouseCode: getRowStr(row, 'warehouse', targetWarehouse),
          itemCode,
          itemDescription,
          category,
          department: getRowStr(row, 'department', 'General Hospital Services'),
          quantityConsumed,
          unit: getRowStr(row, 'unit', 'Units'),
          unitCost,
          totalConsumptionValue: totalVal,
          issueVoucherNumber: getRowStr(row, 'prNumber', `VOUCH-${1000 + idx}`),
        };
      });
    return { consumptionRecords: records };
  }

  if (reportType === 'receiving_grn') {
    const records: ReceivingRecord[] = rows
      .filter((r) => getRowStr(r, 'itemCode'))
      .map((row, idx) => {
        const itemCode = getRowStr(row, 'itemCode');
        const itemDescription = getRowStr(row, 'itemDescription', itemCode);
        const quantityReceived = getRowNum(row, 'quantity', 0);
        const unitCost = getRowNum(row, 'unitCost', 0);
        const totalVal = getRowNum(row, 'totalValue', quantityReceived * unitCost);

        return {
          id: `IMP-REC-${reportId}-${idx}`,
          reportId,
          grnNumber: getRowStr(row, 'grnNumber', `GRN-IMP-${1000 + idx}`),
          prNumber: getRowStr(row, 'prNumber', `PR-${1000 + idx}`),
          receiptDate: getRowStr(row, 'transactionDate', new Date().toISOString().split('T')[0]),
          reportingPeriod,
          warehouseCode: getRowStr(row, 'warehouse', targetWarehouse),
          itemCode,
          itemDescription,
          category: getRowStr(row, 'category', 'General Medical Supplies'),
          supplierName: getRowStr(row, 'supplier', 'Authorized Hospital Distributor'),
          quantityReceived,
          unit: getRowStr(row, 'unit', 'Units'),
          unitCost,
          totalReceivedValue: totalVal,
          inspectionStatus: 'Accepted',
        };
      });
    return { receivingRecords: records };
  }

  if (reportType === 'expiry_batch') {
    const now = new Date();
    const records: ExpiryRecord[] = rows
      .filter((r) => getRowStr(r, 'itemCode'))
      .map((row, idx) => {
        const itemCode = getRowStr(row, 'itemCode');
        const itemDescription = getRowStr(row, 'itemDescription', itemCode);
        const expiryDateStr = getRowStr(row, 'expiryDate', new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0]);
        const expiryDate = new Date(expiryDateStr);
        const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        const quantityRemaining = getRowNum(row, 'quantity', 0);
        const unitCost = getRowNum(row, 'unitCost', 0);
        const totalVal = getRowNum(row, 'totalValue', quantityRemaining * unitCost);

        let riskLevel: 'expired' | 'critical_30' | 'warning_60' | 'notice_90' | 'safe' = 'safe';
        if (diffDays <= 0) riskLevel = 'expired';
        else if (diffDays <= 30) riskLevel = 'critical_30';
        else if (diffDays <= 60) riskLevel = 'warning_60';
        else if (diffDays <= 90) riskLevel = 'notice_90';

        return {
          id: `IMP-EXP-${reportId}-${idx}`,
          reportId,
          warehouseCode: getRowStr(row, 'warehouse', targetWarehouse),
          itemCode,
          itemDescription,
          category: getRowStr(row, 'category', 'Pharmaceuticals'),
          batchNumber: getRowStr(row, 'batchNumber', `BATCH-${idx + 1}`),
          expiryDate: expiryDateStr,
          daysUntilExpiry: diffDays,
          quantityRemaining,
          unit: getRowStr(row, 'unit', 'Units'),
          unitCost,
          totalValueAtRisk: totalVal,
          riskLevel,
        };
      });
    return { expiryRecords: records };
  }

  return {};
}
