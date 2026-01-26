-- SolNFTscanner Database Schema
-- Run this in your Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- Table: audit_reports
-- Stores completed audit reports for download
-- ============================================
CREATE TABLE IF NOT EXISTS audit_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address TEXT NOT NULL,
    report_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'partial', 'complete', 'failed')),
    error_message TEXT,
    frozen_sol_price DECIMAL(10, 2),  -- SOL price frozen at report start for consistency
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster wallet lookups
CREATE INDEX IF NOT EXISTS idx_audit_reports_wallet ON audit_reports(wallet_address);
CREATE INDEX IF NOT EXISTS idx_audit_reports_created ON audit_reports(created_at DESC);

-- ============================================
-- Table: wallet_scans
-- Rate limiting - tracks scan frequency per wallet
-- ============================================
CREATE TABLE IF NOT EXISTS wallet_scans (
    wallet_address TEXT PRIMARY KEY,
    last_scan_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    scan_count INTEGER DEFAULT 1
);

-- ============================================
-- Table: processed_signatures
-- Prevents double-spend attacks on payment verification
-- ============================================
CREATE TABLE IF NOT EXISTS processed_signatures (
    signature TEXT PRIMARY KEY,
    wallet_address TEXT NOT NULL,
    amount_paid DECIMAL(20, 9) NOT NULL,
    nft_count INTEGER NOT NULL,
    selected_collections JSONB DEFAULT '[]'::jsonb,
    report_id UUID REFERENCES audit_reports(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for signature lookups
CREATE INDEX IF NOT EXISTS idx_processed_signatures_wallet ON processed_signatures(wallet_address);

-- ============================================
-- Row Level Security (RLS) Policies
-- Optional but recommended for production
-- ============================================

-- Enable RLS on tables
ALTER TABLE audit_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_signatures ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (for your backend)
CREATE POLICY "Service role has full access to audit_reports" 
    ON audit_reports FOR ALL 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Service role has full access to wallet_scans" 
    ON wallet_scans FOR ALL 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Service role has full access to processed_signatures" 
    ON processed_signatures FOR ALL 
    USING (true) 
    WITH CHECK (true);

-- ============================================
-- Success message
-- ============================================
SELECT 'Schema created successfully!' as status;
