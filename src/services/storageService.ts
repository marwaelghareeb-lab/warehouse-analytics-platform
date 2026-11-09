import {
  StockSnapshot,
  ConsumptionRecord,
  ReceivingRecord,
  ExpiryRecord,
  UploadedReport,
  KPISummary,
  StockRecommendation,
  Warehouse,
  AggregatedInventoryItem,
  ItemBatchDetail,
  UOMConversionRule,
  StockStatus,
} from '../types/warehouse';
import {
  DEMO_WAREHOUSES,
  DEMO_STOCK_SNAPSHOTS,
  DEMO_CONSUMPTION,
  DEMO_RECEIVING,
  DEMO_EXPIRY_RECORDS,
  DEMO_UPLOADED_REPORTS,
  DEMO_RECOMMENDATIONS,
} from '../data/demoData';
import {
  DEFAULT_GLOBAL_UOM_RULES,
  resolveUOMConversion,
  detectNameConversionFactor,
  isBaseUnit,
} from '../utils/uomConverter';

const STORAGE_KEYS = {
  STOCK: 'wh_analytics_stock_v2',
  CONSUMPTION: 'wh_analytics_consumption_v2',
  RECEIVING: 'wh_analytics_receiving_v2',
  EXPIRY: 'wh_analytics_expiry_v2',
  REPORTS: 'wh_analytics_reports_v2',
  UOM_RULES: 'wh_analytics_uom_rules_v2',
  IS_DEMO: 'wh_analytics_is_demo_v2',
};

type Listener = () => void;
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

class StorageService {
  private warehouses: Warehouse[] = DEMO_WAREHOUSES;
  private stockSnapshots: StockSnapshot[] = [];
  private consumptionRecords: ConsumptionRecord[] = [];
  private receivingRecords: ReceivingRecord[] = [];
  private expiryRecords: ExpiryRecord[] = [];
  private uploadedReports: UploadedReport[] = [];
  private uomConversions: UOMConversionRule[] = DEFAULT_GLOBAL_UOM_RULES;
  private isDemoMode: boolean = true;
  private selectedWarehouse: string = 'ALL';
  private selectedPeriod: string = '2026-10';
  private inventoryStatusFilter: string = 'ALL';
  private customPageTitle: string | null = null;

  constructor() {
    this.init();
  }

  private init() {
    try {
      const storedReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
      const isDemoStored = localStorage.getItem(STORAGE_KEYS.IS_DEMO);
      const storedUomRules = localStorage.getItem(STORAGE_KEYS.UOM_RULES);

      if (storedUomRules) {
        this.uomConversions = JSON.parse(storedUomRules);
      } else {
        this.uomConversions = [...DEFAULT_GLOBAL_UOM_RULES];
      }

      if (storedReports) {
        this.uploadedReports = JSON.parse(storedReports);
        this.stockSnapshots = JSON.parse(localStorage.getItem(STORAGE_KEYS.STOCK) || '[]');
        this.consumptionRecords = JSON.parse(localStorage.getItem(STORAGE_KEYS.CONSUMPTION) || '[]');
        this.receivingRecords = JSON.parse(localStorage.getItem(STORAGE_KEYS.RECEIVING) || '[]');
        this.expiryRecords = JSON.parse(localStorage.getItem(STORAGE_KEYS.EXPIRY) || '[]');
        this.isDemoMode = isDemoStored !== null ? JSON.parse(isDemoStored) : false;
      } else {
        // Load default demo data
        this.loadDemoData();
      }
    } catch (e) {
      console.warn('Could not load from localStorage, initializing demo data:', e);
      this.loadDemoData();
    }
  }

  public loadDemoData() {
    this.warehouses = DEMO_WAREHOUSES;
    this.stockSnapshots = [...DEMO_STOCK_SNAPSHOTS];
    this.consumptionRecords = [...DEMO_CONSUMPTION];
    this.receivingRecords = [...DEMO_RECEIVING];
    this.expiryRecords = [...DEMO_EXPIRY_RECORDS];
    this.uploadedReports = [...DEMO_UPLOADED_REPORTS];
    this.uomConversions = [...DEFAULT_GLOBAL_UOM_RULES];
    this.isDemoMode = true;
    this.persist();
    notify();
  }

