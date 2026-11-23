import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { BodyLogEntry, Summary } from '../../core/api/models';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { localDay } from '../../core/tracking/tracking.store';
import { IconComponent } from '../../shared/icon.component';

/** the weigh-ins of these last days say whether the weight still moves */
const WINDOW_DAYS = 21;
const MIN_POINTS = 8;
/** a pace slower than this, in kg a week, towards the goal: a plateau */
const FLAT = 0.1;

/** the pace of the weigh-ins (kg a week, by a straight line through them) over the last WINDOW_DAYS, or null */
export function recentPace(logs: { day: string; weightKg?: number | null }[], today = localDay()): number | null {
  const from = Date.parse(today) - WINDOW_DAYS * 86_400_000;
  const pts = logs.filter((l) => l.weightKg != null && Date.parse(l.day) >= from).map((l) => ({ x: Date.parse(l.day) / 86_400_000, y: l.weightKg! }));
  if (pts.length < MIN_POINTS || pts[pts.length - 1].x - pts[0].x < WINDOW_DAYS - 4) return null;
  const mx = pts.reduce((t, p) => t + p.x, 0) / pts.length;
  const my = pts.reduce((t, p) => t + p.y, 0) / pts.length;
  const num = pts.reduce((t, p) => t + (p.x - mx) * (p.y - my), 0);
  const den = pts.reduce((t, p) => t + (p.x - mx) ** 2, 0);
  return den ? (num / den) * 7 : null;
}

/**
 * 1.19: « Ton poids stagne » on Progress: three weeks of weigh-ins whose line no longer goes towards the goal (less than
 * 100 g a week), more than a kilo from it, after the first month. It says why it happens and what helps, never to eat
 * less than the target (the floor stays): water hiding the fat lost, the waist that goes down meanwhile, the forgotten
 * calories, needs that drop with the kilos, moving a little more each day.
 */
@Component({
  selector: 'app-plateau-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @if (pace(); as p) {
      <section class="card plateau" [attr.aria-label]="'plateau.title' | t">
        <div class="head">
          <span class="ico"><app-icon name="activity" /></span>
          <div>
            <h2 class="h3">{{ 'plateau.title' | t }}</h2>
            <p class="small muted num">{{ 'plateau.pace' | t: { pace: paceText(p) } }}</p>
          </div>
        </div>
        <p class="small">{{ 'plateau.normal' | t }}</p>
        <ul class="tips small">
          <li><app-icon name="ruler" [size]="16" /> {{ 'plateau.waist' | t }}</li>
          <li><app-icon name="utensils" [size]="16" /> {{ 'plateau.log' | t }}</li>
          <li><app-icon name="gauge" [size]="16" /> {{ 'plateau.needs' | t }}</li>
          <li><app-icon name="zap" [size]="16" /> {{ 'plateau.move' | t }}</li>
        </ul>
        <p class="tiny muted">{{ 'plateau.never' | t }}</p>
      </section>
    }
  `,
  styles: `
    .plateau {
      display: grid;
      gap: 10px;
      border-color: color-mix(in srgb, var(--cool) 35%, var(--line));
    }
    .head {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .head p {
      margin: 2px 0 0;
    }
    .ico {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      flex: none;
      border-radius: 14px;
      background: var(--cool-soft);
      color: var(--cool);
    }
    .small {
      margin: 0;
    }
    .tips {
      display: grid;
      gap: 8px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .tips li {
      display: grid;
      grid-template-columns: 18px 1fr;
      gap: 8px;
      align-items: start;
    }
  `,
})
export class PlateauCardComponent {
  readonly logs = input<BodyLogEntry[]>([]);
  readonly summary = input<Summary | null>(null);
  private readonly i18n = inject(I18nService);

  /** the pace of the last weeks when it is a plateau, else null */
  protected readonly pace = computed(() => {
    const s = this.summary();
    if (!s || s.goal.reached) return null;
    // the first month is not judged
    if (Date.parse(localDay()) - Date.parse(s.profile.startDate) < 28 * 86_400_000) return null;
    const current = s.current?.trendKg ?? s.current?.weightKg;
    if (current == null) return null;
    const remaining = s.goal.goalKg - current;
    if (Math.abs(remaining) <= 1) return null;
    const p = recentPace(this.logs());
    if (p == null) return null;
    const towards = remaining < 0 ? -p : p;
    return towards < FLAT ? { pace: p } : null;
  });

  protected paceText(p: { pace: number }): string {
    const v = Math.round(p.pace * 100) / 100;
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${this.i18n.number(Math.abs(v), 2)}`;
  }
}
