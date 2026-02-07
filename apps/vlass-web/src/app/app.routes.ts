import { Route } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const appRoutes: Route[] = [
  {
    path: '',
    redirectTo: 'landing',
    pathMatch: 'full',
  },
  {
    path: 'auth',
    loadChildren: () =>
      import('./features/auth/auth.module').then((m) => m.AuthModule),
  },
  {
    path: 'landing',
    loadChildren: () =>
      import('./features/landing/landing.module').then((m) => m.LandingModule),
    canActivate: [AuthGuard],
  },
  {
    path: 'view',
    loadChildren: () =>
      import('./features/viewer/viewer.module').then((m) => m.ViewerModule),
  },
  {
    path: 'posts',
    loadChildren: () =>
      import('./features/posts/posts.module').then((m) => m.PostsModule),
    canActivate: [AuthGuard],
  },
  {
    path: '**',
    redirectTo: 'landing',
  },
];
