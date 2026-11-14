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
  'qty', 'quantity', 'consumed', 'consumption', 'issued', 'issue', 'dispensed', 'usage',
  'balance', 'onhand', 'on hand', 'stock', 'available', 'count',
  'uom', 'unit', 'pkg', 'pack', 'box',
  'price', 'cost', 'unit price', 'unit cost', 'sar', 'rate',
  'total', 'val', 'value', 'amount', 'extended',
  'date', 'expiry', 'exp', 'batch', 'lot', 'serial',
  'wh', 'warehouse', 'store', 'loc', 'location', 'depot',
  'grn', 'pr', 'po', 'supplier', 'vendor', 'dept', 'department', 'ward',
  'الكمية', 'الصنف', 'كود', 'الوحدة', 'السعر', 'التاريخ',
];

export interface SmartNumberParseResult {
  value: number | null;
  isEmptyOrDash: boolean;
}

const ARABIC_DIGIT_MAP: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/**
 * Robustly parses quantities and monetary values from Excel cells:
 * - Preserves native JS numbers cleanly
 * - Treats empty cells, "-", "—", "N/A", "nil" as numeric 0
 * - Supports comma/space/NBSP thousands separators, accounting negatives (150) / 150-,
 *   Arabic-Indic numerals (٠١٢٣٤٥٦٧٨٩), and unit/currency suffixes (e.g. "150 Box", "250 EA", "SAR 45.00")
 */
export function parseSmartNumber(rawVal: any): SmartNumberParseResult {
  if (typeof rawVal === 'number') {
    return Number.isFinite(rawVal)
      ? { value: rawVal, isEmptyOrDash: false }
      : { value: null, isEmptyOrDash: false };
  }

  if (rawVal === undefined || rawVal === null || typeof rawVal === 'boolean') {
    return { value: 0, isEmptyOrDash: true };
  }

  if (rawVal instanceof Date) {
    return { value: null, isEmptyOrDash: false };
  }

  let str = String(rawVal)
    .replace(/[٠-٩۰-۹]/g, (ch) => ARABIC_DIGIT_MAP[ch] ?? ch)
    .replace(/\u066B/g, '.') // Arabic decimal separator
    .replace(/\u066C/g, ',') // Arabic thousands separator
    .replace(/[\u00A0\u200E\u200F\u202A-\u202E\r\n\t]+/g, ' ')
    .trim();

  if (
    str === '' ||
    /^[-–—−]+$/.test(str) ||
    /^(n\/?a|nil|null|none|nan|\.+)$/i.test(str)
  ) {
    return { value: 0, isEmptyOrDash: true };
  }

  // Reject explicit date strings so dates are never misparsed as numbers
  if (
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:\s|$|T)/.test(str) ||
    /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}(?:\s|$)/.test(str)
  ) {
    return { value: null, isEmptyOrDash: false };
  }

  let isNegative = false;
  // Accounting negative in parentheses: (1,250.50)
  const parenMatch = str.match(/^\((.+)\)$/);
  if (parenMatch) {
    isNegative = true;
    str = parenMatch[1].trim();
  }

  // Trailing minus sign: 1,250-
  if (!isNegative && /^.+-$/.test(str) && /\d/.test(str)) {
    isNegative = true;
    str = str.slice(0, -1).trim();
  }

  // Strip common currency codes or UOM suffixes/prefixes when digits are present
  if (/\d/.test(str)) {
    str = str
      .replace(/^(?:SAR|SR|USD|AED|QTY|QUANTITY|NO|NOS)\s*[:.]?\s*/i, '')
      .replace(
        /\s*(?:EA|EACH|PCS?|PIECES?|BOX(?:ES)?|BX|VIALS?|TABS?|TABLETS?|CAPS?|CAPSULES?|PACKS?|PKTS?|PACKETS?|UNITS?|BTLS?|BOTTLES?|AMPS?|AMPOULES?|KITS?|ROLLS?|BAGS?|PENS?|TUBES?|PAIRS?|SETS?|NOS?|SYR(?:INGES?)?|SACHETS?|CANS?|TIN|SAR|SR|حبة|حبه|علبة|علبه|كرتون|عبوة)\.?$/i,
        ''
      )
      .trim();
  }

  // Remove internal spaces between digits (space-thousands separator like "1 250.50")
  const compact = str.replace(/(?<=\d)\s+(?=\d)/g, '').replace(/\s+/g, '');

  const normalizeSeparators = (token: string): string => {
    if (token.includes('.') && token.includes(',')) {
      if (token.lastIndexOf(',') > token.lastIndexOf('.')) {
        // European 1.250,50
        return token.replace(/\./g, '').replace(',', '.');
      }
      // Standard 1,250.50
      return token.replace(/,/g, '');
    }
    if (token.includes(',') && !token.includes('.')) {
      // Check if comma is clearly a decimal separator (single comma with 1-2 trailing digits, e.g. "12,5" or "12,50")
      if (/^[+-]?\d+,\d{1,2}$/.test(token)) {
        return token.replace(',', '.');
      }
      return token.replace(/,/g, '');
    }
    return token;
  };

  const normalized = normalizeSeparators(compact);
  if (/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
    const num = Number(normalized);
    if (Number.isFinite(num)) {
      const signed = isNegative ? -Math.abs(num) : num;
      return { value: signed === 0 ? 0 : signed, isEmptyOrDash: false };
    }
  }

  // Last-resort extraction for cells like "500 (Box)" or "~1,200" with exactly one numeric token
  const matches = str.match(/[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g);
  if (matches && matches.length === 1 && !/[/-]\d/.test(str)) {
    const parsed = Number(normalizeSeparators(matches[0]));
    if (Number.isFinite(parsed)) {
      const signed = isNegative ? -Math.abs(parsed) : parsed;
      return { value: signed === 0 ? 0 : signed, isEmptyOrDash: false };
    }
  }

  return { value: null, isEmptyOrDash: false };
}

