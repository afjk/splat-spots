/**
 * Splat Spots API — the intake, and the live half of the catalog.
 *
 * A submission is published the moment it arrives. The Worker parses the URL,
 * checks it is shaped like an Insta360 Spatial Capture share link, and stores
 * it as a listing. It deliberately does not contact Insta360: no API call, no
 * fetching the share page, so nothing here behaves like a bot against someone
 * else's service.
 *
 * Nothing is reviewed before it appears. What holds the line instead is the
 * shape check, an hourly cap per client, and removal on request.
 */

import {
  CAPTURE_ID_PATTERN,
  canonicalCaptureUrl,
  normalizeCaptureInput,
} from "../../src/lib/capture-id.ts";
import {
  ensureSchema,
  listOpenReports,
  listPublishedSubmissions,
  listRecentSubmissions,
  listThumbnailVersions,
  publishSubmission,
  readThumbnail,
  saveReport,
  saveThumbnail,
  withinRateLimit,
  type SubmissionRow,
} from "./db.ts";

export interface Env {
  DB: D1Database;
  /** Bearer token for the maintainer view. Set with `wrangler secret put QUEUE_TOKEN`. */
  QUEUE_TOKEN?: string;
  /** Comma separated extra origins, for local development. */
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ORIGINS = ["https://afjk.github.io"];
const MAX_BODY_BYTES = 8_192;
/** A submission may carry a thumbnail, which the browser has already shrunk. */
const MAX_SUBMISSION_BYTES = 700_000;
const MAX_THUMBNAIL_BYTES = 400_000;
const SUBMISSIONS_PER_HOUR = 20;
const REPORTS_PER_HOUR = 10;

const str = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function optionalUrl(value: unknown): string | null {
  const candidate = str(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function tagList(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return [...new Set(raw.map((tag) => str(tag, 32).toLowerCase()).filter(Boolean))].slice(0, 6);
}

function allowedOrigins(env: Env): string[] {
  const extra = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return [...DEFAULT_ORIGINS, ...extra];
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const permitted = allowedOrigins(env).includes(origin);
  return {
    // Echo only a known origin; never reflect an arbitrary one.
    ...(permitted ? { "access-control-allow-origin": origin } : {}),
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

function json(
  body: unknown,
  status: number,
  request: Request,
  env: Env,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // A listing has to be there the moment its submitter reloads the gallery.
      "cache-control": "no-store",
      ...corsHeaders(request, env),
    },
  });
}

async function readJson(
  request: Request,
  max = MAX_BODY_BYTES,
): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > max) throw new Error("送信内容が大きすぎます。");
  const text = await request.text();
  if (text.length > max) throw new Error("送信内容が大きすぎます。");
  return JSON.parse(text) as Record<string, unknown>;
}

/** What the first bytes of a file must be for the type it claims to be. */
const IMAGE_SIGNATURES: { type: string; test: (bytes: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    type: "image/png",
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    type: "image/webp",
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

/**
 * Reads the `data:` URL the form produced. The browser re-encodes whatever was
 * chosen or pasted into a small JPEG first, so anything large or exotic
 * arriving here did not come from the form. The declared type has to match the
 * actual bytes, because this is served straight back to other people.
 */
function decodeThumbnail(value: unknown): { contentType: string; bytes: Uint8Array } | null {
  const source = typeof value === "string" ? value.trim() : "";
  if (!source) return null;

  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(source);
  if (!match) throw new Error("画像を読み取れませんでした。");

  const [, declared, encoded] = match;
  if (encoded.length > Math.ceil(MAX_THUMBNAIL_BYTES / 3) * 4) {
    throw new Error("画像が大きすぎます。");
  }

  let binary: string;
  try {
    binary = atob(encoded);
  } catch {
    throw new Error("画像を読み取れませんでした。");
  }
  if (binary.length > MAX_THUMBNAIL_BYTES) throw new Error("画像が大きすぎます。");
  if (binary.length < 64) throw new Error("画像を読み取れませんでした。");

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);

  const signature = IMAGE_SIGNATURES.find((candidate) => candidate.test(bytes));
  if (!signature || signature.type !== declared) {
    throw new Error("画像として読み取れないファイルです。");
  }
  return { contentType: signature.type, bytes };
}

/** Hourly cap key. The address is hashed, never stored or logged as-is. */
async function clientKey(request: Request): Promise<string> {
  const address = request.headers.get("cf-connecting-ip") ?? "unknown";
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`splat-spots:${address}`),
  );
  return [...new Uint8Array(digest).slice(0, 8)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** A D1 row as the gallery consumes it: same shape as a `data/captures` record. */
function asCapture(row: SubmissionRow): Record<string, unknown> {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) tags = parsed.filter((tag): tag is string => typeof tag === "string");
  } catch {
    tags = [];
  }
  return {
    id: row.capture_id,
    url: row.url,
    title: row.title,
    description: row.note,
    author: row.author,
    tags,
    source_post: row.source_post,
    // Neither is ever guessed, and the form does not ask.
    camera: null,
    captured_at: null,
    submitted_at: row.created_at,
    status: "published",
  };
}

