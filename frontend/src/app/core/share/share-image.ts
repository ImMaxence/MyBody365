import type { DayData, MilestoneData, Post, ProgressData } from '../friends/friends-api';
import type { I18nService } from '../i18n/i18n.service';

/**
 * A post as a picture to send anywhere (1.9): WhatsApp, Instagram, a message… 1080 × 1350 (the portrait format of the
 * social networks), drawn on a canvas with the app's fonts, nothing sent to a server. Then the phone's share sheet, or a
 * download where there is none.
 */
const W = 1080;
const H = 1350;
const SLOT_EMOJI: Record<string, string> = { BREAKFAST: '🥣', LUNCH: '🥗', DINNER: '🍲', SNACK: '🍎' };
const DISPLAY = '"Archivo Variable", Archivo, "Inter Variable", Inter, system-ui, sans-serif';
const TEXT = '"Inter Variable", Inter, system-ui, sans-serif';

export async function postImage(post: Post, i18n: I18nService): Promise<Blob> {
  await document.fonts?.ready.catch(() => undefined);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');

  // a warm background, as the app's flame
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#ff8a3d');
  bg.addColorStop(0.55, '#ff5a4e');
  bg.addColorStop(1, '#d9366b');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 0, W * 0.85, H * 0.1, W * 0.8);
  glow.addColorStop(0, 'rgba(255, 214, 102, 0.55)');
  glow.addColorStop(1, 'rgba(255, 214, 102, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 56px ${DISPLAY}`;
  ctx.fillText('MyBody365', 80, 140);
  ctx.font = `600 34px ${TEXT}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(`${post.author.name} · ${i18n.date(post.day, { day: 'numeric', month: 'long', year: 'numeric' })}`, 80, 196);
  ctx.globalAlpha = 1;

  if (post.kind === 'PROGRESS') drawProgress(ctx, post.data as ProgressData, i18n);
  else if (post.kind === 'MILESTONE') drawMilestone(ctx, post.data as MilestoneData, i18n);
  else drawDay(ctx, post.data as DayData, i18n);

  ctx.font = `600 30px ${TEXT}`;
  ctx.globalAlpha = 0.8;
  ctx.fillText('mybody365.mbonnici.fr', 80, H - 80);
  ctx.globalAlpha = 1;

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no image'))), 'image/png'));
}

function drawProgress(ctx: CanvasRenderingContext2D, d: ProgressData, i18n: I18nService): void {
  const v = d.changeKg;
  const change = `${v > 0 ? '+' : v < 0 ? '−' : ''}${i18n.number(Math.abs(v), 1)} kg`;
  ctx.font = `900 230px ${DISPLAY}`;
  ctx.fillText(change, 72, 560);
  ctx.font = `600 44px ${TEXT}`;
  ctx.fillText(i18n.t('friends.posts.since', { n: d.days }), 80, 640);

  // the way to the goal
  const y = 760;
  roundRect(ctx, 80, y, W - 160, 44, 22);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fill();
  roundRect(ctx, 80, y, Math.max(44, ((W - 160) * Math.min(100, d.progressPct)) / 100), 44, 22);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.font = `700 42px ${TEXT}`;
  ctx.fillText(d.reached ? i18n.t('friends.posts.reached') : i18n.t('friends.posts.way', { pct: d.progressPct }), 80, y + 120);

  let line = y + 230;
  ctx.font = `700 46px ${TEXT}`;
  if (d.streak > 0) {
    ctx.fillText(`🔥 ${i18n.t('friends.posts.streak', { n: d.streak })}`, 80, line);
    line += 80;
  }
  if (d.weights && d.currentKg != null) {
    ctx.fillText(`⚖️ ${i18n.number(d.startKg ?? 0, 1)} → ${i18n.number(d.currentKg, 1)} kg`, 80, line);
    line += 80;
    ctx.fillText(`🎯 ${i18n.number(d.goalKg ?? 0, 1)} kg`, 80, line);
  }
}

function drawMilestone(ctx: CanvasRenderingContext2D, d: MilestoneData, i18n: I18nService): void {
  const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${i18n.number(Math.abs(v), v % 1 ? 1 : 0)} kg`;
  ctx.font = `400 200px ${TEXT}`;
  ctx.fillText('🏅', 72, 470);
  ctx.font = `800 64px ${DISPLAY}`;
  ctx.fillText(i18n.t('friends.posts.milestone'), 80, 590);
  ctx.font = `900 200px ${DISPLAY}`;
  ctx.fillText(d.weights && d.targetKg != null ? `${i18n.number(d.targetKg, d.targetKg % 1 ? 1 : 0)} kg` : signed(d.changeKg), 72, 800);
  let line = 920;
  ctx.font = `700 46px ${TEXT}`;
  if (d.weights && d.targetKg != null) {
    ctx.fillText(signed(d.changeKg), 80, line);
    line += 80;
  }
  if (d.total > 1) {
    ctx.fillText(`⛳ ${i18n.t('friends.posts.milestoneOf', { n: d.reached, total: d.total })}`, 80, line);
    line += 80;
  }
  if (d.streak > 0) ctx.fillText(`🔥 ${i18n.t('friends.posts.streak', { n: d.streak })}`, 80, line);
}

function drawDay(ctx: CanvasRenderingContext2D, d: DayData, i18n: I18nService): void {
  ctx.font = `900 150px ${DISPLAY}`;
  const kcal = i18n.number(d.kcal);
  ctx.fillText(kcal, 72, 420);
  const w = ctx.measureText(kcal).width;
  ctx.font = `700 52px ${TEXT}`;
  ctx.fillText(d.targetKcal ? `kcal / ${i18n.number(d.targetKcal)}` : 'kcal', 92 + w, 420);

  // the lines on a frosted card
  const top = 490;
  const rows = d.lines.slice(0, 9);
  const height = 60 + rows.length * 78 + (d.lines.length + (d.more ?? 0) > rows.length ? 60 : 0);
  roundRect(ctx, 60, top, W - 120, height, 40);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
  ctx.fill();
  ctx.fillStyle = '#fff';
  let y = top + 90;
  for (const l of rows) {
    ctx.font = `600 40px ${TEXT}`;
    const right = `${i18n.number(l.kcal)} kcal`;
    const rw = ctx.measureText(right).width;
    ctx.fillText(fit(ctx, `${SLOT_EMOJI[l.slot] ?? '🍽️'}  ${l.name}`, W - 260 - rw), 100, y);
    ctx.globalAlpha = 0.85;
    ctx.fillText(right, W - 100 - rw, y);
    ctx.globalAlpha = 1;
    y += 78;
  }
  const hidden = d.lines.length - rows.length + (d.more ?? 0);
  if (hidden > 0) {
    ctx.font = `600 34px ${TEXT}`;
    ctx.globalAlpha = 0.85;
    ctx.fillText(i18n.t('friends.posts.more', { n: hidden }), 100, y);
    ctx.globalAlpha = 1;
  }
  if (d.proteinG != null) {
    ctx.font = `600 36px ${TEXT}`;
    ctx.fillText(i18n.t('meals.estimate.macros', { p: d.proteinG, c: d.carbsG ?? 0, f: d.fatG ?? 0 }), 80, top + height + 80);
  }
}

/** the text cut with « … » to fit the width */
function fit(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > max) t = t.slice(0, -1);
  return t + '…';
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

/** the phone's share sheet with the picture, or a download */
export async function shareImage(blob: Blob, name: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], name, { type: 'image/png' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}
