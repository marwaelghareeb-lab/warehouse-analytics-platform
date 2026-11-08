import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import {
  StockSnapshot,
  ConsumptionRecord,
  ReceivingRecord,
  ExpiryRecord,
  KPISummary,
  ExecutiveSummaryResponse,
} from '../types/warehouse';

/**
 * Downloads a complete multi-sheet Excel report of the current warehouse data
 */
export function exportComprehensiveExcelReport(
  kpi: KPISummary,
  stocks: StockSnapshot[],
  consumptions: ConsumptionRecord[],
  receivings: ReceivingRecord[],
  expiries: ExpiryRecord[],
  reportingPeriod: string,
  warehouseName: string
) {
  const wb = XLSX.utils.book_new();

  // 1. Executive Summary Sheet
  const kpiData = [
    ['INVENTRA - HOSPITAL WAREHOUSE ANALYTICS PLATFORM'],
    ['Hospital Warehouse Management & Stock Control System'],
    ['Reporting Period:', reportingPeriod],
    ['Scope / Warehouse:', warehouseName],
    ['Generated At:', new Date().toLocaleString()],
    [''],
    ['METRIC / KPI', 'VALUE', 'UNIT / CURRENCY'],
    ['Total Catalog Items', kpi.totalItems, 'SKUs'],
    ['Total Stock Valuation', kpi.totalStockValueSAR, 'SAR'],
    ['Low Stock Critical Items', kpi.lowStockItemsCount, 'SKUs'],
    ['Near Expiry Items (<=90d)', kpi.nearExpiryItemsCount, 'SKUs / Batches'],
    ['Overstock Items', kpi.overstockItemsCount, 'SKUs'],
    ['Monthly Receiving Amount', kpi.monthlyReceivingAmountSAR, 'SAR'],
    ['Monthly Issuing / Consumption Amount', kpi.monthlyIssuingAmountSAR, 'SAR'],
    ['Total GRNs Processed', kpi.grnDoneCount, 'Documents'],
    ['Total PRs Raised', kpi.prRaisedCount, 'Documents'],
    ['Total Items Received', kpi.itemsReceivedCount, 'Units'],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(kpiData);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Executive Summary');

  // 2. Stock Balance Sheet
  if (stocks.length > 0) {
    const stockRows = stocks.map((s) => ({
      'Item Code': s.itemCode,
      'Item Description': s.itemDescription,
      'Category': s.category,
      'Warehouse': s.warehouseCode,
      'Batch Number': s.batchNumber || 'N/A',
      'Expiry Date': s.expiryDate || 'N/A',
      'Quantity on Hand (Original)': s.quantityOnHand,
      'Original Unit': s.unit,
      'Converted Quantity (Standard)': s.convertedQuantity !== undefined ? s.convertedQuantity : s.quantityOnHand,
      'Standard UOM': s.standardUnit || s.unit,
      'Conversion Factor': s.conversionFactor || 1,
      'Unit Cost (SAR)': s.unitCost,
      'Total Value (SAR)': s.totalStockValue,
      'Stock Status': s.stockStatus.toUpperCase(),
      'Snapshot Date': s.snapshotDate,
      'Reporting Period': s.reportingPeriod,
    }));
    const wsStock = XLSX.utils.json_to_sheet(stockRows);
    XLSX.utils.book_append_sheet(wb, wsStock, 'Stock Balance');
  }

  // 3. Consumption Sheet
  if (consumptions.length > 0) {
    const consRows = consumptions.map((c) => ({
      'Item Code': c.itemCode,
      'Item Description': c.itemDescription,
      'Category': c.category,
      'Department / Ward': c.department,
      'Quantity Consumed': c.quantityConsumed,
      'Unit': c.unit,
      'Unit Cost (SAR)': c.unitCost,
      'Total Value (SAR)': c.totalConsumptionValue,
      'Voucher / Req #': c.issueVoucherNumber,
      'Date': c.transactionDate,
      'Period': c.reportingPeriod,
    }));
    const wsCons = XLSX.utils.json_to_sheet(consRows);
    XLSX.utils.book_append_sheet(wb, wsCons, 'Consumption Log');
  }

  // 4. Receiving & GRN Sheet
  if (receivings.length > 0) {
    const recRows = receivings.map((r) => ({
      'GRN Number': r.grnNumber,
      'PR Number': r.prNumber,
      'PO Number': r.poNumber || 'N/A',
      'Supplier': r.supplierName,
      'Item Code': r.itemCode,
      'Item Description': r.itemDescription,
      'Quantity Received': r.quantityReceived,
      'Unit': r.unit,
      'Unit Cost (SAR)': r.unitCost,
      'Total Received (SAR)': r.totalReceivedValue,
      'Inspection Status': r.inspectionStatus,
      'Receipt Date': r.receiptDate,
    }));
    const wsRec = XLSX.utils.json_to_sheet(recRows);
    XLSX.utils.book_append_sheet(wb, wsRec, 'Goods Receiving (GRN)');
  }

  // 5. Expiry Risk Sheet
  if (expiries.length > 0) {
    const expRows = expiries.map((e) => ({
      'Batch / Lot #': e.batchNumber,
      'Item Code': e.itemCode,
      'Item Description': e.itemDescription,
      'Category': e.category,
      'Warehouse': e.warehouseCode,
      'Quantity Remaining': e.quantityRemaining,
      'Unit': e.unit,
      'Unit Cost (SAR)': e.unitCost,
      'Value at Risk (SAR)': e.totalValueAtRisk,
      'Expiry Date': e.expiryDate,
      'Days Until Expiry': e.daysUntilExpiry,
      'Risk Classification': e.riskLevel.toUpperCase(),
    }));
    const wsExp = XLSX.utils.json_to_sheet(expRows);
    XLSX.utils.book_append_sheet(wb, wsExp, 'Expiry & FEFO Analysis');
  }

  // Write and trigger download
  const dateTag = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `Inventra_Warehouse_Analytics_Report_${reportingPeriod}_${dateTag}.xlsx`);
}

