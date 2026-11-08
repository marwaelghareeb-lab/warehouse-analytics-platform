import * as XLSX from 'xlsx';
import {
  ReportType,
  StandardField,
  StockSnapshot,
  ConsumptionRecord,
  ReceivingRecord,
  ExpiryRecord,
  ColumnMappingResult,
  UOMConversionRule,
} from '../types/warehouse';
import { STANDARD_FIELDS_DICTIONARY } from '../data/demoData';
import {
  resolveUOMConversion,
  normalizeUOMName,
  detectNameConversionFactor,
  isBaseUnit,
} from './uomConverter';

export interface ParsedSheetData {
  fileName: string;
  sheetNames: string[];
  activeSheet: string;
  headers: string[];
  sampleRows: Record<string, any>[]; // Preview rows (up to 20)
  allRows: Record<string, any>[]; // ALL rows from Excel (hundreds or thousands)
  totalRows: number;
  rawWorkbook: XLSX.WorkBook;
  sheetsMetadata?: SheetMetadata[];
}

export interface ValidationIssue {
  type: 'error' | 'warning';
  rowNumber?: number;
  field?: string;
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  totalRowsRead: number;
  totalRowsValidated: number;
  cleanRows: number;
  rowsWithErrors: number;
  rowsWithWarnings: number;
  successfullyImportedRows: number;
  multiBatchItemsCount: number;
  uomConvertedItemsCount: number;
  uomConversionRequiredCount: number;
  issues: ValidationIssue[];
  missingRequiredFields: StandardField[];
}

export interface SheetMetadata {
  name: string;
  rowCount: number;
  headers: string[];
}

/**
 * Keywords commonly present in Hospital ERP warehouse report headers
 */
const ERP_HEADER_KEYWORDS = [
  'item', 'code', 'sku', 'product', 'material', 'desc', 'description', 'name',
  'cat', 'category', 'group', 'class',
  'qty', 'quantity', 'balance', 'onhand', 'on hand', 'stock', 'available', 'count',
  'uom', 'unit', 'pkg', 'pack', 'box',
  'price', 'cost', 'unit price', 'unit cost', 'sar', 'rate',
  'total', 'val', 'value', 'amount', 'extended',
  'date', 'expiry', 'exp', 'batch', 'lot', 'serial',
  'wh', 'warehouse', 'store', 'loc', 'location', 'depot',
  'grn', 'pr', 'po', 'supplier', 'vendor', 'dept', 'department', 'ward'
];

/**
 * Ensures that a worksheet's !ref range encompasses ALL cells present in the sheet.
 * Fixes a critical ERP export issue where !ref was generated as A1:K10 or restricted to 10 rows.
 */
function fixWorksheetRange(worksheet: XLSX.WorkSheet): void {
  if (!worksheet) return;
  let minR = Infinity, maxR = -1;
  let minC = Infinity, maxC = -1;

  for (const key of Object.keys(worksheet)) {
    if (key.startsWith('!')) continue;
    try {
      const cell = XLSX.utils.decode_cell(key);
      if (cell.r < minR) minR = cell.r;
      if (cell.r > maxR) maxR = cell.r;
      if (cell.c < minC) minC = cell.c;
      if (cell.c > maxC) maxC = cell.c;
    } catch (_) {}
  }

  if (maxR >= 0 && maxC >= 0) {
    const sR = minR === Infinity ? 0 : minR;
    const sC = minC === Infinity ? 0 : minC;
    worksheet['!ref'] = XLSX.utils.encode_range({
      s: { r: sR, c: sC },
      e: { r: maxR, c: maxC },
    });
  }
}

/**
 * Robustly parses a worksheet:
 * 1. Expands !ref range if ERP export truncated the range to 10 rows
 * 2. Scans for the true header row (skipping title/metadata banners)
 * 3. Converts all subsequent rows into structured objects (hundreds or thousands of records)
 */
