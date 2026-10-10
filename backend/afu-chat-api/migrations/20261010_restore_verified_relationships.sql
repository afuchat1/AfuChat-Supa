-- Restores legacy AfuChat foreign keys that were absent from the new project.
-- Before applying, the target columns were checked for orphan rows and
-- referenced PK/unique keys. This adds constraints only; it does not rewrite IDs
-- or application rows. Existing profile edges with divergent targets are
-- intentionally left unchanged.

BEGIN;

ALTER TABLE "afuchat"."ad_campaigns" ADD CONSTRAINT "ad_campaigns_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "afuchat"."posts" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."ad_campaigns" ADD CONSTRAINT "ad_campaigns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "afuchat"."merchant_products" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."ad_clicks" ADD CONSTRAINT "ad_clicks_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "afuchat"."ad_campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."ad_impressions" ADD CONSTRAINT "ad_impressions_ad_id_fkey" FOREIGN KEY ("ad_id") REFERENCES "afuchat"."ad_campaigns" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."afumail_recipients" ADD CONSTRAINT "afumail_recipients_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "afuchat"."afumail_emails" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."afumail_user_emails" ADD CONSTRAINT "afumail_user_emails_email_id_fkey" FOREIGN KEY ("email_id") REFERENCES "afuchat"."afumail_emails" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "afuchat"."ai_conversations" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."calls" ADD CONSTRAINT "calls_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."channel_subscriptions" ADD CONSTRAINT "channel_subscriptions_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "afuchat"."channels" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."chat_folder_assignments" ADD CONSTRAINT "chat_folder_assignments_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."chat_folder_assignments" ADD CONSTRAINT "chat_folder_assignments_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "afuchat"."chat_folders" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."chat_label_assignments" ADD CONSTRAINT "chat_label_assignments_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."chat_label_assignments" ADD CONSTRAINT "chat_label_assignments_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "afuchat"."chat_labels" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."chat_members" ADD CONSTRAINT "chat_members_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "afuchat"."conversations" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."chat_mutes" ADD CONSTRAINT "chat_mutes_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."chat_preferences" ADD CONSTRAINT "chat_preferences_theme_id_fkey" FOREIGN KEY ("theme_id") REFERENCES "afuchat"."chat_themes" ("id");
ALTER TABLE "afuchat"."chat_preferences" ADD CONSTRAINT "chat_preferences_wallpaper_id_fkey" FOREIGN KEY ("wallpaper_id") REFERENCES "afuchat"."chat_wallpapers" ("id");
ALTER TABLE "afuchat"."collection_items" ADD CONSTRAINT "collection_items_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "afuchat"."collections" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."community_members" ADD CONSTRAINT "community_members_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "afuchat"."paid_communities" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."conversation_participants" ADD CONSTRAINT "conversation_participants_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "afuchat"."conversations" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."engagera_api_logs" ADD CONSTRAINT "engagera_api_logs_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "afuchat"."engagera_api_keys" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."engagera_dataset_candidates" ADD CONSTRAINT "engagera_dataset_candidates_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "afuchat"."engagera_api_keys" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."engagera_document_chunks" ADD CONSTRAINT "engagera_document_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "afuchat"."engagera_documents" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."engagera_messages" ADD CONSTRAINT "engagera_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "afuchat"."engagera_conversations" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."engagera_reviewer_logs" ADD CONSTRAINT "engagera_reviewer_logs_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "afuchat"."engagera_dataset_candidates" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."engagera_training_jobs" ADD CONSTRAINT "engagera_training_jobs_model_key_fkey" FOREIGN KEY ("model_key") REFERENCES "afuchat"."engagera_model_registry" ("model_key") ON DELETE CASCADE;
ALTER TABLE "afuchat"."engagera_usage_records" ADD CONSTRAINT "engagera_usage_records_api_key_id_fkey" FOREIGN KEY ("api_key_id") REFERENCES "afuchat"."engagera_api_keys" ("id");
ALTER TABLE "afuchat"."freelance_orders" ADD CONSTRAINT "freelance_orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "afuchat"."freelance_listings" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."freelance_reviews" ADD CONSTRAINT "freelance_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "afuchat"."freelance_listings" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."freelance_reviews" ADD CONSTRAINT "freelance_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "afuchat"."freelance_orders" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."gift_marketplace" ADD CONSTRAINT "gift_marketplace_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "afuchat"."gifts" ("id");
ALTER TABLE "afuchat"."gift_marketplace" ADD CONSTRAINT "gift_marketplace_user_gift_id_fkey" FOREIGN KEY ("user_gift_id") REFERENCES "afuchat"."user_gifts" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."gift_statistics" ADD CONSTRAINT "gift_statistics_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "afuchat"."gifts" ("id");
ALTER TABLE "afuchat"."gift_transactions" ADD CONSTRAINT "gift_transactions_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "afuchat"."channels" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."gift_transactions" ADD CONSTRAINT "gift_transactions_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."gift_transactions" ADD CONSTRAINT "gift_transactions_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "afuchat"."gifts" ("id");
ALTER TABLE "afuchat"."match_matches" ADD CONSTRAINT "match_matches_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."match_messages" ADD CONSTRAINT "match_messages_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "afuchat"."match_matches" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."message_edit_history" ADD CONSTRAINT "message_edit_history_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "afuchat"."messages" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."message_reports" ADD CONSTRAINT "message_reports_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "afuchat"."messages" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."message_status" ADD CONSTRAINT "message_status_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "afuchat"."messages" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."messages" ADD CONSTRAINT "messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."messages" ADD CONSTRAINT "messages_reply_to_message_id_fkey" FOREIGN KEY ("reply_to_message_id") REFERENCES "afuchat"."messages" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."music_purchases" ADD CONSTRAINT "music_purchases_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "afuchat"."music_tracks" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."notification_events" ADD CONSTRAINT "notification_events_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "afuchat"."messages" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."org_verification_requests" ADD CONSTRAINT "org_verification_requests_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "afuchat"."organization_pages" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."organization_page_connections" ADD CONSTRAINT "organization_page_connections_follower_page_id_fkey" FOREIGN KEY ("follower_page_id") REFERENCES "afuchat"."organization_pages" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."organization_page_connections" ADD CONSTRAINT "organization_page_connections_following_page_id_fkey" FOREIGN KEY ("following_page_id") REFERENCES "afuchat"."organization_pages" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."organization_page_followers" ADD CONSTRAINT "organization_page_followers_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "afuchat"."organization_pages" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."organization_page_posts" ADD CONSTRAINT "organization_page_posts_page_id_fkey" FOREIGN KEY ("page_id") REFERENCES "afuchat"."organization_pages" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."post_acknowledgments" ADD CONSTRAINT "post_acknowledgments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "afuchat"."posts" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."post_bookmarks" ADD CONSTRAINT "post_bookmarks_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "afuchat"."posts" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."post_images" ADD CONSTRAINT "post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "afuchat"."posts" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."post_replies" ADD CONSTRAINT "post_replies_parent_reply_id_fkey" FOREIGN KEY ("parent_reply_id") REFERENCES "afuchat"."post_replies" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."post_replies" ADD CONSTRAINT "post_replies_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "afuchat"."posts" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."post_reply_likes" ADD CONSTRAINT "post_reply_likes_reply_id_fkey" FOREIGN KEY ("reply_id") REFERENCES "afuchat"."post_replies" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."post_views" ADD CONSTRAINT "post_views_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "afuchat"."posts" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."posts" ADD CONSTRAINT "posts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "afuchat"."channels" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."posts" ADD CONSTRAINT "posts_language_code_fkey" FOREIGN KEY ("language_code") REFERENCES "afuchat"."supported_languages" ("code");
ALTER TABLE "afuchat"."posts" ADD CONSTRAINT "posts_quoted_post_id_fkey" FOREIGN KEY ("quoted_post_id") REFERENCES "afuchat"."posts" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."posts" ADD CONSTRAINT "posts_video_asset_id_fkey" FOREIGN KEY ("video_asset_id") REFERENCES "afuchat"."video_assets" ("id") ON DELETE SET NULL;
ALTER TABLE "accounts"."profiles" ADD CONSTRAINT "profiles_ai_chat_id_fkey" FOREIGN KEY ("ai_chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE SET NULL;
ALTER TABLE "accounts"."profiles" ADD CONSTRAINT "profiles_language_fkey" FOREIGN KEY ("language") REFERENCES "afuchat"."supported_languages" ("code");
ALTER TABLE "afuchat"."red_envelope_claims" ADD CONSTRAINT "red_envelope_claims_red_envelope_id_fkey" FOREIGN KEY ("red_envelope_id") REFERENCES "afuchat"."red_envelopes" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."red_envelopes" ADD CONSTRAINT "red_envelopes_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "afuchat"."chats" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "afuchat"."shop_orders" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "afuchat"."shop_products" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."shop_order_messages" ADD CONSTRAINT "shop_order_messages_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "afuchat"."shop_orders" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."shop_orders" ADD CONSTRAINT "shop_orders_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "afuchat"."shops" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."shop_products" ADD CONSTRAINT "shop_products_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "afuchat"."shops" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."shop_reviews" ADD CONSTRAINT "shop_reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "afuchat"."shop_orders" ("id");
ALTER TABLE "afuchat"."shop_reviews" ADD CONSTRAINT "shop_reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "afuchat"."shop_products" ("id");
ALTER TABLE "afuchat"."shop_reviews" ADD CONSTRAINT "shop_reviews_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "afuchat"."shops" ("id");
ALTER TABLE "afuchat"."shopping_cart" ADD CONSTRAINT "shopping_cart_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "afuchat"."merchant_products" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."story_likes" ADD CONSTRAINT "story_likes_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "afuchat"."stories" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."story_replies" ADD CONSTRAINT "story_replies_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "afuchat"."stories" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."story_views" ADD CONSTRAINT "story_views_story_id_fkey" FOREIGN KEY ("story_id") REFERENCES "afuchat"."stories" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "afuchat"."support_tickets" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."user_gifts" ADD CONSTRAINT "user_gifts_gift_id_fkey" FOREIGN KEY ("gift_id") REFERENCES "afuchat"."gifts" ("id") ON DELETE CASCADE;
ALTER TABLE "afuchat"."user_gifts" ADD CONSTRAINT "user_gifts_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "afuchat"."gift_transactions" ("id") ON DELETE SET NULL;
ALTER TABLE "afuchat"."user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "afuchat"."subscription_plans" ("id");
ALTER TABLE "afuchat"."video_assets" ADD CONSTRAINT "video_assets_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "afuchat"."posts" ("id") ON DELETE CASCADE;

-- These two existing profile relationships have no orphan rows in the target.
ALTER TABLE "afuchat"."chat_members" VALIDATE CONSTRAINT "chat_members_user_id_fkey";
ALTER TABLE "afuchat"."chats" VALIDATE CONSTRAINT "chats_created_by_fkey";

COMMIT;
