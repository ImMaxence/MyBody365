import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorCode } from '../../core/api/api.service';
import type { Recipe } from '../../core/api/models';
import { FriendsStore } from '../../core/friends/friends.store';
import type { Friend } from '../../core/friends/friends-api';
import { I18nService } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MealsApi } from '../../core/meals/meals-api';
import { closeSheet } from '../../core/ui/sheets';
import { ToastService } from '../../core/ui/toast.service';
import { AvatarImgComponent } from '../../shared/avatar-img.component';
import { IconComponent } from '../../shared/icon.component';

/**
 * 1.19: « Envoyer à un ami », from a recipe's page. To a friend of the app: a notification that opens the recipe in
 * their app (an iPhone too, where a link sent by message opens Safari, never the app). Else by message (the phone's
 * share sheet) or a copied link: it opens in the browser, on a page that says how to open it in the app.
 */
@Component({
  selector: 'app-send-recipe-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe, IconComponent, AvatarImgComponent],
  template: `
    <dialog class="sheet" #dlg [attr.aria-label]="'meals.recipe.send.title' | t">
      <div class="sheet-grip"></div>
      @if (recipe(); as r) {
        <div class="stack">
          <div>
            <h2 class="h3">{{ 'meals.recipe.send.title' | t }}</h2>
            <p class="small muted">{{ 'meals.recipe.send.hint' | t }}</p>
          </div>
          @if (friends(); as list) {
            @if (list.length) {
              <ul class="friends" role="list">
                @for (f of list; track f.id) {
                  <li>
                    <span class="avatar" aria-hidden="true"><app-avatar-img [src]="f.avatarUrl" [name]="f.name" [size]="38" /></span>
                    <span class="who">
                      <b class="small">{{ f.name }}</b>
                      <span class="tiny muted">&#64;{{ f.username }}</span>
                    </span>
                    @if (sent().has(f.id)) {
                      <span class="done small"><app-icon name="check" [size]="16" [stroke]="2.6" /> {{ 'meals.recipe.send.sent' | t }}</span>
                    } @else {
                      <button type="button" class="btn btn-primary btn-s" [disabled]="busy() === f.id" (click)="send(r, f)"
                        [attr.aria-label]="'meals.recipe.send.to' | t: { name: f.name }">
                        <app-icon name="send" [size]="15" /> {{ 'meals.recipe.send.cta' | t }}
                      </button>
                    }
                  </li>
                }
              </ul>
            } @else {
              <p class="small muted none">
                {{ 'meals.recipe.send.noFriends' | t }}
                <a routerLink="/app/friends" (click)="close()">{{ 'meals.recipe.send.invite' | t }}</a>
              </p>
            }
          } @else {
            <div class="friends-skel" aria-hidden="true"></div>
          }
          <p class="or tiny muted"><span>{{ 'meals.recipe.send.or' | t }}</span></p>
          @if (canShare) {
            <button type="button" class="btn btn-secondary btn-block" (click)="share(r)"><app-icon name="share" [size]="18" /> {{ 'meals.recipe.send.byMessage' | t }}</button>
          } @else {
            <button type="button" class="btn btn-secondary btn-block" (click)="copy(r)"><app-icon name="link" [size]="18" /> {{ 'meals.recipe.send.copy' | t }}</button>
          }
          <p class="tiny muted">{{ 'meals.recipe.send.linkNote' | t }}</p>
        </div>
      }
    </dialog>
  `,
  styles: `
    .friends {
      display: grid;
      margin: 0;
      padding: 0;
      list-style: none;
      max-height: 46vh;
      overflow-y: auto;
    }
    .friends li {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 0;
    }
    .friends li + li {
      border-top: 1px solid var(--line);
    }
    /* 1.20: round, as everywhere in the app */
    .avatar {
      display: grid;
      flex: none;
      place-items: center;
      width: 38px;
      height: 38px;
      overflow: hidden;
      border-radius: 50%;
      background: var(--accent-soft);
      color: var(--accent-text);
      font-weight: 750;
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    /* the list scrolls: a glow under its button would be cut by its edge */
    .friends .btn {
      box-shadow: none;
    }
    .who {
      display: grid;
      flex: 1;
      min-width: 0;
    }
    .who b,
    .who span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .done {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: var(--success);
      font-weight: 700;
    }
    .none a {
      color: var(--accent-text);
      font-weight: 700;
    }
    .friends-skel {
      height: 54px;
      border-radius: var(--radius-m);
      background: var(--surface-2);
    }
    .or {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
    }
    .or::before,
    .or::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--line);
    }
  `,
})
export class SendRecipeSheetComponent {
  private readonly api = inject(MealsApi);
  private readonly friendsStore = inject(FriendsStore);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');
  protected readonly canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  protected readonly recipe = signal<Recipe | null>(null);
  protected readonly friends = computed<Friend[] | null>(() => this.friendsStore.friends());
  /** the friends it went to while the sheet is open */
  protected readonly sent = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal<string | null>(null);

  open(r: Recipe): void {
    this.recipe.set(r);
    this.sent.set(new Set());
    void this.friendsStore.ensure();
    this.dlg().nativeElement.showModal();
  }

  close(): void {
    closeSheet(this.dlg().nativeElement);
  }

  protected async send(r: Recipe, f: Friend): Promise<void> {
    this.busy.set(f.id);
    try {
      await this.api.sendRecipe(r.id, [f.id]);
      this.sent.update((s) => new Set([...s, f.id]));
      this.toast.show(this.i18n.t('meals.recipe.send.done', { name: f.name }));
    } catch (e) {
      this.toast.error(this.i18n.error(errorCode(e)));
    } finally {
      this.busy.set(null);
    }
  }

  private link(r: Recipe): string {
    return `${location.origin}/app/meals/recipes/${r.id}`;
  }

  /** by message: the phone's share sheet */
  protected async share(r: Recipe): Promise<void> {
    try {
      await navigator.share({ title: r.name, text: this.i18n.t('meals.recipe.shareFriends.text', { name: r.name }), url: this.link(r) });
    } catch {
      /* closed: nothing */
    }
  }

  protected async copy(r: Recipe): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link(r));
      this.toast.show(this.i18n.t('meals.recipe.send.copied'));
    } catch {
      this.toast.error(this.i18n.t('meals.recipe.send.copyFailed'));
    }
  }
}
