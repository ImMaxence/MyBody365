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
          { path: 'meals', loadComponent: () => import('./features/app/soon.page').then((m) => m.SoonPage), data: { section: 'meals', depth: 0 } },
          { path: 'photos', loadComponent: () => import('./features/app/soon.page').then((m) => m.SoonPage), data: { section: 'photos', depth: 0 } },
          { path: 'progress', loadComponent: () => import('./features/app/progress.page').then((m) => m.ProgressPage), data: { depth: 0 } },
          { path: 'account', loadComponent: () => import('./features/app/account.page').then((m) => m.AccountPage), data: { depth: 0 } },
          { path: 'account/goal', loadComponent: () => import('./features/app/goal.page').then((m) => m.GoalPage), data: { depth: 1, back: '/app/account' } },
          { path: 'account/security', loadComponent: () => import('./features/app/security.page').then((m) => m.SecurityPage), data: { depth: 1, back: '/app/account' } },
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
              { path: 'journal', loadComponent: () => import('./features/admin/journal.tab').then((m) => m.AdminJournalTab) },
            ],
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