/**
 * Generates and downloads a clean sample Excel file for testing uploads
 */
export function generateSampleExcelTemplate(type: 'stock_snapshot' | 'consumption' | 'receiving_grn' | 'expiry_batch') {
  const wb = XLSX.utils.book_new();

  if (type === 'stock_snapshot') {
    const sampleData = [
      {
        'ITEM_CODE': 'DRUG-501',
        'MATERIAL_NAME': 'Ciprofloxacin 500mg Film-Coated Tablets',
        'CATEGORY': 'Pharmaceuticals',
        'LOCATION': 'WH-01',
        'PHYSICAL_QTY': 1200,
        'UOM': 'Boxes',
        'UNIT_PRICE_SAR': 28.5,
        'TOTAL_SAR': 34200,
        'SNAPSHOT_DATE': '2026-10-31',
      },
      {
        'ITEM_CODE': 'DRUG-502',
        'MATERIAL_NAME': 'Amoxicillin + Clavulanic Acid 1.2g IV',
        'CATEGORY': 'Pharmaceuticals',
        'LOCATION': 'WH-02',
        'PHYSICAL_QTY': 280,
        'UOM': 'Vials',
        'UNIT_PRICE_SAR': 22.0,
        'TOTAL_SAR': 6160,
        'SNAPSHOT_DATE': '2026-10-31',
      },
      {
        'ITEM_CODE': 'SURG-701',
        'MATERIAL_NAME': 'Surgical Face Masks 3-Ply Ear Loop Type IIR',
        'CATEGORY': 'Personal Protective Equipment',
        'LOCATION': 'WH-01',
        'PHYSICAL_QTY': 15000,
        'UOM': 'Pieces',
        'UNIT_PRICE_SAR': 0.85,
        'TOTAL_SAR': 12750,
        'SNAPSHOT_DATE': '2026-10-31',
      },
      {
        'ITEM_CODE': 'COLD-201',
        'MATERIAL_NAME': 'Erythropoietin 4000 IU Prefilled Syringe',
        'CATEGORY': 'Cold Chain Biologics',
        'LOCATION': 'WH-04',
        'PHYSICAL_QTY': 180,
        'UOM': 'Syringes',
        'UNIT_PRICE_SAR': 95.0,
        'TOTAL_SAR': 17100,
        'SNAPSHOT_DATE': '2026-10-31',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'Stock_Snapshot');
    XLSX.writeFile(wb, 'Sample_Hospital_Stock_Snapshot.xlsx');
  } else if (type === 'consumption') {
    const sampleData = [
      {
        'ITEM_CODE': 'DRUG-501',
        'DESCRIPTION': 'Ciprofloxacin 500mg Film-Coated Tablets',
        'DEPARTMENT': 'Emergency Department',
        'QTY_ISSUED': 150,
        'UNIT_COST': 28.5,
        'TOTAL_VALUE': 4275,
        'ISSUE_DATE': '2026-10-24',
        'REQ_NUMBER': 'REQ-2026-901',
      },
      {
        'ITEM_CODE': 'SURG-701',
        'DESCRIPTION': 'Surgical Face Masks 3-Ply Ear Loop Type IIR',
        'DEPARTMENT': 'Operating Theatres (OR)',
        'QTY_ISSUED': 2500,
        'UNIT_COST': 0.85,
        'TOTAL_VALUE': 2125,
        'ISSUE_DATE': '2026-10-25',
        'REQ_NUMBER': 'REQ-2026-902',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'Consumption_Log');
    XLSX.writeFile(wb, 'Sample_Hospital_Consumption_Report.xlsx');
  } else if (type === 'receiving_grn') {
    const sampleData = [
      {
        'GRN_NUMBER': 'GRN-2026-778',
        'PR_NUMBER': 'PR-2026-301',
        'SUPPLIER': 'Al-Dawaa Medical Supplies',
        'ITEM_CODE': 'DRUG-501',
        'DESCRIPTION': 'Ciprofloxacin 500mg Film-Coated Tablets',
        'QTY_RECEIVED': 1000,
        'UNIT_COST': 28.5,
        'TOTAL_SAR': 28500,
        'RECEIPT_DATE': '2026-10-18',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'GRN_Receiving');
    XLSX.writeFile(wb, 'Sample_Goods_Receiving_GRN.xlsx');
  } else {
    const sampleData = [
      {
        'BATCH_NUMBER': 'LOT-CIP-2026',
        'ITEM_CODE': 'DRUG-501',
        'DESCRIPTION': 'Ciprofloxacin 500mg Film-Coated Tablets',
        'EXPIRY_DATE': '2026-11-25',
        'REMAINING_QTY': 120,
        'UNIT_COST': 28.5,
        'TOTAL_VAL_SAR': 3420,
        'WAREHOUSE': 'WH-01',
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    XLSX.utils.book_append_sheet(wb, ws, 'Batch_Expiry');
    XLSX.writeFile(wb, 'Sample_Expiry_Batch_Report.xlsx');
  }
}

/**
 * Downloads a structured PDF executive management brief
 */
export function exportPDFExecutiveBrief(
  kpi: KPISummary,
  aiSummary: ExecutiveSummaryResponse | null,
  reportingPeriod: string,
  warehouseName: string
) {
  const doc = new jsPDF();

  // Header band
  doc.setFillColor(15, 23, 42); // Navy slate-900
  doc.rect(0, 0, 210, 32, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('INVENTRA • HOSPITAL WAREHOUSE ANALYTICS', 14, 14);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Executive Stock Control & Operational Briefing • Period: ${reportingPeriod}`, 14, 22);
  doc.text(`Warehouse Scope: ${warehouseName}`, 14, 27);

  // Metadata block
  doc.setTextColor(51, 65, 85);
  doc.setFontSize(9);
  doc.text(`Generated: ${new Date().toLocaleString()} | Official Hospital Document`, 14, 38);

  // Key KPI Grid
  doc.setFillColor(241, 245, 249);
  doc.rect(14, 42, 182, 38, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(14, 42, 182, 38, 'S');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('KEY WAREHOUSE PERFORMANCE METRICS (VERIFIED DETERMINISTIC DATA)', 18, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`• Total Active Items: ${kpi.totalItems.toLocaleString()} SKUs`, 18, 56);
  doc.text(`• Total Inventory Valuation: ${kpi.totalStockValueSAR.toLocaleString()} SAR`, 18, 62);
  doc.text(`• Low Stock / Critical Risk: ${kpi.lowStockItemsCount} SKUs`, 18, 68);
  doc.text(`• Overstock Capital Tied: ${kpi.overstockItemsCount} SKUs`, 18, 74);

  doc.text(`• Near Expiry / Expired: ${kpi.nearExpiryItemsCount} Batches`, 110, 56);
  doc.text(`• Monthly Receiving Volume: ${kpi.monthlyReceivingAmountSAR.toLocaleString()} SAR`, 110, 62);
  doc.text(`• Monthly Issuing / Consumption: ${kpi.monthlyIssuingAmountSAR.toLocaleString()} SAR`, 110, 68);
  doc.text(`• GRNs Done: ${kpi.grnDoneCount} | PRs Raised: ${kpi.prRaisedCount}`, 110, 74);

  let currentY = 88;

  // Executive Narrative
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('EXECUTIVE NARRATIVE & AI MANAGEMENT HIGHLIGHTS', 14, currentY);
  currentY += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);

  const narrativeText = aiSummary?.executiveNarrative ||
    `During the reporting period ${reportingPeriod}, the hospital warehouse network recorded a total inventory valuation of ${kpi.totalStockValueSAR.toLocaleString()} SAR across ${kpi.totalItems} managed SKUs. A net flow balance was observed with ${kpi.monthlyReceivingAmountSAR.toLocaleString()} SAR in inbound Goods Received Notes against ${kpi.monthlyIssuingAmountSAR.toLocaleString()} SAR in outbound clinical consumption. Prioritized attention is required on ${kpi.lowStockItemsCount} items approaching stockout thresholds, alongside ${kpi.nearExpiryItemsCount} near-expiry lots to prevent medical waste and ensure uninterrupted clinical operations.`;

  const splitNarrative = doc.splitTextToSize(narrativeText, 182);
  doc.text(splitNarrative, 14, currentY);
  currentY += splitNarrative.length * 5 + 6;

  // Recommendations section
  if (aiSummary && aiSummary.stockRiskAlerts && aiSummary.stockRiskAlerts.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('CRITICAL STOCK RISK & REORDER ALERTS', 14, currentY);
    currentY += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    aiSummary.stockRiskAlerts.forEach((alert) => {
      const splitAlert = doc.splitTextToSize(`• ${alert}`, 180);
      doc.text(splitAlert, 14, currentY);
      currentY += splitAlert.length * 4.5;
    });
    currentY += 4;
  }

  // FEFO Priority section
  if (aiSummary && aiSummary.fefoActionPoints && aiSummary.fefoActionPoints.length > 0) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text('FEFO (FIRST-EXPIRED, FIRST-OUT) DISPATCH DIRECTIVES', 14, currentY);
    currentY += 5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    aiSummary.fefoActionPoints.forEach((point) => {
      const splitPoint = doc.splitTextToSize(`• ${point}`, 180);
      doc.text(splitPoint, 14, currentY);
      currentY += splitPoint.length * 4.5;
    });
    currentY += 4;
  }

  // Footer
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('Confidential - Internal Hospital Warehouse & Pharmacy Administration Only', 14, 285);

  doc.save(`Inventra_Executive_Brief_${reportingPeriod}.pdf`);
}
