import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthV2Service } from '../services/auth-v2.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authV2Service = inject(AuthV2Service);
  const authState = authV2Service.currentAuthState;
  
  // Skip adding token for auth endpoints
  if (req.url.includes('/auth/') || req.url.includes('/v2/auth/')) {
    return next(req);
  }
  
  // Add JWT token if available
  if (authState.accessToken) {
    const authReq = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${authState.accessToken}`)
    });
    return next(authReq);
  }
  
  return next(req);
};
