/**
 * Builds a card for a listing that arrived after the build.
 *
 * The markup comes from `CaptureCardTemplate.astro` so the two stay one
 * design, and every value a submitter typed is written with `textContent`.
 * Nothing here ever assigns HTML: with no review step, a title is just as
 * likely to contain a tag as a place name.
 */

import { hueFor, pointsFor } from "./artwork";
import { displayDate, type CaptureRecord } from "./capture";
import { href } from "./url";

const SVG_NS = "http://www.w3.org/2000/svg";

function svg(name: string, attributes: Record<string, string>): SVGElement {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

/** The same field of points CaptureArt.astro draws, built in the browser. */
export function captureArt(id: string, label: string): SVGElement {
  const hue = hueFor(id);
  const gradientId = `glow-live-${id}`;
  const root = svg("svg", {
    class: "capture-art",
    viewBox: "0 0 400 300",
    preserveAspectRatio: "xMidYMid slice",
    role: "img",
    "aria-label": `${label} の抽象アートワーク`,
    style: `--art-hue: ${hue}`,
  });

  const gradient = svg("radialGradient", { id: gradientId, cx: "50%", cy: "62%", r: "72%" });
  const stops: [string, string, string][] = [
    ["0%", `hsl(${hue} 70% 46%)`, "0.5"],
    ["55%", `hsl(${(hue + 40) % 360} 60% 30%)`, "0.22"],
    ["100%", "#08080a", "0"],
  ];
  for (const [offset, color, opacity] of stops) {
    gradient.append(svg("stop", { offset, "stop-color": color, "stop-opacity": opacity }));
  }
  const defs = svg("defs", {});
  defs.append(gradient);
  root.append(defs);

  root.append(svg("rect", { width: "400", height: "300", fill: "#0c0c10" }));
  root.append(svg("rect", { width: "400", height: "300", fill: `url(#${gradientId})` }));

  for (const point of pointsFor(id)) {
    root.append(
      svg("circle", {
        cx: String(point.x * 400),
        cy: String(point.y * 300),
        r: String(point.r),
        fill: `hsl(${(hue + point.y * 60) % 360} 80% ${58 + point.o * 24}%)`,
        opacity: String(point.o),
      }),
    );
  }
  return root;
}

function slot(root: ParentNode, name: string): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-slot="${name}"]`);
}

export function createCaptureCard(
  capture: CaptureRecord,
  template: HTMLTemplateElement,
): HTMLElement | null {
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const card = fragment.querySelector<HTMLElement>(".capture-card");
  if (!card) return null;

  const detail = href(`/s/${capture.id}`);
  const date = displayDate(capture.captured_at);

  const visual = slot(card, "visual") as HTMLAnchorElement | null;
  if (visual) {
    visual.href = detail;
    visual.prepend(captureArt(capture.id, capture.title));
  }

  const meta = slot(card, "meta");
  if (meta) {
    for (const value of [capture.tags[0], date]) {
      if (!value) continue;
      const span = document.createElement("span");
      span.textContent = value;
      meta.append(span);
    }
  }

  const title = slot(card, "title") as HTMLAnchorElement | null;
  if (title) {
    title.href = detail;
    title.textContent = capture.title;
  }

  const blurb = slot(card, "blurb");
  if (blurb && capture.description) {
    blurb.textContent = capture.description;
    blurb.hidden = false;
  }

  const author = slot(card, "author");
  if (author && capture.author) {
    author.textContent = capture.author;
    author.hidden = false;
  }

  const tags = slot(card, "tags");
  if (tags && capture.tags.length > 0) {
    for (const tag of capture.tags) {
      const span = document.createElement("span");
      span.textContent = `#${tag}`;
      tags.append(span);
    }
    tags.hidden = false;
  }

  // Mirrors the haystack CaptureCard.astro bakes in, so one filter serves both.
  card.dataset.search = [capture.title, capture.description, capture.author ?? "", ...capture.tags]
    .join(" ")
    .toLowerCase();
  card.dataset.tags = capture.tags.join(" ");
  return card;
}
