-- Fix Payout Requests RLS for Thirdweb-authenticated users
-- Since ThirdWeb users do not have a Supabase auth.uid() matching their profile_id,
-- we must temporarily relax the insert policy.

DROP POLICY IF EXISTS payouts_insert ON payout_requests;

CREATE POLICY payouts_insert ON payout_requests 
  FOR INSERT 
  WITH CHECK (true);
