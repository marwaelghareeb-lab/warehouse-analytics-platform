import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

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

// Vite middleware in dev or static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
    console.log(`Warehouse Analytics Platform running on port ${PORT}`);
  });
}

startServer();
