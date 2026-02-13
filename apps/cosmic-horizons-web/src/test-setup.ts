// Polyfill for jsdom test environment
// Ensures navigator.platform is defined for Angular Forms
if (typeof navigator !== 'undefined' && !navigator.platform) {
  Object.defineProperty(navigator, 'platform', {
    value: 'Linux',
    writable: true,
    configurable: true,
  });
}

// Additional jsdom polyfills if needed
if (typeof window !== 'undefined') {
  // Ensure getComputedStyle works
  if (!window.getComputedStyle) {
    (window as any).getComputedStyle = () => ({
      getPropertyValue: () => '',
    });
  }
}
