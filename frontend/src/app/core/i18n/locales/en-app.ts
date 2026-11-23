import { enAdminFoods, enAdminModeration, enAdminStats } from './en-admin';
import { enBackup } from './en-backup';
import { enEngage } from './en-engage';
import { enFriends } from './en-friends';
import { enMeals, enPlan, enShopping } from './en-meals';
import { enPhotos } from './en-photos';
import type { AppDictionary } from './fr';

/** 1.20: the English texts of the app's own screens (see fr-app.ts) */
export const enApp: AppDictionary = {
  photos: enPhotos,
  meals: enMeals,
  shopping: enShopping,
  plan: enPlan,
  engage: enEngage,
  friends: enFriends,
  backup: enBackup,
  adminFoods: enAdminFoods,
  adminStats: enAdminStats,
  adminModeration: enAdminModeration,
};
