-- Keep AfuMusic purchases and creator earnings visible in the shared AfuPay
-- transaction history. The rows are written in the same transaction as wallet
-- changes and ownership, so a ledger failure rolls the purchase back.

create or replace function public.purchase_music_track(p_track_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer uuid := auth.uid();
  v_track public.music_tracks%rowtype;
  v_existing public.music_purchases%rowtype;
  v_purchase_id uuid;
  v_metadata jsonb;
begin
  if v_buyer is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_track
  from public.music_tracks
  where id = p_track_id and status = 'published'
  for update;

  if not found then
    raise exception 'track_not_available';
  end if;

  select * into v_existing
  from public.music_purchases
  where track_id = p_track_id and buyer_id = v_buyer
  for update;

  if found then
    return jsonb_build_object('ok', true, 'already_owned', true, 'price_acoin', v_existing.price_acoin);
  end if;

  if v_track.creator_id <> v_buyer and v_track.price_acoin > 0 then
    perform public.deduct_acoin(v_buyer, v_track.price_acoin);
    perform public.credit_acoin(v_track.creator_id, v_track.price_acoin);
  end if;

  insert into public.music_purchases (track_id, buyer_id, creator_id, price_acoin)
  values (v_track.id, v_buyer, v_track.creator_id, v_track.price_acoin)
  returning id into v_purchase_id;

  insert into public.music_transactions (track_id, buyer_id, creator_id, amount_acoin)
  values (v_track.id, v_buyer, v_track.creator_id, v_track.price_acoin);

  if v_track.creator_id <> v_buyer and v_track.price_acoin > 0 then
    v_metadata := jsonb_build_object(
      'source', 'afumusic',
      'music_purchase_id', v_purchase_id,
      'track_id', v_track.id,
      'track_title', v_track.title,
      'creator_id', v_track.creator_id,
      'buyer_id', v_buyer
    );

    insert into public.acoin_transactions (user_id, amount, transaction_type, metadata)
    values
      (
        v_buyer,
        -v_track.price_acoin,
        'music_purchase',
        v_metadata || jsonb_build_object('counterparty_id', v_track.creator_id)
      ),
      (
        v_track.creator_id,
        v_track.price_acoin,
        'music_sale',
        v_metadata || jsonb_build_object('counterparty_id', v_buyer)
      );
  end if;

  return jsonb_build_object('ok', true, 'already_owned', false, 'price_acoin', v_track.price_acoin);
end;
$$;

revoke all on function public.purchase_music_track(uuid) from public;
grant execute on function public.purchase_music_track(uuid) to authenticated;
