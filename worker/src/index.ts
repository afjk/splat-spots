/**
 * Splat Spots API.
 *
 * Exists for one reason: Insta360's detail endpoint sends no CORS headers, so
 * the static gallery on GitHub Pages cannot verify a capture by itself. This
 * Worker does that check and parks the result in D1 for review.
 *
 * It never publishes anything. The published catalog lives in git, and a
 * submission only becomes a listing when a person commits it.
 */

import {
  CAPTURE_ID_PATTERN,
  canonicalInsta360Url,
  normalizeCaptureInput,
} from "../../src/lib/capture-id.ts";
import {
  ensureSchema,
  listOpenReports,
  listPendingSubmissions,
  saveReport,
  saveSubmission,
} from "./db.ts";
import { verifyCapture } from "./insta360.ts";

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
    id = normalizeCaptureInput(str(payload.insta360_url, 500));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "URLを確認してください。" },
      400, request, env,
    );
  }

  const verification = await verifyCapture(id);
  if (verification.state === "not_found") {
    return json(
      { error: "そのCaptureが見つかりません。URLを確認してください。" },
      404, request, env,
    );
  }
  if (verification.state === "unreachable") {
    return json(
      { error: "Insta360への確認が一時的にできません。時間をおいて試してください。" },
      503, request, env,
    );
  }
  const facts = verification.facts;
  if (!facts.available) {
    return json(
      {
        error: facts.private
          ? "このCaptureは非公開に設定されています。登録できません。"
          : "公開された3Dデータが見つかりません。登録できません。",
      },
      422, request, env,
    );
  }

  try {
    await ensureSchema(env.DB);
    await saveSubmission(env.DB, {
      id: crypto.randomUUID(),
      capture_id: id,
      insta360_url: canonicalInsta360Url(id),
      title: str(payload.title, 120) || facts.title || "",
      description: str(payload.description, 600),
      source_post_url: optionalUrl(payload.source_post_url),
      source_author: str(payload.source_author, 80) || null,
      tags: JSON.stringify(tagList(payload.tags)),
      captured_at: facts.captured_at,
      camera: facts.camera,
      created_at: new Date().toISOString(),
      status: "new",
    });
  } catch {
    return json(
      { error: "現在受け付けられません。時間をおいて試してください。" },
      503, request, env,
    );
  }

  return json(
    {
      ok: true,
      status: "queued",
      capture: { id, title: facts.title, captured_at: facts.captured_at, camera: facts.camera },
    },
    201, request, env,
  );
}

const REPORT_TYPES = new Set(["remove", "correction", "unavailable", "other"]);

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
