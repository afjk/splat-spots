/**
 * Capture identity rules, shared by the build scripts and the browser.
 *
 * Kept free of Node and Astro imports so both sides can use exactly the same
 * validation — a submission rejected in the form is rejected by `npm run add`
 * for the same reason.
 */

export const CAPTURE_ID_PATTERN = /^GS3DG[A-Za-z0-9]{16,80}$/;

const INSTA360_HOST = "app.insta360.com";

export function canonicalInsta360Url(id: string): string {
  return `https://${INSTA360_HOST}/3dspace/detail/${id}`;
}

/**
 * Accepts a bare GS3DG id or an Insta360 share URL and returns the canonical
 * id. Throws with a message meant to be shown to a person.
 */
export function normalizeCaptureInput(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Insta360の公開URLまたはIDを入力してください。");
  if (CAPTURE_ID_PATTERN.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("URLの形式を確認してください。");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("http または https のURLを入力してください。");
  }
  if (url.hostname.toLowerCase() !== INSTA360_HOST) {
    throw new Error("app.insta360.com の公開URLだけを登録できます。");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 3 || segments[0] !== "3dspace" || segments[1] !== "detail") {
    throw new Error("Spatial Captureの詳細URL (/3dspace/detail/…) を入力してください。");
  }

  const id = decodeURIComponent(segments[2]);
  if (!CAPTURE_ID_PATTERN.test(id)) {
    throw new Error("有効なGS3DG IDを見つけられませんでした。");
  }
  return id;
}
