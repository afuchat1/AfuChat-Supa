import { boolean, jsonb, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";

const authSchema = pgSchema("auth");

/**
 * Supabase Auth's identity table. It is read by the API server only to verify
 * existing shared accounts; profile and product data remains in afucloud.
 */
export const authUsersTable = authSchema.table("users", {
  id: uuid("id").primaryKey(),
  aud: text("aud"),
  role: text("role"),
  email: text("email"),
  encryptedPassword: text("encrypted_password").notNull(),
  emailConfirmedAt: timestamp("email_confirmed_at", { withTimezone: true }),
  rawAppMetaData: jsonb("raw_app_meta_data"),
  rawUserMetaData: jsonb("raw_user_meta_data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  isBanned: boolean("is_sso_user"),
});