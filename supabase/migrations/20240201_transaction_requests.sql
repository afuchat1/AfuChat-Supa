CREATE TABLE IF NOT EXISTS transaction_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  currency TEXT NOT NULL CHECK (currency IN ('nexa', 'acoin')),
  amount INTEGER NOT NULL CHECK (amount > 0),
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  CONSTRAINT no_self_request CHECK (requester_id != owner_id)
);

CREATE INDEX IF NOT EXISTS idx_txreq_owner_status ON transaction_requests(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_txreq_requester ON transaction_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_txreq_created ON transaction_requests(created_at DESC);

ALTER TABLE transaction_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "txreq_select_own" ON transaction_requests;
CREATE POLICY "txreq_select_own" ON transaction_requests
  FOR SELECT USING (auth.uid() = requester_id OR auth.uid() = owner_id);

DROP POLICY IF EXISTS "txreq_insert_requester" ON transaction_requests;
CREATE POLICY "txreq_insert_requester" ON transaction_requests
  FOR INSERT WITH CHECK (auth.uid() = requester_id AND status = 'pending');

DROP POLICY IF EXISTS "txreq_update_owner" ON transaction_requests;
CREATE POLICY "txreq_update_owner" ON transaction_requests
  FOR UPDATE USING (auth.uid() = owner_id AND status = 'pending')
  WITH CHECK (
    status IN ('accepted', 'declined')
    AND requester_id = requester_id
    AND owner_id = owner_id
    AND currency = currency
    AND amount = amount
  );

DROP POLICY IF EXISTS "txreq_cancel_requester" ON transaction_requests;
CREATE POLICY "txreq_cancel_requester" ON transaction_requests
  FOR UPDATE USING (auth.uid() = requester_id AND status = 'pending')
  WITH CHECK (
    status = 'cancelled'
    AND requester_id = requester_id
    AND owner_id = owner_id
    AND currency = currency
    AND amount = amount
  );

CREATE OR REPLACE FUNCTION txreq_immutable_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.requester_id != OLD.requester_id
    OR NEW.owner_id != OLD.owner_id
    OR NEW.currency != OLD.currency
    OR NEW.amount != OLD.amount
    OR NEW.message IS DISTINCT FROM OLD.message
    OR NEW.created_at != OLD.created_at
  THEN
    RAISE EXCEPTION 'Cannot modify immutable fields on transaction_requests';
  END IF;
  IF OLD.status != 'pending' THEN
    RAISE EXCEPTION 'Cannot update a request that is no longer pending';
  END IF;
  NEW.responded_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_txreq_immutable ON transaction_requests;
CREATE TRIGGER trg_txreq_immutable
  BEFORE UPDATE ON transaction_requests
  FOR EACH ROW
  EXECUTE FUNCTION txreq_immutable_fields();

ALTER TABLE transaction_requests REPLICA IDENTITY FULL;
