-- SQL Migration: Add pending_mints and fix status constraint
-- Run this in your Supabase SQL Editor

-- 1. Add the missing columns if they don't exist
ALTER TABLE audit_reports 
ADD COLUMN IF NOT EXISTS pending_mints JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS nft_count INT DEFAULT 0;

-- 2. Drop the old constraint that blocks the 'processing' status
-- Supabase usually names this constraint after the table and column name
ALTER TABLE audit_reports 
DROP CONSTRAINT IF EXISTS audit_reports_status_check;

-- 3. Add the updated constraint including 'processing'
ALTER TABLE audit_reports 
ADD CONSTRAINT audit_reports_status_check 
CHECK (status IN ('pending', 'processing', 'partial', 'complete', 'failed'));

-- 4. Update the default value to 'pending' just in case
ALTER TABLE audit_reports 
ALTER COLUMN status SET DEFAULT 'pending';
