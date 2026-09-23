import { pgSchema, text, timestamp, uuid, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { projectsTable } from "./projects";

const afucloudSchema = pgSchema("afucloud");

export const imagesTable = afucloudSchema.table("images", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id").notNull().references(() => projectsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  originalName: text("original_name"),
  storageKey: text("storage_key").notNull(),
  format: text("format").notNull(),
  size: integer("size").notNull().default(0),
  width: integer("width"),
  height: integer("height"),
  favorite: boolean("favorite").notNull().default(false),
  tags: text("tags").array().notNull().default([]),
  album: text("album"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertImageSchema = createInsertSchema(imagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertImage = z.infer<typeof insertImageSchema>;
export type Image = typeof imagesTable.$inferSelect;
