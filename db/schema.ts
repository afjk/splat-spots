import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const captures = sqliteTable(
  "captures",
  {
    id: text("id").primaryKey(),
    insta360Url: text("insta360_url").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    sourcePostUrl: text("source_post_url"),
    sourceAuthor: text("source_author"),
    discoveredAt: text("discovered_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    lastCheckedAt: text("last_checked_at"),
    status: text("status").notNull().default("pending"),
    tags: text("tags").notNull().default("[]"),
  },
  (table) => [index("captures_discovered_at_idx").on(table.discoveredAt)],
);

export const captureReports = sqliteTable(
  "capture_reports",
  {
    id: text("id").primaryKey(),
    captureId: text("capture_id").notNull(),
    requestType: text("request_type").notNull(),
    requesterEmail: text("requester_email").notNull(),
    relationship: text("relationship").notNull().default(""),
    message: text("message").notNull().default(""),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    status: text("status").notNull().default("open"),
  },
  (table) => [index("capture_reports_status_created_idx").on(table.status, table.createdAt)],
);
