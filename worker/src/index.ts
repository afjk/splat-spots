/**
 * Splat Spots API — the intake for community recommendations.
 *
 * It parses the submitted URL, checks it is shaped like an Insta360 Spatial
 * Capture share link, and parks it in D1. It deliberately does not contact
 * Insta360: no API call, no fetching the share page. Whether a capture is
 * really public is decided by a person opening the link during review, which
 * keeps Splat Spots from behaving like a bot against someone else's service.
 *
 * It never publishes anything. The published catalog lives in git, and a
 * submission only becomes a listing when a person commits it.
 */

import {
  CAPTURE_ID_PATTERN,
  canonicalCaptureUrl,
  normalizeCaptureInput,
} from "../../src/lib/capture-id.ts";
import {
  ensureSchema,
  listOpenReports,
  listPendingSubmissions,
  saveReport,
  saveSubmission,
} from "./db.ts";

export interface Env {
  DB: D1Database;
  /** Bearer token for the review queue. Set with `wrangler secret put QUEUE_TOKEN`. */
  QUEUE_TOKEN?: string;
  /** Comma separated extra origins, for local development. */
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_ORIGINS = ["https://afjk.github.io"];
const MAX_BODY_BYTES = 8_192;

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
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders(request, env) },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) throw new Error("送信内容が大きすぎます。");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("送信内容が大きすぎます。");
  return JSON.parse(text) as Record<string, unknown>;
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
    return json({ ok: true, status: "queued" }, 201, request, env);
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
    // Re-submitting a capture that is still queued updates that row rather
    // than adding another. Whether it is already published lives in git, which
    // this Worker deliberately does not read.
    await saveSubmission(env.DB, {
      id: crypto.randomUUID(),
      capture_id: id,
      url: canonicalCaptureUrl(id),
      title: str(payload.title, 120),
      note: str(payload.note, 600),
      source_post: optionalUrl(payload.source_post),
      author: str(payload.author, 80) || null,
      tags: JSON.stringify(tagList(payload.tags)),
      created_at: new Date().toISOString(),
      status: "new",
    });
  } catch {
    return json(
      { error: "現在受け付けられません。時間をおいて試してください。" },
      503, request, env,
    );
  }

  return json({ ok: true, status: "queued", capture: { id } }, 201, request, env);
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

/** Review queue. Read by a maintainer or the ingest workflow, never public. */
async function handleQueue(request: Request, env: Env): Promise<Response> {
  const expected = env.QUEUE_TOKEN;
  const presented = request.headers.get("authorization") ?? "";
  if (!expected || presented !== `Bearer ${expected}`) {
    return json({ error: "unauthorized" }, 401, request, env);
  }

  await ensureSchema(env.DB);
  const [submissions, reports] = await Promise.all([
    listPendingSubmissions(env.DB),
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
