import { UOMConversionRule } from '../types/warehouse';

/**
 * Normalizes common medical UOM labels for consistency (e.g. 'pcs', 'Pieces', 'PIECE' -> 'Piece')
 */
export function normalizeUOMName(uom: string): string {
  if (!uom) return 'Unit';
  const clean = uom.trim();
  const lower = clean.toLowerCase();

  if (['piece', 'pieces', 'pcs', 'pc', 'ea', 'each'].includes(lower)) return 'Piece';
  if (['box', 'boxes', 'bx'].includes(lower)) return 'Box';
  if (['carton', 'cartons', 'ctn', 'crt'].includes(lower)) return 'Carton';
  if (['pack', 'packs', 'pkg', 'pk'].includes(lower)) return 'Pack';
  if (['tablet', 'tablets', 'tab', 'tabs'].includes(lower)) return 'Tablet';
  if (['vial', 'vials', 'vil'].includes(lower)) return 'Vial';
  if (['ampoule', 'ampoules', 'amp', 'amps'].includes(lower)) return 'Ampoule';
  if (['bottle', 'bottles', 'btl'].includes(lower)) return 'Bottle';
  if (['sachet', 'sachets', 'sct'].includes(lower)) return 'Sachet';
  if (['strip', 'strips', 'stp'].includes(lower)) return 'Strip';
  if (['syringe', 'syringes', 'syr'].includes(lower)) return 'Syringe';
  if (['unit', 'units', 'unt'].includes(lower)) return 'Unit';
  if (['roll', 'rolls', 'rol'].includes(lower)) return 'Roll';
  if (['kit', 'kits'].includes(lower)) return 'Kit';

  // Return capitalized
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Checks if a unit is considered a smaller "base" or "each" unit (e.g., Piece, Tablet, Vial)
 */
export function isBaseUnit(uom: string): boolean {
  const norm = normalizeUOMName(uom).toLowerCase();
  return ['piece', 'tablet', 'vial', 'ampoule', 'unit', 'sachet', 'syringe', 'dose'].includes(norm);
}

/**
 * Detects hospital ERP embedded conversion tricks in the item description.
 * Specifically:
 * - (#5) means 1 Box/Pack = 5 units
 * - (#1) means 1 Box/Pack = 1 unit
 * - (#10), (#100), etc.
 * Also handles patterns like "Box of 20", "10 tabs", "(# 50)"
 */
export function detectNameConversionFactor(itemDescription: string): {
  factor: number;
  rawMatch: string;
} | null {
  if (!itemDescription) return null;

  // 1. Primary rule specified by user: (#5) -> box = 5 units, (#1) -> box = 1 unit
  const parenthesizedHashRegex = /\(#\s*(\d+(?:\.\d+)?)\s*\)/i;
  const matchHash = itemDescription.match(parenthesizedHashRegex);
  if (matchHash && matchHash[1]) {
    const factor = parseFloat(matchHash[1]);
    if (!isNaN(factor) && factor > 0) {
      return { factor, rawMatch: matchHash[0] };
    }
  }

  // 2. Direct hashtag: e.g. #5 or #10
  const plainHashRegex = /(?:^|\s)#\s*(\d+(?:\.\d+)?)(?:\s|$|\))/i;
  const matchPlainHash = itemDescription.match(plainHashRegex);
  if (matchPlainHash && matchPlainHash[1]) {
    const factor = parseFloat(matchPlainHash[1]);
    if (!isNaN(factor) && factor > 0) {
      return { factor, rawMatch: matchPlainHash[0].trim() };
    }
  }

  // 3. "Box of 10" or "Pack of 50"
  const boxOfRegex = /\b(?:box|pack|carton)\s+of\s+(\d+(?:\.\d+)?)\b/i;
  const matchBoxOf = itemDescription.match(boxOfRegex);
  if (matchBoxOf && matchBoxOf[1]) {
    const factor = parseFloat(matchBoxOf[1]);
    if (!isNaN(factor) && factor > 0) {
      return { factor, rawMatch: matchBoxOf[0] };
    }
  }

  return null;
}

/**
 * Default global hospital UOM conversion relationships (can be overridden by item-specific admin rules)
 */
export const DEFAULT_GLOBAL_UOM_RULES: UOMConversionRule[] = [
  {
    id: 'DEF-CARTON-BOX',
    itemCode: '*',
    itemDescription: 'Standard Carton to Box (Default)',
    fromUnit: 'Carton',
    toUnit: 'Box',
    factor: 10,
    source: 'default',
    updatedAt: '2026-11-05',
  },
  {
    id: 'DEF-BOX-PIECE',
    itemCode: '*',
    itemDescription: 'Standard Box to Piece (Default)',
    fromUnit: 'Box',
    toUnit: 'Piece',
    factor: 10,
    source: 'default',
    updatedAt: '2026-11-05',
  },
  {
    id: 'DEF-PACK-TABLET',
    itemCode: '*',
    itemDescription: 'Standard Pack to Tablet (Default)',
    fromUnit: 'Pack',
    toUnit: 'Tablet',
    factor: 10,
    source: 'default',
    updatedAt: '2026-11-05',
  },
  {
    id: 'DEF-STRIP-TABLET',
    itemCode: '*',
    itemDescription: 'Standard Strip to Tablet (Default)',
    fromUnit: 'Strip',
    toUnit: 'Tablet',
    factor: 10,
    source: 'default',
    updatedAt: '2026-11-05',
  },
];

export interface ConversionResolution {
  convertedQuantity: number;
  standardUnit: string;
  factor: number;
  status: 'same_unit' | 'converted' | 'name_pattern_detected' | 'conversion_required';
  explanation: string;
}

/**
 * Resolves conversion for an item quantity into the standardized base unit.
 *
 * Rules:
 * 1. If fromUnit equals targetBaseUnit: no conversion required (factor = 1).
 * 2. Item-specific Admin Rule (itemCode matches): highest priority.
 * 3. Item Name embedded pattern (#5, #1, #10): high priority.
 * 4. Global Admin Rule (itemCode = '*'): medium priority.
 * 5. If missing or ambiguous: status = 'conversion_required'. Do NOT guess!
 */
export function resolveUOMConversion(
  itemCode: string,
  itemDescription: string,
  fromUnit: string,
  targetBaseUnit: string,
  quantity: number,
  adminRules: UOMConversionRule[] = []
): ConversionResolution {
  const normFrom = normalizeUOMName(fromUnit);
  const normTarget = normalizeUOMName(targetBaseUnit);

  // 1. Identical units
  if (normFrom.toLowerCase() === normTarget.toLowerCase()) {
    return {
      convertedQuantity: quantity,
      standardUnit: normTarget,
      factor: 1,
      status: 'same_unit',
      explanation: `Units match (${normFrom}). Summed directly.`,
    };
  }

  // 2. Check Item-Specific Admin Rule
  const specificRule = adminRules.find(
    (r) =>
      r.itemCode.trim().toLowerCase() === itemCode.trim().toLowerCase() &&
      normalizeUOMName(r.fromUnit).toLowerCase() === normFrom.toLowerCase() &&
      normalizeUOMName(r.toUnit).toLowerCase() === normTarget.toLowerCase()
  );

  if (specificRule && specificRule.factor > 0) {
    return {
      convertedQuantity: quantity * specificRule.factor,
      standardUnit: normTarget,
      factor: specificRule.factor,
      status: 'converted',
      explanation: `Converted using Admin item-specific rule (1 ${normFrom} = ${specificRule.factor} ${normTarget}).`,
    };
  }

  // 3. Check Name Pattern trick: (#5), (#1), (#10), etc.
  const namePattern = detectNameConversionFactor(itemDescription);
  if (namePattern && namePattern.factor > 0) {
    // If fromUnit is a packaging unit (Box, Pack, Carton) and target is base unit
    if (!isBaseUnit(normFrom) || normFrom === 'Box' || normFrom === 'Pack') {
      const factor = namePattern.factor;
      return {
        convertedQuantity: quantity * factor,
        standardUnit: normTarget,
        factor,
        status: 'name_pattern_detected',
        explanation: `Detected "${namePattern.rawMatch}" in item name: 1 ${normFrom} = ${factor} ${normTarget}.`,
      };
    }
  }

  // 4. Check Global Admin Rule
  const globalRule = adminRules.find(
    (r) =>
      r.itemCode === '*' &&
      normalizeUOMName(r.fromUnit).toLowerCase() === normFrom.toLowerCase() &&
      normalizeUOMName(r.toUnit).toLowerCase() === normTarget.toLowerCase()
  );

  if (globalRule && globalRule.factor > 0) {
    return {
      convertedQuantity: quantity * globalRule.factor,
      standardUnit: normTarget,
      factor: globalRule.factor,
      status: 'converted',
      explanation: `Converted using standard hospital unit ratio (1 ${normFrom} = ${globalRule.factor} ${normTarget}).`,
    };
  }

  // 5. Missing / Ambiguous: Do NOT guess! Flag as conversion required.
  return {
    convertedQuantity: quantity,
    standardUnit: normFrom, // Keep original
    factor: 1,
    status: 'conversion_required',
    explanation: `Missing conversion factor between "${normFrom}" and "${normTarget}". Admin configuration required.`,
  };
}
