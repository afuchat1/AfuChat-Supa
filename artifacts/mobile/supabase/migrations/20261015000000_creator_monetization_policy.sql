-- Monetization policy for Standard/Pro accounts, the username marketplace,
-- and unified AfuMusic creator eligibility.

UPDATE public.subscription_plans
SET name = 'Standard',
    acoin_price = 299,
    duration_days = 30,
    grants_verification = true
WHERE tier = 'silver';

UPDATE public.subscription_plans
SET name = 'Pro',
    acoin_price = 599,
    duration_days = 30,
    grants_verification = true
WHERE tier = 'gold';

-- Preserve the existing top-tier verification entitlement for current
-- Platinum subscribers. Platinum pricing and benefits are otherwise unchanged.
UPDATE public.subscription_plans
SET grants_verification = true
WHERE tier = 'platinum';

-- The existing deduction RPC returns a JSON status instead of raising on an
-- insufficient balance. Preserve that response shape, but reject cross-account
-- and non-positive deductions so callers cannot spend another user's wallet or
-- turn a negative debit into a credit.
CREATE OR REPLACE FUNCTION public.deduct_acoin(p_user_id uuid, p_amount integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_acoin integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Not authenticated');
  END IF;
  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', 'You can only debit your own wallet');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('success', false, 'message', 'Amount must be greater than zero');
  END IF;

  SELECT acoin
  INTO v_current_acoin
  FROM public.profiles
  WHERE id = auth.uid()
  FOR UPDATE;

  IF v_current_acoin IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'User not found');
  END IF;
  IF v_current_acoin < p_amount THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Insufficient ACoins',
      'current_acoin', v_current_acoin,
      'required', p_amount
    );
  END IF;

  UPDATE public.profiles
  SET acoin = acoin - p_amount
  WHERE id = auth.uid();

  RETURN jsonb_build_object('success', true, 'new_balance', v_current_acoin - p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public._is_afu_verified_creator(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE((SELECT profile.is_verified FROM public.profiles profile WHERE profile.id = p_user_id), false)
    OR EXISTS (
      SELECT 1
      FROM public.user_subscriptions subscription
      JOIN public.subscription_plans plan ON plan.id = subscription.plan_id
      WHERE subscription.user_id = p_user_id
        AND subscription.is_active = true
        AND subscription.expires_at > now()
        AND plan.tier IN ('silver', 'gold', 'platinum')
        AND plan.grants_verification = true
    );
$$;

REVOKE ALL ON FUNCTION public._is_afu_verified_creator(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_user_is_afu_verified_creator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public._is_afu_verified_creator(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.current_user_is_afu_verified_creator() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_is_afu_verified_creator() TO authenticated;

-- Existing active listings priced above the new cap (including auction
-- reserves and current bids) are withdrawn before the policy trigger is added.
UPDATE public.username_listings
SET is_active = false
WHERE is_active = true
  AND GREATEST(
    COALESCE(price, 0),
    COALESCE(reserve_price, 0),
    COALESCE(current_bid, 0)
  ) > 1000;

CREATE OR REPLACE FUNCTION public.enforce_username_listing_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT NEW.is_active THEN
    RETURN NEW;
  END IF;

  IF NEW.price IS NULL OR NEW.price < 1 OR NEW.price > 1000 THEN
    RAISE EXCEPTION 'Username price must be between 1 and 1000 ACoin';
  END IF;

  IF GREATEST(
    COALESCE(NEW.price, 0),
    COALESCE(NEW.reserve_price, 0),
    COALESCE(NEW.current_bid, 0)
  ) > 1000 THEN
    RAISE EXCEPTION 'Username listing price cannot exceed 1000 ACoin';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.seller_id::text, 0));
  IF NOT public._is_afu_verified_creator(NEW.seller_id) THEN
    RAISE EXCEPTION 'An active verified creator account is required to list a username';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.username_listings existing
    WHERE existing.seller_id = NEW.seller_id
      AND existing.is_active = true
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'Only one active username listing is allowed per account';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS username_listing_policy_guard ON public.username_listings;
CREATE TRIGGER username_listing_policy_guard
BEFORE INSERT OR UPDATE OF price, reserve_price, current_bid, seller_id, is_active, is_auction
ON public.username_listings
FOR EACH ROW EXECUTE FUNCTION public.enforce_username_listing_policy();

CREATE OR REPLACE FUNCTION public.create_username_listing(
  p_username text,
  p_price integer,
  p_is_auction boolean DEFAULT false,
  p_duration_hours integer DEFAULT NULL
)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_username text := lower(trim(p_username));
  v_listing public.username_listings;
  v_is_resale boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  IF v_username !~ '^[a-z0-9_]{1,30}$' THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;
  IF p_price IS NULL OR p_price < 1 OR p_price > 1000 THEN
    RAISE EXCEPTION 'Username price must be between 1 and 1000 ACoin';
  END IF;
  IF COALESCE(p_is_auction, false) THEN
    RAISE EXCEPTION 'Auctions are not supported';
  END IF;
  IF NOT public._is_afu_verified_creator(auth.uid()) THEN
    RAISE EXCEPTION 'An active verified creator account is required to list a username';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text, 0));
  IF EXISTS (
    SELECT 1
    FROM public.username_listings
    WHERE seller_id = auth.uid()
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Only one active username listing is allowed per account';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND lower(handle) = v_username
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.owned_usernames
    WHERE owner_id = auth.uid()
      AND lower(handle) = v_username
  ) THEN
    RAISE EXCEPTION 'You can only list a username you own';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.username_listings
    WHERE lower(username) = v_username
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'This username is already listed';
  END IF;

  v_is_resale := EXISTS (
    SELECT 1
    FROM public.username_listings
    WHERE lower(username) = v_username
      AND is_active = false
  ) OR (
    EXISTS (
      SELECT 1
      FROM public.owned_usernames
      WHERE owner_id = auth.uid()
        AND lower(handle) = v_username
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND lower(handle) = v_username
    )
  );

  INSERT INTO public.username_listings (
    username, price, seller_id, is_active, is_auction,
    auction_end_at, reserve_price, current_bid, is_resale
  )
  VALUES (
    v_username, p_price, auth.uid(), true, false,
    NULL, NULL, 0, v_is_resale
  )
  RETURNING * INTO v_listing;

  PERFORM public.publish_username_market_event('listed', v_username, p_price, NULL, auth.uid());
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.create_username_listing(text, integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_username_listing(text, integer, boolean, integer) TO authenticated;

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

  UPDATE public.username_listings
  SET is_active = false
  WHERE id = v_listing.id;

  PERFORM public.publish_username_market_event(
    'acquired', v_listing.username, v_listing.price, auth.uid(), v_listing.seller_id
  );

  v_listing.is_active := false;
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_username(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_username(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.purchase_music_track(p_track_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer uuid := auth.uid();
  v_track public.music_tracks%rowtype;
  v_existing public.music_purchases%rowtype;
  v_deduction jsonb;
BEGIN
  IF v_buyer IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT *
  INTO v_track
  FROM public.music_tracks
  WHERE id = p_track_id AND status = 'published'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'track_not_available';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.music_purchases
  WHERE track_id = p_track_id AND buyer_id = v_buyer
  FOR UPDATE;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already_owned', true,
      'price_acoin', v_existing.price_acoin
    );
  END IF;

  IF v_track.creator_id <> v_buyer AND v_track.price_acoin > 0 THEN
    v_deduction := public.deduct_acoin(v_buyer, v_track.price_acoin);
    IF COALESCE((v_deduction ->> 'success')::boolean, false) IS NOT TRUE THEN
      RAISE EXCEPTION '%', COALESCE(v_deduction ->> 'message', 'Insufficient ACoin');
    END IF;
    PERFORM public.credit_acoin(v_track.creator_id, v_track.price_acoin);
  END IF;

  INSERT INTO public.music_purchases (track_id, buyer_id, creator_id, price_acoin)
  VALUES (v_track.id, v_buyer, v_track.creator_id, v_track.price_acoin);

  INSERT INTO public.music_transactions (track_id, buyer_id, creator_id, amount_acoin)
  VALUES (v_track.id, v_buyer, v_track.creator_id, v_track.price_acoin);

  RETURN jsonb_build_object(
    'ok', true,
    'already_owned', false,
    'price_acoin', v_track.price_acoin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purchase_music_track(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purchase_music_track(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.place_username_bid(p_listing_id uuid, p_amount integer)
RETURNS public.username_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_previous_bidder uuid;
  v_previous_amount integer;
  v_deduction jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 1000 THEN
    RAISE EXCEPTION 'Bid must be between 1 and 1000 ACoin';
  END IF;
  SELECT *
  INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id AND is_active = true AND is_auction = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This auction is no longer available';
  END IF;
  IF v_listing.auction_end_at IS NULL OR v_listing.auction_end_at <= now() THEN
    RAISE EXCEPTION 'This auction has ended';
  END IF;
  IF v_listing.seller_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot bid on your own username';
  END IF;
  IF p_amount <= greatest(coalesce(v_listing.current_bid, 0), coalesce(v_listing.reserve_price, 0)) THEN
    RAISE EXCEPTION 'Bid must be higher than the current bid and reserve';
  END IF;

  SELECT bidder_id, amount
  INTO v_previous_bidder, v_previous_amount
  FROM public.username_bids
  WHERE listing_id = v_listing.id
  ORDER BY amount DESC, created_at DESC
  LIMIT 1;

  v_deduction := public.deduct_acoin(auth.uid(), p_amount);
  IF COALESCE((v_deduction ->> 'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(v_deduction ->> 'message', 'Insufficient ACoin');
  END IF;
  IF v_previous_bidder IS NOT NULL THEN
    PERFORM public.credit_acoin(v_previous_bidder, v_previous_amount);
  END IF;

  INSERT INTO public.username_bids (listing_id, bidder_id, amount)
  VALUES (v_listing.id, auth.uid(), p_amount);
  UPDATE public.username_listings
  SET current_bid = p_amount, current_bidder_id = auth.uid()
  WHERE id = v_listing.id;
  v_listing.current_bid := p_amount;
  v_listing.current_bidder_id := auth.uid();
  RETURN v_listing;
END;
$$;

REVOKE ALL ON FUNCTION public.place_username_bid(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_username_bid(uuid, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.feature_username_listing(
  p_listing_id uuid,
  p_duration_hours integer DEFAULT 24
)
RETURNS public.username_featured_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing public.username_listings;
  v_feature public.username_featured_listings;
  v_hours integer := greatest(24, least(coalesce(p_duration_hours, 24), 168));
  v_amount integer := CASE
    WHEN greatest(24, least(coalesce(p_duration_hours, 24), 168)) <= 24 THEN 250
    WHEN greatest(24, least(coalesce(p_duration_hours, 24), 168)) <= 72 THEN 600
    ELSE 1200
  END;
  v_deduction jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in';
  END IF;
  SELECT *
  INTO v_listing
  FROM public.username_listings
  WHERE id = p_listing_id AND is_active = true
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This listing is no longer available';
  END IF;
  IF v_listing.seller_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the listing owner can feature this username';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.username_featured_listings
    WHERE listing_id = p_listing_id AND ends_at > now()
  ) THEN
    RAISE EXCEPTION 'This username is already featured';
  END IF;

  v_deduction := public.deduct_acoin(auth.uid(), v_amount);
  IF COALESCE((v_deduction ->> 'success')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION '%', COALESCE(v_deduction ->> 'message', 'Insufficient ACoin');
  END IF;

  INSERT INTO public.username_featured_listings (listing_id, sponsor_id, amount, ends_at)
  VALUES (p_listing_id, auth.uid(), v_amount, now() + (v_hours || ' hours')::interval)
  RETURNING * INTO v_feature;
  RETURN v_feature;
END;
$$;

REVOKE ALL ON FUNCTION public.feature_username_listing(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feature_username_listing(uuid, integer) TO authenticated;

-- Reuse the existing purchase settlement and ledger; do not create a second
-- wallet. This RLS policy ensures direct table inserts cannot bypass creator
-- eligibility even if a client skips the AfuMusic UI.
DROP POLICY IF EXISTS "music creators publish tracks" ON public.music_tracks;
CREATE POLICY "music creators publish tracks"
  ON public.music_tracks FOR INSERT
  WITH CHECK (
    creator_id = auth.uid()
    AND public.current_user_is_afu_verified_creator()
  );
