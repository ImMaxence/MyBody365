import { provideHttpClient, withFetch, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { DOCUMENT } from '@angular/common';
import { ApplicationConfig, ErrorHandler, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { I18nService } from './core/i18n/i18n.service';
import { ReportingErrorHandler } from './core/support/error-reporter';
import { REMOVE_STYLES_ON_COMPONENT_DESTROY, provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { csrfInterceptor } from './core/api/csrf.interceptor';
import { onViewTransitionCreated } from './core/nav/stack-navigation';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // the English texts before the first screen when it will be in English (/en, or an English phone)
    provideAppInitializer(() => {
      const i18n = inject(I18nService);
      const path = inject(DOCUMENT).location?.pathname ?? '/';
      return i18n.load(path === '/en' || path.startsWith('/en/') ? 'en' : i18n.preferred());
    }),
    // unhandled errors also go to the admins' error journal
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
    // a screen's styles stay once it is gone: the back swipe moves a copy of it over the previous screen
    { provide: REMOVE_STYLES_ON_COMPONENT_DESTROY, useValue: false },
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'enabled' }),
      // screens slide like a phone app (push / pop), tabs cross-fade
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated }),
    ),
    provideHttpClient(
      withFetch(),
      withInterceptors([csrfInterceptor]),
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
