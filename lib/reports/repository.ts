import { env } from "cloudflare:workers";
import type { CaptureReport } from "./types";

const createReportsTable = `
  CREATE TABLE IF NOT EXISTS capture_reports (
    id TEXT PRIMARY KEY NOT NULL,
    capture_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
  )
`;

const createReportStatusIndex = `
  CREATE INDEX IF NOT EXISTS capture_reports_status_created_idx
  ON capture_reports (status, created_at DESC)
`;

function database(): D1Database {
  if (!env.DB) throw new Error("Report storage is unavailable.");
  return env.DB;
}

async function ensureReportSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(createReportsTable),
    db.prepare(createReportStatusIndex),
  ]);
}

export async function saveCaptureReport(report: CaptureReport): Promise<CaptureReport> {
  const db = database();
  await ensureReportSchema(db);
  await db
    .prepare(
      `INSERT INTO capture_reports (
        id, capture_id, request_type, requester_email, relationship,
        message, created_at, status
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
    )
    .bind(
      report.id,
      report.capture_id,
      report.request_type,
      report.requester_email,
      report.relationship,
      report.message,
      report.created_at,
      report.status,
    )
    .run();
  return report;
}
