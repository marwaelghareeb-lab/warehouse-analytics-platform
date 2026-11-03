-- ==========================================================
-- WAREHOUSE ANALYTICS PLATFORM - SUPABASE POSTGRES SCHEMA
-- Designed for Hospital Warehouse Management & Historical ERP Reports
-- ==========================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. WAREHOUSES TABLE
CREATE TABLE IF NOT EXISTS public.warehouses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(100) NOT NULL, -- Central, Pharmacy, Surgical, Cold Chain, Emergency
    location VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. UPLOADED REPORTS (Tracks all imported ERP Excel files)
CREATE TABLE IF NOT EXISTS public.uploaded_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    filename VARCHAR(255) NOT NULL,
    original_storage_path TEXT, -- Reference to Supabase Storage bucket 'warehouse-reports'
    report_type VARCHAR(50) NOT NULL, -- 'stock_snapshot', 'consumption', 'receiving_grn', 'expiry_batch'
    warehouse_code VARCHAR(50) REFERENCES public.warehouses(code) ON DELETE SET NULL,
    reporting_period VARCHAR(50) NOT NULL, -- e.g., '2026-Q3', '2026-10'
    file_size_bytes BIGINT,
    total_rows_imported INTEGER DEFAULT 0,
    validation_status VARCHAR(50) DEFAULT 'completed', -- 'processing', 'completed', 'failed', 'warnings'
    validation_errors JSONB DEFAULT '[]'::jsonb,
    column_mappings JSONB DEFAULT '{}'::jsonb,
    uploaded_by VARCHAR(255) DEFAULT 'Warehouse Manager',
    is_demo BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ITEM MASTER (Consolidated Hospital Inventory Master)
CREATE TABLE IF NOT EXISTS public.item_master (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_code VARCHAR(100) UNIQUE NOT NULL,
    item_description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL, -- 'Pharmaceuticals', 'Surgical Consumables', 'Cold Chain Biologics', etc.
    unit VARCHAR(50) DEFAULT 'Units',
    standard_unit_cost NUMERIC(15, 2) DEFAULT 0.00, -- in SAR
    min_safety_stock NUMERIC(15, 2) DEFAULT 0,
    max_stock_level NUMERIC(15, 2) DEFAULT 0,
    reorder_point NUMERIC(15, 2) DEFAULT 0,
    lead_time_days INTEGER DEFAULT 14,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. STOCK SNAPSHOTS (DATED SNAPSHOTS - NEVER SUM SNAPSHOTS ACROSS DATES)
CREATE TABLE IF NOT EXISTS public.stock_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES public.uploaded_reports(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    reporting_period VARCHAR(50) NOT NULL,
    warehouse_code VARCHAR(50) NOT NULL REFERENCES public.warehouses(code) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL REFERENCES public.item_master(item_code) ON DELETE CASCADE,
    quantity_on_hand NUMERIC(15, 2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0, -- in SAR
    total_stock_value NUMERIC(18, 2) GENERATED ALWAYS AS (quantity_on_hand * unit_cost) STORED,
    stock_status VARCHAR(50) DEFAULT 'normal', -- 'low_stock', 'normal', 'overstock', 'stockout'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_item_warehouse_period UNIQUE (item_code, warehouse_code, reporting_period)
);

-- 5. CONSUMPTION / ISSUING DATA (Period-based flow)
CREATE TABLE IF NOT EXISTS public.consumption_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES public.uploaded_reports(id) ON DELETE CASCADE,
    transaction_date DATE,
    reporting_period VARCHAR(50) NOT NULL,
    warehouse_code VARCHAR(50) NOT NULL REFERENCES public.warehouses(code) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL REFERENCES public.item_master(item_code) ON DELETE CASCADE,
    department VARCHAR(100) NOT NULL, -- 'ICU', 'Emergency', 'Surgery/OR', 'Inpatient', etc.
    quantity_consumed NUMERIC(15, 2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_consumption_value NUMERIC(18, 2) GENERATED ALWAYS AS (quantity_consumed * unit_cost) STORED,
    issue_voucher_number VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. RECEIVING DATA (Goods Received Notes - Period-based flow)
CREATE TABLE IF NOT EXISTS public.receiving_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES public.uploaded_reports(id) ON DELETE CASCADE,
    grn_number VARCHAR(100) NOT NULL,
    pr_number VARCHAR(100), -- Purchase Requisition
    po_number VARCHAR(100), -- Purchase Order
    receipt_date DATE NOT NULL,
    reporting_period VARCHAR(50) NOT NULL,
    warehouse_code VARCHAR(50) NOT NULL REFERENCES public.warehouses(code) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL REFERENCES public.item_master(item_code) ON DELETE CASCADE,
    supplier_name VARCHAR(255) NOT NULL,
    quantity_received NUMERIC(15, 2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_received_value NUMERIC(18, 2) GENERATED ALWAYS AS (quantity_received * unit_cost) STORED,
    inspection_status VARCHAR(50) DEFAULT 'Accepted',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. EXPIRY & BATCH DATA (FEFO Tracking)
CREATE TABLE IF NOT EXISTS public.expiry_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id UUID REFERENCES public.uploaded_reports(id) ON DELETE CASCADE,
    warehouse_code VARCHAR(50) NOT NULL REFERENCES public.warehouses(code) ON DELETE CASCADE,
    item_code VARCHAR(100) NOT NULL REFERENCES public.item_master(item_code) ON DELETE CASCADE,
    batch_number VARCHAR(100) NOT NULL,
    expiry_date DATE NOT NULL,
    quantity_remaining NUMERIC(15, 2) NOT NULL DEFAULT 0,
    unit_cost NUMERIC(15, 2) NOT NULL DEFAULT 0,
    total_value_at_risk NUMERIC(18, 2) GENERATED ALWAYS AS (quantity_remaining * unit_cost) STORED,
    reporting_period VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_stock_snapshots_wh_period ON public.stock_snapshots(warehouse_code, reporting_period);
CREATE INDEX IF NOT EXISTS idx_stock_snapshots_item ON public.stock_snapshots(item_code);
CREATE INDEX IF NOT EXISTS idx_consumption_period_dept ON public.consumption_data(reporting_period, department);
CREATE INDEX IF NOT EXISTS idx_receiving_grn_date ON public.receiving_data(receipt_date, supplier_name);
CREATE INDEX IF NOT EXISTS idx_expiry_batch_date ON public.expiry_data(expiry_date);

-- ROW LEVEL SECURITY (RLS) POLICIES
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_master ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumption_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receiving_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expiry_data ENABLE ROW LEVEL SECURITY;

-- Allow authenticated and service_role access
CREATE POLICY "Allow public read access to warehouses" ON public.warehouses FOR SELECT USING (true);
CREATE POLICY "Allow public read access to uploaded_reports" ON public.uploaded_reports FOR SELECT USING (true);
CREATE POLICY "Allow public insert to uploaded_reports" ON public.uploaded_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public all on item_master" ON public.item_master FOR ALL USING (true);
CREATE POLICY "Allow public all on stock_snapshots" ON public.stock_snapshots FOR ALL USING (true);
CREATE POLICY "Allow public all on consumption_data" ON public.consumption_data FOR ALL USING (true);
CREATE POLICY "Allow public all on receiving_data" ON public.receiving_data FOR ALL USING (true);
CREATE POLICY "Allow public all on expiry_data" ON public.expiry_data FOR ALL USING (true);

-- STORAGE BUCKET CONFIGURATION (for Supabase Storage)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('warehouse-reports', 'warehouse-reports', false) ON CONFLICT DO NOTHING;
