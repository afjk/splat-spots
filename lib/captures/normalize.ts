const CAPTURE_ID_PATTERN = /^GS3DG[A-Za-z0-9]{16,80}$/;
const INSTA360_HOST = "app.insta360.com";
const DETAIL_PREFIX = "/3dspace/detail/";

export type NormalizedCapture = {
  id: string;
  insta360_url: string;
};

export function isCaptureId(value: string): boolean {
  return CAPTURE_ID_PATTERN.test(value.trim());
}

export function canonicalInsta360Url(id: string): string {
  return `https://${INSTA360_HOST}${DETAIL_PREFIX}${id}`;
}

export function normalizeCaptureInput(input: string): NormalizedCapture {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Insta360の公開URLを入力してください。");
  }

  if (isCaptureId(trimmed)) {
    return { id: trimmed, insta360_url: canonicalInsta360Url(trimmed) };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("URLの形式を確認してください。");
  }

  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.hostname.toLowerCase() !== INSTA360_HOST
  ) {
    throw new Error("app.insta360.com の公開URLだけを登録できます。");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[0] !== "3dspace" || segments[1] !== "detail") {
    throw new Error("Spatial Captureの詳細URLを入力してください。");
  }

  const id = decodeURIComponent(segments[2]);
  if (!isCaptureId(id)) {
    throw new Error("有効なGS3DG IDを見つけられませんでした。");
  }

  return { id, insta360_url: canonicalInsta360Url(id) };
}
