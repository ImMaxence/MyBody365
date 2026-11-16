import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { InstallService, Platform } from '../../core/pwa/install.service';
import { IconComponent } from '../../shared/icon.component';

interface Step {
  icon: string;
  text: string;
}

/** Step-by-step install instructions per platform; the visitor's platform is preselected. */
@Component({
  selector: 'app-install-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, IconComponent],
  template: `
    <div class="seg" role="tablist" [attr.aria-label]="'landing.installTitle' | t">
      @for (p of platforms; track p) {
        <button
          type="button"
          role="tab"
          [id]="'tab-' + p"
          [attr.aria-selected]="selected() === p"
          [attr.aria-controls]="'panel-' + p"
          (click)="selected.set(p)"
        >
          <app-icon [name]="p === 'desktop' ? 'monitor' : 'smartphone'" />
          {{ 'install.tabs.' + p | t }}
        </button>
      }
    </div>

    <div class="panel" role="tabpanel" [id]="'panel-' + selected()" [attr.aria-labelledby]="'tab-' + selected()">
      @if (install.platform() === selected()) {
        <span class="chip chip-accent detected"><app-icon name="check" /> {{ 'install.detected' | t }}</span>
      }
      <ol class="steps" role="list">
        @for (s of steps(); track $index) {
          <li>
            <span class="n num">{{ $index + 1 }}</span>
            <span class="ico"><app-icon [name]="s.icon" /></span>
            <span class="txt" [innerHTML]="s.text"></span>
          </li>
        }
      </ol>

      @if (selected() !== 'ios' && install.canPrompt()) {
        <button type="button" class="btn btn-primary btn-block" (click)="install.prompt()">
          <app-icon name="download" /> {{ 'install.oneTap' | t }}
        </button>
      }
      @if (install.installed()) {
        <p class="notice notice-success"><app-icon name="check" /> {{ (install.platform() === 'desktop' ? 'install.installedDesktop' : 'install.installed') | t }}</p>
      }
      @if (selected() === 'ios') {
        <p class="notice"><app-icon name="bell" /> {{ 'install.iosNote' | t }}</p>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--space-5);
      min-width: 0;
    }
    .panel {
      position: relative;
      display: grid;
      gap: var(--space-4);
      padding: var(--space-6) var(--space-5);
      border-radius: var(--radius-xl);
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: var(--shadow-1);
    }
    .detected {
      justify-self: start;
    }
    /* a narrow phone: the three tab names alone, so they always fit */
    @media (max-width: 420px) {
      /* app-icon is display: contents: hide the drawing itself */
      .seg ::ng-deep svg {
        display: none;
      }
      .panel {
        padding: var(--space-5) var(--space-4);
      }
      .steps li {
        grid-template-columns: 18px 40px minmax(0, 1fr);
        gap: 10px;
      }
      .ico {
        width: 40px;
        height: 40px;
      }
    }
    .steps {
      display: grid;
      gap: var(--space-3);
      counter-reset: step;
    }
    .steps li {
      display: grid;
      grid-template-columns: 22px 44px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .n {
      font-family: var(--font-display);
      font-weight: 800;
      font-size: 1.25rem;
      color: var(--accent-text);
      text-align: center;
    }
    .ico {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--surface);
      border: 1px solid var(--line);
    }
    .txt {
      overflow-wrap: anywhere;
      font-size: var(--fs-s);
      line-height: 1.45;
    }
    .txt ::ng-deep strong {
      font-weight: 700;
      color: var(--fg);
    }
  `,
})
export class InstallGuideComponent {
  protected readonly install = inject(InstallService);
  private readonly i18n = inject(I18nService);
  protected readonly platforms: Platform[] = ['android', 'ios', 'desktop'];
  protected readonly selected = signal<Platform>(this.install.platform());

  protected readonly steps = computed(() => {
    const site = '<strong>mybody365.mbonnici.fr</strong>';
    return (this.i18n.get<Step[]>(`install.${this.selected()}`) ?? []).map((s) => ({
      icon: s.icon,
      // the texts are ours (locale files): only **bold** is turned into markup, after escaping
      text: escape(s.text)
        .replace('{site}', site)
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'),
    }));
  });
}

function escape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
