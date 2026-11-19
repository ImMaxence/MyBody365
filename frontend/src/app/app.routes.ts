import { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard, installGate } from './core/auth/guards';
import { LandingPage } from './features/landing/landing.page';

export const routes: Routes = [
  // public site, prerendered (see app.routes.server.ts)
  { path: '', component: LandingPage, data: { lang: 'fr' } },
  { path: 'en', component: LandingPage, data: { lang: 'en' } },
  { path: 'legal/:doc', loadComponent: () => import('./features/legal/legal.page').then((m) => m.LegalPage), data: { lang: 'fr' } },
  { path: 'en/legal/:doc', loadComponent: () => import('./features/legal/legal.page').then((m) => m.LegalPage), data: { lang: 'en' } },
  { path: 'changelog', loadComponent: () => import('./features/changelog/changelog.page').then((m) => m.ChangelogPage) },
  // invitation / recovery links: work in any browser tab
  { path: 'link', loadComponent: () => import('./features/link/link.page').then((m) => m.LinkPage) },
  // friend links: work in any browser tab too (QR codes often open outside the installed app)
  { path: 'friends/add', loadComponent: () => import('./features/friends/friend-link.page').then((m) => m.FriendLinkPage) },

  // the app: installed only
  {
    path: 'app',
    canActivate: [installGate],
    loadComponent: () => import('./features/app/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/app/login.page').then((m) => m.LoginPage), data: { depth: 0 } },
      { path: 'request', loadComponent: () => import('./features/app/request.page').then((m) => m.RequestPage), data: { depth: 1, back: '/app/login' } },
      { path: 'welcome', canActivate: [authGuard], loadComponent: () => import('./features/app/welcome.page').then((m) => m.WelcomePage), data: { depth: 0 } },
      {
        path: '',
        canActivateChild: [authGuard],
        children: [
          // depth 0: the five tabs; depth 1+: screens pushed on top of them (see core/nav/stack-navigation.ts)
          { path: '', loadComponent: () => import('./features/app/today.page').then((m) => m.TodayPage), data: { depth: 0 } },
          { path: 'meals', loadComponent: () => import('./features/meals/meals.page').then((m) => m.MealsPage), data: { depth: 0 } },
          { path: 'meals/add', loadComponent: () => import('./features/meals/meal-add.page').then((m) => m.MealAddPage), data: { depth: 1, back: '/app/meals' } },
          // one source at a time (1.9): Open Food Facts, and Ciqual with my own foods
          { path: 'meals/products', loadComponent: () => import('./features/meals/food-source.page').then((m) => m.FoodSourcePage), data: { depth: 2, back: '/app/meals/add', source: 'off' } },
          { path: 'meals/foods', loadComponent: () => import('./features/meals/food-source.page').then((m) => m.FoodSourcePage), data: { depth: 2, back: '/app/meals/add', source: 'ciqual' } },
          { path: 'meals/scan', loadComponent: () => import('./features/meals/barcode-scan.page').then((m) => m.BarcodeScanPage), data: { depth: 3, back: '/app/meals/add' } },
          { path: 'meals/food/new', loadComponent: () => import('./features/meals/food-edit.page').then((m) => m.FoodEditPage), data: { depth: 3, back: '/app/meals/add' } },
          { path: 'meals/food/:id', loadComponent: () => import('./features/meals/food-edit.page').then((m) => m.FoodEditPage), data: { depth: 2, back: '/app/meals' } },
          { path: 'meals/stats', loadComponent: () => import('./features/meals/meal-stats.page').then((m) => m.MealStatsPage), data: { depth: 1, back: '/app/meals' } },
          { path: 'meals/recipes', loadComponent: () => import('./features/meals/recipes.page').then((m) => m.RecipesPage), data: { depth: 1, back: '/app/meals' } },
          // 1.11: what to cook with what I have, and the shopping list
          { path: 'meals/recipes/with', loadComponent: () => import('./features/meals/recipes-with.page').then((m) => m.RecipesWithPage), data: { depth: 2, back: '/app/meals/recipes' } },
          { path: 'meals/shopping', loadComponent: () => import('./features/meals/shopping.page').then((m) => m.ShoppingPage), data: { depth: 1, back: '/app/meals' } },
          { path: 'meals/recipes/new', loadComponent: () => import('./features/meals/recipe-edit.page').then((m) => m.RecipeEditPage), data: { depth: 2, back: '/app/meals/recipes' } },
          { path: 'meals/recipes/:id', loadComponent: () => import('./features/meals/recipe.page').then((m) => m.RecipePage), data: { depth: 2, back: '/app/meals/recipes' } },
          { path: 'meals/recipes/:id/edit', loadComponent: () => import('./features/meals/recipe-edit.page').then((m) => m.RecipeEditPage), data: { depth: 3, back: '/app/meals/recipes' } },
          { path: 'photos', loadComponent: () => import('./features/photos/photos.page').then((m) => m.PhotosPage), data: { depth: 0 } },
          { path: 'photos/camera', loadComponent: () => import('./features/photos/camera.page').then((m) => m.CameraPage), data: { depth: 1, back: '/app/photos' } },
          { path: 'photos/compare', loadComponent: () => import('./features/photos/compare.page').then((m) => m.ComparePage), data: { depth: 1, back: '/app/photos' } },
          { path: 'photos/timelapse', loadComponent: () => import('./features/photos/timelapse.page').then((m) => m.TimelapsePage), data: { depth: 1, back: '/app/photos' } },
          { path: 'photos/:id', loadComponent: () => import('./features/photos/photo-viewer.page').then((m) => m.PhotoViewerPage), data: { depth: 1, back: '/app/photos' } },
          { path: 'progress', loadComponent: () => import('./features/app/progress.page').then((m) => m.ProgressPage), data: { depth: 0 } },
          { path: 'account', loadComponent: () => import('./features/app/account.page').then((m) => m.AccountPage), data: { depth: 0 } },
          { path: 'account/goal', loadComponent: () => import('./features/app/goal.page').then((m) => m.GoalPage), data: { depth: 1, back: '/app/account' } },
          { path: 'account/security', loadComponent: () => import('./features/app/security.page').then((m) => m.SecurityPage), data: { depth: 1, back: '/app/account' } },
          { path: 'account/backup', loadComponent: () => import('./features/app/backup.page').then((m) => m.BackupPage), data: { depth: 1, back: '/app/account' } },
          { path: 'account/water', loadComponent: () => import('./features/app/water-settings.page').then((m) => m.WaterSettingsPage), data: { depth: 1, back: '/app/account' } },
          { path: 'account/settings', loadComponent: () => import('./features/app/app-settings.page').then((m) => m.AppSettingsPage), data: { depth: 1, back: '/app/account' } },
          { path: 'account/notifications', loadComponent: () => import('./features/app/notifications.page').then((m) => m.NotificationsPage), data: { depth: 1, back: '/app/account' } },
          { path: 'challenges', loadComponent: () => import('./features/friends/challenges.page').then((m) => m.ChallengesPage), data: { depth: 2, back: '/app/friends' } },
          { path: 'friends', loadComponent: () => import('./features/friends/friends.page').then((m) => m.FriendsPage), data: { depth: 1, back: '/app' } },
          // « Ta semaine » went in 1.8: an old link (a notification) leads to Today
          { path: 'week', redirectTo: '' },
          { path: 'timer', loadComponent: () => import('./features/timer/timer.page').then((m) => m.TimerPage), data: { depth: 1, back: '/app' } },
          // the workout programs (0.5 to 0.7) gave way to the timer
          { path: 'workouts', redirectTo: 'timer' },
          { path: 'workouts/session', redirectTo: 'timer' },
          {
            path: 'admin',
            canActivate: [adminGuard],
            loadComponent: () => import('./features/admin/admin.page').then((m) => m.AdminPage),
            data: { depth: 1, back: '/app/account' },
            children: [
              { path: '', pathMatch: 'full', redirectTo: 'users' },
              { path: 'users', loadComponent: () => import('./features/admin/users.tab').then((m) => m.AdminUsersTab) },
              { path: 'requests', loadComponent: () => import('./features/admin/requests.tab').then((m) => m.AdminRequestsTab) },
              { path: 'links', loadComponent: () => import('./features/admin/links.tab').then((m) => m.AdminLinksTab) },
              { path: 'foods', loadComponent: () => import('./features/admin/foods.tab').then((m) => m.AdminFoodsTab) },
              { path: 'moderation', loadComponent: () => import('./features/admin/moderation.tab').then((m) => m.AdminModerationTab) },
              { path: 'feedback', loadComponent: () => import('./features/admin/feedback.tab').then((m) => m.AdminFeedbackTab) },
              { path: 'errors', loadComponent: () => import('./features/admin/errors.tab').then((m) => m.AdminErrorsTab) },
              { path: 'journal', loadComponent: () => import('./features/admin/journal.tab').then((m) => m.AdminJournalTab) },
            ],
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
