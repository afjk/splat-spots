import { mergedCatalog } from "@/lib/captures/catalog";
import { normalizeCaptureInput } from "@/lib/captures/normalize";
import { listStoredCaptures, saveCapture } from "@/lib/captures/repository";
import type { Capture } from "@/lib/captures/types";
import { verifyPublicCapture } from "@/lib/verification/insta360";

const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function optionalUrl(value: unknown): string | null {
  const candidate = text(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function tags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((tag) => text(tag, 32).toLowerCase()).filter(Boolean))].slice(0, 6);
}

export async function GET() {
  try {
    return Response.json({ captures: mergedCatalog(await listStoredCaptures()) });
  } catch {
    return Response.json({ captures: mergedCatalog([]), storage: "seed-only" });
  }
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "入力内容を読み取れませんでした。" }, { status: 400 });
  }

  let normalized: ReturnType<typeof normalizeCaptureInput>;
  try {
    normalized = normalizeCaptureInput(text(payload.insta360_url, 500));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "URLを確認してください。" },
      { status: 400 },
    );
  }

  const now = new Date();
  const verification = await verifyPublicCapture(normalized, now);
  if (verification.state === "unavailable") {
    return Response.json({ error: verification.reason }, { status: 422 });
  }

  const submittedTitle = text(payload.title, 120);
  const capture: Capture = {
    id: normalized.id,
    insta360_url: normalized.insta360_url,
    title:
      submittedTitle ||
      (verification.state === "available" ? text(verification.title, 120) : "") ||
      "Untitled capture",
    description: text(payload.description, 600),
    source_post_url: optionalUrl(payload.source_post_url),
    source_author: text(payload.source_author, 80) || null,
    discovered_at: now.toISOString(),
    last_checked_at: verification.state === "available" ? verification.checked_at : null,
    status: verification.state === "available" ? "available" : "pending",
    tags: tags(payload.tags),
  };

  try {
    await saveCapture(capture);
    return Response.json({ capture, verification: verification.state }, { status: 201 });
  } catch {
    return Response.json(
      { error: "現在カタログへ保存できません。少し待ってから再度お試しください。" },
      { status: 503 },
    );
  }
}
