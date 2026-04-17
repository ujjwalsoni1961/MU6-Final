-- Relax RLS for payout_requests because ThirdWeb auth does not set a matching Supabase auth.uid()
DROP POLICY IF EXISTS payouts_insert ON payout_requests;
CREATE POLICY payouts_insert ON payout_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS profiles_update ON profiles;
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (true) WITH CHECK (true);
