export type ReportType = 'stock_snapshot' | 'consumption' | 'receiving_grn' | 'expiry_batch';

export type WarehouseCode = 'WH-01' | 'WH-02' | 'WH-03' | 'WH-04' | 'WH-05' | string;

export interface Warehouse {
  code: string;
  name: string;
  type: string;
  location: string;
  itemCount?: number;
  totalValueSAR?: number;
}

export interface ItemMaster {
  itemCode: string;
  itemDescription: string;
  category: string;
  unit: string;
  standardUnitCost: number; // in SAR
  minSafetyStock: number;
  maxStockLevel: number;
  reorderPoint: number;
  leadTimeDays: number;
}

export type StockStatus = 'normal' | 'low_stock' | 'overstock' | 'stockout' | 'non_moving';

export interface StockSnapshot {
  id: string;
  reportId?: string;
  snapshotDate: string;
  reportingPeriod: string;
  warehouseCode: string;
  warehouseName?: string;
  itemCode: string;
  itemDescription: string;
  category: string;
  quantityOnHand: number;
  unit: string;
  unitCost: number; // in SAR
  totalStockValue: number; // in SAR
  stockStatus: StockStatus;
  minSafetyStock?: number;
  maxStockLevel?: number;
  reorderPoint?: number;

  // Batch & UOM conversion fields
  batchNumber?: string;
  expiryDate?: string;
  convertedQuantity?: number;
  standardUnit?: string;
  conversionFactor?: number;
  conversionStatus?: 'converted' | 'same_unit' | 'conversion_required' | 'name_pattern_detected';
}

export interface ItemBatchDetail {
  id: string;
  reportId?: string;
  itemCode: string;
  batchNumber: string;
  expiryDate?: string;
  daysUntilExpiry?: number;
  originalQuantity: number;
  originalUnit: string;
  convertedQuantity: number;
  standardUnit: string;
  conversionFactor: number;
  conversionStatus: 'converted' | 'same_unit' | 'conversion_required' | 'name_pattern_detected';
  unitCost: number; // per original unit or base unit
  totalValueSAR: number;
  warehouseCode: string;
  reportingPeriod: string;
  snapshotDate: string;
}

export interface AggregatedInventoryItem {
  itemCode: string;
  itemDescription: string;
  category: string;
  warehouseCode: string;
  reportingPeriod: string;
  snapshotDate: string;
  totalQuantity: number; // in standardized UOM
  standardUnit: string;
  batchCount: number;
  totalStockValueSAR: number;
  earliestExpiryDate?: string;
  earliestExpiryDays?: number;
  batches: ItemBatchDetail[];
  stockStatus: StockStatus;
  conversionRequired?: boolean;
  namePatternFactor?: number;
  monthlyConsumption?: number;
  isNonMoving30Days?: boolean;
  isOverstock90Days?: boolean;
}

export interface UOMConversionRule {
  id: string;
  itemCode: string; // item specific code or '*' for global
  itemDescription?: string;
  fromUnit: string; // e.g. 'Box', 'Carton', 'Pack'
  toUnit: string; // base unit, e.g. 'Piece', 'Unit', 'Tablet', 'Vial'
  factor: number; // 1 fromUnit = factor toUnits. E.g. 1 Box = 10 Pieces -> factor: 10
  source: 'admin' | 'name_pattern' | 'default';
  updatedAt: string;
}


export interface ConsumptionRecord {
  id: string;
  reportId?: string;
  transactionDate: string;
  reportingPeriod: string;
  warehouseCode: string;
  itemCode: string;
  itemDescription: string;
  category: string;
  department: string;
  quantityConsumed: number;
  unit: string;
  unitCost: number; // in SAR
  totalConsumptionValue: number; // in SAR
  issueVoucherNumber: string;
}

