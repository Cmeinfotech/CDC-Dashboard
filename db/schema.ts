import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const uploads = sqliteTable("uploads", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), reportType: text("report_type").notNull(),
  fileName: text("file_name").notNull(), fileSize: integer("file_size").notNull(), sheetName: text("sheet_name").notNull(),
  rowCount: integer("row_count").notNull(), validCount: integer("valid_count").notNull(), invalidCount: integer("invalid_count").notNull(),
  parentsCount: integer("parents_count").notNull().default(0), childrenCount: integer("children_count").notNull().default(0),
  revenue: integer("revenue_cents").notNull().default(0), changesCount: integer("changes_count").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("uploads_user_type_created_idx").on(table.userId, table.reportType, table.createdAt)]);

export const snapshotRows = sqliteTable("snapshot_rows", {
  id: integer("id").primaryKey({ autoIncrement: true }), uploadId: text("upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(), reportType: text("report_type").notNull(), recordKey: text("record_key").notNull(),
  asin: text("asin").notNull().default(""), parentAsin: text("parent_asin").notNull().default(""), sku: text("sku").notNull().default(""),
  month: text("month").notNull().default(""), data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
}, (table) => [index("snapshot_rows_upload_idx").on(table.uploadId), index("snapshot_rows_user_asin_idx").on(table.userId, table.asin)]);

export const detectedChanges = sqliteTable("detected_changes", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), previousUploadId: text("previous_upload_id"),
  currentUploadId: text("current_upload_id").notNull().references(() => uploads.id, { onDelete: "cascade" }), kind: text("kind").notNull(),
  asin: text("asin").notNull(), sku: text("sku").notNull().default(""), parentSku: text("parent_sku").notNull().default(""),
  product: text("product").notNull().default(""), previousAsin: text("previous_asin").notNull().default(""), currentAsin: text("current_asin").notNull().default(""),
  details: text("details", { mode: "json" }).$type<Array<{ field: string; previous: string; current: string }>>().notNull(),
  status: text("status").notNull().default("Ready to merge"), confidence: integer("confidence").notNull().default(100),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("changes_user_created_idx").on(table.userId, table.createdAt)]);

export const asinHistory = sqliteTable("asin_history", {
  id: integer("id").primaryKey({ autoIncrement: true }), userId: text("user_id").notNull(), product: text("product").notNull(),
  currentAsin: text("current_asin").notNull(), previousAsin: text("previous_asin").notNull(), mergedAt: text("merged_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("asin_history_user_idx").on(table.userId)]);
