import { Routes } from '@angular/router';
import { LandingShellComponent } from './landing-shell.component';

export const routes: Routes = [
  { path: '', component: LandingShellComponent },
  // { path: 'app', loadComponent: () => import('./main-app.component').then(m => m.MainAppComponent) }
];