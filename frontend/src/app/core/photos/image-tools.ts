/**
 * Pictures are prepared in the browser before they leave the phone: oriented, resized to 1600 px and
 * encoded as WebP (JPEG where the browser cannot), so a photo weighs ~200 KB instead of 4 MB. The server
 * decodes and re-encodes them anyway (and drops every metadata): this is only about speed and data.
 */
export const MAX_SIDE = 1600;

/** a file from the gallery (HEIC included where the browser decodes it) or a canvas, ready to upload */
export async function prepareImage(source: Blob | HTMLCanvasElement, maxSide = MAX_SIDE): Promise<Blob> {
  const canvas = source instanceof HTMLCanvasElement ? fit(source, maxSide) : await drawFile(source, maxSide);
  const webp = await toBlob(canvas, 'image/webp', 0.86);
  if (webp && webp.type === 'image/webp') return webp;
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.88);
  if (!jpeg) throw new Error('invalid_image');
  return jpeg;
}

async function drawFile(file: Blob, maxSide: number): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    // EXIF orientation applied (portrait photos stay portrait)
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('unsupported_image');
  }
  const { w, h } = size(bitmap.width, bitmap.height, maxSide);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return canvas;
}

function fit(src: HTMLCanvasElement, maxSide: number): HTMLCanvasElement {
  const { w, h } = size(src.width, src.height, maxSide);
  if (w === src.width && h === src.height) return src;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, w, h);
  return canvas;
}

function size(w: number, h: number, maxSide: number): { w: number; h: number } {
  const f = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.round(w * f), h: Math.round(h * f) };
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** a picture fully loaded and decoded (for canvases and smooth playback) */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('invalid_image'));
    img.src = url;
  });
}

/** "12,4 Mo" / "12.4 MB" */
export function formatBytes(bytes: number, lang: 'fr' | 'en'): string {
  const units = lang === 'fr' ? ['o', 'Ko', 'Mo', 'Go'] : ['B', 'KB', 'MB', 'GB'];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const n = new Intl.NumberFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: v < 10 && i > 0 ? 1 : 0 }).format(v);
  return `${n} ${units[i]}`;
}
