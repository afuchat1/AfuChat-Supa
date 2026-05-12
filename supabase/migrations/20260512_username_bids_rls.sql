-- Create username_bids table if it doesn't already exist, then add RLS policies.
-- Safe to run multiple times (IF NOT EXISTS / DROP POLICY IF EXISTS).

CREATE TABLE IF NOT EXISTS username_bids (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  listing_id  UUID         NOT NULL REFERENCES username_listings(id) ON DELETE CASCADE,
  bidder_id   UUID         NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount      INTEGER      NOT NULL CHECK (amount > 0),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS username_bids_listing_id_idx ON username_bids(listing_id);
CREATE INDEX IF NOT EXISTS username_bids_bidder_id_idx  ON username_bids(bidder_id);

ALTER TABLE username_bids ENABLE ROW LEVEL SECURITY;

-- Drop old policies first (idempotent)
DROP POLICY IF EXISTS "public read bids"        ON username_bids;
DROP POLICY IF EXISTS "authenticated insert bid" ON username_bids;
DROP POLICY IF EXISTS "bidder delete own bid"   ON username_bids;

-- Anyone can read bids (leaderboard / auction history)
CREATE POLICY "public read bids"
  ON username_bids FOR SELECT
  USING (true);

-- Authenticated users may insert their own bids
CREATE POLICY "authenticated insert bid"
  ON username_bids FOR INSERT
  WITH CHECK (auth.uid() = bidder_id);

-- Bidder can delete (retract) their own bid
CREATE POLICY "bidder delete own bid"
  ON username_bids FOR DELETE
  USING (auth.uid() = bidder_id);
