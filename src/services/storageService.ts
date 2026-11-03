import {
  StockSnapshot,
  ConsumptionRecord,
  ReceivingRecord,
  ExpiryRecord,
  UploadedReport,
  KPISummary,
  StockRecommendation,
  Warehouse,
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

const STORAGE_KEYS = {
  STOCK: 'wh_analytics_stock_v1',
  CONSUMPTION: 'wh_analytics_consumption_v1',
  RECEIVING: 'wh_analytics_receiving_v1',
  EXPIRY: 'wh_analytics_expiry_v1',
  REPORTS: 'wh_analytics_reports_v1',
  IS_DEMO: 'wh_analytics_is_demo_v1',
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
  private isDemoMode: boolean = true;
  private selectedWarehouse: string = 'ALL';
  private selectedPeriod: string = '2026-10';

  constructor() {
    this.init();
  }

  private init() {
    try {
      const storedReports = localStorage.getItem(STORAGE_KEYS.REPORTS);
      const isDemoStored = localStorage.getItem(STORAGE_KEYS.IS_DEMO);

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

    // If all reports deleted, we are not demo mode
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

  public addImportedData(params: {
    report: UploadedReport;
    stockSnapshots?: StockSnapshot[];
    consumptionRecords?: ConsumptionRecord[];
    receivingRecords?: ReceivingRecord[];
    expiryRecords?: ExpiryRecord[];
  }) {
    // If we were on demo mode and this is the first real user import, give option or auto-switch
    this.isDemoMode = false;

    // Remove older report with same id if replacing
    this.uploadedReports = [params.report, ...this.uploadedReports.filter((r) => r.id !== params.report.id)];

    if (params.stockSnapshots && params.stockSnapshots.length > 0) {
      // Rule: Stock reports are dated snapshots. Never add two snapshots together.
      // Remove previous snapshot for exact same warehouse & period to avoid double counting
      const incomingKeys = new Set(
        params.stockSnapshots.map((s) => `${s.itemCode}_${s.warehouseCode}_${s.reportingPeriod}`)
      );
      this.stockSnapshots = [
        ...params.stockSnapshots,
        ...this.stockSnapshots.filter((s) => !incomingKeys.has(`${s.itemCode}_${s.warehouseCode}_${s.reportingPeriod}`)),
      ];
    }

    if (params.consumptionRecords && params.consumptionRecords.length > 0) {
      this.consumptionRecords = [...params.consumptionRecords, ...this.consumptionRecords];
    }

    if (params.receivingRecords && params.receivingRecords.length > 0) {
      this.receivingRecords = [...params.receivingRecords, ...this.receivingRecords];
    }

    if (params.expiryRecords && params.expiryRecords.length > 0) {
      this.expiryRecords = [...params.expiryRecords, ...this.expiryRecords];
    }

    this.persist();
    notify();
  }

  // Filtered queries
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
    return this.expiryRecords.filter((e) => {
      return this.selectedWarehouse === 'ALL' || e.warehouseCode === this.selectedWarehouse;
    });
  }

  // Deterministic KPI summary calculation
  public getKPISummary(): KPISummary {
    const stocks = this.getStockSnapshots();
    const consumptions = this.getConsumptionRecords();
    const receivings = this.getReceivingRecords();
    const expiries = this.getExpiryRecords();

    // Latest snapshot per item to ensure NO double counting
    const itemMap = new Map<string, StockSnapshot>();
    stocks.forEach((s) => {
      const existing = itemMap.get(s.itemCode);
      if (!existing || new Date(s.snapshotDate) >= new Date(existing.snapshotDate)) {
        itemMap.set(s.itemCode, s);
      }
    });

    const uniqueStockItems = Array.from(itemMap.values());
    const totalItems = uniqueStockItems.length;
    const totalStockValueSAR = uniqueStockItems.reduce((acc, curr) => acc + (curr.totalStockValue || 0), 0);
    const lowStockItemsCount = uniqueStockItems.filter((s) => s.stockStatus === 'low_stock' || s.stockStatus === 'stockout').length;
    const overstockItemsCount = uniqueStockItems.filter((s) => s.stockStatus === 'overstock').length;

    // Near expiry items count (< 90 days or already expired)
    const nearExpiryItemsCount = expiries.filter((e) => e.daysUntilExpiry <= 90).length;

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
      overstockItemsCount,
      monthlyReceivingAmountSAR,
      monthlyIssuingAmountSAR,
      grnDoneCount: grnSet.size,
      prRaisedCount: prSet.size,
      itemsReceivedCount,
    };
  }

  // Deterministic Recommendations
  public getRecommendations(): StockRecommendation[] {
    // Generate dynamic actionable recommendations based on actual imported stock and consumption
    const recommendations: StockRecommendation[] = [];
    const stocks = this.getStockSnapshots();
    const consumptions = this.getConsumptionRecords();
    const expiries = this.getExpiryRecords();

    // 1. Critical low stocks
    const lowStocks = stocks.filter((s) => s.stockStatus === 'low_stock' || s.stockStatus === 'stockout');
    lowStocks.slice(0, 3).forEach((ls, idx) => {
      const monthlyCons = consumptions
        .filter((c) => c.itemCode === ls.itemCode)
        .reduce((sum, c) => sum + c.quantityConsumed, 0);
      const runRateDaily = monthlyCons > 0 ? monthlyCons / 30 : 5;
      const daysCoverage = Math.max(1, Math.round(ls.quantityOnHand / runRateDaily));

      recommendations.push({
        id: `REC-DYN-LOW-${idx}`,
        type: 'urgent_reorder',
        severity: daysCoverage <= 7 ? 'critical' : 'high',
        title: `Low Stock Critical: ${ls.itemDescription}`,
        itemCode: ls.itemCode,
        itemDescription: ls.itemDescription,
        warehouseCode: ls.warehouseCode,
        details: `Current stock of ${ls.quantityOnHand.toLocaleString()} ${ls.unit} provides only ~${daysCoverage} days of clinical coverage. Reorder point is ${ls.reorderPoint || 300} ${ls.unit}.`,
        impactSAR: (ls.reorderPoint || 500) * (ls.unitCost || 10),
        actionableStep: `Generate urgent Purchase Requisition for ${(ls.reorderPoint || 500) * 2} ${ls.unit} to safeguard hospital patient care.`,
        metrics: {
          currentStock: ls.quantityOnHand,
          recommendedStock: (ls.reorderPoint || 500) * 2,
          runRateDaily: Number(runRateDaily.toFixed(1)),
          daysCoverage,
        },
      });
    });

    // 2. Near expiry FEFO priority
    const criticalExpiries = expiries.filter((e) => e.daysUntilExpiry > 0 && e.daysUntilExpiry <= 30);
    criticalExpiries.slice(0, 2).forEach((ce, idx) => {
      recommendations.push({
        id: `REC-DYN-EXP-${idx}`,
        type: 'fefo_priority_dispatch',
        severity: 'high',
        title: `FEFO Priority Dispatch: Batch ${ce.batchNumber}`,
        itemCode: ce.itemCode,
        itemDescription: ce.itemDescription,
        warehouseCode: ce.warehouseCode,
        details: `Batch ${ce.batchNumber} has ${ce.quantityRemaining.toLocaleString()} ${ce.unit} expiring in ${ce.daysUntilExpiry} days. Valuation at risk: ${ce.totalValueAtRisk.toLocaleString()} SAR.`,
        impactSAR: ce.totalValueAtRisk,
        actionableStep: `Prioritize FEFO issuing of Batch ${ce.batchNumber} to high-volume inpatient wards before newer arrivals.`,
        metrics: {
          currentStock: ce.quantityRemaining,
          daysCoverage: ce.daysUntilExpiry,
        },
      });
    });

    // 3. Overstock items
    const overstocks = stocks.filter((s) => s.stockStatus === 'overstock');
    overstocks.slice(0, 2).forEach((os, idx) => {
      recommendations.push({
        id: `REC-DYN-OVER-${idx}`,
        type: 'overstock_liquidation',
        severity: 'medium',
        title: `Excess Capital Locked: ${os.itemDescription}`,
        itemCode: os.itemCode,
        itemDescription: os.itemDescription,
        warehouseCode: os.warehouseCode,
        details: `Stock level of ${os.quantityOnHand.toLocaleString()} ${os.unit} exceeds warehouse maximum holding capacity. Total tied-up value: ${os.totalStockValue.toLocaleString()} SAR.`,
        impactSAR: os.totalStockValue * 0.3,
        actionableStep: `Pause replenishment PRs for 60 days or arrange vendor returns for surplus volume.`,
        metrics: {
          currentStock: os.quantityOnHand,
          daysCoverage: 180,
        },
      });
    });

    // If dynamic list is small, fallback to demo recommendations
    if (recommendations.length === 0) {
      return DEMO_RECOMMENDATIONS;
    }

    return recommendations;
  }
}

export const storageService = new StorageService();
