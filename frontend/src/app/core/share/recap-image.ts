import type { MonthRecap } from '../api/habits-api';
import type { I18nService } from '../i18n/i18n.service';

/**
 * 1.19: the recap of a month as a picture to share (1080 × 1350, the portrait of the social networks), drawn on a canvas
 * with the app's fonts like the posts of 1.9, nothing sent to a server: the kilos of the month, the days weighed, the days of
 * meals noted, the longest run, the health score of the plate. Never a photo of the body.
 */
const W = 1080;
const H = 1350;
const DISPLAY = '"Archivo Variable", Archivo, "Inter Variable", Inter, system-ui, sans-serif';
const TEXT = '"Inter Variable", Inter, system-ui, sans-serif';

export async function recapImage(r: MonthRecap, monthName: string, i18n: I18nService): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#2b1055');
  bg.addColorStop(0.55, '#7a2a6b');
  bg.addColorStop(1, '#ff6a3d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.8, H * 0.15, 0, W * 0.8, H * 0.15, W * 0.75);
  glow.addColorStop(0, 'rgba(255, 194, 61, 0.45)');
  glow.addColorStop(1, 'rgba(255, 194, 61, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.font = `800 56px ${DISPLAY}`;
  ctx.fillText('MyBody365', 80, 140);
  ctx.globalAlpha = 0.85;
  ctx.font = `600 36px ${TEXT}`;
  ctx.fillText(i18n.t('recap.imageOf', { month: monthName, name: r.firstName }), 80, 200);
  ctx.globalAlpha = 1;

  // the kilos of the month, or the days weighed when one weigh-in only
  const delta = r.weight.deltaKg;
  ctx.font = `800 210px ${DISPLAY}`;
  const big = delta == null || r.weight.days < 2 ? String(r.weight.days) : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${i18n.number(Math.abs(delta), 1)}`;
  ctx.fillText(big, 80, 520);
  ctx.font = `700 52px ${TEXT}`;
  ctx.fillText(delta == null || r.weight.days < 2 ? i18n.t('recap.weighIns') : 'kg', 80, 600);

  const tiles: [string, string][] = [
    [String(r.weight.days), i18n.t('recap.tiles.weighed')],
    [String(r.meals.days), i18n.t('recap.tiles.meals')],
    [String(r.bestRun), i18n.t('recap.tiles.run')],
  ];
  if (r.meals.avgHealth != null) tiles.push([i18n.number(r.meals.avgHealth, r.meals.avgHealth % 1 ? 1 : 0) + '/10', i18n.t('recap.tiles.health')]);
  const tw = (W - 160 - 30) / 2;
  tiles.slice(0, 4).forEach(([value, label], i) => {
    const x = 80 + (i % 2) * (tw + 30);
    const y = 700 + Math.floor(i / 2) * 230;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    roundRect(ctx, x, y, tw, 200, 36);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `800 84px ${DISPLAY}`;
    ctx.fillText(value, x + 36, y + 110);
    ctx.font = `600 30px ${TEXT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(label, x + 36, y + 162);
    ctx.globalAlpha = 1;
  });

  ctx.font = `600 30px ${TEXT}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText('mybody365.mbonnici.fr', 80, H - 70);
  ctx.globalAlpha = 1;
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
