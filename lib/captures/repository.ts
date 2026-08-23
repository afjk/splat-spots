import { env } from "cloudflare:workers";
import type { Capture, CaptureStatus } from "./types";

const createCapturesTable = `
  CREATE TABLE IF NOT EXISTS captures (
    id TEXT PRIMARY KEY NOT NULL,
    insta360_url TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    source_post_url TEXT,
    source_author TEXT,
    discovered_at TEXT NOT NULL,
    last_checked_at TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    tags TEXT NOT NULL DEFAULT '[]'
  )
`;

const createDiscoveredIndex = `
  CREATE INDEX IF NOT EXISTS captures_discovered_at_idx
  ON captures (discovered_at DESC)
`;

type CaptureRow = Omit<Capture, "tags" | "status"> & {
  tags: string;
  status: string;
};

function database(): D1Database {
  if (!env.DB) throw new Error("Capture catalog storage is unavailable.");
  return env.DB;
}

async function ensureCatalogSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(createCapturesTable),
    db.prepare(createDiscoveredIndex),
  ]);
}

function rowToCapture(row: CaptureRow): Capture {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === "string");
  } catch {
    tags = [];
  }

  const status: CaptureStatus =
    row.status === "available" || row.status === "unavailable" ? row.status : "pending";

  return { ...row, status, tags };
}

export async function listStoredCaptures(): Promise<Capture[]> {
  const db = database();
  await ensureCatalogSchema(db);
  const result = await db
    .prepare("SELECT * FROM captures ORDER BY discovered_at DESC LIMIT 200")
    .all<CaptureRow>();
  return result.results.map(rowToCapture);
}

export async function findStoredCapture(id: string): Promise<Capture | null> {
  const db = database();
  await ensureCatalogSchema(db);
  const row = await db
    .prepare("SELECT * FROM captures WHERE id = ?1 LIMIT 1")
    .bind(id)
    .first<CaptureRow>();
  return row ? rowToCapture(row) : null;
}

export async function saveCapture(capture: Capture): Promise<Capture> {
  const db = database();
  await ensureCatalogSchema(db);
  await db
    .prepare(
      `INSERT INTO captures (
        id, insta360_url, title, description, source_post_url, source_author,
        discovered_at, last_checked_at, status, tags
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
      ON CONFLICT(id) DO UPDATE SET
        insta360_url = excluded.insta360_url,
        title = excluded.title,
        description = excluded.description,
        source_post_url = excluded.source_post_url,
        source_author = excluded.source_author,
        last_checked_at = excluded.last_checked_at,
        status = excluded.status,
        tags = excluded.tags`,
    )
    .bind(
      capture.id,
      capture.insta360_url,
      capture.title,
      capture.description,
      capture.source_post_url,
      capture.source_author,
      capture.discovered_at,
      capture.last_checked_at,
      capture.status,
      JSON.stringify(capture.tags),
    )
    .run();
  return capture;
}
