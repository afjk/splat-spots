/**
 * D1 is an inbox, not the catalog. Nothing here is ever served to the public
 * site: rows wait until a person reviews them and commits a record to
 * `data/captures/`. Deleting a row does not unpublish anything, and writing
 * one does not publish anything.
 */

export type SubmissionRow = {
  id: string;
  capture_id: string;
  insta360_url: string;
  title: string;
  description: string;
  source_post_url: string | null;
  source_author: string | null;
  tags: string;
  captured_at: string | null;
  camera: string | null;
  created_at: string;
  status: string;
};

export type ReportRow = {
  id: string;
  capture_id: string;
  request_type: string;
  requester_email: string;
  relationship: string;
  message: string;
  created_at: string;
  status: string;
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY NOT NULL,
    capture_id TEXT NOT NULL,
    insta360_url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    source_post_url TEXT,
    source_author TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    captured_at TEXT,
    camera TEXT,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new'
  )`,
  // One pending submission per capture: re-submitting a queued capture updates
  // it rather than filling the queue with duplicates.
  `CREATE UNIQUE INDEX IF NOT EXISTS submissions_pending_capture
    ON submissions (capture_id) WHERE status = 'new'`,
  `CREATE INDEX IF NOT EXISTS submissions_status_created
    ON submissions (status, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY NOT NULL,
    capture_id TEXT NOT NULL,
    request_type TEXT NOT NULL,
    requester_email TEXT NOT NULL,
    relationship TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open'
  )`,
  `CREATE INDEX IF NOT EXISTS reports_status_created
    ON reports (status, created_at DESC)`,
];

export async function ensureSchema(db: D1Database): Promise<void> {
  await db.batch(SCHEMA.map((statement) => db.prepare(statement)));
}

export async function saveSubmission(db: D1Database, row: SubmissionRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO submissions (
        id, capture_id, insta360_url, title, description, source_post_url,
        source_author, tags, captured_at, camera, created_at, status
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)
      ON CONFLICT (capture_id) WHERE status = 'new' DO UPDATE SET
        title = excluded.title,
        description = excluded.description,
        source_post_url = excluded.source_post_url,
        source_author = excluded.source_author,
        tags = excluded.tags,
        captured_at = excluded.captured_at,
        camera = excluded.camera,
        created_at = excluded.created_at`,
    )
    .bind(
      row.id, row.capture_id, row.insta360_url, row.title, row.description,
      row.source_post_url, row.source_author, row.tags, row.captured_at,
      row.camera, row.created_at, row.status,
    )
    .run();
}

export async function saveReport(db: D1Database, row: ReportRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO reports (
        id, capture_id, request_type, requester_email, relationship,
        message, created_at, status
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`,
    )
    .bind(
      row.id, row.capture_id, row.request_type, row.requester_email,
      row.relationship, row.message, row.created_at, row.status,
    )
    .run();
}

export async function listPendingSubmissions(db: D1Database): Promise<SubmissionRow[]> {
  const result = await db
    .prepare("SELECT * FROM submissions WHERE status = 'new' ORDER BY created_at ASC LIMIT 100")
    .all<SubmissionRow>();
  return result.results;
}

export async function listOpenReports(db: D1Database): Promise<ReportRow[]> {
  const result = await db
    .prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY created_at ASC LIMIT 100")
    .all<ReportRow>();
  return result.results;
}
