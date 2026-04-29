// Unit tests for services/certPinning.js.
//
// We never want a release build to ship with the placeholder pins by accident,
// so `pinsLookConfigured` MUST return false until the SHA-256 strings have
// been replaced with real fingerprints. These tests pin (pun intended) that
// invariant so a typo or revert will fail CI.

jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const certPinning = require('../services/certPinning');

describe('certPinning', () => {
  test('exposes pin configuration for the API host', () => {
    const pins = certPinning.EXPECTED_PINS['pythonapi.digiexports.in'];
    expect(Array.isArray(pins)).toBe(true);
    expect(pins.length).toBeGreaterThanOrEqual(2); // primary + backup
  });

  test('flags placeholder pins as not configured', () => {
    // The shipped values are still the AAAA / BBBB placeholders.
    expect(certPinning.pinsLookConfigured()).toBe(false);
  });

  test('verifyPinningHealth runs without throwing', () => {
    const original__DEV__ = global.__DEV__;
    global.__DEV__ = false;
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(() => certPinning.verifyPinningHealth()).not.toThrow();
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      global.__DEV__ = original__DEV__;
    }
  });

  test('verifyPinningHealth is a no-op in dev builds', () => {
    const original__DEV__ = global.__DEV__;
    global.__DEV__ = true;
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      certPinning.verifyPinningHealth();
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      global.__DEV__ = original__DEV__;
    }
  });
});
