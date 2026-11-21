/**
 * 1.16: the screens of the five tabs, for the routes and for the warm-up while the logo is on screen
 * (core/nav/warm-up.ts): loaded once, a tab then opens without waiting for its code.
 */
export const TABS = {
  today: () => import('./features/app/today.page').then((m) => m.TodayPage),
  meals: () => import('./features/meals/meals.page').then((m) => m.MealsPage),
  photos: () => import('./features/photos/photos.page').then((m) => m.PhotosPage),
  progress: () => import('./features/app/progress.page').then((m) => m.ProgressPage),
  account: () => import('./features/app/account.page').then((m) => m.AccountPage),
};
