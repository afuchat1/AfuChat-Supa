import { boolean, bigint, integer, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { authUsersTable } from "./auth-users";

/**
 * Shared profile record for every Afu product.
 *
 * Authentication is owned by Supabase Auth. This table deliberately has no
 * password or credential columns; user_id is the auth.users UUID.
 */
// Profiles are shared across Afu products in the accounts schema. All
// AfuCloud-owned tables use pgSchema("afucloud").
const accountsSchema = pgSchema("accounts");

export const profilesTable = accountsSchema.table("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().unique().references(() => authUsersTable.id, { onDelete: "cascade" }),
  email: text("email"),
  emailVerified: boolean("email_verified").notNull().default(false),
  fullName: text("full_name"),
  avatarUrl: text("avatar_url"),
  roleType: text("role_type").default("advertiser"),
  advertiserId: text("advertiser_id"),
  publisherId: text("publisher_id"),
  storageUsed: bigint("storage_used", { mode: "number" }).notNull().default(0),
  storageLimit: bigint("storage_limit", { mode: "number" }).notNull().default(1073741824),
  suspended: boolean("suspended").notNull().default(false),
  name: text("name"),
  avatar: text("avatar"),
  coins: integer("coins").default(0),
  referralCode: text("referral_code"),
  referralCount: integer("referral_count").default(0),
  storeCount: integer("store_count").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProfileSchema = createInsertSchema(profilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profilesTable.$inferSelect;