function extractRowsFromWorksheet(worksheet: XLSX.WorkSheet): {
  headers: string[];
  allRows: Record<string, any>[];
  totalRows: number;
} {
  if (!worksheet) {
    return { headers: [], allRows: [], totalRows: 0 };
  }

  // 1. Fix truncated !ref range
  fixWorksheetRange(worksheet);

  // 2. Read as 2D array of rows
  const raw2D: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
    raw: false,
    dateNF: 'yyyy-mm-dd',
  });

  if (!raw2D || raw2D.length === 0) {
    return { headers: [], allRows: [], totalRows: 0 };
  }

  // 3. Find the real header row by scoring the first 25 rows
  let bestHeaderRowIndex = 0;
  let bestScore = -1;
  const maxScanRows = Math.min(raw2D.length, 25);

  for (let r = 0; r < maxScanRows; r++) {
    const row = raw2D[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    // Count non-empty text cells
    const textCells = row.map((c) => String(c || '').trim()).filter((c) => c !== '');
    if (textCells.length === 0) continue;

    // Score based on count of valid column titles and ERP keyword matches
    let score = textCells.length;
    let keywordMatches = 0;

    textCells.forEach((cell) => {
      const lower = cell.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (ERP_HEADER_KEYWORDS.some((kw) => lower.includes(kw.replace(/[^a-z0-9]/g, '')))) {
        keywordMatches += 3;
      }
    });

    score += keywordMatches;

    // A row with multiple distinct columns and keyword matches is very likely the header
    if (score > bestScore && textCells.length >= 2) {
      bestScore = score;
      bestHeaderRowIndex = r;
    }
  }

  // Extract cleaned headers from best header row
  const rawHeaderRow = raw2D[bestHeaderRowIndex] || [];
  const headers: string[] = [];
  const seenHeaders = new Set<string>();

  rawHeaderRow.forEach((cellVal: any, colIdx: number) => {
    let headerName = String(cellVal || '').trim();
    if (!headerName) {
      headerName = `Column_${colIdx + 1}`;
    }
    // Handle duplicate header names in Excel
    let uniqueName = headerName;
    let count = 2;
    while (seenHeaders.has(uniqueName)) {
      uniqueName = `${headerName}_${count}`;
      count++;
    }
    seenHeaders.add(uniqueName);
    headers.push(uniqueName);
  });

  // 4. Extract data rows (all rows after the detected header row)
  const allRows: Record<string, any>[] = [];

  for (let r = bestHeaderRowIndex + 1; r < raw2D.length; r++) {
    const rowData = raw2D[r];
    if (!Array.isArray(rowData)) continue;

    // Check if row has any non-empty data
    const hasData = rowData.some((val) => val !== null && val !== undefined && String(val).trim() !== '');
    if (!hasData) continue;

    const rowObj: Record<string, any> = {};
    headers.forEach((header, colIdx) => {
      const val = rowData[colIdx];
      rowObj[header] = val !== undefined && val !== null ? String(val).trim() : '';
    });

    allRows.push(rowObj);
  }

  return {
    headers,
    allRows,
    totalRows: allRows.length,
  };
}

/**
 * Reads an uploaded Excel file and extracts sheets, headers, preview rows, and ALL actual data rows
 */
export async function parseExcelFile(file: File): Promise<ParsedSheetData> {
  const data = await file.arrayBuffer();
  // Support .xlsx, .xls (BIFF8), .xls (HTML tables), and XML spreadsheets
  const workbook = XLSX.read(data, { type: 'array', cellDates: true, dense: false });

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('The uploaded Excel file contains no worksheets.');
  }

  // Scan all worksheets to find the sheet with the most data records
  let bestSheetName = workbook.SheetNames[0];
  let maxRows = -1;
  const sheetsMetadata: SheetMetadata[] = [];

  workbook.SheetNames.forEach((sheetName) => {
    const ws = workbook.Sheets[sheetName];
    const { headers, allRows } = extractRowsFromWorksheet(ws);
    sheetsMetadata.push({
      name: sheetName,
      rowCount: allRows.length,
      headers,
    });
    if (allRows.length > maxRows) {
      maxRows = allRows.length;
      bestSheetName = sheetName;
    }
  });

  const bestSheetData = extractRowsFromWorksheet(workbook.Sheets[bestSheetName]);

  return {
    fileName: file.name,
    sheetNames: workbook.SheetNames,
    activeSheet: bestSheetName,
    headers: bestSheetData.headers,
    sampleRows: bestSheetData.allRows.slice(0, 25),
    allRows: bestSheetData.allRows,
    totalRows: bestSheetData.totalRows,
    rawWorkbook: workbook,
    sheetsMetadata,
  };
}

