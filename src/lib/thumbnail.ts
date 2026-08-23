/**
 * Turns whatever someone chose or pasted into one card-shaped picture.
 *
 * People paste screenshots, phone photos, panoramas — any size, any ratio. The
 * card is a fixed 4:3 frame, so the browser fits the image into that frame
 * here, before anything is uploaded: the whole picture is drawn inside the
 * frame, and a blurred, enlarged copy of itself fills whatever is left over.
 * Nothing is cropped away and no letterbox voids appear.
 *
 * Doing it in the browser also means the upload is small, the Worker never
 * decodes anyone's file, and re-encoding drops the EXIF — including where the
 * photo was taken — on the way through.
 */

/** The card frame. 4:3, matching `.capture-visual`. */
export const THUMBNAIL_WIDTH = 1200;
export const THUMBNAIL_HEIGHT = 900;

/** The Worker rejects anything larger, so the encoder aims below it. */
export const MAX_THUMBNAIL_BYTES = 400_000;
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const QUALITIES = [0.82, 0.72, 0.62, 0.5];

type Source = ImageBitmap | HTMLImageElement;

function sizeOf(image: Source): { width: number; height: number } {
  return image instanceof HTMLImageElement
    ? { width: image.naturalWidth, height: image.naturalHeight }
    : { width: image.width, height: image.height };
}

async function decode(file: Blob): Promise<Source> {
  if (typeof createImageBitmap === "function") {
    try {
      // `from-image` so a phone photo is not delivered on its side.
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // Fall through: some formats decode as an <img> but not as a bitmap.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("画像を読み取れませんでした。"));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paint(image: Source, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("この環境では画像を処理できません。");

  const { width: sourceWidth, height: sourceHeight } = sizeOf(image);
  if (!sourceWidth || !sourceHeight) throw new Error("画像を読み取れませんでした。");

  const draw = (scale: number) => {
    const w = sourceWidth * scale;
    const h = sourceHeight * scale;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  };

  // Backdrop: the same image, enlarged past the frame and blurred, so a tall
  // or wide picture sits on something related to itself rather than on a slab
  // of grey. Enlarged a little extra because a blur pulls in the edges.
  ctx.filter = "blur(36px)";
  draw(Math.max(width / sourceWidth, height / sourceHeight) * 1.25);
  ctx.filter = "none";
  ctx.fillStyle = "rgba(8, 8, 10, 0.45)";
  ctx.fillRect(0, 0, width, height);

  // The picture itself, whole.
  draw(Math.min(width / sourceWidth, height / sourceHeight));
  return canvas;
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("画像を変換できませんでした。"))),
      "image/jpeg",
      quality,
    );
  });
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("画像を読み取れませんでした。"));
    reader.readAsDataURL(blob);
  });
}

/** The finished thumbnail as a `data:` URL, ready to preview and to upload. */
export async function normalizeThumbnail(file: Blob): Promise<string> {
  if (file.size > MAX_SOURCE_BYTES) throw new Error("画像が大きすぎます（25MBまで）。");
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("画像ファイルを選んでください。");
  }

  const image = await decode(file);
  try {
    for (const scale of [1, 0.75, 0.5]) {
      const canvas = paint(image, THUMBNAIL_WIDTH * scale, THUMBNAIL_HEIGHT * scale);
      for (const quality of QUALITIES) {
        const blob = await encode(canvas, quality);
        if (blob.size <= MAX_THUMBNAIL_BYTES) return toDataUrl(blob);
      }
    }
    throw new Error("画像を小さくできませんでした。別の画像を試してください。");
  } finally {
    if (!(image instanceof HTMLImageElement)) image.close();
  }
}

/** The first image on a clipboard or in a drop, if there is one. */
export function imageFrom(transfer: DataTransfer | null): File | null {
  if (!transfer) return null;
  for (const item of transfer.files) {
    if (item.type.startsWith("image/")) return item;
  }
  for (const item of transfer.items) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}
