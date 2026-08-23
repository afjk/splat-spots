import { isCaptureId } from "@/lib/captures/normalize";
import { saveCaptureReport } from "@/lib/reports/repository";
import type { CaptureReport, ReportRequestType } from "@/lib/reports/types";

const allowedTypes = new Set<ReportRequestType>(["remove", "correction", "unavailable", "other"]);
const text = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export async function POST(request: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "入力内容を読み取れませんでした。" }, { status: 400 });
  }

  // Quietly accept bot-filled honeypots without writing them to the queue.
  if (text(payload.website, 200)) {
    return Response.json({ report: { id: crypto.randomUUID() } }, { status: 201 });
  }

  const captureId = text(payload.capture_id, 90);
  const requestType = text(payload.request_type, 24) as ReportRequestType;
  const requesterEmail = text(payload.requester_email, 254).toLowerCase();
  const relationship = text(payload.relationship, 80);
  const message = text(payload.message, 1_500);

  if (!isCaptureId(captureId)) {
    return Response.json({ error: "有効なCapture IDを入力してください。" }, { status: 400 });
  }
  if (!allowedTypes.has(requestType)) {
    return Response.json({ error: "依頼の種類を選択してください。" }, { status: 400 });
  }
  if (!validEmail(requesterEmail)) {
    return Response.json({ error: "連絡可能なメールアドレスを入力してください。" }, { status: 400 });
  }
  if (message.length < 10) {
    return Response.json({ error: "依頼内容を10文字以上で入力してください。" }, { status: 400 });
  }

  const report: CaptureReport = {
    id: crypto.randomUUID(),
    capture_id: captureId,
    request_type: requestType,
    requester_email: requesterEmail,
    relationship,
    message,
    created_at: new Date().toISOString(),
    status: "open",
  };

  try {
    await saveCaptureReport(report);
    return Response.json({ report: { id: report.id, status: report.status } }, { status: 201 });
  } catch {
    return Response.json(
      { error: "現在依頼を保存できません。少し待ってから再度お試しください。" },
      { status: 503 },
    );
  }
}
