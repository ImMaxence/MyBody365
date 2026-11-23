import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { I18nService } from './i18n.service';

/** 1.20: the app's screens (and the public pages that use their words) open once their texts are there */
export const appTexts: CanActivateFn = () =>
  inject(I18nService)
    .loadApp()
    .then(() => true);