  public clearAllData() {
    this.stockSnapshots = [];
    this.consumptionRecords = [];
    this.receivingRecords = [];
    this.expiryRecords = [];
    this.uploadedReports = [];
    this.isDemoMode = false;
    this.persist();
    notify();
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEYS.REPORTS, JSON.stringify(this.uploadedReports));
      localStorage.setItem(STORAGE_KEYS.STOCK, JSON.stringify(this.stockSnapshots));
      localStorage.setItem(STORAGE_KEYS.CONSUMPTION, JSON.stringify(this.consumptionRecords));
      localStorage.setItem(STORAGE_KEYS.RECEIVING, JSON.stringify(this.receivingRecords));
      localStorage.setItem(STORAGE_KEYS.EXPIRY, JSON.stringify(this.expiryRecords));
      localStorage.setItem(STORAGE_KEYS.UOM_RULES, JSON.stringify(this.uomConversions));
      localStorage.setItem(STORAGE_KEYS.IS_DEMO, JSON.stringify(this.isDemoMode));
    } catch (e) {
      console.warn('Storage persistence failed', e);
    }
  }

  public subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  public getIsDemoMode(): boolean {
    return this.isDemoMode;
  }

  public setIsDemoMode(val: boolean) {
    this.isDemoMode = val;
    this.persist();
    notify();
  }

  public getSelectedWarehouse(): string {
    return this.selectedWarehouse;
  }

  public setSelectedWarehouse(wh: string) {
    this.selectedWarehouse = wh;
    notify();
  }

  public getSelectedPeriod(): string {
    return this.selectedPeriod;
  }

  public setSelectedPeriod(period: string) {
    this.selectedPeriod = period;
    notify();
  }

  public getInventoryStatusFilter(): string {
    return this.inventoryStatusFilter;
  }

  public setInventoryStatusFilter(filter: string) {
    this.inventoryStatusFilter = filter;
    notify();
  }

  public getCustomPageTitle(): string | null {
    return this.customPageTitle;
  }

  public setCustomPageTitle(title: string | null) {
    this.customPageTitle = title;
    notify();
  }

  public getWarehouses(): Warehouse[] {
    return this.warehouses;
  }

  public getUploadedReports(): UploadedReport[] {
    return this.uploadedReports;
  }

  public deleteReport(reportId: string) {
    this.uploadedReports = this.uploadedReports.filter((r) => r.id !== reportId);
    this.stockSnapshots = this.stockSnapshots.filter((s) => s.reportId !== reportId);
    this.consumptionRecords = this.consumptionRecords.filter((c) => c.reportId !== reportId);
    this.receivingRecords = this.receivingRecords.filter((r) => r.reportId !== reportId);
    this.expiryRecords = this.expiryRecords.filter((e) => e.reportId !== reportId);

    // If all reports deleted, reset demo mode flag
    if (this.uploadedReports.length === 0) {
      this.isDemoMode = false;
    }
    this.persist();
    notify();
  }

  public reprocessReport(reportId: string) {
    const report = this.uploadedReports.find((r) => r.id === reportId);
    if (!report) return;

    report.validationStatus = 'completed';
    report.validationErrors = [];
    this.persist();
    notify();
  }

  // UOM Conversion Rules Management
  public getUOMConversions(): UOMConversionRule[] {
    return this.uomConversions;
  }

  public saveUOMConversion(rule: UOMConversionRule): void {
    const existingIdx = this.uomConversions.findIndex(
      (r) =>
        r.id === rule.id ||
        (r.itemCode.toLowerCase() === rule.itemCode.toLowerCase() &&
          r.fromUnit.toLowerCase() === rule.fromUnit.toLowerCase() &&
          r.toUnit.toLowerCase() === rule.toUnit.toLowerCase())
    );

    if (existingIdx >= 0) {
      this.uomConversions[existingIdx] = {
        ...this.uomConversions[existingIdx],
        ...rule,
        updatedAt: new Date().toISOString().split('T')[0],
      };
    } else {
      this.uomConversions = [
        {
          ...rule,
          id: rule.id || `UOM-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          updatedAt: new Date().toISOString().split('T')[0],
        },
        ...this.uomConversions,
      ];
    }
    this.persist();
    notify();
  }

  public deleteUOMConversion(ruleId: string): void {
    this.uomConversions = this.uomConversions.filter((r) => r.id !== ruleId);
    this.persist();
    notify();
  }

  /**
   * Adds imported data preserving full batch traceability and preventing accidental double counting.
   * Replaces fictional demo data when real reports are imported.
   */
  public addImportedData(params: {
    report: UploadedReport;
    stockSnapshots?: StockSnapshot[];
    consumptionRecords?: ConsumptionRecord[];
    receivingRecords?: ReceivingRecord[];
    expiryRecords?: ExpiryRecord[];
    replaceDemoData?: boolean;
  }) {
    // If replaceDemoData is true or if we are currently in demo mode:
    const shouldWipeDemo = params.replaceDemoData ?? this.isDemoMode;

    if (shouldWipeDemo) {
      // Clear fictional sample dataset so real ERP items are 100% pure
      this.stockSnapshots = [];
      this.consumptionRecords = [];
      this.receivingRecords = [];
      this.expiryRecords = [];
      this.uploadedReports = [];
    }

    // Switch off demo mode once user imports real data
    this.isDemoMode = false;

    // Upsert report record
    this.uploadedReports = [params.report, ...this.uploadedReports.filter((r) => r.id !== params.report.id)];

    if (params.stockSnapshots && params.stockSnapshots.length > 0) {
      const newReportId = params.report.id;
      const filteredExisting = this.stockSnapshots.filter(
        (s) => s.reportId !== newReportId
      );
      // Append all new batch snapshots (hundreds or thousands of records)
      this.stockSnapshots = [...params.stockSnapshots, ...filteredExisting];
    }

    if (params.consumptionRecords && params.consumptionRecords.length > 0) {
      const filteredExisting = this.consumptionRecords.filter(
        (c) => c.reportId !== params.report.id
      );
      this.consumptionRecords = [...params.consumptionRecords, ...filteredExisting];
    }

    if (params.receivingRecords && params.receivingRecords.length > 0) {
      const filteredExisting = this.receivingRecords.filter(
        (r) => r.reportId !== params.report.id
      );
      this.receivingRecords = [...params.receivingRecords, ...filteredExisting];
    }

    if (params.expiryRecords && params.expiryRecords.length > 0) {
      const filteredExisting = this.expiryRecords.filter(
        (e) => e.reportId !== params.report.id
      );
      this.expiryRecords = [...params.expiryRecords, ...filteredExisting];
    }

    // Auto-align selected period with the imported report
    if (params.report.reportingPeriod) {
      this.selectedPeriod = params.report.reportingPeriod;
    }
    // Set warehouse filter to ALL so all imported records are visible immediately
    this.selectedWarehouse = 'ALL';

    this.persist();
    notify();
  }

  // Raw Filtered Queries
  public getStockSnapshots(): StockSnapshot[] {
    return this.stockSnapshots.filter((s) => {
      const matchWh = this.selectedWarehouse === 'ALL' || s.warehouseCode === this.selectedWarehouse;
      const matchPeriod = this.selectedPeriod === 'ALL' || s.reportingPeriod === this.selectedPeriod;
      return matchWh && matchPeriod;
    });
  }

  public getConsumptionRecords(): ConsumptionRecord[] {
    return this.consumptionRecords.filter((c) => {
      const matchWh = this.selectedWarehouse === 'ALL' || c.warehouseCode === this.selectedWarehouse;
      const matchPeriod = this.selectedPeriod === 'ALL' || c.reportingPeriod === this.selectedPeriod;
      return matchWh && matchPeriod;
    });
  }

  public getReceivingRecords(): ReceivingRecord[] {
    return this.receivingRecords.filter((r) => {
      const matchWh = this.selectedWarehouse === 'ALL' || r.warehouseCode === this.selectedWarehouse;
      const matchPeriod = this.selectedPeriod === 'ALL' || r.reportingPeriod === this.selectedPeriod;
      return matchWh && matchPeriod;
    });
  }

  public getExpiryRecords(): ExpiryRecord[] {
    const directExpiries = this.expiryRecords.filter((e) => {
      return this.selectedWarehouse === 'ALL' || e.warehouseCode === this.selectedWarehouse;
    });

    // If explicit expiry reports exist, return them
    if (directExpiries.length > 0) {
      return directExpiries;
    }

    // Otherwise, synthesize expiry records directly from on-hand stock snapshot batches that have an expiry date!
    const aggregated = this.getAggregatedInventory();
    const synthesized: ExpiryRecord[] = [];
    const now = new Date();

    aggregated.forEach((item) => {
      item.batches.forEach((b, idx) => {
        if (!b.expiryDate) return;
        const expDate = new Date(b.expiryDate);
        if (isNaN(expDate.getTime())) return;

        const diffDays = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 3600 * 24));
        let riskLevel: 'expired' | 'critical_30' | 'warning_60' | 'notice_90' | 'safe' = 'safe';
        if (diffDays <= 0) riskLevel = 'expired';
        else if (diffDays <= 30) riskLevel = 'critical_30';
        else if (diffDays <= 60) riskLevel = 'warning_60';
        else if (diffDays <= 90) riskLevel = 'notice_90';

        synthesized.push({
          id: b.id || `SYN-EXP-${item.itemCode}-${idx}`,
          reportId: b.reportId,
          warehouseCode: b.warehouseCode || item.warehouseCode,
          itemCode: item.itemCode,
          itemDescription: item.itemDescription,
          category: item.category,
          batchNumber: b.batchNumber || `LOT-${idx + 1}`,
          expiryDate: b.expiryDate,
          daysUntilExpiry: diffDays,
          quantityRemaining: b.originalQuantity,
          unit: b.originalUnit,
          unitCost: b.unitCost,
          totalValueAtRisk: b.totalValueSAR,
          riskLevel,
        });
      });
    });

    // Sort by earliest expiring (FEFO order)
    return synthesized.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  }

  /**
   * Smart Item Aggregation Across Multiple Batches with Automatic UOM Conversion
   */
  public getAggregatedInventory(targetWarehouse?: string, targetPeriod?: string): AggregatedInventoryItem[] {
    const wh = targetWarehouse !== undefined ? targetWarehouse : this.selectedWarehouse;
    const period = targetPeriod !== undefined ? targetPeriod : this.selectedPeriod;

    const filtered = this.stockSnapshots.filter((s) => {
      const matchWh = wh === 'ALL' || s.warehouseCode === wh;
      const matchPeriod = period === 'ALL' || s.reportingPeriod === period;
      return matchWh && matchPeriod;
    });

    // Group rows strictly by itemCode so an item repeated across batches or warehouses is 1 unique SKU
    const itemGroups = new Map<string, StockSnapshot[]>();
    filtered.forEach((s) => {
      const key = s.itemCode;
      if (!itemGroups.has(key)) {
        itemGroups.set(key, []);
      }
      itemGroups.get(key)!.push(s);
    });

    const aggregatedList: AggregatedInventoryItem[] = [];

    // Build monthly consumption map for active period/warehouse
    const consumptions = this.getConsumptionRecords();
    const itemMonthlyConsumptionMap = new Map<string, number>();
    consumptions.forEach((c) => {
      const current = itemMonthlyConsumptionMap.get(c.itemCode) || 0;
      itemMonthlyConsumptionMap.set(c.itemCode, current + (c.quantityConsumed || 0));
    });

    itemGroups.forEach((batchRows) => {
      if (batchRows.length === 0) return;
      const first = batchRows[0];
      const itemCode = first.itemCode;
      const itemDescription = first.itemDescription || itemCode;
      const category = first.category || 'General Medical Supplies';
      const warehouseCode = first.warehouseCode;
      const reportingPeriod = first.reportingPeriod;
      const snapshotDate = first.snapshotDate;

      // Detect (#5) or (#1) name pattern in item description
      const namePattern = detectNameConversionFactor(itemDescription);
      const namePatternFactor = namePattern ? namePattern.factor : undefined;

      // Determine the standardized target base unit:
      // Prefer base unit (Piece, Tablet, Vial, Unit), or first unit
      const allUnits = batchRows.map((b) => b.standardUnit || b.unit || 'Unit');
      const standardUnit = allUnits.find(isBaseUnit) || allUnits[0] || 'Unit';

      // Build batch details & calculate converted quantities
      const batches: ItemBatchDetail[] = batchRows.map((b, idx) => {
        const origQty = b.quantityOnHand || 0;
        const origUnit = b.unit || 'Unit';
        const batchNum = b.batchNumber || `B-${idx + 1}`;
        const expiryDate = b.expiryDate || '';

        let daysUntilExpiry: number | undefined = undefined;
        if (expiryDate && !isNaN(Date.parse(expiryDate))) {
          const now = new Date();
          daysUntilExpiry = Math.ceil((new Date(expiryDate).getTime() - now.getTime()) / (1000 * 3600 * 24));
        }

        // Resolve UOM conversion
        const resolution = resolveUOMConversion(
          itemCode,
          itemDescription,
          origUnit,
          standardUnit,
          origQty,
          this.uomConversions
        );

        const convertedQty = resolution.convertedQuantity;
        const unitCost = b.unitCost || 0;
        const totalValueSAR =
          b.totalStockValue !== undefined && b.totalStockValue !== null
            ? b.totalStockValue
            : origQty * unitCost;

        return {
          id: b.id || `BATCH-${itemCode}-${idx}`,
          reportId: b.reportId,
          itemCode,
          batchNumber: batchNum,
          expiryDate: expiryDate || undefined,
          daysUntilExpiry,
          originalQuantity: origQty,
          originalUnit: origUnit,
          convertedQuantity: convertedQty,
          standardUnit: resolution.standardUnit,
          conversionFactor: resolution.factor,
          conversionStatus: resolution.status,
          unitCost,
          totalValueSAR,
          warehouseCode: b.warehouseCode,
          reportingPeriod: b.reportingPeriod,
          snapshotDate: b.snapshotDate,
        };
      });

      // Sum aggregated quantities in standardized base unit
      const totalQuantity = batches.reduce((sum, b) => sum + b.convertedQuantity, 0);
      const totalStockValueSAR = batches.reduce((sum, b) => sum + b.totalValueSAR, 0);
      const batchCount = batches.length;

      // Find earliest expiry date
      const batchesWithExpiry = batches.filter((b) => b.expiryDate && !isNaN(Date.parse(b.expiryDate)));
      batchesWithExpiry.sort((a, b) => new Date(a.expiryDate!).getTime() - new Date(b.expiryDate!).getTime());
      const earliest = batchesWithExpiry[0];
      const earliestExpiryDate = earliest ? earliest.expiryDate : undefined;
      const earliestExpiryDays = earliest ? earliest.daysUntilExpiry : undefined;

      // Check if any batch needs UOM configuration
      const conversionRequired = batches.some((b) => b.conversionStatus === 'conversion_required');

      // Calculate monthly consumption for this item
      const monthlyConsumed = itemMonthlyConsumptionMap.get(itemCode) || 0;
      const isNonMoving30Days = totalQuantity > 0 && monthlyConsumed === 0;
      const isOverstock90Days = totalQuantity > 0 && (
        monthlyConsumed > 0
          ? totalQuantity > (monthlyConsumed * 3)
          : totalQuantity > 6000
      );

      let stockStatus: StockStatus = 'normal';
      if (totalQuantity <= 0) stockStatus = 'stockout';
      else if (isNonMoving30Days) stockStatus = 'non_moving';
      else if (isOverstock90Days) stockStatus = 'overstock';
      else if (totalQuantity < 300) stockStatus = 'low_stock';

      aggregatedList.push({
        itemCode,
        itemDescription,
        category,
        warehouseCode,
        reportingPeriod,
        snapshotDate,
        totalQuantity,
        standardUnit,
        batchCount,
        totalStockValueSAR,
        earliestExpiryDate,
        earliestExpiryDays,
        batches,
        stockStatus,
        conversionRequired,
        namePatternFactor,
        monthlyConsumption: monthlyConsumed,
        isNonMoving30Days,
        isOverstock90Days,
      });
    });

    return aggregatedList;
  }

  // Deterministic KPI summary calculation based on aggregated inventory
  public getKPISummary(): KPISummary {
    const aggregated = this.getAggregatedInventory();
    const consumptions = this.getConsumptionRecords();
    const receivings = this.getReceivingRecords();
    const expiries = this.getExpiryRecords();

    const totalItems = aggregated.length;
    const totalStockValueSAR = aggregated.reduce((acc, curr) => acc + (curr.totalStockValueSAR || 0), 0);
    const lowStockItemsCount = aggregated.filter(
      (s) => s.stockStatus === 'low_stock' || s.stockStatus === 'stockout'
    ).length;
    // 1. Consumption map by item code
    const itemMonthlyConsumptionMap = new Map<string, number>();
    consumptions.forEach((c) => {
      const current = itemMonthlyConsumptionMap.get(c.itemCode) || 0;
      itemMonthlyConsumptionMap.set(c.itemCode, current + (c.quantityConsumed || 0));
    });

    // 2. Non-moving items for 30 days: items with stock available (>0) but zero consumption or absent from consumption sheet
    const nonMovingItems = aggregated.filter((item) => item.isNonMoving30Days || item.stockStatus === 'non_moving');
    const nonMoving30DaysCount = nonMovingItems.length;
    const nonMoving30DaysValueSAR = nonMovingItems.reduce((acc, curr) => acc + (curr.totalStockValueSAR || 0), 0);

    // 3. Overstock (>90 days stock coverage = stock > monthly consumption * 3):
    const overstock90DaysItems = aggregated.filter((item) => item.isOverstock90Days || item.stockStatus === 'overstock');
    const overstock90DaysCount = overstock90DaysItems.length;
    const overstock90DaysValueSAR = overstock90DaysItems.reduce((acc, curr) => acc + (curr.totalStockValueSAR || 0), 0);

    // Near expiry items count (< 90 days or already expired from expiry records or batch records)
    const nearExpiryFromExpiries = expiries.filter((e) => e.daysUntilExpiry <= 90).length;
    const nearExpiryFromBatches = aggregated.reduce((acc, item) => {
      const nearBatches = item.batches.filter((b) => b.daysUntilExpiry !== undefined && b.daysUntilExpiry <= 90);
      return acc + nearBatches.length;
    }, 0);
    const nearExpiryItemsCount = Math.max(nearExpiryFromExpiries, nearExpiryFromBatches);

    // Monthly flow KPIs
    const monthlyReceivingAmountSAR = receivings.reduce((acc, curr) => acc + (curr.totalReceivedValue || 0), 0);
    const monthlyIssuingAmountSAR = consumptions.reduce((acc, curr) => acc + (curr.totalConsumptionValue || 0), 0);

    const grnSet = new Set(receivings.map((r) => r.grnNumber));
    const prSet = new Set(receivings.filter((r) => r.prNumber).map((r) => r.prNumber));
    const itemsReceivedCount = receivings.reduce((acc, curr) => acc + (curr.quantityReceived || 0), 0);

    return {
      totalItems,
      totalStockValueSAR,
      lowStockItemsCount,
      nearExpiryItemsCount,
      overstockItemsCount: overstock90DaysCount,
      nonMoving30DaysCount,
      nonMoving30DaysValueSAR,
      overstock90DaysCount,
      overstock90DaysValueSAR,
      monthlyReceivingAmountSAR,
      monthlyIssuingAmountSAR,
      grnDoneCount: grnSet.size,
      prRaisedCount: prSet.size,
      itemsReceivedCount,
    };
  }

  // Actionable recommendations based on aggregated data
  public getRecommendations(): StockRecommendation[] {
    const aggregated = this.getAggregatedInventory();
    const consumptions = this.getConsumptionRecords();
    const recommendations: StockRecommendation[] = [];

    // Map consumptions by item
    const consumptionMap = new Map<string, number>();
    consumptions.forEach((c) => {
      consumptionMap.set(c.itemCode, (consumptionMap.get(c.itemCode) || 0) + (c.quantityConsumed || 0));
    });

    aggregated.forEach((item) => {
      const monthlyBurn = consumptionMap.get(item.itemCode) || 50;
      const dailyBurn = monthlyBurn / 30;
      const daysCoverage = dailyBurn > 0 ? Math.round(item.totalQuantity / dailyBurn) : 999;

      // 1. Critical Stockout / Low stock
      if (item.stockStatus === 'stockout') {
        recommendations.push({
          id: `REC-SO-${item.itemCode}`,
          type: 'urgent_reorder',
          severity: 'critical',
          title: `Stockout Alert: Zero Available Balance`,
          itemCode: item.itemCode,
          itemDescription: item.itemDescription,
          warehouseCode: item.warehouseCode,
          details: `Physical balance is 0 ${item.standardUnit}. Clinical demand average is ${monthlyBurn} units/month.`,
          impactSAR: monthlyBurn * 45,
          actionableStep: `Raise emergency PR and expedite supplier delivery.`,
          metrics: { currentStock: 0, recommendedStock: monthlyBurn * 2, daysCoverage: 0 },
        });
      } else if (item.stockStatus === 'low_stock' || (daysCoverage < 15 && daysCoverage >= 0)) {
        recommendations.push({
          id: `REC-LOW-${item.itemCode}`,
          type: 'urgent_reorder',
          severity: 'high',
          title: `Low Safety Buffer (${daysCoverage} Days Coverage)`,
          itemCode: item.itemCode,
          itemDescription: item.itemDescription,
          warehouseCode: item.warehouseCode,
          details: `Current stock of ${item.totalQuantity} ${item.standardUnit} across ${item.batchCount} batch(es) is below standard buffer.`,
          impactSAR: (item.totalStockValueSAR || 0) * 1.5,
          actionableStep: `Generate purchase requisition for ${Math.round(monthlyBurn * 1.5)} ${item.standardUnit}.`,
          metrics: { currentStock: item.totalQuantity, recommendedStock: monthlyBurn * 2, daysCoverage },
        });
      }

      // 2. Near Expiry FEFO Priority
      if (item.earliestExpiryDays !== undefined && item.earliestExpiryDays <= 60 && item.earliestExpiryDays > 0) {
        recommendations.push({
          id: `REC-FEFO-${item.itemCode}`,
          type: 'fefo_priority_dispatch',
          severity: item.earliestExpiryDays <= 30 ? 'critical' : 'high',
          title: `FEFO Priority: Earliest Batch Expires in ${item.earliestExpiryDays} Days`,
          itemCode: item.itemCode,
          itemDescription: item.itemDescription,
          warehouseCode: item.warehouseCode,
          details: `Earliest batch expires on ${item.earliestExpiryDate}. Expedite clinical dispensing to prevent write-off.`,
          impactSAR: item.totalStockValueSAR || 5000,
          actionableStep: `Dispatch earliest expiring batches to high-consumption wards immediately.`,
          metrics: { currentStock: item.totalQuantity, daysCoverage: item.earliestExpiryDays },
        });
      }

      // 3. Overstock Liquidation
      if (item.stockStatus === 'overstock' || daysCoverage > 180) {
        recommendations.push({
          id: `REC-OVR-${item.itemCode}`,
          type: 'overstock_liquidation',
          severity: 'medium',
          title: `Excess Capital Locked (${daysCoverage} Days Coverage)`,
          itemCode: item.itemCode,
          itemDescription: item.itemDescription,
          warehouseCode: item.warehouseCode,
          details: `Current stock of ${item.totalQuantity} ${item.standardUnit} exceeds 6 months clinical consumption.`,
          impactSAR: Math.round((item.totalStockValueSAR || 0) * 0.4),
          actionableStep: `Halt new purchase orders and consider inter-depot transfers.`,
          metrics: { currentStock: item.totalQuantity, daysCoverage },
        });
      }
    });

    if (recommendations.length === 0) {
      return DEMO_RECOMMENDATIONS;
    }

    return recommendations.slice(0, 15);
  }
}

export const storageService = new StorageService();
