import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { I18nService } from '../i18n/i18n.service';
import { InstallService } from '../pwa/install.service';
import { recipeLinkId } from '../meals/recipe-link';
import { SessionStore } from './session.store';

/** /app only opens in the installed app: a browser tab is sent to the install guide (1.19: a recipe's link, to the page that
 * says how to open it in the app). */
export const installGate: CanActivateFn = (_route, state) => {
  const install = inject(InstallService);
  if (install.canOpenApp()) return true;
  const router = inject(Router);
  const recipe = recipeLinkId(state.url);
  if (recipe) return router.createUrlTree(['/recette', recipe]);
  const lang = inject(I18nService).preferred();
  return router.createUrlTree([lang === 'en' ? '/en' : '/'], { fragment: 'install' });
};

/**
 * Signed-in pages: the sign-in screen otherwise, the onboarding until the two consents are given
 * and the body profile (height, weight, goal) is filled in.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const me = await session.load();
  if (!me.authenticated) return router.createUrlTree(['/app/login']);
  const ready = me.account?.onboarded && me.account.profileComplete;
  if (!ready && !state.url.startsWith('/app/welcome')) return router.createUrlTree(['/app/welcome']);
  return true;
};

// inject() only works before the first await: every dependency is taken up front
export const guestGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const me = await session.load();
  return me.authenticated ? router.createUrlTree(['/app']) : true;
};

export const adminGuard: CanActivateFn = async () => {
  const session = inject(SessionStore);
  const router = inject(Router);
  const me = await session.load();
  return me.account?.admin ? true : router.createUrlTree(['/app']);
};
