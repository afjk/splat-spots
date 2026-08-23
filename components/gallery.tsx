"use client";

import { useEffect, useMemo, useState } from "react";
import type { Capture } from "@/lib/captures/types";
import { CaptureCard } from "./capture-card";

export function Gallery({ initialCaptures }: { initialCaptures: Capture[] }) {
  const [captures, setCaptures] = useState(initialCaptures);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/captures", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { captures?: Capture[] } | null) => {
        if (payload?.captures) setCaptures(payload.captures);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return captures;
    return captures.filter((capture) =>
      [capture.title, capture.description, capture.source_author ?? "", ...capture.tags]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [captures, query]);

  return (
    <section className="gallery-section" id="gallery">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PUBLIC INDEX / {String(captures.length).padStart(3, "0")}</p>
          <h2>Explore captures</h2>
        </div>
        <label className="search-field">
          <span aria-hidden="true">⌕</span>
          <span className="sr-only">Search captures</span>
          <input
            type="search"
            placeholder="Search places, creators, tags…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>/</kbd>
        </label>
      </div>

      {filtered.length ? (
        <div className="capture-grid">
          {filtered.map((capture, index) => (
            <CaptureCard key={capture.id} capture={capture} index={index} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>NO MATCHES</span>
          <h3>まだ見つかっていない空間です。</h3>
          <p>検索語を変えるか、公開URLをカタログへ追加してください。</p>
        </div>
      )}
    </section>
  );
}
