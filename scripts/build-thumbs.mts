/**
 * Derive gallery thumbnails from the orbit video Insta360 generates.
 *
 *   node scripts/build-thumbs.mts [--force] [--only <id>]
 *
 * The source mp4 is ~14MB behind a URL that expires after seven days, so it is
 * fetched to a temp file, reduced, and thrown away. Only the small derived
 * files are kept:
 *
 *   public/thumbs/<id>/poster.jpg    720x900 (4:5) card image
 *   public/thumbs/<id>/og.jpg        1200x630 social card image
 *   public/thumbs/<id>/loop.mp4      ~3s silent 480x600 hover preview
 *
 * Insta360's clip spends its first two thirds on a particle-formation effect
 * and only resolves into the actual place near the end, so every frame is
 * sampled from the tail. Where exactly the camera ends up is arbitrary though,
 * so several candidates are tried and the most detailed one wins — otherwise a
 * clip that finishes facing a blank wall gets a blank thumbnail.
 *
 * Sources are portrait (1080x1920); the 4:5 and 1.91:1 crops are baked in here
 * rather than left to CSS to keep the files small.
 *
 * Nothing here is committed. `public/thumbs/` is reconciled to
 * `data/captures/` on every run: thumbnails are rendered for records that
 * lack them and deleted for records that no longer exist. That reconciliation
 * is what makes a removal complete — no stale artifact can survive in a build
 * cache, a working copy, or git history.
 *
 * Existing thumbnails are otherwise left alone unless --force is passed.
 */

import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { listCaptureIds, readCapture } from "./lib/catalog.mts";
import { lookupCapture } from "./lib/insta360.mts";

const run = promisify(execFile);

const THUMBS_DIR = path.join(process.cwd(), "public", "thumbs");

/**
 * Seconds before the end to try for the still, best-looking one wins. A JPEG
 * encoded at fixed quality is larger when the frame holds more detail, which
 * is a good enough stand-in for "shows something".
 */
const POSTER_OFFSETS = [0.4, 1.1, 1.8, 2.5];
/** Length of the hover loop, taken from the end of the clip. */
const LOOP_SECONDS = 3.2;

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete thumbnails whose capture is no longer in the catalog. Runs before
 * anything else so a removed capture cannot be re-published by a restored
 * build cache.
 */
async function pruneOrphans(catalogIds: string[]): Promise<number> {
  const { readdir } = await import("node:fs/promises");
  const keep = new Set(catalogIds);
  let removed = 0;

  let entries: string[];
  try {
    entries = await readdir(THUMBS_DIR);
  } catch {
    return 0;
  }

  for (const entry of entries) {
    if (entry.startsWith(".") || keep.has(entry)) continue;
    await rm(path.join(THUMBS_DIR, entry), { recursive: true, force: true });
    console.log(`prune    ${entry}`);
    removed += 1;
  }
  return removed;
}

async function ensureFfmpeg(): Promise<void> {
  try {
    await run("ffmpeg", ["-version"]);
  } catch {
    throw new Error("ffmpeg not found. Install it (brew install ffmpeg) and retry.");
  }
}

async function download(url: string, target: string): Promise<void> {
  const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`preview download failed: HTTP ${response.status}`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}

async function probeDuration(source: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=duration",
    "-of", "default=nw=1:nk=1",
    source,
  ]);
  const seconds = Number.parseFloat(stdout.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("could not read clip duration");
  return seconds;
}

/**
 * mjpeg rather than webp: it is present in every ffmpeg build, so CI and local
 * machines produce identical files.
 */
async function renderStill(
  source: string,
  target: string,
  at: number,
  crop: string,
  scale: string,
  quality: string,
): Promise<void> {
  await run("ffmpeg", [
    "-loglevel", "error", "-y",
    "-ss", at.toFixed(2),
    "-i", source,
    "-frames:v", "1",
    "-vf", `crop=${crop},scale=${scale}:flags=lanczos`,
    "-c:v", "mjpeg",
    "-q:v", quality,
    target,
  ]);
}

