import { provideHttpClient, withFetch, withInterceptors, withXsrfConfiguration } from '@angular/common/http';
import { ApplicationConfig, ErrorHandler, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { ReportingErrorHandler } from './core/support/error-reporter';
import { provideClientHydration, withNoIncrementalHydration } from '@angular/platform-browser';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { csrfInterceptor } from './core/api/csrf.interceptor';
import { onViewTransitionCreated } from './core/nav/stack-navigation';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // unhandled errors also go to the admins' error journal
    { provide: ErrorHandler, useClass: ReportingErrorHandler },
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
