import { boolean, integer, pgSchema, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { authUsersTable } from "./auth-users";
import { projectsTable } from "./projects";
import { hostnamesTable } from "./domains";

const afucloudSchema = pgSchema("afucloud");

export const storageContainersTable = afucloudSchema.table("storage_containers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  projectId: uuid("project_id").references(() => projectsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description"),
  accessMode: text("access_mode").notNull().default("private"),
  cdnEnabled: boolean("cdn_enabled").notNull().default(false),
  cdnHostnameId: uuid("cdn_hostname_id").references(() => hostnamesTable.id, { onDelete: "set null" }),
  cdnStatus: text("cdn_status").notNull().default("disabled"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  userSlugUnique: uniqueIndex("storage_containers_user_slug_unique").on(table.userId, table.slug),
}));

export const storageObjectsTable = afucloudSchema.table("storage_objects", {
  id: uuid("id").primaryKey().defaultRandom(),
  containerId: uuid("container_id").notNull().references(() => storageContainersTable.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => authUsersTable.id, { onDelete: "cascade" }),
  objectKey: text("object_key").notNull(),
  name: text("name").notNull(),
  contentType: text("content_type"),
  size: integer("size").notNull().default(0),
  etag: text("etag"),
  isFolder: boolean("is_folder").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => ({
  containerObjectUnique: uniqueIndex("storage_objects_container_key_unique").on(table.containerId, table.objectKey),
}));

export const insertStorageContainerSchema = createInsertSchema(storageContainersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStorageContainer = z.infer<typeof insertStorageContainerSchema>;
export type StorageContainer = typeof storageContainersTable.$inferSelect;
export type StorageObject = typeof storageObjectsTable.$inferSelect;