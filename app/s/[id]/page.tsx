import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { seedCaptureById } from "@/lib/captures/catalog";
import { isCaptureId, canonicalInsta360Url } from "@/lib/captures/normalize";
import { findStoredCapture } from "@/lib/captures/repository";
import type { Capture } from "@/lib/captures/types";
import { viewerUrl } from "@/lib/viewer/adapter";

type PageProps = { params: Promise<{ id: string }> };

async function captureFor(id: string): Promise<Capture> {
  try {
    const stored = await findStoredCapture(id);
    if (stored) return stored;
  } catch {
    // The bundled catalog remains usable when local D1 is not available.
  }
  return seedCaptureById(id) ?? {
    id,
    insta360_url: canonicalInsta360Url(id),
    title: "Public Spatial Capture",
    description: "Insta360で一般公開されたSpatial Capture。",
    source_post_url: null,
    source_author: null,
    discovered_at: new Date().toISOString(),
    last_checked_at: null,
    status: "pending",
    tags: [],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isCaptureId(id)) return { title: "Capture not found — Splat Atlas" };
  const capture = await captureFor(id);
  return {
    title: `${capture.title} — Splat Atlas`,
    description: capture.description,
  };
}

export default async function CapturePage({ params }: PageProps) {
  const { id } = await params;
  if (!isCaptureId(id)) notFound();
  const capture = await captureFor(id);
  const launchUrl = viewerUrl(id);

  return (
    <main className="viewer-page">
      <SiteHeader />
      <section className="viewer-heading">
        <div>
          <Link className="back-link" href="/">← BACK TO ATLAS</Link>
          <p className="eyebrow">SPATIAL CAPTURE / {capture.status.toUpperCase()}</p>
          <h1>{capture.title}</h1>
          <p>{capture.description}</p>
        </div>
        <div className="viewer-heading-actions">
          <a className="button button-dark" href={launchUrl} target="_blank" rel="noreferrer">
            Open XR Viewer <span>↗</span>
          </a>
          <a className="text-link" href={capture.insta360_url} target="_blank" rel="noreferrer">
            View on Insta360 ↗
          </a>
        </div>
      </section>

      <section className="viewer-stage-wrap">
        <div className="viewer-stage-bar">
          <div><span className="live-dot" /> LIVE REMOTE VIEWER</div>
          <code>{capture.id}</code>
          <a href={launchUrl} target="_blank" rel="noreferrer">FULLSCREEN ↗</a>
        </div>
        <div className="viewer-stage">
          <iframe
            src={launchUrl}
            title={`${capture.title} WebXR viewer`}
            allow="fullscreen; xr-spatial-tracking"
            allowFullScreen
            loading="eager"
          />
          <div className="viewer-frame-note">Desktop: drag to orbit · Quest / PICO: open fullscreen to enter VR</div>
        </div>
      </section>

      <section className="capture-details">
        <div className="detail-main">
          <p className="eyebrow">CATALOG RECORD</p>
          <dl>
            <div><dt>Capture ID</dt><dd><code>{capture.id}</code></dd></div>
            <div><dt>Source author</dt><dd>{capture.source_author ?? "Not provided"}</dd></div>
            <div><dt>Discovered</dt><dd>{new Intl.DateTimeFormat("ja-JP", { dateStyle: "long" }).format(new Date(capture.discovered_at))}</dd></div>
            <div><dt>Last checked</dt><dd>{capture.last_checked_at ? new Intl.DateTimeFormat("ja-JP").format(new Date(capture.last_checked_at)) : "Not yet checked"}</dd></div>
          </dl>
        </div>
        <aside className="detail-actions">
          <p>この空間の所有者ですか？掲載内容の修正・削除依頼を受け付けます。</p>
          <Link href={`/report?capture=${encodeURIComponent(capture.id)}`}>Report / Remove ↗</Link>
          {capture.source_post_url ? <a href={capture.source_post_url} target="_blank" rel="noreferrer">Source post ↗</a> : null}
        </aside>
      </section>
      <SiteFooter />
    </main>
  );
}
