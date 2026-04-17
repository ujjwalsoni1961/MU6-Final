-- Migration 029: Allow authenticated buyers to insert their own mint_intents
--
-- Bug report: user was charged for an NFT mint but the mint failed with
-- "Invalid or expired auth token". The failure cascade:
--   1. Payment tx succeeded on-chain (buyer wallet debited).
--   2. Client attempted to insert into mint_intents for later reconciliation.
--   3. INSERT silently blocked by RLS (only a SELECT policy existed).
--   4. serverClaim edge function call sent the anon key as Bearer token.
--      The edge function's verifyAuth rejected it with "Invalid or expired
--      auth token", returning 401.
--   5. Client surfaced "NFT mint failed" BUT never persisted the intent,
--      so we had no audit trail of the successful payment.
--
-- Fix #1 (this migration): Allow authenticated users to INSERT a mint_intent
-- for themselves. Buyer can only write their own buyer_profile_id, and the
-- price/tx_hash values are advisory (reconciler re-verifies on-chain anyway).
--
-- Fix #2 (client): src/services/blockchain.ts now sends the user session JWT
-- (not anon key) to the nft-admin edge function.
--
-- Together these ensure every paid mint gets a durable record for refund /
-- retry regardless of whether the on-chain claim succeeds.

BEGIN;

CREATE POLICY mint_intents_buyer_insert ON mint_intents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Either the row links to the caller's profile (typical case) OR the
    -- caller is inserting an anonymous / guest intent (buyer_profile_id
    -- nullable, buyer_wallet required). We allow both so guest purchases
    -- flow through unchanged.
    buyer_profile_id IS NULL
    OR buyer_profile_id = auth.uid()
  );

-- Buyer also needs to UPDATE their own intent (for status transitions
-- paid -> minting -> confirmed / failed) until the operator-side reconciler
-- takes over. Without this the edge function writes succeed via service role
-- but the client's `minting` transition silently fails.
CREATE POLICY mint_intents_buyer_update ON mint_intents
  FOR UPDATE
  TO authenticated
  USING (
    buyer_profile_id IS NULL
    OR buyer_profile_id = auth.uid()
  )
  WITH CHECK (
    buyer_profile_id IS NULL
    OR buyer_profile_id = auth.uid()
  );

COMMIT;
