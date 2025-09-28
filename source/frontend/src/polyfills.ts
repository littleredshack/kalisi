// Node.js polyfills for browser environment
(window as any).global = window;
(window as any).process = {
  env: {
    NODE_ENV: 'production'
  }
};