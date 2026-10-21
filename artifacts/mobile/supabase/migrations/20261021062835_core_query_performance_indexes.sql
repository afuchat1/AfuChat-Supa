-- Evidence-driven indexes for high-frequency app queries.
-- Keep existing indexes and constraints; these are additive and reversible.
CREATE INDEX IF NOT EXISTS messages_chat_sender_idx
  ON public.messages (chat_id, sender_id);

CREATE INDEX IF NOT EXISTS post_acknowledgments_user_post_idx
  ON public.post_acknowledgments (user_id, post_id);

CREATE INDEX IF NOT EXISTS post_views_viewer_viewed_at_idx
  ON public.post_views (viewer_id, viewed_at DESC);

CREATE INDEX IF NOT EXISTS username_listings_auction_due_idx
  ON public.username_listings (auction_end_at)
  WHERE is_auction = true AND is_active = true AND settled_at IS NULL;

ANALYZE public.messages;
ANALYZE public.post_acknowledgments;
ANALYZE public.post_views;
ANALYZE public.username_listings;

NOTIFY pgrst, 'reload schema';