/**
 * Switch active sheet and get its headers, sample rows, and all valid data rows
 */
export function getSheetData(workbook: XLSX.WorkBook, sheetName: string): {
  headers: string[];
  sampleRows: Record<string, any>[];
  allRows: Record<string, any>[];
  totalRows: number;
} {
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
    return { headers: [], sampleRows: [], allRows: [], totalRows: 0 };
  }
  const extracted = extractRowsFromWorksheet(worksheet);
  return {
    headers: extracted.headers,
    sampleRows: extracted.allRows.slice(0, 25),
    allRows: extracted.allRows,
    totalRows: extracted.totalRows,
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
 * Validates ALL mapped Excel rows according to report type, multi-batch rules, and UOM standards
 */
export function validateImportData(
  rows: Record<string, any>[],
  columnMapping: ColumnMappingResult,
  reportType: ReportType,
  targetWarehouse: string,
  reportingPeriod: string,
  uomRules: UOMConversionRule[] = []
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

  // Tracking structures for smart multi-batch and multi-UOM aggregation
  const itemBatchCountMap = new Map<string, Set<string>>();
  const itemUomsMap = new Map<string, Set<string>>();
  const seenExactRecords = new Set<string>();

  let cleanRowCount = 0;
  let rowsWithErrorsCount = 0;
  let rowsWithWarningsCount = 0;
  const flaggedUomItems = new Set<string>();
  const convertedUomItems = new Set<string>();

  // Validate every single row
  rows.forEach((row, idx) => {
    const rowNum = idx + 2; // 1-based index accounting for header row
    let rowHasError = false;
    let rowHasWarning = false;

    // 1. Item Code Check
    const itemCodeHeader = standardToSource['itemCode'];
    const itemCode = getRowStr(row, 'itemCode');
    const itemDesc = getRowStr(row, 'itemDescription', itemCode);
    const batchNo = getRowStr(row, 'batchNumber', '');
    const expiry = getRowStr(row, 'expiryDate', '');
    const uom = getRowStr(row, 'unit', 'Unit');
    const wh = getRowStr(row, 'warehouse', targetWarehouse);

    if (itemCodeHeader && !itemCode) {
      issues.push({
        type: 'error',
        rowNumber: rowNum,
        field: 'itemCode',
        message: `Row ${rowNum}: Item Code is missing or empty.`,
      });
      rowHasError = true;
    }

    // 2. Quantity Check
    const qtyHeader = standardToSource['quantity'];
    if (qtyHeader) {
      const rawVal = row[qtyHeader];
      const numVal = parseFloat(String(rawVal).replace(/,/g, ''));
      if (isNaN(numVal)) {
        issues.push({
          type: 'error',
          rowNumber: rowNum,
          field: 'quantity',
          message: `Row ${rowNum}: Quantity "${rawVal}" is not a valid number.`,
        });
        rowHasError = true;
      } else if (numVal < 0) {
        issues.push({
          type: 'warning',
          rowNumber: rowNum,
          field: 'quantity',
          message: `Row ${rowNum}: Negative quantity (${numVal}) for item "${itemCode}". Please verify return/credit transaction.`,
        });
        rowHasWarning = true;
      }
    }

    // 3. Multi-batch tracking & Exact duplicate detection
    if (itemCode) {
      // Track batch numbers for this item
      if (!itemBatchCountMap.has(itemCode)) {
        itemBatchCountMap.set(itemCode, new Set());
      }
      if (batchNo) {
        itemBatchCountMap.get(itemCode)!.add(batchNo);
      }

      // Track UOMs for this item
      if (!itemUomsMap.has(itemCode)) {
        itemUomsMap.set(itemCode, new Set());
      }
      if (uom) {
        itemUomsMap.get(itemCode)!.add(normalizeUOMName(uom));
      }

      // Exact Duplicate Check: Same itemCode + batchNumber + expiry + warehouse + UOM + quantity
      const exactKey = `${itemCode}__${batchNo}__${expiry}__${wh}__${uom}__${getRowNum(row, 'quantity')}`;
      if (seenExactRecords.has(exactKey)) {
        issues.push({
          type: 'warning',
          rowNumber: rowNum,
          field: 'itemCode',
          message: `Row ${rowNum}: Potential exact duplicate row for Item "${itemCode}" (Batch: "${batchNo || 'N/A'}", Qty: ${getRowNum(row, 'quantity')}). Both preserved for audit.`,
        });
        rowHasWarning = true;
      } else {
        seenExactRecords.add(exactKey);
      }

      // Check UOM Conversion viability if item has multiple units or name pattern
      const namePattern = detectNameConversionFactor(itemDesc);
      if (namePattern) {
        convertedUomItems.add(itemCode);
      }
    }

    // 4. Date validation for expiry/batch reports
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
          rowHasError = true;
        }
      }
    }

    // 5. Unit Cost check
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
        rowHasWarning = true;
      }
    }

    if (rowHasError) {
      rowsWithErrorsCount++;
    } else if (rowHasWarning) {
      rowsWithWarningsCount++;
    } else {
      cleanRowCount++;
    }
  });

  // Check multi-UOM items for missing conversion factors
  itemUomsMap.forEach((uomSet, itemCode) => {
    if (uomSet.size > 1) {
      // Find candidate base unit
      const uomArray = Array.from(uomSet);
      let baseUnit = uomArray.find(isBaseUnit) || uomArray[uomArray.length - 1];

      uomArray.forEach((unit) => {
        if (unit.toLowerCase() !== baseUnit.toLowerCase()) {
          const resolution = resolveUOMConversion(
            itemCode,
            '',
            unit,
            baseUnit,
            1,
            uomRules
          );
          if (resolution.status === 'conversion_required') {
            flaggedUomItems.add(itemCode);
            issues.push({
              type: 'warning',
              field: 'unit',
              message: `Item "${itemCode}": Multiple UOMs detected (${Array.from(uomSet).join(', ')}). Conversion factor for "${unit}" to "${baseUnit}" is required before combining.`,
            });
          } else {
            convertedUomItems.add(itemCode);
          }
        }
      });
    }
  });

  // Count items with multiple batches
  let multiBatchItemsCount = 0;
  itemBatchCountMap.forEach((batches) => {
    if (batches.size > 1) {
      multiBatchItemsCount++;
    }
  });

  const hasFatalErrors = missingRequired.length > 0 || rowsWithErrorsCount > 0;
  const successfullyImported = rows.length - rowsWithErrorsCount;

  return {
    isValid: !hasFatalErrors,
    totalRowsRead: rows.length,
    totalRowsValidated: rows.length,
    cleanRows: cleanRowCount,
    rowsWithErrors: rowsWithErrorsCount,
    rowsWithWarnings: rowsWithWarningsCount,
    successfullyImportedRows: successfullyImported,
    multiBatchItemsCount,
    uomConvertedItemsCount: convertedUomItems.size,
    uomConversionRequiredCount: flaggedUomItems.size,
    issues: issues.slice(0, 100), // Show up to 100 detailed audit issues in UI
    missingRequiredFields: missingRequired,
  };
}

