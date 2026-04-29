-- Reconcile transaction_requests with what the mobile client expects.
--
-- Two earlier migrations (20240201, 20240302) defined this table with
-- conflicting status values and column names. The deployed schema ended
-- up with the 20240302 shape, but the client code (artifacts/mobile/app/
-- wallet/requests.tsx) writes `status = 'accepted'` and a `responded_at`
-- timestamp — neither of which exist on the live table — which causes
-- the "Payment sent but request status could not be updated" warning.
--
-- This migration is idempotent: it only adds what is missing.

-- 1. Make sure the responded_at column exists.
ALTER TABLE public.transaction_requests
  ADD COLUMN IF NOT EXISTS responded_at TIMESTAMPTZ;

-- Backfill from updated_at if that column is around (it was on the
-- 20240302 schema), so existing finished requests still show a response
-- time in the UI.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transaction_requests'
      AND column_name = 'updated_at'
  ) THEN
    EXECUTE 'UPDATE public.transaction_requests
             SET responded_at = updated_at
             WHERE responded_at IS NULL
               AND status <> ''pending''';
  END IF;
END $$;

-- 2. Replace the status CHECK constraint so both legacy values
--    (`approved`) and the values the client now writes (`accepted`,
--    `expired`) are accepted.
ALTER TABLE public.transaction_requests
  DROP CONSTRAINT IF EXISTS transaction_requests_status_check;

ALTER TABLE public.transaction_requests
  ADD CONSTRAINT transaction_requests_status_check
  CHECK (status IN ('pending', 'accepted', 'approved', 'declined', 'expired', 'cancelled'));

-- 3. Make sure REPLICA IDENTITY FULL is set so realtime UPDATE events
--    carry the previous row state (used by the requests screen).
ALTER TABLE public.transaction_requests REPLICA IDENTITY FULL;
