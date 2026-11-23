import { Injectable, signal } from '@angular/core';

/** what the sheet asks: a question, what it means, the two answers */
export interface ConfirmAsk {
  title: string;
  text?: string;
  /** the answer that goes ahead (« Supprimer ») */
  ok: string;
  /** the one that stays (« Annuler » by default) */
  cancel?: string;
  /** something lost for good: the answer is red */
  danger?: boolean;
}

/**
 * 1.19: a question before something that cannot be undone, in a sheet of the app (shared/confirm-sheet.component.ts,
 * in the shell) instead of the phone's own alert: « Supprimer ta pesée du 23 novembre ? ». The answer comes back as
 * a promise: true to go ahead; false when cancelled, the sheet swiped away, or another question asked meanwhile.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly asking = signal<(ConfirmAsk & { resolve: (ok: boolean) => void }) | null>(null);

  ask(a: ConfirmAsk): Promise<boolean> {
    this.asking()?.resolve(false);
    return new Promise<boolean>((resolve) => this.asking.set({ ...a, resolve }));
  }

  /** from a sentence of the dictionaries, « Supprimer cette passkey ? Tu ne pourras plus te connecter avec »: the
   * question as the title, the rest under it, the answer in red */
  askSentence(sentence: string, ok: string, danger = true): Promise<boolean> {
    const at = sentence.indexOf('?');
    const title = at > 0 ? sentence.slice(0, at + 1).trim() : sentence;
    const text = at > 0 ? sentence.slice(at + 1).trim() : '';
    return this.ask({ title, text: text || undefined, ok, danger });
  }

  answer(ok: boolean): void {
    const a = this.asking();
    if (!a) return;
    this.asking.set(null);
    a.resolve(ok);
  }
}