export interface ReceivingRecord {
  id: string;
  reportId?: string;
  grnNumber: string;
  prNumber: string;
  poNumber?: string;
  receiptDate: string;
  reportingPeriod: string;
  warehouseCode: string;
  itemCode: string;
  itemDescription: string;
  category: string;
  supplierName: string;
  quantityReceived: number;
  unit: string;
  unitCost: number; // in SAR
  totalReceivedValue: number; // in SAR
  inspectionStatus: 'Accepted' | 'Pending Inspection' | 'Rejected';
}

export type ExpiryRiskLevel = 'expired' | 'critical_30' | 'warning_60' | 'notice_90' | 'safe';

export interface ExpiryRecord {
  id: string;
  reportId?: string;
  warehouseCode: string;
  itemCode: string;
  itemDescription: string;
  category: string;
  batchNumber: string;
  expiryDate: string;
  daysUntilExpiry: number;
  quantityRemaining: number;
  unit: string;
  unitCost: number; // in SAR
  totalValueAtRisk: number; // in SAR
  riskLevel: ExpiryRiskLevel;
}

export interface UploadedReport {
  id: string;
  filename: string;
  reportType: ReportType;
  warehouseCode: string;
  reportingPeriod: string;
  fileSizeBytes: number;
  totalRowsImported: number;
  validationStatus: 'completed' | 'processing' | 'failed' | 'warnings';
  validationErrors?: string[];
  uploadedAt: string;
  isDemo?: boolean;
}

export type StandardField =
  | 'itemCode'
  | 'itemDescription'
  | 'category'
  | 'warehouse'
  | 'quantity'
  | 'unit'
  | 'unitCost'
  | 'totalValue'
  | 'transactionDate'
  | 'reportingPeriod'
  | 'supplier'
  | 'department'
  | 'batchNumber'
  | 'expiryDate'
  | 'grnNumber'
  | 'prNumber';

export interface FieldDefinition {
  key: StandardField;
  label: string;
  description: string;
  requiredFor: ReportType[];
  type: 'string' | 'number' | 'date';
  aliases: string[];
}

export interface ColumnMappingResult {
  [sourceHeader: string]: StandardField | 'ignore';
}

export interface KPISummary {
  totalItems: number;
  totalStockValueSAR: number;
  lowStockItemsCount: number;
  nearExpiryItemsCount: number;
  overstockItemsCount: number;
  
  // Specific requested non-moving and 90-day overstock calculations
  nonMoving30DaysCount: number;
  nonMoving30DaysValueSAR: number;
  overstock90DaysCount: number;
  overstock90DaysValueSAR: number;

  // Specific requested monthly KPI flows
  monthlyReceivingAmountSAR: number;
  monthlyIssuingAmountSAR: number;
  grnDoneCount: number;
  prRaisedCount: number;
  itemsReceivedCount: number;
}

export interface StockRecommendation {
  id: string;
  type: 'urgent_reorder' | 'overstock_liquidation' | 'inter_warehouse_transfer' | 'fefo_priority_dispatch' | 'slow_moving_alert';
  severity: 'critical' | 'high' | 'medium' | 'info';
  title: string;
  itemCode: string;
  itemDescription: string;
  warehouseCode: string;
  details: string;
  impactSAR: number;
  actionableStep: string;
  metrics: {
    currentStock: number;
    recommendedStock?: number;
    runRateDaily?: number;
    daysCoverage?: number;
  };
}

export interface ExecutiveSummaryResponse {
  summaryTitle: string;
  reportingPeriod: string;
  generatedAt: string;
  keyFacts: {
    totalValuationSAR: number;
    criticalLowStockItems: number;
    expiryRiskValuationSAR: number;
    overstockCapitalTiedSAR: number;
    monthlyBurnRateSAR: number;
    netInventoryFlowSAR: number; // Receiving SAR - Issuing SAR
  };
  executiveNarrative: string;
  highConsumptionHighlights: string[];
  stockRiskAlerts: string[];
  fefoActionPoints: string[];
  procurementRecommendations: string[];
}
