/**
 * D1 holds the live half of the catalog.
 *
 * A submission is published the moment it arrives — there is no queue and no
 * review step. `data/captures/` in git still holds the curated half; the
 * gallery fetches this table and merges the two, with git winning on id.
 *
 * Removing a listing means flipping its status here:
 *   UPDATE submissions SET status='removed' WHERE capture_id='GS3DG…'
 */

export type SubmissionRow = {
  id: string;
  capture_id: string;
  url: string;
  title: string;
  /** Published as the listing's description. Column name predates that. */
  note: string;
  source_post: string | null;
  author: string | null;
  tags: string;
  created_at: string;
  /** `published` is live; anything else is hidden. */
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
    status TEXT NOT NULL DEFAULT 'published'
  )`,
  // The old index only guarded rows waiting in the queue. Now that a row is a
  // listing, one row per capture is the invariant at all times.
  `DROP INDEX IF EXISTS submissions_pending_capture`,
  `DELETE FROM submissions WHERE rowid NOT IN (
    SELECT MAX(rowid) FROM submissions GROUP BY capture_id
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS submissions_capture ON submissions (capture_id)`,
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
  // Counts per hashed client per hour. No raw address is ever stored.
  `CREATE TABLE IF NOT EXISTS rate_limit (
    bucket TEXT PRIMARY KEY NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL
  )`,
];

/**
 * Once per isolate rather than once per request: the statements are idempotent
 * but two of them write, and nothing here changes between requests.
 */
let ready: Promise<void> | null = null;

export function ensureSchema(db: D1Database): Promise<void> {
  ready ??= db
    .batch(SCHEMA.map((statement) => db.prepare(statement)))
    .then(async () => {
      await db.prepare("DELETE FROM rate_limit WHERE expires_at < ?1").bind(Date.now()).run();
    })
    .catch((error: unknown) => {
      ready = null;
      throw error;
    });
  return ready;
}

/**
 * Publishes a submission. Re-submitting a capture updates the listing instead
 * of adding a second one, and keeps the date it first appeared.
 */
export async function publishSubmission(db: D1Database, row: SubmissionRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO submissions (
        id, capture_id, url, title, note, source_post, author, tags,
        created_at, status
      ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)
      ON CONFLICT (capture_id) DO UPDATE SET
        title = excluded.title,
        note = excluded.note,
        source_post = excluded.source_post,
        author = excluded.author,
        tags = excluded.tags
      WHERE submissions.status = 'published'`,
    )
    .bind(
      row.id, row.capture_id, row.url, row.title, row.note,
      row.source_post, row.author, row.tags, row.created_at, row.status,
    )
    .run();
}

/** The live catalog. Served to anyone; the gallery reads it on every load. */
export async function listPublishedSubmissions(db: D1Database): Promise<SubmissionRow[]> {
  const result = await db
    .prepare(
      "SELECT * FROM submissions WHERE status = 'published' ORDER BY created_at DESC LIMIT 500",
    )
    .all<SubmissionRow>();
  return result.results;
}

/** Everything that arrived recently, for a maintainer looking over the site. */
export async function listRecentSubmissions(db: D1Database): Promise<SubmissionRow[]> {
  const result = await db
    .prepare("SELECT * FROM submissions ORDER BY created_at DESC LIMIT 100")
    .all<SubmissionRow>();
  return result.results;
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

export async function listOpenReports(db: D1Database): Promise<ReportRow[]> {
  const result = await db
    .prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY created_at ASC LIMIT 100")
    .all<ReportRow>();
  return result.results;
}

const HOUR_MS = 3_600_000;

/**
 * Counts one hit against an hourly bucket and says whether it is still under
 * the limit. Publishing without review means a flood lands straight on the
 * site, and this is the only thing standing between the form and that.
 */
export async function withinRateLimit(
  db: D1Database,
  key: string,
  limit: number,
): Promise<boolean> {
  const hour = Math.floor(Date.now() / HOUR_MS);
  const row = await db
    .prepare(
      `INSERT INTO rate_limit (bucket, hits, expires_at) VALUES (?1, 1, ?2)
       ON CONFLICT (bucket) DO UPDATE SET hits = hits + 1
       RETURNING hits`,
    )
    .bind(`${key}:${hour}`, (hour + 2) * HOUR_MS)
    .first<{ hits: number }>();
  return (row?.hits ?? 1) <= limit;
}