function formatDateYMD(date: Date): string {
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function readWorksheetCell(cell: XLSX.CellObject | undefined): any {
  if (!cell || cell.t === 'z' || cell.t === 'e') return '';

  // True Date object (via cellDates: true)
  if (cell.v instanceof Date || cell.t === 'd') {
    const d = cell.v instanceof Date ? cell.v : new Date(cell.v as any);
    if (!isNaN(d.getTime())) {
      return formatDateYMD(d);
    }
    return cell.w ? String(cell.w).trim() : '';
  }

  // True Excel numeric cell -> preserve exact number (avoid raw:false turning 0 into "-" or narrow cells into "###")
  if (cell.t === 'n' && typeof cell.v === 'number' && Number.isFinite(cell.v)) {
    // Handle numeric Excel date serials that kept t='n' with a date number format
    if (
      cell.z &&
      typeof cell.z === 'string' &&
      /[dmy]/i.test(cell.z) &&
      !/[#0]\.[0#]/.test(cell.z) &&
      cell.w &&
      /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(cell.w)
    ) {
      return String(cell.w).trim();
    }
    // Strip tiny IEEE-754 floating point dust (e.g. 12.300000000000001 -> 12.3)
    const cleanNum = Number(cell.v.toPrecision(14));
    return Object.is(cleanNum, -0) ? 0 : cleanNum;
  }

  if (cell.t === 'b') {
    return Boolean(cell.v);
  }

  const text = cell.v !== undefined && cell.v !== null ? String(cell.v) : String(cell.w || '');
  return text.replace(/[\r\n\u00A0]+/g, ' ').trim();
}

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
 * 2. Reads raw cell values directly (preserving true numbers instead of formatted "-" / "###")
 * 3. Scans for the true header row (skipping title/metadata banners)
 * 4. Converts all subsequent rows into structured objects
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

  const ref = worksheet['!ref'];
  if (!ref) {
    return { headers: [], allRows: [], totalRows: 0 };
  }

  const range = XLSX.utils.decode_range(ref);
  const raw2D: any[][] = [];

  // 2. Read cell-by-cell preserving numeric & date accuracy
  for (let r = range.s.r; r <= range.e.r; r++) {
    const rowArr: any[] = [];
    let hasValue = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const val = readWorksheetCell(worksheet[addr]);
      rowArr.push(val);
      if (val !== '' && val !== undefined && val !== null) {
        hasValue = true;
      }
    }
    if (hasValue) {
      raw2D.push(rowArr);
    }
  }

  if (raw2D.length === 0) {
    return { headers: [], allRows: [], totalRows: 0 };
  }

  // 3. Find the real header row by scoring the first 25 non-empty rows
  let bestHeaderRowIndex = 0;
  let bestScore = -Infinity;
  const maxScanRows = Math.min(raw2D.length, 25);

  for (let r = 0; r < maxScanRows; r++) {
    const row = raw2D[r];
    if (!Array.isArray(row) || row.length === 0) continue;

    const nonEmptyCells = row.filter((c) => c !== '' && c !== null && c !== undefined);
    if (nonEmptyCells.length < 2) continue;

    let score = 0;
    let textLabelCount = 0;

    nonEmptyCells.forEach((cell) => {
      if (typeof cell === 'number') {
        score -= 2; // Data rows have numbers; headers don't
        return;
      }
      const str = String(cell).trim();
      if (/^[-+]?[\d,.\s]+$/.test(str)) {
        score -= 1;
        return;
      }
      if (str.length > 60) {
        score -= 1; // Long report title/notes banner
        return;
      }

      textLabelCount++;
      score += 2;

      const lower = str.toLowerCase();
      const lowerAlphaNum = lower.replace(/[^a-z0-9\u0600-\u06FF]/g, '');
      const hasKw = ERP_HEADER_KEYWORDS.some((kw) => {
        const cleanKw = kw.toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]/g, '');
        return cleanKw.length >= 2 && (lowerAlphaNum.includes(cleanKw) || lower.includes(kw));
      });
      if (hasKw) {
        score += 4;
      }
    });

    if (textLabelCount >= 2 && score > bestScore) {
      bestScore = score;
      bestHeaderRowIndex = r;
    }
  }

  // Extract cleaned headers from best header row
  const rawHeaderRow = raw2D[bestHeaderRowIndex] || [];
  const headers: string[] = [];
  const seenHeaders = new Set<string>();

  rawHeaderRow.forEach((cellVal: any, colIdx: number) => {
    let headerName = String(cellVal ?? '').replace(/[\r\n\u00A0]+/g, ' ').trim();
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

    const hasData = rowData.some(
      (val) => val !== null && val !== undefined && (typeof val === 'number' || String(val).trim() !== '')
    );
    if (!hasData) continue;

    const rowObj: Record<string, any> = {};
    headers.forEach((header, colIdx) => {
      const val = rowData[colIdx];
      if (typeof val === 'number') {
        rowObj[header] = val;
      } else {
        rowObj[header] = val !== undefined && val !== null ? String(val).trim() : '';
      }
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
  // Support .xlsx, .xls (BIFF8), .xls (HTML tables), .csv, and XML spreadsheets
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

function normalizeHeaderTokens(text: string): { clean: string; words: string[] } {
  const spaced = text
    .toLowerCase()
    .replace(/[_/\\|()-]+/g, ' ')
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    clean: spaced.replace(/\s+/g, ''),
    words: spaced ? spaced.split(' ') : [],
  };
}

/**
 * Scored, collision-free 1-to-1 heuristic column auto-mapping
 */
export function autoMapColumns(headers: string[], reportType?: ReportType): ColumnMappingResult {
  const mapping: ColumnMappingResult = {};
  headers.forEach((h) => {
    mapping[h] = 'ignore';
  });

  interface CandidateMatch {
    header: string;
    field: StandardField;
    score: number;
  }

  const candidates: CandidateMatch[] = [];

  headers.forEach((header) => {
    const { clean, words } = normalizeHeaderTokens(header);
    if (!clean) return;

    const looksLikeCost = words.some((w) => ['cost', 'price', 'rate', 'sar', 'value', 'amount'].includes(w));
    const looksLikeQty = words.some((w) =>
      ['qty', 'quantity', 'consumed', 'consumption', 'issued', 'dispensed', 'usage', 'balance', 'stock', 'الكمية', 'كمية', 'الاستهلاك'].includes(w)
    );
    const looksLikeDept = words.some((w) => ['dept', 'department', 'ward', 'clinic', 'القسم'].includes(w));

    STANDARD_FIELDS_DICTIONARY.forEach((def) => {
      // Collision guards
      if (def.key === 'unit' && (looksLikeCost || looksLikeQty)) return;
      if (def.key === 'category' && looksLikeDept) return;
      if (def.key === 'itemCode' && (words.includes('sno') || clean === 'sn' || clean === 'no')) return;

      let bestFieldScore = 0;

      def.aliases.forEach((alias) => {
        const { clean: cleanAlias, words: aliasWords } = normalizeHeaderTokens(alias);
        if (!cleanAlias) return;

        let score = 0;
        if (clean === cleanAlias) {
          score = 1000 + cleanAlias.length;
        } else if (
          aliasWords.length > 0 &&
          aliasWords.every((aw) => words.includes(aw))
        ) {
          score = 500 + aliasWords.length * 25 + cleanAlias.length;
        } else if (cleanAlias.length >= 4 && clean.includes(cleanAlias)) {
          score = 220 + cleanAlias.length * 3;
        } else if (clean.length >= 5 && cleanAlias.includes(clean) && words.every((w) => w.length >= 4)) {
          score = 120 + clean.length * 2;
        }

        if (score > 0 && def.key === 'quantity' && reportType === 'consumption') {
          if (/consum|issu|dispens|usage|quantity|qty|الكمية|الاستهلاك/.test(cleanAlias)) {
            score += 80;
          }
        }

        if (score > bestFieldScore) {
          bestFieldScore = score;
        }
      });

      // Fallback recognition for headers like "OCT CONSUMPTION" or "MONTHLY CONSUMPTION QTY"
      if (def.key === 'quantity' && bestFieldScore < 500 && looksLikeQty) {
        bestFieldScore = Math.max(bestFieldScore, 450);
      }

      if (bestFieldScore > 0) {
        candidates.push({ header, field: def.key, score: bestFieldScore });
      }
    });
  });

  // Sort highest-confidence matches first and assign 1-to-1
  candidates.sort((a, b) => b.score - a.score);
  const usedHeaders = new Set<string>();
  const usedFields = new Set<StandardField>();

  for (const c of candidates) {
    if (usedHeaders.has(c.header) || usedFields.has(c.field)) continue;
    mapping[c.header] = c.field;
    usedHeaders.add(c.header);
    usedFields.add(c.field);
  }

  return mapping;
}

/**
 * Detects Excel footer summary/total rows (e.g. "Total", "Grand Total", "Sub Total", "الإجمالي")
 * or completely blank item rows that should not cause validation errors or double-count totals.
 */
function isSummaryOrEmptyRow(
  row: Record<string, any>,
  standardToSource: Partial<Record<StandardField, string>>
): boolean {
  const codeSrc = standardToSource['itemCode'];
  const descSrc = standardToSource['itemDescription'];
  const codeVal = codeSrc ? String(row[codeSrc] ?? '').trim() : '';
  const descVal = descSrc ? String(row[descSrc] ?? '').trim() : '';

  const totalPattern = /^(grand\s*)?(total|sub\s*-?\s*total|sum|overall|net\s*total|الإجمالي|المجموع|الجملة)s?[:\s]*$/i;

  if (totalPattern.test(codeVal) || totalPattern.test(descVal)) {
    return true;
  }

  // If itemCode is mapped and empty, check if any text cell says Total / Grand Total or if all text metadata is empty
  if (codeSrc && !codeVal) {
    const anyTotalMarker = Object.values(row).some(
      (v) => typeof v === 'string' && /^(grand\s*total|sub\s*-?\s*total|total\b|الإجمالي|المجموع)/i.test(v.trim())
    );
    if (anyTotalMarker) return true;
    if (!descVal) return true;
  }

  return false;
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

  // Inverse mapping: StandardField -> source header (keep first mapped if duplicated manually)
  const standardToSource: Partial<Record<StandardField, string>> = {};
  for (const [sourceHeader, standardField] of Object.entries(columnMapping)) {
    if (standardField !== 'ignore' && !standardToSource[standardField]) {
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
    const parsed = parseSmartNumber(row[src]);
    return parsed.value !== null ? parsed.value : fallback;
  };

  // Tracking structures for smart multi-batch and multi-UOM aggregation
  const itemBatchCountMap = new Map<string, Set<string>>();
  const itemUomsMap = new Map<string, Set<string>>();
  const seenExactRecords = new Set<string>();

  let validatedRowCount = 0;
  let cleanRowCount = 0;
  let rowsWithErrorsCount = 0;
  let rowsWithWarningsCount = 0;
  let skippedSummaryRows = 0;
  const flaggedUomItems = new Set<string>();
  const convertedUomItems = new Set<string>();

  // Validate every data row
  rows.forEach((row, idx) => {
    if (isSummaryOrEmptyRow(row, standardToSource)) {
      skippedSummaryRows++;
      return;
    }

    validatedRowCount++;
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

    // 2. Quantity Check (supports numbers, formatted strings, Arabic digits, units, dashes/blanks as 0)
    const qtyHeader = standardToSource['quantity'];
    if (qtyHeader) {
      const rawVal = row[qtyHeader];
      const parsedQty = parseSmartNumber(rawVal);
      if (parsedQty.value === null) {
        issues.push({
          type: 'error',
          rowNumber: rowNum,
          field: 'quantity',
          message: `Row ${rowNum}: Quantity "${rawVal}" is not a valid number.`,
        });
        rowHasError = true;
      } else if (parsedQty.value < 0) {
        issues.push({
          type: 'warning',
          rowNumber: rowNum,
          field: 'quantity',
          message: `Row ${rowNum}: Negative quantity (${parsedQty.value}) for item "${itemCode}". Please verify return/credit transaction.`,
        });
        rowHasWarning = true;
      }
    }

    // 3. Multi-batch tracking & Exact duplicate detection
    if (itemCode) {
      if (!itemBatchCountMap.has(itemCode)) {
        itemBatchCountMap.set(itemCode, new Set());
      }
      if (batchNo) {
        itemBatchCountMap.get(itemCode)!.add(batchNo);
      }

      if (!itemUomsMap.has(itemCode)) {
        itemUomsMap.set(itemCode, new Set());
      }
      if (uom) {
        itemUomsMap.get(itemCode)!.add(normalizeUOMName(uom));
      }

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
    if (costHeader && row[costHeader] !== undefined && String(row[costHeader]).trim() !== '') {
      const parsedCost = parseSmartNumber(row[costHeader]);
      if (parsedCost.value === null || parsedCost.value < 0) {
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

  if (skippedSummaryRows > 0) {
    issues.unshift({
      type: 'warning',
      message: `Automatically excluded ${skippedSummaryRows} blank or summary/total footer row(s) to prevent double counting.`,
    });
  }

  // Check multi-UOM items for missing conversion factors
  itemUomsMap.forEach((uomSet, itemCode) => {
    if (uomSet.size > 1) {
      const uomArray = Array.from(uomSet);
      const baseUnit = uomArray.find(isBaseUnit) || uomArray[uomArray.length - 1];

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
  const successfullyImported = Math.max(0, validatedRowCount - rowsWithErrorsCount);

  return {
    isValid: !hasFatalErrors,
    totalRowsRead: rows.length,
    totalRowsValidated: validatedRowCount,
    cleanRows: cleanRowCount,
    rowsWithErrors: rowsWithErrorsCount,
    rowsWithWarnings: rowsWithWarningsCount,
    successfullyImportedRows: successfullyImported,
    multiBatchItemsCount,
    uomConvertedItemsCount: convertedUomItems.size,
    uomConversionRequiredCount: flaggedUomItems.size,
    issues: issues.slice(0, 100),
    missingRequiredFields: missingRequired,
  };
}

/**
 * Normalizes ALL validated rows into structured records while maintaining batch-level traceability
 * and guaranteeing finite numeric types for all quantity and value fields.
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
    if (standardField !== 'ignore' && !standardToSource[standardField]) {
      standardToSource[standardField] = sourceHeader;
    }
  }

  const getRowStr = (row: Record<string, any>, f: StandardField, fallback = ''): string => {
    const src = standardToSource[f];
    if (!src || row[src] === undefined || row[src] === null) return fallback;
    const s = String(row[src]).trim();
    return s === '' ? fallback : s;
  };

  const getRowNum = (row: Record<string, any>, f: StandardField, fallback = 0): number => {
    const src = standardToSource[f];
    if (!src || row[src] === undefined || row[src] === null) return fallback;
    const parsed = parseSmartNumber(row[src]);
    if (parsed.value !== null && Number.isFinite(parsed.value)) {
      return parsed.isEmptyOrDash ? fallback : parsed.value;
    }
    return fallback;
  };

  const validRows = rows.filter((r) => {
    if (isSummaryOrEmptyRow(r, standardToSource)) return false;
    return Boolean(getRowStr(r, 'itemCode'));
  });

  // 1. STOCK SNAPSHOTS (Batch-aware & UOM-aware)
  if (reportType === 'stock_snapshot') {
    const itemBaseUnitMap = new Map<string, string>();
    validRows.forEach((r) => {
      const code = getRowStr(r, 'itemCode');
      const uom = normalizeUOMName(getRowStr(r, 'unit', 'Unit'));
      if (code) {
        if (!itemBaseUnitMap.has(code)) {
          itemBaseUnitMap.set(code, uom);
        } else {
          const current = itemBaseUnitMap.get(code)!;
          if (!isBaseUnit(current) && isBaseUnit(uom)) {
            itemBaseUnitMap.set(code, uom);
          }
        }
      }
    });

    const snapshots: StockSnapshot[] = validRows.map((row, idx) => {
      const itemCode = getRowStr(row, 'itemCode');
      const itemDescription = getRowStr(row, 'itemDescription', itemCode);
      const category = getRowStr(row, 'category', 'General Medical Supplies');
      const rawQty = Number(getRowNum(row, 'quantity', 0)) || 0;
      const originalUnit = normalizeUOMName(getRowStr(row, 'unit', 'Unit'));
      const unitCost = Number(getRowNum(row, 'unitCost', 0)) || 0;
      const totalStockValue = Number(getRowNum(row, 'totalValue', rawQty * unitCost)) || 0;

      const batchNumber = getRowStr(row, 'batchNumber', `BATCH-${idx + 1}`);
      const expiryDate = getRowStr(row, 'expiryDate', '');

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
        quantityOnHand: rawQty,
        unit: originalUnit,
        unitCost,
        totalStockValue,
        stockStatus,
        batchNumber,
        expiryDate,
        convertedQuantity: Number(resolution.convertedQuantity) || 0,
        standardUnit: resolution.standardUnit,
        conversionFactor: resolution.factor,
        conversionStatus: resolution.status,
      };
    });

    return { stockSnapshots: snapshots };
  }

  // 2. CONSUMPTION RECORDS
  if (reportType === 'consumption') {
    const periodFallbackDate = reportingPeriod && reportingPeriod.match(/^\d{4}-\d{2}$/)
      ? `${reportingPeriod}-28`
      : new Date().toISOString().split('T')[0];

    const records: ConsumptionRecord[] = validRows.map((row, idx) => {
      const itemCode = getRowStr(row, 'itemCode');
      const itemDescription = getRowStr(row, 'itemDescription', itemCode);
      const category = getRowStr(row, 'category', 'General Medical Supplies');
      const quantityConsumed = Number(getRowNum(row, 'quantity', 0)) || 0;
      const unitCost = Number(getRowNum(row, 'unitCost', 0)) || 0;
      const totalVal = Number(getRowNum(row, 'totalValue', quantityConsumed * unitCost)) || 0;

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
    const records: ReceivingRecord[] = validRows.map((row, idx) => {
      const itemCode = getRowStr(row, 'itemCode');
      const itemDescription = getRowStr(row, 'itemDescription', itemCode);
      const quantityReceived = Number(getRowNum(row, 'quantity', 0)) || 0;
      const unitCost = Number(getRowNum(row, 'unitCost', 0)) || 0;
      const totalVal = Number(getRowNum(row, 'totalValue', quantityReceived * unitCost)) || 0;

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
    const records: ExpiryRecord[] = validRows.map((row, idx) => {
      const itemCode = getRowStr(row, 'itemCode');
      const itemDescription = getRowStr(row, 'itemDescription', itemCode);
      const expiryDateStr = getRowStr(
        row,
        'expiryDate',
        new Date(now.getTime() + 90 * 86400000).toISOString().split('T')[0]
      );
      const expiryDate = new Date(expiryDateStr);
      const diffDays = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
      const quantityRemaining = Number(getRowNum(row, 'quantity', 0)) || 0;
      const unitCost = Number(getRowNum(row, 'unitCost', 0)) || 0;
      const totalVal = Number(getRowNum(row, 'totalValue', quantityRemaining * unitCost)) || 0;

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
