---
name: Shared AfuChat profile lookup
description: Which existing Supabase profile relation owns current-user hydration for centrally authenticated AfuChat accounts.
---

AfuChat's authenticated current-user profile is stored in the shared `accounts.profiles` relation. The `public.profiles` compatibility view points to the AfuChat product schema and can have no row for an account that already has a valid shared AfuAuth identity and an `accounts.profiles` row. Keep the profile read scoped to the `accounts` PostgREST schema and derive the lookup ID only from the verified Supabase bearer. Do not create a duplicate profile or change product-data reads such as conversations away from their existing schema.

**Why:** A real authenticated lookup returned `404` when reading the AfuChat compatibility view even though the same verified identity had a complete profile in `accounts.profiles`; the `accounts` row was readable under the user's bearer and the corrected profile endpoint returned `200`.

**How to apply:** For `/v1/chat/me`, verify the token through AfuAuth, forward the same bearer to Supabase with `Accept-Profile: accounts`, and return only the authenticated user's profile. Keep unrelated AfuChat business data on its current schema and avoid schema migrations or copied user rows.
