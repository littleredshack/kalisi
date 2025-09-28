// Karma configuration for CI
module.exports = function(config) {
  // Load base config
  require('./karma.conf.js')(config);
  
  // Override for CI - keeping it simple
  config.set({
    browsers: ['jsdom'],
    singleRun: true,
    autoWatch: false,
    restartOnFileChange: false,
    reporters: ['dots'],
    logLevel: config.LOG_ERROR,
    browserNoActivityTimeout: 10000,
    captureTimeout: 10000,
    browserDisconnectTimeout: 10000,
    browserDisconnectTolerance: 0,
    jsdomLauncher: {
      jsdom: {
        // Minimal jsdom configuration to avoid hanging
        resources: 'usable',
        runScripts: 'dangerously',
        pretendToBeVisual: false,
        features: {
          FetchExternalResources: false,
          ProcessExternalResources: false,
          SkipExternalResources: true
        },
        beforeParse: function(window) {
          // Add minimal DOM APIs needed for Angular tests
          window.getComputedStyle = window.getComputedStyle || function() {
            return {
              getPropertyValue: function() { return ''; }
            };
          };
        }
      }
    }
  });
};