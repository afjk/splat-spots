"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { normalizeCaptureInput } from "@/lib/captures/normalize";

type ReportState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "saved"; id: string };

export function ReportForm({ initialCapture }: { initialCapture: string }) {
  const [state, setState] = useState<ReportState>({ kind: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let captureId: string;
    try {
      captureId = normalizeCaptureInput(String(form.get("capture_id") ?? "")).id;
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Capture IDを確認してください。",
      });
      return;
    }

    setState({ kind: "saving" });
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          capture_id: captureId,
          request_type: form.get("request_type"),
          requester_email: form.get("requester_email"),
          relationship: form.get("relationship"),
          message: form.get("message"),
          website: form.get("website"),
        }),
      });
      const payload = (await response.json()) as { report?: { id: string }; error?: string };
      if (!response.ok || !payload.report) throw new Error(payload.error ?? "送信できませんでした。");
      setState({ kind: "saved", id: payload.report.id });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "送信できませんでした。" });
    }
  }

  if (state.kind === "saved") {
    return (
      <div className="report-success" role="status">
        <span className="report-success-mark">✓</span>
        <p className="eyebrow">REQUEST RECEIVED</p>
        <h2>申請を受け付けました。</h2>
        <p>内容を確認し、必要に応じて掲載情報の修正または非表示対応を行います。</p>
        <code>{state.id}</code>
        <Link className="button button-dark" href="/">Return to atlas <span>←</span></Link>
      </div>
    );
  }

  return (
    <form className="submit-form report-form" onSubmit={submit}>
      <div className="field-block field-wide">
        <label htmlFor="capture_id">Capture URL or ID <b>*</b></label>
        <input
          id="capture_id"
          name="capture_id"
          defaultValue={initialCapture}
          placeholder="GS3DG… または Insta360公開URL"
          required
        />
      </div>
      <div className="field-block">
        <label htmlFor="request_type">Request type <b>*</b></label>
        <select id="request_type" name="request_type" defaultValue="remove" required>
          <option value="remove">掲載を削除してほしい</option>
          <option value="correction">掲載情報を修正したい</option>
          <option value="unavailable">共有が解除されている</option>
          <option value="other">その他</option>
        </select>
      </div>
      <div className="field-block">
        <label htmlFor="relationship">Your relationship</label>
        <select id="relationship" name="relationship" defaultValue="creator">
          <option value="creator">Captureの作者・所有者</option>
          <option value="subject">撮影対象・関係者</option>
          <option value="finder">リンクを見つけた人</option>
          <option value="other">その他</option>
        </select>
      </div>
      <div className="field-block field-wide">
        <label htmlFor="requester_email">Contact email <b>*</b></label>
        <input id="requester_email" name="requester_email" type="email" autoComplete="email" placeholder="you@example.com" required />
      </div>
      <div className="field-block field-wide">
        <label htmlFor="message">Details <b>*</b></label>
        <textarea
          id="message"
          name="message"
          rows={6}
          minLength={10}
          maxLength={1500}
          placeholder="削除・修正を希望する理由や、確認に役立つ情報を入力してください。"
          required
        />
      </div>
      <div className="honeypot" aria-hidden="true">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <div className="submission-note field-wide">
        <span aria-hidden="true">◎</span>
        <p>メールアドレスは申請内容の確認にだけ使用し、公開しません。申請によってCapture本体がコピーされることはありません。</p>
      </div>
      {state.kind === "error" ? <p className="form-message is-error" role="alert">{state.message}</p> : null}
      <button className="button button-dark submit-button" disabled={state.kind === "saving"} type="submit">
        {state.kind === "saving" ? "Sending…" : "Send request"}<span>↗</span>
      </button>
    </form>
  );
}
