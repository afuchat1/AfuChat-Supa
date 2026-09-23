import { pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { authUsersTable } from "./auth-users";

const afucloudSchema = pgSchema("afucloud");

export const personalTokensTable = afucloudSchema.table("personal_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  prefix: text("prefix").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  scopes: text("scopes").array().notNull().default([]),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPersonalTokenSchema = createInsertSchema(personalTokensTable).omit({ id: true, createdAt: true });
export type InsertPersonalToken = z.infer<typeof insertPersonalTokenSchema>;
export type PersonalToken = typeof personalTokensTable.$inferSelect;
