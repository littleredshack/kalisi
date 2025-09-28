// Minimal Karma configuration for basic test execution
module.exports = function(config) {
  config.set({
    basePath: '',
    frameworks: ['jasmine', '@angular-devkit/build-angular'],
    plugins: [
      require('karma-jasmine'),
      require('karma-jsdom-launcher'),
      require('@angular-devkit/build-angular/plugins/karma')
    ],
    client: {
      jasmine: {
        random: false,
        stopOnSpecFailure: true
      },
      clearContext: false
    },
    reporters: ['dots'],
    port: 9876,
    colors: false,
    logLevel: config.LOG_ERROR,
    autoWatch: false,
    browsers: ['jsdom'],
    jsdomLauncher: {
      jsdom: {
        resources: 'usable',
        runScripts: 'dangerously',
        pretendToBeVisual: false,
        features: {
          FetchExternalResources: false,
          ProcessExternalResources: false,
          SkipExternalResources: true
        }
      }
    },
    singleRun: true,
    restartOnFileChange: false,
    captureTimeout: 5000,
    browserDisconnectTolerance: 0,
    browserDisconnectTimeout: 5000,
    browserNoActivityTimeout: 5000,
    files: [
      // Only include essential test files to avoid hanging
      'src/test.ts',
    ],
    exclude: [
      // Exclude potentially problematic test files
      'src/**/*integration*.spec.ts',
      'src/**/*e2e*.spec.ts'
    ]
  });
};