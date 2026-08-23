import { seedCaptures } from "@/catalog/captures";
import type { Capture } from "./types";

export function mergedCatalog(stored: Capture[]): Capture[] {
  const byId = new Map<string, Capture>();
  for (const capture of seedCaptures) byId.set(capture.id, capture);
  for (const capture of stored) byId.set(capture.id, capture);

  return [...byId.values()].sort(
    (a, b) => Date.parse(b.discovered_at) - Date.parse(a.discovered_at),
  );
}

export function seedCaptureById(id: string): Capture | null {
  return seedCaptures.find((capture) => capture.id === id) ?? null;
}
