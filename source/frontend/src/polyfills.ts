// Node.js polyfills for browser environment
(window as any).global = window;
(window as any).process = {
  env: {
    NODE_ENV: 'production'
  }
};

// Make touch and wheel events passive by default for better scroll performance
// This prevents "[Violation] Added non-passive event listener" warnings
if (typeof EventTarget !== 'undefined') {
  const originalAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(
    type: string,
    listener: any,
    options?: boolean | AddEventListenerOptions
  ) {
    // Events that should be passive by default for scroll performance
    const passiveEvents = ['touchstart', 'touchmove', 'touchend', 'touchcancel'];

    // If options is not specified and event is in passive list, make it passive
    if (passiveEvents.includes(type) && options === undefined) {
      options = { passive: true };
    } else if (typeof options === 'boolean') {
      // Convert boolean to object if needed
      options = { capture: options };
    }

    originalAddEventListener.call(this, type, listener, options);
  };
}