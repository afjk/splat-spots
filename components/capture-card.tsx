import Link from "next/link";
import type { CSSProperties } from "react";
import type { Capture } from "@/lib/captures/types";

const statusLabel = {
  available: "PUBLIC",
  pending: "PENDING REVIEW",
  unavailable: "OFFLINE",
};

function captureHue(id: string): number {
  return [...id].reduce((total, character) => total + character.charCodeAt(0), 0) % 360;
}

export function CaptureCard({ capture, index }: { capture: Capture; index: number }) {
  const style = { "--capture-hue": captureHue(capture.id) } as CSSProperties;
  const date = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(capture.discovered_at));

  return (
    <article className="capture-card">
      <Link className="capture-visual" href={`/s/${capture.id}`} style={style}>
        <span className="capture-index">{String(index + 1).padStart(2, "0")}</span>
        <span className="capture-status">{statusLabel[capture.status]}</span>
        <span className="splat-field" aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="enter-capture">ENTER SPACE ↗</span>
      </Link>
      <div className="capture-copy">
        <div className="capture-meta">
          <span>{date}</span>
          <span>{capture.last_checked_at ? "CHECKED" : "NOT YET CHECKED"}</span>
        </div>
        <h3>
          <Link href={`/s/${capture.id}`}>{capture.title}</Link>
        </h3>
        <p>{capture.description || "Public Insta360 Spatial Capture"}</p>
        <div className="tag-row">
          {capture.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
      </div>
    </article>
  );
}
