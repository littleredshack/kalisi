import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { MfaSetupComponent } from './components/mfa-setup/mfa-setup.component';
import { MfaVerifyComponent } from './components/mfa-verify/mfa-verify.component';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'register',
    component: RegisterComponent
  },
  {
    path: 'mfa-setup',
    component: MfaSetupComponent
  },
  {
    path: 'mfa-verify',
    component: MfaVerifyComponent
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AuthRoutingModule { }
