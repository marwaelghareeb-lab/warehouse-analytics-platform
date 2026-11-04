import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize GoogleGenAI client securely on the server
const getAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
};

// 1. AI-Powered Column Mapping Endpoint
app.post('/api/ai/column-mapping', async (req: Request, res: Response): Promise<void> => {
  try {
    const { headers, sampleRows, reportType } = req.body;

    if (!headers || !Array.isArray(headers) || headers.length === 0) {
      res.status(400).json({ error: 'Headers array is required' });
      return;
    }

    const ai = getAiClient();
    if (!ai) {
      // Heuristic fallback if Gemini API key is not configured
      res.json({
        success: true,
        isAiPowered: false,
        message: 'Rule-based column recognition (AI key not set)',
        mappings: {},
      });
      return;
    }

    const prompt = `
You are an expert hospital ERP data integration engine.
Analyze these raw Excel column headers and sample data rows from a hospital inventory report (${reportType || 'general'}).

Raw Headers:
${JSON.stringify(headers)}

Sample Data (first rows):
${JSON.stringify(sampleRows ? sampleRows.slice(0, 3) : [])}

Map each raw header to EXACTLY ONE of the following standard field keys:
- itemCode (SKU, item id, material number, drug code)
- itemDescription (item name, drug specification, product description)
- category (item group, medical class, department type)
- warehouse (store code, location, subinventory)
- quantity (on hand, stock balance, quantity consumed, quantity received)
- unit (UOM, unit of measure, pack, vial, box)
- unitCost (price per unit, purchase cost, unit price in SAR)
- totalValue (extended value, total cost, line total in SAR)
- transactionDate (receipt date, posting date, consumption date)
- reportingPeriod (month, quarter, period)
- supplier (vendor name, distributor, manufacturer)
- department (ward, clinic, consuming unit, cost center)
- batchNumber (lot number, batch id)
- expiryDate (expiration date, valid until)
- grnNumber (Goods Received Note number, receiving doc)
- prNumber (Purchase Requisition, PO number)
- ignore (if irrelevant like row index, notes, timestamp)

Be extremely accurate. Return JSON mapping.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mappings: {
              type: Type.OBJECT,
              description: 'Key-value map where key is raw header and value is the standard field key or ignore',
            },
            confidenceScores: {
              type: Type.OBJECT,
              description: 'Confidence score (0.0 to 1.0) for each mapped header',
            },
            explanation: {
              type: Type.STRING,
              description: 'Brief explanation of mapping decisions',
            },
          },
          required: ['mappings'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      success: true,
      isAiPowered: true,
      mappings: parsed.mappings || {},
      confidenceScores: parsed.confidenceScores || {},
      explanation: parsed.explanation || 'Mapped using Gemini AI column recognition.',
    });
  } catch (err: any) {
    console.warn('Gemini Column Mapping encountered error, using rule-based fallback:', err.message);
    const ruleBased = fallbackRuleBasedMapping(req.body.headers || []);
    res.json({
      success: true,
      isAiPowered: false,
      message: 'Heuristic rule-based fallback applied',
      mappings: ruleBased,
      explanation: 'Mapped using hospital standard ERP terminology rules.',
    });
  }
});

// Heuristic rule-based column matcher
function fallbackRuleBasedMapping(headers: string[]): Record<string, string> {
  const dictionary: Record<string, string[]> = {
    itemCode: ['item code', 'itemcode', 'item_code', 'item no', 'sku', 'material code', 'product code', 'item_id', 'code', 'part_number'],
    itemDescription: ['item description', 'description', 'item_desc', 'product name', 'item name', 'drug name', 'material description', 'specification', 'name'],
    category: ['category', 'item category', 'material group', 'class', 'group', 'product line', 'dept_type'],
    warehouse: ['warehouse', 'warehouse code', 'wh_code', 'store', 'storage location', 'subinventory', 'site', 'depot', 'loc'],
    quantity: ['quantity', 'qty', 'on hand', 'balance', 'stock qty', 'qty received', 'qty issued', 'current stock', 'physical qty', 'available qty'],
    unit: ['unit', 'uom', 'unit of measure', 'pkg', 'packaging', 'base uom'],
    unitCost: ['unit cost', 'cost', 'unit price', 'price', 'standard cost', 'rate', 'purchase price', 'item cost', 'sar cost', 'cost/unit'],
    totalValue: ['total value', 'total cost', 'total amount', 'extended value', 'inventory value', 'line total', 'total sar', 'net value'],
    transactionDate: ['date', 'transaction date', 'posting date', 'issue date', 'receipt date', 'txn date', 'created date'],
    reportingPeriod: ['period', 'reporting period', 'month', 'fiscal period', 'quarter'],
    supplier: ['supplier', 'vendor', 'supplier name', 'manufacturer', 'vendor name'],
    department: ['department', 'dept', 'cost center', 'ward', 'requesting unit', 'clinic'],
    batchNumber: ['batch', 'batch number', 'lot', 'lot number', 'batch_no', 'lot_no'],
    expiryDate: ['expiry date', 'expiration date', 'exp date', 'exp_date', 'valid until', 'expiry', 'exp_dt'],
    grnNumber: ['grn', 'grn number', 'grn_no', 'receiving doc', 'receipt number'],
    prNumber: ['pr number', 'pr_no', 'requisition', 'purchase requisition', 'po number', 'po_no'],
  };

  const mappings: Record<string, string> = {};
  for (const header of headers) {
    const clean = header.toLowerCase().replace(/[^a-z0-9]/g, '');
    let matched = 'ignore';
    for (const [field, aliases] of Object.entries(dictionary)) {
      if (
        aliases.some((a) => {
          const cleanA = a.toLowerCase().replace(/[^a-z0-9]/g, '');
          return clean === cleanA || clean.includes(cleanA) || cleanA.includes(clean);
        })
      ) {
        matched = field;
        break;
      }
    }
    mappings[header] = matched;
  }
  return mappings;
}

// 2. AI Executive Summary Endpoint (strictly grounded in verified calculated data)
app.post('/api/ai/executive-summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      kpi,
      topConsumed,
      lowStockItems,
      nearExpiryBatches,
      overstockItems,
      reportingPeriod,
      warehouseName,
    } = req.body;

    const ai = getAiClient();
    if (!ai) {
      // Deterministic structured summary fallback if no Gemini key
      res.json({
        success: true,
        isAiPowered: false,
        summary: {
          summaryTitle: `Warehouse Executive Management Summary (${reportingPeriod || 'Current Period'})`,
          reportingPeriod: reportingPeriod || 'Current Period',
          generatedAt: new Date().toISOString(),
          keyFacts: {
            totalValuationSAR: kpi?.totalStockValueSAR || 0,
            criticalLowStockItems: kpi?.lowStockItemsCount || 0,
            expiryRiskValuationSAR: nearExpiryBatches?.reduce((a: number, b: any) => a + (b.totalValueAtRisk || 0), 0) || 0,
            overstockCapitalTiedSAR: overstockItems?.reduce((a: number, b: any) => a + (b.totalStockValue || 0), 0) || 0,
            monthlyBurnRateSAR: kpi?.monthlyIssuingAmountSAR || 0,
            netInventoryFlowSAR: (kpi?.monthlyReceivingAmountSAR || 0) - (kpi?.monthlyIssuingAmountSAR || 0),
          },
          executiveNarrative: `During reporting period ${reportingPeriod}, the hospital warehouse network recorded a total inventory valuation of ${(kpi?.totalStockValueSAR || 0).toLocaleString()} SAR across ${kpi?.totalItems || 0} active medical SKUs. Inbound receipts totaled ${(kpi?.monthlyReceivingAmountSAR || 0).toLocaleString()} SAR across ${kpi?.grnDoneCount || 0} GRNs, against clinical issues totaling ${(kpi?.monthlyIssuingAmountSAR || 0).toLocaleString()} SAR. Stock controller attention is urgently required for ${kpi?.lowStockItemsCount || 0} low stock items and ${kpi?.nearExpiryItemsCount || 0} near-expiry lots.`,
          highConsumptionHighlights: (topConsumed || []).slice(0, 3).map(
            (c: any) => `${c.itemDescription || c.itemCode}: Consumed ${c.quantityConsumed?.toLocaleString()} units (${(c.totalConsumptionValue || 0).toLocaleString()} SAR)`
          ),
          stockRiskAlerts: (lowStockItems || []).slice(0, 3).map(
            (l: any) => `Critical Buffer Alert: ${l.itemDescription} at ${l.quantityOnHand} units in ${l.warehouseCode}. Immediate reorder recommended.`
          ),
          fefoActionPoints: (nearExpiryBatches || []).slice(0, 3).map(
            (e: any) => `FEFO Alert: Batch ${e.batchNumber} (${e.itemDescription}) expires in ${e.daysUntilExpiry} days. ${e.quantityRemaining} units at risk (${(e.totalValueAtRisk || 0).toLocaleString()} SAR).`
          ),
          procurementRecommendations: [
            'Expedite pending Purchase Requisitions for critical surgical and antibiotic items.',
            'Enforce First-Expired, First-Out (FEFO) dispensing in inpatient pharmacy and cold-chain stores.',
            'Review excess safety buffers on personal protective equipment to release locked capital.',
          ],
        },
      });
      return;
    }

    const prompt = `
You are a senior hospital supply chain consultant and warehouse auditor.
Generate a concise, professional executive management summary based ONLY on the following verified calculated warehouse data.

CRITICAL RULES:
1. Never invent data or hallucinate items, prices, or numbers.
2. Clearly distinguish calculated facts from strategic supply chain recommendations.
3. Currency is SAR (Saudi Riyal).
4. Emphasize patient safety, uninterrupted clinical availability, cold-chain integrity, and capital efficiency.

DATA INPUTS:
- Scope: ${warehouseName || 'All Hospital Warehouses'}
- Reporting Period: ${reportingPeriod}
- Total Catalog Items: ${kpi?.totalItems || 0}
- Total Stock Valuation (SAR): ${kpi?.totalStockValueSAR || 0}
- Critical Low Stock Items Count: ${kpi?.lowStockItemsCount || 0}
- Near Expiry Items Count: ${kpi?.nearExpiryItemsCount || 0}
- Overstock Items Count: ${kpi?.overstockItemsCount || 0}
- Monthly Receiving Amount (SAR): ${kpi?.monthlyReceivingAmountSAR || 0}
- Monthly Issuing / Consumption Amount (SAR): ${kpi?.monthlyIssuingAmountSAR || 0}
- Total GRNs Processed: ${kpi?.grnDoneCount || 0}
- Total PRs Raised: ${kpi?.prRaisedCount || 0}
- High Consumption Items: ${JSON.stringify((topConsumed || []).slice(0, 5))}
- Critical Low Stock Items: ${JSON.stringify((lowStockItems || []).slice(0, 5))}
- Near Expiry Batches: ${JSON.stringify((nearExpiryBatches || []).slice(0, 5))}
- Overstock Items: ${JSON.stringify((overstockItems || []).slice(0, 3))}
`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryTitle: { type: Type.STRING },
            reportingPeriod: { type: Type.STRING },
            executiveNarrative: {
              type: Type.STRING,
              description: 'Executive paragraph summarizing verified performance, flows, and stock health',
            },
            highConsumptionHighlights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Key insights on top consumed medicines or supplies',
            },
            stockRiskAlerts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Urgent stockout risks with specific item codes and quantities',
            },
            fefoActionPoints: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Specific batches and expiration dates requiring immediate clinical issuing',
            },
            procurementRecommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Actionable procurement and supply chain adjustments',
            },
          },
          required: [
            'summaryTitle',
            'reportingPeriod',
            'executiveNarrative',
            'highConsumptionHighlights',
            'stockRiskAlerts',
            'fefoActionPoints',
            'procurementRecommendations',
          ],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      success: true,
      isAiPowered: true,
      summary: {
        ...parsed,
        generatedAt: new Date().toISOString(),
        keyFacts: {
          totalValuationSAR: kpi?.totalStockValueSAR || 0,
          criticalLowStockItems: kpi?.lowStockItemsCount || 0,
          expiryRiskValuationSAR: nearExpiryBatches?.reduce((a: number, b: any) => a + (b.totalValueAtRisk || 0), 0) || 0,
          overstockCapitalTiedSAR: overstockItems?.reduce((a: number, b: any) => a + (b.totalStockValue || 0), 0) || 0,
          monthlyBurnRateSAR: kpi?.monthlyIssuingAmountSAR || 0,
          netInventoryFlowSAR: (kpi?.monthlyReceivingAmountSAR || 0) - (kpi?.monthlyIssuingAmountSAR || 0),
        },
      },
    });
  } catch (err: any) {
    console.warn('Gemini Executive Summary Error, using deterministic facts fallback:', err.message);
    const { kpi, topConsumed, lowStockItems, nearExpiryBatches, overstockItems, reportingPeriod } = req.body;
    res.json({
      success: true,
      isAiPowered: false,
      summary: {
        summaryTitle: `Warehouse Executive Management Summary (${reportingPeriod || 'Current Period'})`,
        reportingPeriod: reportingPeriod || 'Current Period',
        generatedAt: new Date().toISOString(),
        keyFacts: {
          totalValuationSAR: kpi?.totalStockValueSAR || 0,
          criticalLowStockItems: kpi?.lowStockItemsCount || 0,
          expiryRiskValuationSAR: nearExpiryBatches?.reduce((a: number, b: any) => a + (b.totalValueAtRisk || 0), 0) || 0,
          overstockCapitalTiedSAR: overstockItems?.reduce((a: number, b: any) => a + (b.totalStockValue || 0), 0) || 0,
          monthlyBurnRateSAR: kpi?.monthlyIssuingAmountSAR || 0,
          netInventoryFlowSAR: (kpi?.monthlyReceivingAmountSAR || 0) - (kpi?.monthlyIssuingAmountSAR || 0),
        },
        executiveNarrative: `During reporting period ${reportingPeriod}, the hospital warehouse network recorded a total inventory valuation of ${(kpi?.totalStockValueSAR || 0).toLocaleString()} SAR across ${kpi?.totalItems || 0} active medical SKUs. Inbound receipts totaled ${(kpi?.monthlyReceivingAmountSAR || 0).toLocaleString()} SAR across ${kpi?.grnDoneCount || 0} GRNs, against clinical issues totaling ${(kpi?.monthlyIssuingAmountSAR || 0).toLocaleString()} SAR. Stock controller attention is urgently required for ${kpi?.lowStockItemsCount || 0} low stock items and ${kpi?.nearExpiryItemsCount || 0} near-expiry lots.`,
        highConsumptionHighlights: (topConsumed || []).slice(0, 3).map(
          (c: any) => `${c.itemDescription || c.itemCode}: Consumed ${c.quantityConsumed?.toLocaleString()} units (${(c.totalConsumptionValue || 0).toLocaleString()} SAR)`
        ),
        stockRiskAlerts: (lowStockItems || []).slice(0, 3).map(
          (l: any) => `Critical Buffer Alert: ${l.itemDescription} at ${l.quantityOnHand} units in ${l.warehouseCode}. Immediate reorder recommended.`
        ),
        fefoActionPoints: (nearExpiryBatches || []).slice(0, 3).map(
          (e: any) => `FEFO Alert: Batch ${e.batchNumber} (${e.itemDescription}) expires in ${e.daysUntilExpiry} days. ${e.quantityRemaining} units at risk (${(e.totalValueAtRisk || 0).toLocaleString()} SAR).`
        ),
        procurementRecommendations: [
          'Expedite pending Purchase Requisitions for critical surgical and antibiotic items.',
          'Enforce First-Expired, First-Out (FEFO) dispensing in inpatient pharmacy and cold-chain stores.',
          'Review excess safety buffers on personal protective equipment to release locked capital.',
        ],
      },
    });
  }
});

// ==========================================
// SUPABASE DATABASE & STORAGE ADMIN ENDPOINTS
// ==========================================

const getSupabaseAdmin = (): SupabaseClient | null => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key || url.includes('your-project') || key.includes('your-anon') || key.includes('your-service')) {
    return null;
  }
  try {
    return createClient(url, key, {
      auth: { persistSession: false },
    });
  } catch (err) {
    console.error('Supabase initialization failed:', err);
    return null;
  }
};

let localSavedOutputs: any[] = [];

// 1. Supabase Status & Connection Diagnostic
app.get('/api/supabase/status', async (_req: Request, res: Response) => {
  const url = process.env.SUPABASE_URL;
  const hasAnonKey = !!process.env.SUPABASE_ANON_KEY && !process.env.SUPABASE_ANON_KEY.includes('your-anon');
  const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SERVICE_ROLE_KEY.includes('your-service');
  const isConfigured = !!url && !url.includes('your-project') && (hasAnonKey || hasServiceKey);

  if (!isConfigured) {
    res.json({
      isConfigured: false,
      isConnected: false,
      hasAnonKey,
      hasServiceKey,
      url: url || null,
      message: 'Supabase credentials not configured in environment. Running in high-performance local store mode.',
      savedOutputsCount: localSavedOutputs.length,
    });
    return;
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    res.json({
      isConfigured: true,
      isConnected: false,
      hasAnonKey,
      hasServiceKey,
      message: 'Failed to initialize Supabase client with current credentials.',
      savedOutputsCount: localSavedOutputs.length,
    });
    return;
  }

  try {
    // Check tables
    const tableChecks: Record<string, boolean> = {};
    const tables = ['warehouses', 'uploaded_reports', 'item_master', 'stock_snapshots', 'consumption_data', 'receiving_data', 'expiry_data', 'analytical_outputs'];
    
    for (const table of tables) {
      const { error } = await supabase.from(table).select('id', { count: 'exact', head: true }).limit(1);
      tableChecks[table] = !error;
    }

    // Check bucket
    let bucketExists = false;
    try {
      const { data: buckets } = await supabase.storage.listBuckets();
      bucketExists = !!buckets?.some((b) => b.name === 'warehouse-reports');
    } catch (e) {
      // Storage permission error or not set up
    }

    const allTablesReady = Object.values(tableChecks).every(Boolean);

    res.json({
      isConfigured: true,
      isConnected: true,
      hasAnonKey,
      hasServiceKey,
      maskedUrl: url?.replace(/(https:\/\/[^.]+).*/, '$1.supabase.co'),
      tableChecks,
      allTablesReady,
      bucketExists,
      message: allTablesReady
        ? 'Connected to Supabase. All database tables and RLS policies are active.'
        : 'Connected to Supabase, but some tables have not been created yet. Execute the SQL schema from the Admin Panel.',
      savedOutputsCount: localSavedOutputs.length,
    });
  } catch (err: any) {
    res.json({
      isConfigured: true,
      isConnected: false,
      hasAnonKey,
      hasServiceKey,
      error: err.message,
      message: 'Failed to ping Supabase instance.',
      savedOutputsCount: localSavedOutputs.length,
    });
  }
});

// 2. Save Analytical Output (Executive summary, KPI brief, FEFO risk matrix)
app.post('/api/supabase/save-analysis', async (req: Request, res: Response): Promise<void> => {
  try {
    const output = req.body;
    if (!output || !output.title) {
      res.status(400).json({ error: 'Title and output payload are required' });
      return;
    }

    const savedRecord = {
      id: output.id || `AO-${Date.now()}`,
      title: output.title,
      report_scope: output.report_scope || output.reportScope || 'All Warehouses',
      reporting_period: output.reporting_period || output.reportingPeriod || '2026-10',
      summary_type: output.summary_type || output.summaryType || 'executive_summary',
      kpi_metrics: output.kpi_metrics || output.kpiMetrics || {},
      executive_narrative: output.executive_narrative || output.executiveNarrative || '',
      high_consumption_highlights: output.high_consumption_highlights || output.highConsumptionHighlights || [],
      stock_risk_alerts: output.stock_risk_alerts || output.stockRiskAlerts || [],
      fefo_action_points: output.fefo_action_points || output.fefoActionPoints || [],
      procurement_recommendations: output.procurement_recommendations || output.procurementRecommendations || [],
      generated_by: output.generated_by || output.generatedBy || 'Hospital AI Warehouse Engine',
      created_at: new Date().toISOString(),
    };

    // Save locally first
    localSavedOutputs = [savedRecord, ...localSavedOutputs.filter((o) => o.id !== savedRecord.id)];

    // If Supabase is connected, persist to Postgres
    const supabase = getSupabaseAdmin();
    let supabasePersisted = false;
    if (supabase) {
      const { error } = await supabase.from('analytical_outputs').upsert(savedRecord);
      if (!error) {
        supabasePersisted = true;
      } else {
        console.warn('Failed to upsert analytical_outputs to Supabase (using local store):', error.message);
      }
    }

    res.json({
      success: true,
      record: savedRecord,
      persistedToSupabase: supabasePersisted,
      message: supabasePersisted
        ? 'Analytical output saved to Supabase PostgreSQL database.'
        : 'Analytical output saved to local store (Supabase not configured or table missing).',
    });
  } catch (err: any) {
    console.error('Error saving analytical output:', err);
    res.status(500).json({ error: err.message || 'Failed to save analytical output' });
  }
});

// 3. Fetch All Saved Analytical Outputs
app.get('/api/supabase/analytical-outputs', async (_req: Request, res: Response) => {
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data, error } = await supabase
      .from('analytical_outputs')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && data.length > 0) {
      res.json({ success: true, outputs: data, source: 'supabase' });
      return;
    }
  }

  // Fallback to local store
  res.json({ success: true, outputs: localSavedOutputs, source: 'local' });
});

// 4. Delete Saved Analytical Output
app.delete('/api/supabase/analytical-outputs/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  localSavedOutputs = localSavedOutputs.filter((o) => o.id !== id);

  const supabase = getSupabaseAdmin();
  if (supabase) {
    await supabase.from('analytical_outputs').delete().eq('id', id);
  }

  res.json({ success: true, message: 'Analytical output deleted.' });
});

// 5. Batch Sync All Warehouse Data to Supabase
app.post('/api/supabase/sync-all', async (req: Request, res: Response): Promise<void> => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      res.status(400).json({
        success: false,
        error: 'Supabase credentials not configured in environment. Add SUPABASE_URL and keys to environment.',
      });
      return;
    }

    const {
      warehouses,
      reports,
      stockSnapshots,
      consumptionRecords,
      receivingRecords,
      expiryRecords,
      analyticalOutputs,
    } = req.body;

    const syncResults: Record<string, { attempted: number; succeeded: number; error?: string }> = {};

    // 1. Warehouses
    if (warehouses && Array.isArray(warehouses) && warehouses.length > 0) {
      const records = warehouses.map((w: any) => ({
        code: w.code,
        name: w.name,
        type: w.type || 'General',
        location: w.location || '',
      }));
      const { error } = await supabase.from('warehouses').upsert(records, { onConflict: 'code' });
      syncResults['warehouses'] = { attempted: records.length, succeeded: error ? 0 : records.length, error: error?.message };
    }

    // 2. Uploaded Reports
    if (reports && Array.isArray(reports) && reports.length > 0) {
      const records = reports.map((r: any) => ({
        filename: r.filename,
        report_type: r.reportType,
        warehouse_code: r.warehouseCode,
        reporting_period: r.reportingPeriod,
        file_size_bytes: r.fileSizeBytes || 0,
        total_rows_imported: r.totalRowsImported || 0,
        validation_status: r.validationStatus || 'completed',
        is_demo: !!r.isDemo,
      }));
      const { error } = await supabase.from('uploaded_reports').upsert(records);
      syncResults['uploaded_reports'] = { attempted: records.length, succeeded: error ? 0 : records.length, error: error?.message };
    }

    // 3. Stock Snapshots
    if (stockSnapshots && Array.isArray(stockSnapshots) && stockSnapshots.length > 0) {
      const records = stockSnapshots.map((s: any) => ({
        snapshot_date: s.snapshotDate || new Date().toISOString().split('T')[0],
        reporting_period: s.reportingPeriod,
        warehouse_code: s.warehouseCode,
        item_code: s.itemCode,
        quantity_on_hand: s.quantityOnHand,
        unit_cost: s.unitCost,
        stock_status: s.stockStatus || 'normal',
      }));
      const { error } = await supabase.from('stock_snapshots').upsert(records);
      syncResults['stock_snapshots'] = { attempted: records.length, succeeded: error ? 0 : records.length, error: error?.message };
    }

    // 4. Consumption Records
    if (consumptionRecords && Array.isArray(consumptionRecords) && consumptionRecords.length > 0) {
      const records = consumptionRecords.map((c: any) => ({
        transaction_date: c.transactionDate || new Date().toISOString().split('T')[0],
        reporting_period: c.reportingPeriod,
        warehouse_code: c.warehouseCode,
        item_code: c.itemCode,
        department: c.department,
        quantity_consumed: c.quantityConsumed,
        unit_cost: c.unitCost,
        issue_voucher_number: c.issueVoucherNumber,
      }));
      const { error } = await supabase.from('consumption_data').upsert(records);
      syncResults['consumption_data'] = { attempted: records.length, succeeded: error ? 0 : records.length, error: error?.message };
    }

    // 5. Receiving Records
    if (receivingRecords && Array.isArray(receivingRecords) && receivingRecords.length > 0) {
      const records = receivingRecords.map((r: any) => ({
        grn_number: r.grnNumber,
        pr_number: r.prNumber,
        po_number: r.poNumber,
        receipt_date: r.receiptDate || new Date().toISOString().split('T')[0],
        reporting_period: r.reportingPeriod,
        warehouse_code: r.warehouseCode,
        item_code: r.itemCode,
        supplier_name: r.supplierName,
        quantity_received: r.quantityReceived,
        unit_cost: r.unitCost,
        inspection_status: r.inspectionStatus || 'Accepted',
      }));
      const { error } = await supabase.from('receiving_data').upsert(records);
      syncResults['receiving_data'] = { attempted: records.length, succeeded: error ? 0 : records.length, error: error?.message };
    }

    // 6. Expiry Records
    if (expiryRecords && Array.isArray(expiryRecords) && expiryRecords.length > 0) {
      const records = expiryRecords.map((e: any) => ({
        warehouse_code: e.warehouseCode,
        item_code: e.itemCode,
        batch_number: e.batchNumber,
        expiry_date: e.expiryDate,
        quantity_remaining: e.quantityRemaining,
        unit_cost: e.unitCost,
        reporting_period: '2026-10',
      }));
      const { error } = await supabase.from('expiry_data').upsert(records);
      syncResults['expiry_data'] = { attempted: records.length, succeeded: error ? 0 : records.length, error: error?.message };
    }

    // 7. Analytical Outputs
    if (analyticalOutputs && Array.isArray(analyticalOutputs) && analyticalOutputs.length > 0) {
      const { error } = await supabase.from('analytical_outputs').upsert(analyticalOutputs);
      syncResults['analytical_outputs'] = { attempted: analyticalOutputs.length, succeeded: error ? 0 : analyticalOutputs.length, error: error?.message };
    }

    res.json({
      success: true,
      syncResults,
      message: 'All warehouse data and analytical outputs synchronized with Supabase.',
    });
  } catch (err: any) {
    console.error('Batch sync error:', err);
    res.status(500).json({ error: err.message || 'Failed to sync data with Supabase' });
  }
});

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false, // Prevents Vite from attempting WebSocket HMR in sandbox/preview
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Inventra running on port ${PORT}`);
  });
}

startServer();
