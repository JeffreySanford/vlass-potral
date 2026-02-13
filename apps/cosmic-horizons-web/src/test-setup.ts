// Polyfill for jsdom test environment
// Ensures navigator.platform is defined for Angular Forms
if (typeof navigator !== 'undefined') {
  try {
    // Check if navigator.platform exists and is not empty
    if (!navigator.platform || navigator.platform === '') {
      Object.defineProperty(navigator, 'platform', {
        value: 'Linux',
        writable: true,
        configurable: true,
      });
    }
  } catch (e) {
    // Silently ignore if defineProperty fails (in case of strict mode)
    console.warn('Could not set navigator.platform polyfill:', e);
  }
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
