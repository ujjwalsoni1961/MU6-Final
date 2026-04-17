-- Add admin notes and tx_hash columns to payout_requests table
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS admin_notes TEXT;
ALTER TABLE payout_requests ADD COLUMN IF NOT EXISTS tx_hash TEXT;
