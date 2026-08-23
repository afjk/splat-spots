/**
 * Phase 0 — move the catalog out of D1 and into git.
 *
 * Reads the currently deployed `/api/captures` (the only way to reach the
 * ChatGPT Sites D1 instance), re-checks each capture against Insta360, and
 * writes one reviewed record per file under `data/captures/`.
 *
 *   node scripts/export-catalog.mts [--source <url>] [--dry-run]
 *
 * Existing files are never silently overwritten: locally edited fields
 * (title, description, tags, source_*) win over the imported values.
 */

import { access } from "node:fs/promises";
import {
  CAPTURE_ID_PATTERN,
  canonicalInsta360Url,
  capturePath,
  readCapture,
  serializeCapture,
  writeCapture,
  type CaptureRecord,
} from "./lib/catalog.mts";
import { lookupCapture } from "./lib/insta360.mts";

const DEFAULT_SOURCE = "https://splat-atlas.afjk01.chatgpt.site/api/captures";

type SourceCapture = {
  id?: unknown;
  title?: unknown;
  description?: unknown;
  source_post_url?: unknown;
  source_author?: unknown;
  discovered_at?: unknown;
  tags?: unknown;
};

function flag(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "") : null;
}

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value.trim() : fallback;

const nullableStr = (value: unknown): string | null => str(value) || null;

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const source = flag("source") || DEFAULT_SOURCE;
  const dryRun = process.argv.includes("--dry-run");

  console.log(`source   ${source}`);
  console.log(`mode     ${dryRun ? "dry run" : "write"}\n`);

  const response = await fetch(source, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Source returned HTTP ${response.status}.`);
  const payload = (await response.json()) as { captures?: SourceCapture[] };
  const incoming = Array.isArray(payload.captures) ? payload.captures : [];
  if (!incoming.length) throw new Error("Source returned no captures.");

  const warnings: string[] = [];

  for (const entry of incoming) {
    const id = str(entry.id);
    if (!CAPTURE_ID_PATTERN.test(id)) {
      warnings.push(`skipped an entry with an unusable id: ${JSON.stringify(entry.id)}`);
      continue;
    }

    const existing = (await exists(capturePath(id))) ? await readCapture(id) : null;
    const lookup = await lookupCapture(id);

    if (lookup.state === "unreachable") {
      warnings.push(`${id}: could not reach Insta360 (${lookup.reason}); left untouched`);
      continue;
    }

    const meta = lookup.metadata;

    // Locally reviewed prose wins; Insta360 only fills what we do not have.
    const record: CaptureRecord = {
      id,
      insta360_url: canonicalInsta360Url(id),
      title:
        existing?.title ||
        str(entry.title) ||
        meta.title ||
        "Untitled capture",
      description: existing?.description ?? str(entry.description),
      captured_at: meta.captured_at ?? existing?.captured_at ?? null,
      camera: meta.camera ?? existing?.camera ?? null,
      source_post_url: existing?.source_post_url ?? nullableStr(entry.source_post_url),
      source_author: existing?.source_author ?? nullableStr(entry.source_author),
      discovered_at:
        existing?.discovered_at ??
        str(entry.discovered_at) ??
        new Date().toISOString(),
      last_checked_at: meta.checked_at,
      status: meta.available ? "available" : "unavailable",
      tags: existing?.tags ?? (Array.isArray(entry.tags) ? entry.tags.map((t) => str(t)).filter(Boolean) : []),
    };

    if (!meta.available) {
      warnings.push(
        `${id}: ${meta.private ? "set to private" : "no public SOG"} — review before publishing`,
      );
    }

    const label = existing ? "update" : "create";
    console.log(`${label}  ${id}`);
    console.log(`        ${record.title}`);
    console.log(
      `        ${record.status} · ${record.captured_at ?? "date unknown"} · ${record.camera ?? "camera unknown"}`,
    );

    if (dryRun) console.log(serializeCapture(record).replace(/^/gm, "        "));
    else await writeCapture(record);
    console.log();
  }

  if (warnings.length) {
    console.log("warnings");
    for (const warning of warnings) console.log(`  - ${warning}`);
  } else {
    console.log("no warnings");
  }
}

await main();