async function handleSubmission(request: Request, env: Env): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    payload = await readJson(request, MAX_SUBMISSION_BYTES);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "入力内容を読み取れませんでした。" },
      400, request, env,
    );
  }

  // Bots fill hidden fields. Accept without writing so they learn nothing.
  if (str(payload.website, 200)) {
    return json({ ok: true, status: "published" }, 201, request, env);
  }

  let id: string;
  try {
    id = normalizeCaptureInput(str(payload.url, 500));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "URLを確認してください。" },
      400, request, env,
    );
  }

  let thumbnail: { contentType: string; bytes: Uint8Array } | null;
  try {
    thumbnail = decodeThumbnail(payload.thumbnail);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "画像を読み取れませんでした。" },
      400, request, env,
    );
  }

  try {
    await ensureSchema(env.DB);
    if (!(await withinRateLimit(env.DB, await clientKey(request), SUBMISSIONS_PER_HOUR))) {
      return json({ error: "しばらく時間をおいてから送信してください。" }, 429, request, env);
    }
    await publishSubmission(env.DB, {
      id: crypto.randomUUID(),
      capture_id: id,
      url: canonicalCaptureUrl(id),
      title: str(payload.title, 120),
      note: str(payload.note, 600),
      source_post: optionalUrl(payload.source_post),
      author: str(payload.author, 80) || null,
      tags: JSON.stringify(tagList(payload.tags)),
      created_at: new Date().toISOString(),
      status: "published",
    });
    if (thumbnail) {
      await saveThumbnail(env.DB, {
        capture_id: id,
        content_type: thumbnail.contentType,
        // D1 takes the buffer itself; slice keeps it from carrying the view.
        bytes: thumbnail.bytes.buffer.slice(
          thumbnail.bytes.byteOffset,
          thumbnail.bytes.byteOffset + thumbnail.bytes.byteLength,
        ),
        updated_at: Date.now(),
      });
    }
  } catch {
    return json(
      { error: "現在受け付けられません。時間をおいて試してください。" },
      503, request, env,
    );
  }

  return json({ ok: true, status: "published", capture: { id } }, 201, request, env);
}

/**
 * The live catalog. Public: the gallery reads this on every load.
 *
 * `thumbnails` covers both halves — a capture committed to git can have a
 * picture here too — and carries the version the gallery hangs on the image
 * URL so a replaced picture is never served from cache.
 */
async function handleCaptures(request: Request, env: Env): Promise<Response> {
  try {
    await ensureSchema(env.DB);
    const [rows, thumbnails] = await Promise.all([
      listPublishedSubmissions(env.DB),
      listThumbnailVersions(env.DB),
    ]);
    return json({ captures: rows.map(asCapture), thumbnails }, 200, request, env);
  } catch {
    // The gallery still has everything in git; an empty live half is survivable.
    return json({ captures: [], thumbnails: [] }, 200, request, env);
  }
}

/**
 * One thumbnail. The URL carries the version, so it can be cached hard: a new
 * picture is a new URL. Served as an image and nothing else — declared type
 * matched the bytes on the way in, and nosniff keeps it that way.
 */
