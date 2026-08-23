/**
 * D1 is an inbox, not the catalog. Nothing here is ever served to the public
 * site: rows wait until a person reviews them and commits a record to
 * `data/captures/`. Deleting a row does not unpublish anything, and writing
 * one does not publish anything.
 */

export type SubmissionRow = {
  id: string;
  capture_id: string;
  url: string;
  title: string;
  /** Free text from the submitter, for the reviewer. Not published as-is. */
  note: string;
  source_post: string | null;
  author: string | null;
  tags: string;
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
    url TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    source_post TEXT,
    author TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
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
        id, capture_id, url, title, note, source_post, author, tags,
        created_at, status
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
      ON CONFLICT (capture_id) WHERE status = 'new' DO UPDATE SET
        title = excluded.title,
        note = excluded.note,
        source_post = excluded.source_post,
        author = excluded.author,
        tags = excluded.tags,
        created_at = excluded.created_at`,
    )
    .bind(
      row.id, row.capture_id, row.url, row.title, row.note,
      row.source_post, row.author, row.tags, row.created_at, row.status,
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
