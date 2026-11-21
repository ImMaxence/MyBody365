/**
 * 1.16: touching up a photo already taken, on the phone: placed and sized in the frame (smaller than it too, a background
 * then fills the rest: the photo blurred, black or white), turned by quarter turns and straightened, brighter, more
 * contrasted, more or less colourful. The preview draws on a canvas with the browser's CSS filters on top; the saved
 * picture is drawn the same way and its pixels get the same filters by hand (the formulas of CSS filters), since iPhones
 * have no filters on a canvas. The frame is the photos' own: 3 by 4.
 */
export interface PhotoEdit {
  /** quarter turns, clockwise */
  turn: 0 | 1 | 2 | 3;
  /** straightened, in degrees */
  angle: number;
  /** 1: the photo just covers the frame; below, it is smaller and the background shows */
  zoom: number;
  /** moved, as a share of the frame's width and height */
  x: number;
  y: number;
  /** 1: unchanged (0.5 to 1.5) */
  brightness: number;
  contrast: number;
  saturation: number;
  background: Background;
}

export type Background = 'blur' | 'black' | 'white';
export const BACKGROUNDS: Background[] = ['blur', 'black', 'white'];

export const NO_EDIT: PhotoEdit = { turn: 0, angle: 0, zoom: 1, x: 0, y: 0, brightness: 1, contrast: 1, saturation: 1, background: 'blur' };

/** the saved picture: 3 by 4, as the camera takes them */
export const OUT_W = 1200;
export const OUT_H = 1600;
export const ZOOM_MIN = 0.3;
export const ZOOM_MAX = 4;
export const ANGLE_MAX = 20;

type Picture = HTMLImageElement | HTMLCanvasElement;

const width = (img: Picture) => (img instanceof HTMLImageElement ? img.naturalWidth || img.width : img.width);
const height = (img: Picture) => (img instanceof HTMLImageElement ? img.naturalHeight || img.height : img.height);

/** something to save: the background alone changes nothing while the photo covers the frame */
export function changed(e: PhotoEdit): boolean {
  return (Object.keys(NO_EDIT) as (keyof PhotoEdit)[]).some((k) => k !== 'background' && e[k] !== NO_EDIT[k]);
}

export function filtered(e: PhotoEdit): boolean {
  return e.brightness !== 1 || e.contrast !== 1 || e.saturation !== 1;
}

/** the preview's filters, the same as applyFilters gives the saved picture */
export function cssFilter(e: PhotoEdit): string {
  return filtered(e) ? `brightness(${e.brightness}) contrast(${e.contrast}) saturate(${e.saturation})` : 'none';
}

export function clampZoom(z: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

/** a move stays within a frame's width or height of the middle: the photo never gets lost */
export function clampMove(v: number): number {
  return Math.min(1, Math.max(-1, v));
}

/** a little copy of the photo, turned, smoothed in two steps: once stretched over the frame, a soft blur */
export function softCopy(img: Picture, turn: number): HTMLCanvasElement {
  const iw = width(img);
  const ih = height(img);
  const side = turn % 2 === 1;
  const bw = side ? ih : iw;
  const bh = side ? iw : ih;
  const step = (long: number, src: CanvasImageSource, sw: number, sh: number, rotate: boolean) => {
    const k = long / Math.max(bw, bh);
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(bw * k));
    c.height = Math.max(1, Math.round(bh * k));
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (rotate) {
      ctx.translate(c.width / 2, c.height / 2);
      ctx.rotate((turn * Math.PI) / 2);
      const dw = side ? c.height : c.width;
      const dh = side ? c.width : c.height;
      ctx.drawImage(src, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.drawImage(src, 0, 0, sw, sh, 0, 0, c.width, c.height);
    }
    return c;
  };
  const tiny = step(18, img, iw, ih, true);
  return step(140, tiny, tiny.width, tiny.height, false);
}

/** the photo as edited, on a w × h canvas: the background, then the photo placed, sized and turned */
export function draw(ctx: CanvasRenderingContext2D, w: number, h: number, img: Picture, e: PhotoEdit, soft: HTMLCanvasElement | null): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (e.background === 'blur' && soft) {
    const k = Math.max(w / soft.width, h / soft.height);
    const sw = soft.width * k;
    const sh = soft.height * k;
    ctx.drawImage(soft, (w - sw) / 2, (h - sh) / 2, sw, sh);
    // a little darker: the photo stands out of it
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = e.background === 'white' ? '#ffffff' : '#000000';
    ctx.fillRect(0, 0, w, h);
  }
  const iw = width(img);
  const ih = height(img);
  const side = e.turn % 2 === 1;
  const s = Math.max(w / (side ? ih : iw), h / (side ? iw : ih)) * e.zoom;
  ctx.translate(w / 2 + e.x * w, h / 2 + e.y * h);
  ctx.rotate(((e.turn * 90 + e.angle) * Math.PI) / 180);
  ctx.scale(s, s);
  ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  ctx.restore();
}

/** brightness, contrast, then saturation, as CSS filters do them (each one clamped), on RGBA pixels in place */
export function applyFilters(px: Uint8ClampedArray, e: PhotoEdit): void {
  if (!filtered(e)) return;
  const lut = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    let v = Math.min(1, (i / 255) * e.brightness);
    v = Math.min(1, Math.max(0, (v - 0.5) * e.contrast + 0.5));
    lut[i] = v * 255;
  }
  const s = e.saturation;
  // the saturate() matrix of the Filter Effects spec
  const m = [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
  for (let i = 0; i < px.length; i += 4) {
    const r = lut[px[i]];
    const g = lut[px[i + 1]];
    const b = lut[px[i + 2]];
    if (s === 1) {
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
    } else {
      // Uint8ClampedArray rounds and clamps on its own
      px[i] = m[0] * r + m[1] * g + m[2] * b;
      px[i + 1] = m[3] * r + m[4] * g + m[5] * b;
      px[i + 2] = m[6] * r + m[7] * g + m[8] * b;
    }
  }
}

/** the picture to save: OUT_W × OUT_H, drawn and filtered */
export function render(img: Picture, e: PhotoEdit): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = OUT_W;
  canvas.height = OUT_H;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, OUT_W, OUT_H, img, e, e.background === 'blur' ? softCopy(img, e.turn) : null);
  if (filtered(e)) {
    const data = ctx.getImageData(0, 0, OUT_W, OUT_H);
    applyFilters(data.data, e);
    ctx.putImageData(data, 0, 0);
  }
  return canvas;
}