async function handleThumbnail(request: Request, env: Env, id: string): Promise<Response> {
  if (!CAPTURE_ID_PATTERN.test(id)) return json({ error: "not found" }, 404, request, env);

  let row: Awaited<ReturnType<typeof readThumbnail>>;
  try {
    await ensureSchema(env.DB);
    row = await readThumbnail(env.DB, id);
  } catch {
    return json({ error: "unavailable" }, 503, request, env);
  }
  if (!row) return json({ error: "not found" }, 404, request, env);

  const body = new Uint8Array(row.bytes);
  const etag = `"${id}-${row.updated_at}"`;
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: { etag, ...corsHeaders(request, env) } });
  }

  return new Response(body, {
    headers: {
      "content-type": row.content_type,
      "content-length": String(body.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      etag,
      ...corsHeaders(request, env),
    },
  });
}

const REPORT_TYPES = new Set([
  "creator_removal",
  "not_public",
  "privacy",
  "incorrect",
  "other",
]);

function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function handleReport(request: Request, env: Env): Promise<Response> {
  let payload: Record<string, unknown>;
  try {
    payload = await readJson(request);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "入力内容を読み取れませんでした。" },
      400, request, env,
    );
  }

  if (str(payload.website, 200)) {
    return json({ ok: true }, 201, request, env);
  }

  const captureId = str(payload.capture_id, 90);
  const requestType = str(payload.request_type, 24);
  const email = str(payload.requester_email, 254).toLowerCase();
  const message = str(payload.message, 1_500);

  if (!CAPTURE_ID_PATTERN.test(captureId)) {
    return json({ error: "有効なCapture IDを入力してください。" }, 400, request, env);
  }
  if (!REPORT_TYPES.has(requestType)) {
    return json({ error: "依頼の種類を選択してください。" }, 400, request, env);
  }
  if (!validEmail(email)) {
    return json({ error: "連絡可能なメールアドレスを入力してください。" }, 400, request, env);
  }
  if (message.length < 10) {
    return json({ error: "依頼内容を10文字以上で入力してください。" }, 400, request, env);
  }

  try {
    await ensureSchema(env.DB);
    if (!(await withinRateLimit(env.DB, await clientKey(request), REPORTS_PER_HOUR))) {
      return json({ error: "しばらく時間をおいてから送信してください。" }, 429, request, env);
    }
    await saveReport(env.DB, {
      id: crypto.randomUUID(),
      capture_id: captureId,
      request_type: requestType,
      requester_email: email,
      relationship: str(payload.relationship, 80),
      message,
      created_at: new Date().toISOString(),
      status: "open",
    });
  } catch {
    return json({ error: "現在受け付けられません。時間をおいて試してください。" }, 503, request, env);
  }

  return json({ ok: true }, 201, request, env);
}

/**
 * What arrived lately, listings and reports together. Read by a maintainer
 * looking over a site that publishes without asking them first.
 */
async function handleQueue(request: Request, env: Env): Promise<Response> {
  const expected = env.QUEUE_TOKEN;
  const presented = request.headers.get("authorization") ?? "";
  if (!expected || presented !== `Bearer ${expected}`) {
    return json({ error: "unauthorized" }, 401, request, env);
  }

  await ensureSchema(env.DB);
  const [submissions, reports] = await Promise.all([
    listRecentSubmissions(env.DB),
    listOpenReports(env.DB),
  ]);

  return json(
    {
      submissions: submissions.map((row) => ({
        ...row,
        tags: JSON.parse(row.tags) as string[],
      })),
      reports,
    },
    200, request, env,
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    if (pathname === "/api/submissions" && request.method === "POST") {
      return handleSubmission(request, env);
    }
    if (pathname === "/api/captures" && request.method === "GET") {
      return handleCaptures(request, env);
    }
    if (pathname.startsWith("/api/thumbnails/") && request.method === "GET") {
      return handleThumbnail(request, env, pathname.slice("/api/thumbnails/".length));
    }
    if (pathname === "/api/reports" && request.method === "POST") {
      return handleReport(request, env);
    }
    if (pathname === "/api/queue" && request.method === "GET") {
      return handleQueue(request, env);
    }
    if (pathname === "/api/health") {
      return json({ ok: true }, 200, request, env);
    }

    return json({ error: "not found" }, 404, request, env);
  },
} satisfies ExportedHandler<Env>;
