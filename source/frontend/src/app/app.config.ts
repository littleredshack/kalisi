import { ApplicationConfig, APP_INITIALIZER } from '@angular/core';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideHttpClient } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { routes } from './app.routes';
import { WebSocketLoggerService } from './core/services/websocket-logger.service';

function initializeWebSocketLogger(logger: WebSocketLoggerService) {
  return () => {
    console.log('APP_INITIALIZER: WebSocket logger service loaded');
    // Service constructor will initialize automatically
    return Promise.resolve();
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withInMemoryScrolling({scrollPositionRestoration: 'enabled'})),
    provideAnimations(),
    provideHttpClient(),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: 'body',
          cssLayer: {
            name: 'primeng',
            order: 'tailwind-base, primeng, tailwind-utilities'
          }
        }
      }
    }),
    WebSocketLoggerService,
    {
      provide: APP_INITIALIZER,
      useFactory: initializeWebSocketLogger,
      deps: [WebSocketLoggerService],
      multi: true
    }
  ]
};