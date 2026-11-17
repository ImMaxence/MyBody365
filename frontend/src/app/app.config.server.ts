import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { ENGLISH } from './core/i18n/i18n.service';
import { en } from './core/i18n/locales/en';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

const serverConfig: ApplicationConfig = {
  providers: [provideServerRendering(withRoutes(serverRoutes)), { provide: ENGLISH, useValue: en }],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
