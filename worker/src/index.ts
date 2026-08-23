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
  publishSubmission,
  saveReport,
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

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) throw new Error("送信内容が大きすぎます。");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("送信内容が大きすぎます。");
  return JSON.parse(text) as Record<string, unknown>;
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
    payload = await readJson(request);
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
  } catch {
    return json(
      { error: "現在受け付けられません。時間をおいて試してください。" },
      503, request, env,
    );
  }

  return json({ ok: true, status: "published", capture: { id } }, 201, request, env);
}

/** The live catalog. Public: the gallery reads this on every load. */
async function handleCaptures(request: Request, env: Env): Promise<Response> {
  try {
    await ensureSchema(env.DB);
    const rows = await listPublishedSubmissions(env.DB);
    return json({ captures: rows.map(asCapture) }, 200, request, env);
  } catch {
    // The gallery still has everything in git; an empty live half is survivable.
    return json({ captures: [] }, 200, request, env);
  }
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
