import { pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { authUsersTable } from "./auth-users";

const afucloudSchema = pgSchema("afucloud");

export const domainsTable = afucloudSchema.table("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull(),
  verificationToken: text("verification_token").notNull(),
  verificationStatus: text("verification_status").notNull().default("pending"),
  sslStatus: text("ssl_status").notNull().default("not_configured"),
  dnsStatus: text("dns_status").notNull().default("pending"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userHostnameUnique: uniqueIndex("domains_user_hostname_unique").on(table.userId, table.hostname),
}));

export const hostnamesTable = afucloudSchema.table("hostnames", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id").notNull().references(() => domainsTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  hostname: text("hostname").notNull(),
  service: text("service").notNull().default("unconnected"),
  serviceId: uuid("service_id"),
  status: text("status").notNull().default("pending"),
  sslStatus: text("ssl_status").notNull().default("pending"),
  dnsStatus: text("dns_status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userHostnameUnique: uniqueIndex("hostnames_user_hostname_unique").on(table.userId, table.hostname),
}));

export const insertDomainSchema = createInsertSchema(domainsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDomain = z.infer<typeof insertDomainSchema>;
export type Domain = typeof domainsTable.$inferSelect;
export type Hostname = typeof hostnamesTable.$inferSelect;