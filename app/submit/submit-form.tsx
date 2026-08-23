"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { normalizeCaptureInput } from "@/lib/captures/normalize";
import type { Capture } from "@/lib/captures/types";

type SubmitState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "error"; message: string }
  | { kind: "saved"; capture: Capture };

export function SubmitForm() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  const normalized = useMemo(() => {
    if (!url.trim()) return null;
    try {
      return { value: normalizeCaptureInput(url), error: null };
    } catch (error) {
      return { value: null, error: error instanceof Error ? error.message : "URLを確認してください。" };
    }
  }, [url]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!normalized?.value) {
      setState({ kind: "error", message: normalized?.error ?? "公開URLを入力してください。" });
      return;
    }

    const form = new FormData(event.currentTarget);
    setState({ kind: "saving" });
    try {
      const response = await fetch("/api/captures", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          insta360_url: normalized.value.insta360_url,
          title: form.get("title"),
          description: form.get("description"),
          source_post_url: form.get("source_post_url"),
          source_author: form.get("source_author"),
          tags: String(form.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim()),
        }),
      });
      const payload = (await response.json()) as { capture?: Capture; error?: string };
      if (!response.ok || !payload.capture) throw new Error(payload.error ?? "保存できませんでした。");
      setState({ kind: "saved", capture: payload.capture });
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : "保存できませんでした。" });
    }
  }

  return (
    <form className="submit-form" onSubmit={submit}>
      <div className="field-block field-wide">
        <label htmlFor="insta360_url">Insta360 public share URL <b>*</b></label>
        <input
          id="insta360_url"
          name="insta360_url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://app.insta360.com/3dspace/detail/GS3DG…"
          value={url}
          onChange={(event) => {
            setUrl(event.target.value);
            setState({ kind: "idle" });
          }}
          required
        />
        <div className={`normalization-preview ${normalized?.value ? "is-valid" : ""}`}>
          <span>{normalized?.value ? "✓" : "→"}</span>
          <div>
            <small>NORMALIZED CAPTURE ID</small>
            <code>{normalized?.value?.id ?? "GS3DG…"}</code>
          </div>
          {normalized?.error ? <p>{normalized.error}</p> : null}
        </div>
      </div>

      <div className="field-block field-wide">
        <label htmlFor="title">Title</label>
        <input id="title" name="title" maxLength={120} placeholder="例：夜の日本橋を歩く" />
      </div>

      <div className="field-block field-wide">
        <label htmlFor="description">Description</label>
        <textarea id="description" name="description" maxLength={600} rows={4} placeholder="この空間について短く教えてください。" />
      </div>

      <div className="field-block">
        <label htmlFor="source_author">Source author</label>
        <input id="source_author" name="source_author" maxLength={80} placeholder="@creator" />
      </div>
      <div className="field-block">
        <label htmlFor="source_post_url">Source post URL</label>
        <input id="source_post_url" name="source_post_url" type="url" inputMode="url" placeholder="https://…" />
      </div>
      <div className="field-block field-wide">
        <label htmlFor="tags">Tags <span>comma separated</span></label>
        <input id="tags" name="tags" placeholder="architecture, tokyo, night" />
      </div>

      <div className="submission-note field-wide">
        <span aria-hidden="true">◎</span>
        <p>
          送信すると、URLと上記メタデータだけが審査待ちとして保存されます。Capture本体の
          SOG / PLYファイルはコピーしません。
        </p>
      </div>

      {state.kind === "error" ? <p className="form-message is-error" role="alert">{state.message}</p> : null}
      {state.kind === "saved" ? (
        <div className="form-message is-success" role="status">
          <span>登録しました。</span>
          <Link href={`/s/${state.capture.id}`}>Viewerを開く ↗</Link>
        </div>
      ) : null}

      <button className="button button-dark submit-button" disabled={state.kind === "saving"} type="submit">
        {state.kind === "saving" ? "Saving…" : "Submit to the atlas"}<span>↗</span>
      </button>
    </form>
  );
}
