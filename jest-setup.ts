/**
 * Global Jest Setup File
 * 
 * This file runs before all tests to set up polyfills and global test configuration.
 * It ensures cross-platform compatibility for test environments.
 */

// Polyfill for jsdom test environment used in GitHub Actions CI
// Angular Forms' _isAndroid() function requires navigator.platform to exist
// In jsdom (headless browser environment), navigator.platform can be undefined
if (typeof navigator !== 'undefined' && navigator.platform === undefined) {
  Object.defineProperty(navigator, 'platform', {
    value: 'Linux x86_64',
    writable: true,
    configurable: true,
  });
}

// Ensure getComputedStyle is available
if (typeof window !== 'undefined' && !window.getComputedStyle) {
  (window as any).getComputedStyle = () => ({
    getPropertyValue: () => '',
  });
}

// Suppress console warnings in tests (optional - remove if you want to see warnings)
// const originalWarn = console.warn;
// beforeAll(() => {
//   console.warn = jest.fn();
// });
// afterAll(() => {
//   console.warn = originalWarn;
// });
