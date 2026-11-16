import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, signal } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { IconComponent } from '../../shared/icon.component';

/** a year of weigh-ins for the time-lapse: from 82.4 kg to 71.9 kg */
const YEAR = [82.4, 81.1, 79.9, 78.6, 77.8, 76.9, 75.8, 75.1, 74.2, 73.4, 72.6, 71.9];

/**
 * The small piece of interface that illustrates each stop of the journey (day 1, 2, 7, 30, 90, 180,
 * 365). Drawn in HTML/CSS (no picture to download), themed like the app; the before / after slider
 * and the time-lapse can be played with.
 */
@Component({
  selector: 'app-journey-vignette',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    @switch (day()) {
      @case ('1') {
        <div class="v-day1" aria-hidden="true">
          <div class="tile">
            <span class="lbl">{{ 'landing.vignette.weighIn' | t }}</span>
            <span class="kg num">82,4<small> kg</small></span>
            <span class="ruler"><i></i></span>
          </div>
          <div class="tile viewfinder">
            <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
            <span class="thirds"></span>
            <span class="vf-label">{{ 'landing.vignette.sameFrame' | t }}</span>
            <span class="shutter"><i></i></span>
            <span class="ok"><app-icon name="check" [size]="14" [stroke]="2.6" /> {{ 'landing.vignette.taken' | t }}</span>
          </div>
        </div>
      }
      @case ('2') {
        <div class="v v-meals" aria-hidden="true">
          <div class="ring">
            <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" class="track" /><circle cx="50" cy="50" r="44" class="val" pathLength="100" /></svg>
            <span class="ring-text"><b class="num">640</b><small>{{ 'landing.vignette.kcal' | t }}</small><small>{{ 'landing.vignette.left' | t }}</small></span>
          </div>
          <ul class="meals" role="list">
            <li class="meal-head">{{ 'landing.vignette.meals' | t }}</li>
            @for (item of mealItems(); track $index) {
              <li [style.--i]="$index">
                <span>{{ item }}</span>
                <span class="kcal num">{{ kcal[$index] }}</span>
                <span class="ns" [class]="'ns ns-' + scores[$index]">{{ scores[$index] }}</span>
              </li>
            }
          </ul>
        </div>
      }
      @case ('7') {
        <div class="v v-flame" aria-hidden="true">
          <span class="flame"><app-icon name="flame" [size]="44" [stroke]="2" /></span>
          <span class="big num">7</span>
          <span class="lbl">{{ 'landing.vignette.streak' | t }}</span>
          <span class="week">
            @for (d of [0, 1, 2, 3, 4, 5, 6]; track d) {
              <i [style.--i]="d"><app-icon name="check" [size]="12" [stroke]="3" /></i>
            }
          </span>
        </div>
      }
      @case ('30') {
        <div class="v v-compare">
          <div class="frames" [style.--split]="split() + '%'">
            <div class="pane before">
              <em>{{ 'landing.vignette.before' | t }}</em>
              <span class="pane-kg num">82,4<small> kg</small></span>
              <span class="pane-sub">94 cm · {{ 'landing.vignette.waist' | t }}</span>
            </div>
            <div class="pane after">
              <em>{{ 'landing.vignette.after' | t }}</em>
              <span class="pane-kg num">79,3<small> kg</small></span>
              <span class="pane-sub">90 cm · {{ 'landing.vignette.waist' | t }}</span>
            </div>
            <span class="handle" aria-hidden="true"><app-icon name="chevronLeft" [size]="14" [stroke]="2.6" /><app-icon name="chevronRight" [size]="14" [stroke]="2.6" /></span>
            <input
              type="range"
              min="0"
              max="100"
              [value]="split()"
              (input)="split.set(+$any($event.target).value)"
              [attr.aria-label]="'landing.vignette.slide' | t"
            />
          </div>
          <p class="drag small muted"><app-icon name="chevronLeft" [size]="14" /> {{ 'landing.vignette.slide' | t }} <app-icon name="chevronRight" [size]="14" /></p>
        </div>
      }
      @case ('90') {
        <div class="v v-chart" aria-hidden="true" [class.armed]="chart() !== 'idle'" [class.in]="chart() === 'in'">
          <div class="c-head">
            <div>
              <p class="lbl">{{ 'landing.vignette.trend' | t }}</p>
              <p class="c-val num">{{ 'landing.vignette.trendValue' | t }} <small>kg</small></p>
            </div>
            <span class="c-date"><app-icon name="target" [size]="14" [stroke]="2.4" /> {{ 'landing.vignette.goalDate' | t }}</span>
          </div>
          <!-- 90 days of a real-looking year: weigh-ins, the smoothed trend, then the forecast down to the goal -->
          <svg viewBox="0 0 320 132" class="chart">
            <defs>
              <linearGradient id="v90-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" class="fill-top" />
                <stop offset="1" class="fill-bottom" />
              </linearGradient>
            </defs>
            <line x1="0" y1="20" x2="320" y2="20" class="grid" />
            <line x1="0" y1="65" x2="320" y2="65" class="grid" />
            <line x1="0" y1="110.9" x2="320" y2="110.9" class="goal-line" />
            <path class="area" [attr.d]="trend + ' L194.5 132 L10 132 Z'" />
            <path class="dots" [attr.d]="dots" />
            <path class="real" [attr.d]="trend" pathLength="1" />
            <path class="forecast" d="M194.5 73.1 C 230 84, 268 102, 300 110.9" />
            <circle class="halo" cx="194.5" cy="73.1" r="9" />
            <circle class="now" cx="194.5" cy="73.1" r="4.5" />
            <g class="target">
              <circle cx="300" cy="110.9" r="7" />
              <circle cx="300" cy="110.9" r="2.4" class="target-in" />
            </g>
          </svg>
          <div class="legend">
            <span><i class="key-real"></i>{{ 'landing.vignette.trendKey' | t }}</span>
            <span><i class="key-forecast"></i>{{ 'landing.vignette.forecast' | t }}</span>
            <span><i class="key-goal"></i>{{ 'landing.vignette.goal' | t }} {{ 'landing.vignette.goalKg' | t }}</span>
          </div>
        </div>
      }
      @case ('180') {
        <div class="v v-friends" aria-hidden="true">
          @for (f of friends(); track f; let i = $index) {
            <div class="friend" [style.--i]="i">
              <span class="ava" [style.--h]="hues[i]">{{ f.charAt(0) }}</span>
              <span class="name">{{ f }}</span>
              <span class="streak num"><app-icon name="flame" [size]="15" [stroke]="2.2" /> {{ streaks[i] }}</span>
            </div>
          }
          <div class="toast-v"><app-icon name="bell" [size]="16" /> {{ 'landing.vignette.nudge' | t }}</div>
        </div>
      }
      @case ('365') {
        <div class="v v-film">
          <div class="screen" [style.--p]="frame() / 11">
            <span class="month">{{ monthLabel() }}</span>
            <span class="screen-kg num">{{ i18n.number(year[frame()], 1) }}<small> kg</small></span>
            <span class="screen-delta num">−{{ i18n.number(year[0] - year[frame()], 1) }} kg</span>
            <span class="progress"><i></i></span>
          </div>
          <div class="strip" aria-hidden="true">
            @for (kg of year; track $index) {
              <span class="shot" [class.on]="$index <= frame()" [class.current]="$index === frame()" [style.--i]="$index"></span>
            }
          </div>
          <button type="button" class="play" (click)="toggle()" [attr.aria-pressed]="playing()">
            <span class="tri"><app-icon [name]="playing() ? 'pause' : 'play'" [size]="16" [stroke]="0" /></span>
            {{ (playing() ? 'landing.vignette.pause' : 'landing.vignette.play') | t }} · 0:12
          </button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .v {
      position: relative;
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: var(--shadow-1);
      font-size: var(--fs-s);
    }
    .lbl {
      color: var(--fg-2);
      font-weight: 600;
      font-size: var(--fs-xs);
    }
    .ok {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: var(--success);
      font-weight: 700;
      font-size: var(--fs-xs);
    }

    /* the vignettes come alive as they scroll into view */
    @supports (animation-timeline: view()) {
      @media (prefers-reduced-motion: no-preference) {
        .ring .val,
        .week i,
        .meals li,
        .friend,
        .toast-v,
        .shutter i {
          animation-timeline: view();
          animation-range: entry 30% cover 40%;
          animation-fill-mode: both;
          animation-timing-function: var(--ease-out);
        }
        .ring .val {
          animation-name: ring-fill;
        }
        .shutter i {
          animation-name: pop;
        }
        .week i {
          animation-name: pop;
          animation-range: entry calc(30% + var(--i) * 4%) cover calc(40% + var(--i) * 4%);
        }
        .meals li,
        .friend {
          animation-name: slide-in;
          animation-range: entry calc(30% + var(--i, 0) * 6%) cover calc(42% + var(--i, 0) * 6%);
        }
        .toast-v {
          animation-name: toast-up;
          animation-range: entry 50% cover 55%;
        }
      }
    }
    /* day 90: the chart draws itself once on screen (JS adds .armed, then .in; without JS it is simply whole) */
    @media (prefers-reduced-motion: no-preference) {
      .v-chart:not(.armed) .halo {
        animation: halo 2.4s ease-out infinite;
      }
      .v-chart.armed :is(.dots, .area, .now, .halo, .target) {
        opacity: 0;
      }
      .v-chart.armed .real {
        stroke-dashoffset: 1;
      }
      .v-chart.armed .forecast {
        clip-path: inset(0 100% 0 0);
      }
      .v-chart.in .dots {
        animation: appear 500ms var(--ease-out) both;
      }
      .v-chart.in .real {
        animation: draw-in 1100ms 150ms var(--ease-out) both;
      }
      .v-chart.in .area {
        animation: appear 800ms 700ms var(--ease-out) both;
      }
      .v-chart.in .now {
        animation: pop-in 420ms 1150ms var(--ease-out) both;
      }
      .v-chart.in .halo {
        animation:
          appear 300ms 1350ms both,
          halo 2.4s 1650ms ease-out infinite;
      }
      .v-chart.in .forecast {
        animation: wipe-in 900ms 1300ms var(--ease-out) both;
      }
      .v-chart.in .target {
        animation: pop-in 480ms 2100ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
      }
    }
    @keyframes appear {
      to {
        opacity: 1;
      }
    }
    @keyframes draw-in {
      to {
        stroke-dashoffset: 0;
      }
    }
    @keyframes pop-in {
      from {
        transform: scale(0.3);
      }
      to {
        transform: none;
        opacity: 1;
      }
    }
    @keyframes wipe-in {
      to {
        clip-path: inset(0 0 0 0);
      }
    }
    @keyframes halo {
      from {
        transform: scale(0.5);
        opacity: 1;
      }
      to {
        transform: scale(2);
        opacity: 0;
      }
    }
    @keyframes ring-fill {
      from {
        stroke-dashoffset: 100;
      }
    }
    @keyframes pop {
      from {
        transform: scale(0.3);
        opacity: 0;
      }
    }
    @keyframes slide-in {
      from {
        transform: translateX(16px);
        opacity: 0;
      }
    }
    @keyframes toast-up {
      from {
        transform: translateY(14px) scale(0.96);
        opacity: 0;
      }
    }

    /* day 1: the scale and the camera */
    .v-day1 {
      display: grid;
      grid-template-columns: 1.15fr 1fr;
      gap: var(--space-3);
    }
    .tile {
      position: relative;
      display: grid;
      align-content: start;
      gap: 6px;
      padding: var(--space-4);
      border-radius: var(--radius-l);
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: var(--shadow-1);
      overflow: hidden;
    }
    .kg {
      font-family: var(--font-display);
      font-stretch: 120%;
      font-weight: 800;
      font-size: 2.3rem;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .kg small {
      font-size: 0.9rem;
      color: var(--fg-2);
      letter-spacing: 0;
    }
    .ruler {
      position: relative;
      height: 26px;
      margin-top: 6px;
      background: repeating-linear-gradient(90deg, var(--line-strong) 0 1px, transparent 1px 8px);
      mask: linear-gradient(90deg, transparent, #000 20%, #000 80%, transparent);
    }
    .ruler i {
      position: absolute;
      left: 50%;
      top: -4px;
      bottom: -4px;
      width: 3px;
      border-radius: 2px;
      background: var(--flame);
    }
    .viewfinder {
      aspect-ratio: 3 / 4;
      align-content: end;
      justify-items: center;
      background:
        radial-gradient(120% 80% at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%),
        linear-gradient(160deg, var(--surface-2), var(--bg-sunken));
    }
    .corner {
      position: absolute;
      width: 18px;
      height: 18px;
      border: 2.5px solid var(--fg);
      opacity: 0.7;
    }
    .tl {
      top: 12px;
      left: 12px;
      border-right: 0;
      border-bottom: 0;
      border-radius: 6px 0 0 0;
    }
    .tr {
      top: 12px;
      right: 12px;
      border-left: 0;
      border-bottom: 0;
      border-radius: 0 6px 0 0;
    }
    .bl {
      bottom: 12px;
      left: 12px;
      border-right: 0;
      border-top: 0;
      border-radius: 0 0 0 6px;
    }
    .br {
      bottom: 12px;
      right: 12px;
      border-left: 0;
      border-top: 0;
      border-radius: 0 0 6px 0;
    }
    .thirds {
      position: absolute;
      inset: 18px;
      background:
        linear-gradient(90deg, transparent calc(33.3% - 0.5px), var(--line-strong) calc(33.3% - 0.5px) calc(33.3% + 0.5px), transparent calc(33.3% + 0.5px) calc(66.6% - 0.5px), var(--line-strong) calc(66.6% - 0.5px) calc(66.6% + 0.5px), transparent calc(66.6% + 0.5px)),
        linear-gradient(transparent calc(33.3% - 0.5px), var(--line-strong) calc(33.3% - 0.5px) calc(33.3% + 0.5px), transparent calc(33.3% + 0.5px) calc(66.6% - 0.5px), var(--line-strong) calc(66.6% - 0.5px) calc(66.6% + 0.5px), transparent calc(66.6% + 0.5px));
    }
    .vf-label {
      position: absolute;
      top: 40%;
      left: 50%;
      padding: 4px 10px;
      border-radius: var(--radius-pill);
      background: var(--glass);
      font-size: 11px;
      font-weight: 700;
      white-space: nowrap;
      transform: translate(-50%, -50%);
    }
    .shutter {
      position: relative;
      display: grid;
      place-items: center;
      width: 46px;
      height: 46px;
      margin-bottom: 4px;
      border-radius: 50%;
      border: 3px solid var(--fg);
    }
    .shutter i {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      background: var(--flame);
    }

    /* day 2: meals */
    .v-meals {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr);
      gap: var(--space-4);
      align-items: center;
    }
    .ring {
      position: relative;
      width: 112px;
      height: 112px;
    }
    .ring svg {
      transform: rotate(-90deg);
    }
    .ring circle {
      fill: none;
      stroke-width: 9;
    }
    .ring .track {
      stroke: var(--surface-3);
    }
    .ring .val {
      stroke: var(--accent);
      stroke-linecap: round;
      stroke-dasharray: 100;
      stroke-dashoffset: 35;
    }
    .ring-text {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      text-align: center;
      line-height: 1.1;
    }
    .ring-text b {
      font-family: var(--font-display);
      font-stretch: 115%;
      font-size: 1.45rem;
      line-height: 1;
    }
    .ring-text small {
      font-size: 10px;
      color: var(--fg-3);
      font-weight: 600;
    }
    .meals {
      display: grid;
      gap: 8px;
      min-width: 0;
    }
    .meals li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 8px;
    }
    .meals li span:first-child {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .meal-head {
      font-weight: 700;
    }
    .kcal {
      color: var(--fg-2);
      font-size: var(--fs-xs);
    }
    .ns {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border-radius: 6px;
      color: #fff;
      font-size: 11px;
      font-weight: 800;
    }
    .ns-A {
      background: #027d3e;
    }
    .ns-B {
      background: #4a7d0f;
    }

    /* day 7: the streak */
    .v-flame {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 4px var(--space-4);
      background:
        radial-gradient(120% 120% at 0% 0%, var(--accent-soft), transparent 60%),
        var(--surface);
    }
    .flame {
      grid-row: span 2;
      display: grid;
      place-items: center;
      width: 76px;
      height: 76px;
      border-radius: 24px;
      background: var(--flame);
      color: var(--accent-ink);
      box-shadow: 0 14px 30px -12px var(--accent-glow);
      animation: flicker 2.4s ease-in-out infinite;
    }
    @keyframes flicker {
      0%,
      100% {
        transform: scale(1) rotate(0);
      }
      30% {
        transform: scale(1.05) rotate(-2deg);
      }
      60% {
        transform: scale(0.98) rotate(1.5deg);
      }
    }
    .big {
      font-family: var(--font-display);
      font-stretch: 125%;
      font-weight: 800;
      font-size: 3rem;
      line-height: 0.9;
    }
    .week {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
      margin-top: var(--space-3);
    }
    .week i {
      display: grid;
      place-items: center;
      height: 30px;
      border-radius: 10px;
      background: #16a34a;
      color: #fff;
    }

    /* day 30: before / after, to slide */
    .frames {
      --split: 50%;
      position: relative;
      aspect-ratio: 4 / 3;
      border-radius: 16px;
      overflow: hidden;
      touch-action: pan-y;
    }
    .pane {
      position: absolute;
      inset: 0;
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 4px;
      padding: var(--space-4);
    }
    .before {
      background: linear-gradient(160deg, var(--surface-3), var(--bg-sunken));
    }
    .after {
      background:
        radial-gradient(100% 90% at 70% 10%, color-mix(in srgb, var(--accent) 30%, transparent), transparent 70%),
        linear-gradient(160deg, var(--surface-2), var(--bg-sunken));
      clip-path: inset(0 0 0 var(--split));
    }
    .pane em {
      position: absolute;
      top: 10px;
      padding: 3px 10px;
      border-radius: var(--radius-pill);
      background: var(--glass);
      font-style: normal;
      font-size: 11px;
      font-weight: 700;
    }
    .before em {
      left: 10px;
    }
    .after em {
      right: 10px;
    }
    .pane-kg {
      font-family: var(--font-display);
      font-stretch: 122%;
      font-weight: 800;
      font-size: 2.6rem;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .pane-kg small {
      font-size: 1rem;
      letter-spacing: 0;
      color: var(--fg-2);
    }
    .after .pane-kg {
      background: var(--flame);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .pane-sub {
      color: var(--fg-2);
      font-weight: 600;
    }
    .frames::after {
      content: '';
      position: absolute;
      left: var(--split);
      top: 0;
      bottom: 0;
      width: 2px;
      transform: translateX(-50%);
      background: var(--fg);
      pointer-events: none;
    }
    .handle {
      position: absolute;
      left: var(--split);
      top: 50%;
      z-index: 1;
      display: flex;
      align-items: center;
      padding: 7px;
      border-radius: var(--radius-pill);
      background: var(--fg);
      color: var(--bg);
      transform: translate(-50%, -50%);
      box-shadow: var(--shadow-2);
      pointer-events: none;
      transition: transform var(--dur-1) var(--ease-out);
    }
    .frames:active .handle {
      transform: translate(-50%, -50%) scale(1.12);
    }
    .frames input {
      position: absolute;
      inset: 0;
      z-index: 2;
      width: 100%;
      height: 100%;
      margin: 0;
      opacity: 0;
      cursor: ew-resize;
    }
    .frames:has(input:focus-visible) {
      outline: 2px solid var(--accent);
      outline-offset: 3px;
    }
    .drag {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: var(--space-3);
      font-weight: 600;
    }

    /* day 90: the forecast */
    .v-chart {
      display: grid;
      gap: var(--space-3);
    }
    .c-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .c-val {
      margin-top: 2px;
      font-weight: 800;
      font-size: 1.6rem;
      letter-spacing: -0.02em;
      line-height: 1.1;
    }
    .c-val small {
      font-size: 0.95rem;
      font-weight: 650;
      color: var(--fg-2);
    }
    .c-date {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 11px;
      border-radius: var(--radius-pill);
      background: var(--cool-soft);
      color: var(--fg);
      font-weight: 650;
      font-size: var(--fs-xs);
      white-space: nowrap;
    }
    .c-date app-icon {
      color: var(--cool);
    }
    .chart {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }
    .chart path,
    .chart line {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }
    .grid {
      stroke: var(--line);
      stroke-width: 1;
    }
    .goal-line {
      stroke: var(--cool);
      stroke-width: 1.5;
      stroke-dasharray: 3 5;
      opacity: 0.5;
    }
    .fill-top {
      stop-color: var(--accent);
      stop-opacity: 0.22;
    }
    .fill-bottom {
      stop-color: var(--accent);
      stop-opacity: 0;
    }
    /* a fragment-only url() is local to the document, whatever the <base> */
    .chart .area {
      fill: url(#v90-fill);
      stroke: none;
    }
    .chart .dots {
      fill: color-mix(in srgb, var(--accent) 35%, transparent);
    }
    /* drawn with a dash as long as the path: the stroke must scale with the chart, or the dash would not cover it */
    .chart .real {
      vector-effect: none;
      stroke: var(--accent);
      stroke-width: 2.6;
      stroke-dasharray: 1;
    }
    .forecast {
      stroke: var(--cool);
      stroke-width: 3;
      stroke-dasharray: 1 7;
    }
    .now {
      fill: var(--accent);
      stroke: var(--surface);
      stroke-width: 2.5;
      transform-box: fill-box;
      transform-origin: center;
    }
    .halo {
      fill: var(--accent-soft);
      transform-box: fill-box;
      transform-origin: center;
    }
    .target circle {
      fill: var(--surface);
      stroke: var(--cool);
      stroke-width: 3;
      vector-effect: non-scaling-stroke;
    }
    .target .target-in {
      fill: var(--cool);
      stroke: none;
    }
    .target {
      transform-box: fill-box;
      transform-origin: center;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 16px;
      color: var(--fg-2);
      font-weight: 600;
      font-size: var(--fs-xs);
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 7px;
    }
    .legend i {
      width: 16px;
      height: 3px;
      border-radius: 2px;
    }
    .key-real {
      background: var(--accent);
    }
    .key-forecast {
      background: radial-gradient(circle, var(--cool) 0 1.4px, transparent 1.6px) 0 50% / 5px 3px repeat-x;
    }
    .legend .key-goal {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      border: 2.5px solid var(--cool);
    }

    /* day 180: friends */
    .v-friends {
      display: grid;
      gap: 10px;
    }
    .friend {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
    }
    .ava {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: hsl(var(--h) 70% 55%);
      color: #111;
      font-weight: 800;
    }
    .name {
      font-weight: 650;
    }
    .streak {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--accent-text);
      font-weight: 700;
    }
    .toast-v {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
      padding: 10px 12px;
      border-radius: var(--radius-m);
      background: var(--fg);
      color: var(--bg);
      font-weight: 600;
    }

    /* day 365: the year in twelve seconds */
    .screen {
      --p: 0;
      position: relative;
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 2px;
      aspect-ratio: 16 / 9;
      border-radius: 16px;
      overflow: hidden;
      background:
        radial-gradient(90% 90% at 50% 120%, color-mix(in srgb, var(--accent) calc(10% + var(--p) * 45%), transparent), transparent 70%),
        linear-gradient(160deg, var(--surface-2), var(--bg-sunken));
    }
    .month {
      font-size: var(--fs-xs);
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--fg-2);
    }
    .screen-kg {
      font-family: var(--font-display);
      font-stretch: 122%;
      font-weight: 800;
      font-size: 2.6rem;
      letter-spacing: -0.04em;
      line-height: 1;
    }
    .screen-kg small {
      font-size: 1rem;
      color: var(--fg-2);
      letter-spacing: 0;
    }
    .screen-delta {
      color: var(--success);
      font-weight: 700;
    }
    .progress {
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: 10px;
      height: 4px;
      border-radius: 2px;
      background: var(--line);
      overflow: hidden;
    }
    .progress i {
      display: block;
      height: 100%;
      width: calc(var(--p) * 100%);
      background: var(--flame);
      transition: width 900ms linear;
    }
    .strip {
      display: grid;
      grid-template-columns: repeat(12, 1fr);
      gap: 4px;
      margin-top: var(--space-3);
    }
    .shot {
      height: 26px;
      border-radius: 6px;
      background: var(--surface-3);
      transition: background-color 300ms, transform 300ms var(--ease-out);
    }
    .shot.on {
      background: color-mix(in srgb, var(--accent) calc(25% + var(--i) * 6%), var(--surface-3));
    }
    .shot.current {
      transform: scaleY(1.25);
    }
    .play {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      margin-top: var(--space-3);
      padding: 4px 14px 4px 4px;
      border-radius: var(--radius-pill);
      font-weight: 700;
      transition: background-color var(--dur-2);
    }
    .play:hover {
      background: var(--surface-3);
    }
    .tri {
      display: grid;
      place-items: center;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: var(--flame);
      color: var(--accent-ink);
    }
    .tri ::ng-deep svg {
      fill: currentColor;
    }
  `,
})
export class JourneyVignetteComponent {
  readonly day = input.required<string>();
  protected readonly i18n = inject(I18nService);

  protected readonly mealItems = computed(() => this.i18n.get<string[]>('landing.vignette.mealItems') ?? []);
  protected readonly friends = computed(() => this.i18n.get<string[]>('landing.vignette.friends') ?? []);
  protected readonly kcal = [540, 57, 72];
  protected readonly scores = ['B', 'A', 'A'];
  protected readonly streaks = [182, 175, 96];
  protected readonly hues = [24, 210, 280];
  protected readonly year = YEAR;
  /** day 90: a smoothed trend from 88.6 to 82.4 kg (x: day 0 → 90, y: 89.5 kg at the top) */
  protected readonly trend =
    'M10 19.7 C13.4 21.1, 23.7 25.4, 30.5 28 C37.3 30.6, 44.2 33.2, 51 35.6 C57.8 38, 64.7 40.3, 71.5 42.5 C78.3 44.7, 85.2 46.8, 92 48.8 C98.8 50.8, 105.7 52.8, 112.5 54.6 C119.3 56.5, 126.2 58.2, 133 59.9 C139.8 61.6, 146.7 63.2, 153.5 64.7 C160.3 66.2, 167.2 67.7, 174 69.1 C180.8 70.5, 191.1 72.4, 194.5 73.1';
  /** the weigh-ins around it, every five days, with the daily noise of real scales */
  protected readonly dots = [
    [10, 18], [20.3, 24.8], [30.5, 25.1], [40.8, 30.4], [51, 32.4], [61.2, 35.3], [71.5, 39.7], [81.8, 40.5], [92, 46.7], [102.2, 46.5],
    [112.5, 52.9], [122.7, 53.4], [133, 58.6], [143.3, 61], [153.5, 63.7], [163.8, 68.4], [174, 68.8], [184.2, 74.8],
  ]
    .map(([x, y]) => `M${x - 2.2} ${y}a2.2 2.2 0 1 0 4.4 0a2.2 2.2 0 1 0 -4.4 0`)
    .join('');

  /** before / after: where the slider is (% from the left) */
  protected readonly split = signal(50);

  /** time-lapse: the month on screen, and whether it plays */
  protected readonly frame = signal(0);
  protected readonly playing = signal(false);
  private timer: ReturnType<typeof setInterval> | null = null;
  protected readonly monthLabel = computed(() => {
    const d = new Date(2026, this.frame(), 1);
    return new Intl.DateTimeFormat(this.i18n.locale(), { month: 'long' }).format(d);
  });

  /**
   * day 90: 'idle' (whole, as prerendered), 'armed' (hidden, waiting to be seen), 'in' (drawing itself).
   */
  protected readonly chart = signal<'idle' | 'armed' | 'in'>('idle');

  constructor() {
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.stop());
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (this.day() !== '90' || typeof IntersectionObserver === 'undefined') return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.chart.set('armed');
      const io = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return;
          this.chart.set('in');
          io.disconnect();
        },
        { threshold: 0.6 },
      );
      io.observe(host);
      destroyRef.onDestroy(() => io.disconnect());
    });
  }

  protected toggle(): void {
    if (this.playing()) {
      this.stop();
      return;
    }
    if (this.frame() >= YEAR.length - 1) this.frame.set(0);
    this.playing.set(true);
    // twelve months in twelve seconds
    this.timer = setInterval(() => {
      if (this.frame() >= YEAR.length - 1) {
        this.stop();
        return;
      }
      this.frame.update((f) => f + 1);
    }, 1000);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.playing.set(false);
  }
}
