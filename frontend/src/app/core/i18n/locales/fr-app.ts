import { frAdminFoods, frAdminModeration, frAdminStats } from './fr-admin';
import { frBackup } from './fr-backup';
import { frEngage } from './fr-engage';
import { frFriends } from './fr-friends';
import { frMeals, frPlan, frShopping } from './fr-meals';
import { frPhotos } from './fr-photos';

/**
 * 1.20: the texts of the app's own screens (meals, photos, engagement, friends, backups, admin), a file of their own: loaded
 * when the app opens (I18nService.loadApp, the guard appTexts), not with the public site. The first load of the site and of
 * the app is that much lighter.
 */
export const frApp = {
  photos: frPhotos,
  meals: frMeals,
  shopping: frShopping,
  plan: frPlan,
  engage: frEngage,
  friends: frFriends,
  backup: frBackup,
  adminFoods: frAdminFoods,
  adminStats: frAdminStats,
  adminModeration: frAdminModeration,
};
