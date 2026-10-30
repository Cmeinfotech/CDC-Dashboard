import { index, int, json, mysqlTable, timestamp, varchar } from "drizzle-orm/mysql-core";

export const uploads = mysqlTable("uploads", {
  id: varchar("id", { length: 191 }).primaryKey(), userId: varchar("user_id", { length: 191 }).notNull(), reportType: varchar("report_type", { length: 32 }).notNull(),
  fileName: varchar("file_name", { length: 512 }).notNull(), fileSize: int("file_size").notNull(), sheetName: varchar("sheet_name", { length: 255 }).notNull(),
  rowCount: int("row_count").notNull(), validCount: int("valid_count").notNull(), invalidCount: int("invalid_count").notNull(),
  parentsCount: int("parents_count").notNull().default(0), childrenCount: int("children_count").notNull().default(0),
  revenue: int("revenue_cents").notNull().default(0), changesCount: int("changes_count").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [index("uploads_user_type_created_idx").on(table.userId, table.reportType, table.createdAt)]);

export const snapshotRows = mysqlTable("snapshot_rows", {
  id: int("id").autoincrement().primaryKey(), uploadId: varchar("upload_id", { length: 191 }).notNull().references(() => uploads.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 191 }).notNull(), reportType: varchar("report_type", { length: 32 }).notNull(), recordKey: varchar("record_key", { length: 512 }).notNull(),
  asin: varchar("asin", { length: 191 }).notNull().default(""), parentAsin: varchar("parent_asin", { length: 191 }).notNull().default(""), sku: varchar("sku", { length: 191 }).notNull().default(""),
  month: varchar("month", { length: 32 }).notNull().default(""), data: json("data").$type<Record<string, unknown>>().notNull(),
}, (table) => [index("snapshot_rows_upload_idx").on(table.uploadId), index("snapshot_rows_user_asin_idx").on(table.userId, table.asin)]);

export const detectedChanges = mysqlTable("detected_changes", {
  id: varchar("id", { length: 191 }).primaryKey(), userId: varchar("user_id", { length: 191 }).notNull(), previousUploadId: varchar("previous_upload_id", { length: 191 }),
  currentUploadId: varchar("current_upload_id", { length: 191 }).notNull().references(() => uploads.id, { onDelete: "cascade" }), kind: varchar("kind", { length: 32 }).notNull(),
  asin: varchar("asin", { length: 191 }).notNull(), sku: varchar("sku", { length: 191 }).notNull().default(""), parentSku: varchar("parent_sku", { length: 191 }).notNull().default(""),
  product: varchar("product", { length: 1000 }).notNull().default(""), previousAsin: varchar("previous_asin", { length: 191 }).notNull().default(""), currentAsin: varchar("current_asin", { length: 191 }).notNull().default(""),
  details: json("details").$type<Array<{ field: string; previous: string; current: string }>>().notNull(),
  status: varchar("status", { length: 64 }).notNull().default("Ready to merge"), confidence: int("confidence").notNull().default(100),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [index("changes_user_created_idx").on(table.userId, table.createdAt)]);

export const asinHistory = mysqlTable("asin_history", {
  id: int("id").autoincrement().primaryKey(), userId: varchar("user_id", { length: 191 }).notNull(), product: varchar("product", { length: 1000 }).notNull(),
  currentAsin: varchar("current_asin", { length: 191 }).notNull(), previousAsin: varchar("previous_asin", { length: 191 }).notNull(), mergedAt: timestamp("merged_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [index("asin_history_user_idx").on(table.userId)]);

export const changeAudit = mysqlTable("change_audit", {
  id: varchar("id", { length: 191 }).primaryKey(), userId: varchar("user_id", { length: 191 }).notNull(), actor: varchar("actor", { length: 191 }).notNull(),
  action: varchar("action", { length: 64 }).notNull(), entityType: varchar("entity_type", { length: 64 }).notNull(), entityId: varchar("entity_id", { length: 191 }).notNull(),
  summary: varchar("summary", { length: 1000 }).notNull(), details: json("details").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).notNull().defaultNow(),
}, (table) => [index("change_audit_user_created_idx").on(table.userId, table.createdAt)]);