async function renderLoop(source: string, target: string, start: number): Promise<void> {
  await run("ffmpeg", [
    "-loglevel", "error", "-y",
    "-ss", start.toFixed(2),
    "-t", String(LOOP_SECONDS),
    "-i", source,
    "-an",
    "-vf", "crop=1080:1350,scale=480:600:flags=lanczos,fps=20",
    "-c:v", "libx264",
    "-profile:v", "main",
    "-pix_fmt", "yuv420p",
    "-crf", "32",
    "-preset", "slow",
    "-movflags", "+faststart",
    target,
  ]);
}

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)}KB`;
}

/** Encode each candidate, keep the heaviest, discard the rest. */
async function pickStillTime(source: string, duration: number, work: string): Promise<number> {
  const { statSync } = await import("node:fs");
  let best = { at: Math.max(0, duration - POSTER_OFFSETS[0]), bytes: -1 };

  for (const offset of POSTER_OFFSETS) {
    const at = duration - offset;
    if (at < 0) continue;
    const probe = path.join(work, `probe-${offset}.jpg`);
    try {
      await renderStill(source, probe, at, "1080:1350", "720:900", "7");
      const bytes = statSync(probe).size;
      if (bytes > best.bytes) best = { at, bytes };
    } catch {
      // A candidate that will not encode simply does not compete.
    }
  }

  return best.at;
}

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const atIndex = process.argv.indexOf("--at");
  // Manual override, in seconds before the end, when the automatic pick is poor.
  const forcedOffset = atIndex >= 0 ? Number.parseFloat(process.argv[atIndex + 1] ?? "") : NaN;
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

  const catalogIds = await listCaptureIds();
  await mkdir(THUMBS_DIR, { recursive: true });
  const pruned = await pruneOrphans(catalogIds);

  const ids = catalogIds.filter((id) => !only || id === only);
  if (!ids.length) {
    console.log(
      catalogIds.length
        ? "nothing matched --only"
        : "no captures in data/captures — nothing to render",
    );
    if (pruned) console.log(`pruned ${pruned} orphaned thumbnail set(s)`);
    return;
  }

  await ensureFfmpeg();

  const failures: string[] = [];
  let rendered = 0;
  let skipped = 0;

  for (const id of ids) {
    const dir = path.join(THUMBS_DIR, id);
    const poster = path.join(dir, "poster.jpg");
    const og = path.join(dir, "og.jpg");
    const loop = path.join(dir, "loop.mp4");

    if (!force && (await exists(poster)) && (await exists(og)) && (await exists(loop))) {
      skipped += 1;
      continue;
    }

    const capture = await readCapture(id);
    if (capture.status !== "available") {
      console.log(`skip     ${id} (status: ${capture.status})`);
      skipped += 1;
      continue;
    }

    const lookup = await lookupCapture(id);
    if (lookup.state === "unreachable") {
      failures.push(`${id}: ${lookup.reason}`);
      continue;
    }
    if (lookup.state === "not_found") {
      // The record outlived the capture. `npm run verify` is what decides to
      // unpublish it; rendering just reports and moves on.
      failures.push(`${id}: Insta360 no longer has this capture`);
      continue;
    }
    const previewUrl = lookup.metadata.preview_video_url;
    if (!previewUrl) {
      failures.push(`${id}: Insta360 reported no preview video`);
      continue;
    }

    const work = await mkdtemp(path.join(tmpdir(), "splat-spots-"));
    const source = path.join(work, "source.mp4");
    try {
      await mkdir(dir, { recursive: true });
      await download(previewUrl, source);
      const duration = await probeDuration(source);
      const stillAt = Number.isFinite(forcedOffset)
        ? Math.max(0, duration - forcedOffset)
        : await pickStillTime(source, duration, work);

      await renderStill(source, poster, stillAt, "1080:1350", "720:900", "7");
      await renderStill(source, og, stillAt, "1080:566", "1200:630", "6");
      await renderLoop(source, loop, Math.max(0, duration - LOOP_SECONDS));

      const { statSync } = await import("node:fs");
      console.log(
        `render   ${id}  poster ${kb(statSync(poster).size)} · og ${kb(statSync(og).size)}` +
          ` · loop ${kb(statSync(loop).size)}` +
          `  (still at -${(duration - stillAt).toFixed(1)}s)`,
      );
      rendered += 1;
    } catch (error) {
      failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  console.log(
    `\nrendered ${rendered} · skipped ${skipped} · pruned ${pruned} · failed ${failures.length}`,
  );
  if (failures.length) {
    console.log("\nfailures");
    for (const failure of failures) console.log(`  - ${failure}`);
    // A missing thumbnail degrades to a gradient tile, so this must not fail the build.
  }
}

await main();
