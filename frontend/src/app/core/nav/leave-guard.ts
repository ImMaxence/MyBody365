import type { CanDeactivateFn } from '@angular/router';

/** 1.17: a screen with changes that would be lost: it says whether one may leave (it may ask first) */
export interface Leaving {
  canLeave(): boolean;
}

/** route guard: the screen is asked before leaving it (the back button, the phone's back, a link) */
export const confirmLeave: CanDeactivateFn<Leaving> = (screen) => screen?.canLeave?.() ?? true;
