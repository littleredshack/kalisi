// Standalone minimal Karma configuration
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
        stopOnSpecFailure: false
      }
    },
    reporters: ['dots'],
    port: 9876,
    colors: false,
    logLevel: config.LOG_WARN,
    autoWatch: false,
    browsers: ['jsdom'],
    jsdomLauncher: {
      jsdom: {
        // Very minimal jsdom setup
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
    captureTimeout: 3000,
    browserDisconnectTolerance: 0,
    browserDisconnectTimeout: 3000,
    browserNoActivityTimeout: 3000
  });
};