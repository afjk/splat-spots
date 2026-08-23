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
 * sampled from the tail. Sources are portrait (1080x1920); the 4:5 and 1.91:1
 * crops are baked in here rather than left to CSS to keep the files small.
 *
 * Existing thumbnails are left alone unless --force is passed. Regenerating
 * unchanged files on every build would bloat the repository for no reason.
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

/** Seconds before the end to grab the still from. */
const POSTER_OFFSET = 0.4;
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

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const onlyIndex = process.argv.indexOf("--only");
  const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

  const ids = (await listCaptureIds()).filter((id) => !only || id === only);
  if (!ids.length) {
    console.log("no captures in data/captures — nothing to render");
    return;
  }

  await ensureFfmpeg();
  await mkdir(THUMBS_DIR, { recursive: true });

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
      const stillAt = Math.max(0, duration - POSTER_OFFSET);

      await renderStill(source, poster, stillAt, "1080:1350", "720:900", "7");
      await renderStill(source, og, stillAt, "1080:566", "1200:630", "6");
      await renderLoop(source, loop, Math.max(0, duration - LOOP_SECONDS));

      const { statSync } = await import("node:fs");
      console.log(
        `render   ${id}  poster ${kb(statSync(poster).size)} · og ${kb(statSync(og).size)}` +
          ` · loop ${kb(statSync(loop).size)}`,
      );
      rendered += 1;
    } catch (error) {
      failures.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  console.log(`\nrendered ${rendered} · skipped ${skipped} · failed ${failures.length}`);
  if (failures.length) {
    console.log("\nfailures");
    for (const failure of failures) console.log(`  - ${failure}`);
    // A missing thumbnail degrades to a gradient tile, so this must not fail the build.
  }
}

await main();
