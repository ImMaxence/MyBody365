import { provideHttpClient, withFetch, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { ApplicationConfig, ErrorHandler, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { I18nService } from './core/i18n/i18n.service';
import { ReportingErrorHandler } from './core/support/error-reporter';
import { REMOVE_STYLES_ON_COMPONENT_DESTROY, provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withRouterConfig, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { csrfInterceptor } from './core/api/csrf.interceptor';
import { networkInterceptor } from './core/offline/network';
import { offlineCacheInterceptor } from './core/offline/offline-cache';
import { onViewTransitionCreated } from './core/nav/stack-navigation';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // the English texts before the first screen when it will be in English (/en, or an English phone)
    provideAppInitializer(() => {
      const i18n = inject(I18nService);
      const path = inject(DOCUMENT).location?.pathname ?? '/';
      const lang = path === '/en' || path.startsWith('/en/') ? 'en' : i18n.preferred();
      // 1.14: the app (its sign-in screen included) speaks the device's language until one is chosen; the site's pages
      // set their own
      if (path.startsWith('/app')) i18n.set(lang);
      return i18n.load(lang);
    }),
    // unhandled errors also go to the admins' error journal
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
    // a screen's styles stay once it is gone: the back swipe moves a copy of it over the previous screen
    { provide: REMOVE_STYLES_ON_COMPONENT_DESTROY, useValue: false },
    provideRouter(
      routes,
      withComponentInputBinding(),
      // anchors only: the scroll of each screen is kept by StackNavigation, which waits for the screen to be back
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'disabled' }),
      // screens slide like a phone app (push / pop), tabs cross-fade
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated }),
      // 1.17: a back cancelled by a screen (changes not saved) leaves the history where it was
      withRouterConfig({ canceledNavigationResolution: 'computed' }),
    ),
    provideHttpClient(
      withFetch(),
      // 1.18: the answers kept on the phone come back when the network does not let a request through (networkInterceptor,
      // inside it, still sees the failure)
      withInterceptors([csrfInterceptor, offlineCacheInterceptor, networkInterceptor]),
      // matches Spring Security's CookieCsrfTokenRepository
      withXsrfConfiguration({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' }),
    ),
    // no incremental hydration: it brings event replay, whose inline scripts a strict CSP (script-src 'self') blocks
    provideClientHydration(withNoIncrementalHydration()),
    // public/sw.js: Angular's worker (ngsw-worker.js) plus the badge on the app icon
    provideServiceWorker('sw.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
