-- Only marketplace purchases are permanent username aliases.
-- The current profile handle remains a free primary reservation.

BEGIN;

ALTER TABLE public.owned_usernames
  ALTER COLUMN acquired_at DROP DEFAULT;

ALTER TABLE public.owned_usernames
  ENABLE ROW LEVEL SECURITY;

-- Remove every client-facing write policy. Privileged purchase/claim functions
-- remain the only supported write path; public reads are retained for routing.
DO $$
DECLARE
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'owned_usernames'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.owned_usernames',
      policy_row.policyname
    );
  END LOOP;
END;
$$;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.owned_usernames
  FROM PUBLIC, anon, authenticated;

-- Also clear any column-level write grants left by older dashboard policies.
DO $$
DECLARE
  column_list text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
  INTO column_list
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'owned_usernames';

  IF column_list IS NOT NULL THEN
    EXECUTE format(
      'REVOKE INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ' ||
      'ON TABLE public.owned_usernames FROM PUBLIC, anon, authenticated',
      column_list
    );
  END IF;
END;
$$;

-- A free handle that was left listed after its owner changed names is not
-- eligible for sale. No active rows were found in the production audit, but
-- close any such stale listings before cleaning their reservations.
UPDATE public.username_listings listing
SET is_active = false
WHERE listing.is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.owned_usernames owned
    WHERE lower(owned.handle) = lower(listing.username)
      AND owned.owner_id = listing.seller_id
      AND NOT EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = owned.owner_id
          AND lower(profile.handle) = lower(owned.handle)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.acoin_transactions tx
        WHERE tx.user_id = owned.owner_id
          AND tx.transaction_type = 'marketplace_purchase'
          AND tx.metadata ->> 'item_type' = 'username'
          AND lower(tx.metadata ->> 'username') = lower(owned.handle)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.username_listings sale
        WHERE lower(sale.username) = lower(owned.handle)
          AND sale.is_active = false
          AND sale.seller_id <> owned.owner_id
          AND (
            sale.is_auction = false
            OR sale.current_bidder_id = owned.owner_id
          )
      )
  );

-- Preserve paid aliases proven by transaction history or legacy completed-sale
-- records. Do not infer a purchase from acquired_at alone: the old default
-- stamped free profile claims with the current timestamp.
UPDATE public.owned_usernames owned
SET acquired_at = COALESCE(owned.acquired_at, now())
WHERE owned.acquired_at IS NULL
  AND (
    EXISTS (
      SELECT 1
      FROM public.acoin_transactions tx
      WHERE tx.user_id = owned.owner_id
        AND tx.transaction_type = 'marketplace_purchase'
        AND tx.metadata ->> 'item_type' = 'username'
        AND lower(tx.metadata ->> 'username') = lower(owned.handle)
    )
    OR EXISTS (
      SELECT 1
      FROM public.username_listings sale
      WHERE lower(sale.username) = lower(owned.handle)
        AND sale.is_active = false
        AND sale.seller_id <> owned.owner_id
        AND (
          sale.is_auction = false
          OR sale.current_bidder_id = owned.owner_id
        )
    )
  );

-- Current primary handles are free reservations, not purchased aliases.
UPDATE public.owned_usernames owned
SET acquired_at = NULL
WHERE EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = owned.owner_id
      AND lower(profile.handle) = lower(owned.handle)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.acoin_transactions tx
    WHERE tx.user_id = owned.owner_id
      AND tx.transaction_type = 'marketplace_purchase'
      AND tx.metadata ->> 'item_type' = 'username'
      AND lower(tx.metadata ->> 'username') = lower(owned.handle)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.username_listings sale
    WHERE lower(sale.username) = lower(owned.handle)
      AND sale.is_active = false
      AND sale.seller_id <> owned.owner_id
      AND (
        sale.is_auction = false
        OR sale.current_bidder_id = owned.owner_id
      )
  );

-- Release only unpurchased reservations that are no longer the owner's
-- primary handle. Current profile handles and purchase-proven aliases remain.
DELETE FROM public.owned_usernames owned
WHERE NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = owned.owner_id
      AND lower(profile.handle) = lower(owned.handle)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.acoin_transactions tx
    WHERE tx.user_id = owned.owner_id
      AND tx.transaction_type = 'marketplace_purchase'
      AND tx.metadata ->> 'item_type' = 'username'
      AND lower(tx.metadata ->> 'username') = lower(owned.handle)
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.username_listings sale
    WHERE lower(sale.username) = lower(owned.handle)
      AND sale.is_active = false
      AND sale.seller_id <> owned.owner_id
      AND (
        sale.is_auction = false
        OR sale.current_bidder_id = owned.owner_id
      )
  );

COMMIT;
