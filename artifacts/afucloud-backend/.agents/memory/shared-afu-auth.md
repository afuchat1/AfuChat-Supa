---
name: Shared Afu authentication
description: Cross-product Supabase Auth and profile conventions
---

# Shared Afu authentication

Supabase `auth.users` is the only identity and credential source across Afu products. `accounts.profiles.user_id` links shared profile data to the Auth UUID. Product schemas such as `afucloud` reference `auth.users(id)` directly.

**Why:** Product-specific user tables and password columns caused accounts and ownership records to diverge across AfuChat, AfuMail, AfuAI, AfuCloud, and AfuAds.

**How to apply:** Add new domain tables under the product schema, use `user_id uuid references auth.users(id)`, and read shared display data from `accounts.profiles` by `user_id`. Do not add product credential tables or use `accounts.profiles.id` as the Auth identity.