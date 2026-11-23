import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { ENGLISH, ENGLISH_APP, FRENCH_APP } from './core/i18n/i18n.service';
import { en } from './core/i18n/locales/en';
import { enApp } from './core/i18n/locales/en-app';
import { frApp } from './core/i18n/locales/fr-app';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes)), { provide: ENGLISH, useValue: en },
    { provide: FRENCH_APP, useValue: frApp },
    { provide: ENGLISH_APP, useValue: enApp },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