/**
 * Normalizes ALL validated rows into structured records while maintaining batch-level traceability
 */
export function normalizeExcelData(
  rows: Record<string, any>[],
  columnMapping: ColumnMappingResult,
  reportType: ReportType,
  targetWarehouse: string,
  reportingPeriod: string,
  reportId: string,
  uomRules: UOMConversionRule[] = []
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

  // 1. STOCK SNAPSHOTS (Batch-aware & UOM-aware)
  if (reportType === 'stock_snapshot') {
    // Determine base unit per item code across all rows
    const itemBaseUnitMap = new Map<string, string>();
    rows.forEach((r) => {
      const code = getRowStr(r, 'itemCode');
      const uom = normalizeUOMName(getRowStr(r, 'unit', 'Unit'));
      if (code) {
        if (!itemBaseUnitMap.has(code)) {
          itemBaseUnitMap.set(code, uom);
        } else {
          // If current stored is not a base unit but incoming is a base unit, prefer base unit
          const current = itemBaseUnitMap.get(code)!;
          if (!isBaseUnit(current) && isBaseUnit(uom)) {
            itemBaseUnitMap.set(code, uom);
          }
        }
      }
    });

    const snapshots: StockSnapshot[] = rows
      .filter((r) => getRowStr(r, 'itemCode'))
      .map((row, idx) => {
        const itemCode = getRowStr(row, 'itemCode');
        const itemDescription = getRowStr(row, 'itemDescription', itemCode);
        const category = getRowStr(row, 'category', 'General Medical Supplies');
        const rawQty = getRowNum(row, 'quantity', 0);
        const originalUnit = normalizeUOMName(getRowStr(row, 'unit', 'Unit'));
        const unitCost = getRowNum(row, 'unitCost', 0);
        const totalStockValue = getRowNum(row, 'totalValue', rawQty * unitCost);

        const batchNumber = getRowStr(row, 'batchNumber', `BATCH-${idx + 1}`);
        const expiryDate = getRowStr(row, 'expiryDate', '');

        // Resolve UOM conversion into standardized base unit
        const targetBaseUnit = itemBaseUnitMap.get(itemCode) || originalUnit;
        const resolution = resolveUOMConversion(
          itemCode,
          itemDescription,
          originalUnit,
          targetBaseUnit,
          rawQty,
          uomRules
        );

        let stockStatus: 'normal' | 'low_stock' | 'overstock' | 'stockout' = 'normal';
        if (resolution.convertedQuantity <= 0) stockStatus = 'stockout';
        else if (resolution.convertedQuantity < 300) stockStatus = 'low_stock';
        else if (resolution.convertedQuantity > 6000) stockStatus = 'overstock';

        return {
          id: `IMP-SS-${reportId}-${idx}-${batchNumber}`,
          reportId,
          snapshotDate: getRowStr(row, 'transactionDate', new Date().toISOString().split('T')[0]),
          reportingPeriod,
          warehouseCode: getRowStr(row, 'warehouse', targetWarehouse),
          itemCode,
          itemDescription,
          category,
          quantityOnHand: rawQty, // original quantity
          unit: originalUnit, // original unit
          unitCost,
          totalStockValue,
          stockStatus,
          batchNumber,
          expiryDate,
          convertedQuantity: resolution.convertedQuantity,
          standardUnit: resolution.standardUnit,
          conversionFactor: resolution.factor,
          conversionStatus: resolution.status,
        };
      });

    return { stockSnapshots: snapshots };
  }

  // 2. CONSUMPTION RECORDS
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

        // Default date based on reportingPeriod (e.g. 2026-10 -> 2026-10-31)
        const periodFallbackDate = reportingPeriod && reportingPeriod.match(/^\d{4}-\d{2}$/)
          ? `${reportingPeriod}-28`
          : new Date().toISOString().split('T')[0];

        return {
          id: `IMP-CON-${reportId}-${idx}`,
          reportId,
          transactionDate: getRowStr(row, 'transactionDate', periodFallbackDate),
          reportingPeriod,
          warehouseCode: getRowStr(row, 'warehouse', targetWarehouse),
          itemCode,
          itemDescription,
          category,
          department: getRowStr(row, 'department', 'General Hospital Services'),
          quantityConsumed,
          unit: normalizeUOMName(getRowStr(row, 'unit', 'Unit')),
          unitCost,
          totalConsumptionValue: totalVal,
          issueVoucherNumber: getRowStr(row, 'prNumber', `VOUCH-${1000 + idx}`),
        };
      });
    return { consumptionRecords: records };
  }

  // 3. RECEIVING RECORDS (GRN)
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
          unit: normalizeUOMName(getRowStr(row, 'unit', 'Unit')),
          unitCost,
          totalReceivedValue: totalVal,
          inspectionStatus: 'Accepted',
        };
      });
    return { receivingRecords: records };
  }

  // 4. EXPIRY & BATCH RECORDS
  if (reportType === 'expiry_batch') {
    const now = new Date();
    const records: ExpiryRecord[] = rows
      .filter((r) => getRowStr(r, 'itemCode'))
      .map((row, idx) => {
        const itemCode = getRowStr(row, 'itemCode');
        const itemDescription = getRowStr(row, 'itemDescription', itemCode);
        const expiryDateStr = getRowStr(
          row,
          'expiryDate',
          new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0]
        );
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
          unit: normalizeUOMName(getRowStr(row, 'unit', 'Unit')),
          unitCost,
          totalValueAtRisk: totalVal,
          riskLevel,
        };
      });
    return { expiryRecords: records };
  }

  return {};
}
