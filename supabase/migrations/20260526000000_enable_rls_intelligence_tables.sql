-- Security fix: enable RLS on intelligence/scraper tables that were left open.
-- These tables contain competitive market data (listings, price changes) and
-- AI-generated daily briefs — they should be readable by authenticated users only.
--
-- Applied directly to production on 2026-05-26 via Management API before this
-- migration was recorded here.  Running ENABLE again is idempotent; CREATE POLICY
-- is guarded by IF NOT EXISTS.

ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_changes ENABLE ROW LEVEL SECURITY;

-- Read-only for any authenticated session (estimator, admin, owner, viewer)
CREATE POLICY IF NOT EXISTS "Authenticated read daily_briefs"
  ON daily_briefs FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Authenticated read listings"
  ON listings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY IF NOT EXISTS "Authenticated read listing_changes"
  ON listing_changes FOR SELECT
  USING (auth.role() = 'authenticated');
