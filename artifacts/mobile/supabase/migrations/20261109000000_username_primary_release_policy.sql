-- Enforce one free primary username per account while preserving paid aliases.
-- Free handles are released immediately when a profile changes its handle.
-- Purchased aliases remain in owned_usernames and can still be listed/resold.

ALTER TABLE public.owned_usernames
  ADD COLUMN IF NOT EXISTS acquired_at timestamptz;

-- Recover older paid aliases from marketplace purchase records and completed
-- transfers. This must run before stale free reservations are released.
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
      FROM public.username_listings listing
      WHERE lower(listing.username) = lower(owned.handle)
        AND listing.is_active = false
        AND listing.seller_id <> owned.owner_id
        AND (
          listing.is_auction = false
          OR listing.current_bidder_id = owned.owner_id
        )
    )
  );

-- A free handle that was left listed after its owner changed names is no
-- longer eligible for sale. Close those stale listings before releasing it.
UPDATE public.username_listings listing
SET is_active = false
WHERE listing.is_active = true
  AND EXISTS (
    SELECT 1
    FROM public.owned_usernames owned
    WHERE lower(owned.handle) = lower(listing.username)
      AND owned.owner_id = listing.seller_id
      AND owned.acquired_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = listing.seller_id
      AND lower(profile.handle) = lower(listing.username)
  );

-- Remove orphaned free reservations left behind by previous username changes.
-- Keep current primary handles and every alias proven to have been purchased.
DELETE FROM public.owned_usernames owned
WHERE owned.acquired_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles profile
    WHERE profile.id = owned.owner_id
      AND lower(profile.handle) = lower(owned.handle)
  );

CREATE OR REPLACE FUNCTION public.release_previous_free_username()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP <> 'UPDATE'
     OR lower(coalesce(OLD.handle, '')) = lower(coalesce(NEW.handle, '')) THEN
    RETURN NEW;
  END IF;

  -- A listed username is reserved for its active sale. The owner must delist
  -- it before changing their primary handle.
  IF EXISTS (
    SELECT 1
    FROM public.username_listings listing
    WHERE lower(listing.username) = lower(OLD.handle)
      AND listing.seller_id = OLD.id
      AND listing.is_active = true
  ) THEN
    RAISE EXCEPTION 'Delist your current username before changing it';
  END IF;

  -- A free primary handle is not a permanent alias. Paid aliases are retained.
  DELETE FROM public.owned_usernames owned
  WHERE owned.owner_id = OLD.id
    AND lower(owned.handle) = lower(OLD.handle)
    AND owned.acquired_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_release_previous_free_username ON public.profiles;
CREATE TRIGGER profiles_release_previous_free_username
  AFTER UPDATE OF handle ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.release_previous_free_username();

REVOKE ALL ON FUNCTION public.release_previous_free_username() FROM PUBLIC;

-- Marketplace transfers deactivate the listing before changing the seller's
-- profile handle. This lets the release trigger distinguish a completed sale
-- from an ordinary user-initiated username change.
CREATE OR REPLACE FUNCTION public.purchase_username(p_listing_id uuid)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_fallback text;
  v_existing_owner uuid;
  v_deduction jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;

  SELECT *
  INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id
    AND is_active = true
    AND is_auction = false
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This username is no longer available';
  END IF;
  IF v_listing.price < 1 OR v_listing.price > 1000 THEN
    RAISE EXCEPTION 'This username is no longer available under the current price policy';
  END IF;
  IF v_listing.seller_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot buy your own username';
  END IF;

  SELECT owner_id
  INTO v_existing_owner
  FROM public.owned_usernames
  WHERE lower(handle) = lower(v_listing.username)
  FOR UPDATE;

  IF v_existing_owner IS NOT NULL
     AND v_existing_owner <> v_listing.seller_id THEN
    RAISE EXCEPTION 'This username is already owned';
  END IF;

  v_deduction := public.deduct_acoin(auth.uid(), v_listing.price);
  IF COALESCE((v_deduction ->> 'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(v_deduction ->> 'message', 'Insufficient ACoin');
  END IF;
  PERFORM public.credit_acoin(v_listing.seller_id, v_listing.price);

  INSERT INTO public.acoin_transactions (user_id, amount, transaction_type, metadata)
  VALUES
    (
      auth.uid(), -v_listing.price, 'marketplace_purchase',
      jsonb_build_object(
        'item_type', 'username',
        'username', v_listing.username,
        'listing_id', v_listing.id,
        'seller_id', v_listing.seller_id
      )
    ),
    (
      v_listing.seller_id, v_listing.price, 'marketplace_sale',
      jsonb_build_object(
        'item_type', 'username',
        'username', v_listing.username,
        'listing_id', v_listing.id,
        'buyer_id', auth.uid()
      )
    );

  -- Deactivate inside this same transaction before the seller's profile update.
  UPDATE public.username_listings
  SET is_active = false
  WHERE id = v_listing.id;

  v_fallback := 'user_' || replace(substr(v_listing.seller_id::text, 1, 12), '-', '');
  UPDATE public.profiles
  SET handle = v_fallback
  WHERE id = v_listing.seller_id
    AND lower(handle) = lower(v_listing.username);

  INSERT INTO public.owned_usernames (handle, owner_id)
  VALUES (lower(v_listing.username), auth.uid())
  ON CONFLICT (lower(handle)) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        acquired_at = now();

  PERFORM public.publish_username_market_event(
    'acquired', v_listing.username, v_listing.price, auth.uid(), v_listing.seller_id
  );

  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_username(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_username(uuid) TO authenticated;

-- Keep older active auctions compatible with the same primary-handle release
-- and purchased-alias retention policy.
CREATE OR REPLACE FUNCTION public.settle_username_auction(p_listing_id uuid)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_fallback text;
BEGIN
  SELECT *
  INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id
    AND is_active = true
    AND is_auction = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'This auction is no longer available';
  END IF;
  IF v_listing.auction_end_at IS NULL OR v_listing.auction_end_at > now() THEN
    RAISE EXCEPTION 'This auction is still live';
  END IF;

  IF v_listing.current_bidder_id IS NULL
     OR coalesce(v_listing.current_bid, 0) < coalesce(v_listing.reserve_price, 0) THEN
    IF v_listing.current_bidder_id IS NOT NULL THEN
      PERFORM public.credit_acoin(v_listing.current_bidder_id, v_listing.current_bid);
    END IF;
    UPDATE public.username_listings
    SET is_active = false
    WHERE id = v_listing.id;
    v_listing.is_active := false;
    RETURN v_listing;
  END IF;

  PERFORM public.credit_acoin(v_listing.seller_id, v_listing.current_bid);

  -- Deactivate before changing the seller's primary handle, within this tx.
  UPDATE public.username_listings
  SET is_active = false
  WHERE id = v_listing.id;

  v_fallback := 'user_' || replace(substr(v_listing.seller_id::text, 1, 12), '-', '');
  UPDATE public.profiles
  SET handle = v_fallback
  WHERE id = v_listing.seller_id
    AND lower(handle) = lower(v_listing.username);

  INSERT INTO public.owned_usernames (handle, owner_id)
  VALUES (lower(v_listing.username), v_listing.current_bidder_id)
  ON CONFLICT (lower(handle)) DO UPDATE
    SET owner_id = EXCLUDED.owner_id,
        acquired_at = now();

  PERFORM public.publish_username_market_event(
    'acquired',
    v_listing.username,
    v_listing.current_bid,
    v_listing.current_bidder_id,
    v_listing.seller_id
  );

  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_username_auction(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_username_auction(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
