import { isValidEmail, isValidPhone, sanitizeInput, sanitizeForApi, isValidCode, isStrongPassword, createRateLimiter } from '../utils/validation';

describe('isValidEmail', () => {
  it('accepts valid emails', () => {
    expect(isValidEmail('user@example.com')).toBe(true);
    expect(isValidEmail('a.b@c.d.com')).toBe(true);
    expect(isValidEmail('test+tag@mail.org')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('noatsign')).toBe(false);
    expect(isValidEmail('@nodomain')).toBe(false);
    expect(isValidEmail('spaces in@mail.com')).toBe(false);
    expect(isValidEmail('missing@tld')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('accepts valid phone numbers', () => {
    expect(isValidPhone('0612345678')).toBe(true);
    expect(isValidPhone('+33 6 12 34 56 78')).toBe(true);
    expect(isValidPhone('(01) 234-5678')).toBe(true);
  });

  it('rejects invalid phones', () => {
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('12345')).toBe(false); // too short
    expect(isValidPhone('abc')).toBe(false);
  });
});

describe('sanitizeInput', () => {
  it('strips HTML tags', () => {
    expect(sanitizeInput('<script>alert(1)</script>')).toBe('alert(1)');
  });

  it('strips dangerous characters', () => {
    expect(sanitizeInput('hello"world')).toBe('helloworld');
    expect(sanitizeInput("test'value")).toBe('testvalue');
    expect(sanitizeInput('a<b>c&d')).toBe('acd');
  });

  it('trims whitespace', () => {
    expect(sanitizeInput('  hello  ')).toBe('hello');
  });

  it('handles non-string input', () => {
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
    expect(sanitizeInput(123)).toBe('');
  });
});

describe('sanitizeForApi', () => {
  it('removes SQL injection characters', () => {
    expect(sanitizeForApi("'; DROP TABLE--")).toBe('DROP TABLE');
    expect(sanitizeForApi('test"value')).toBe('testvalue');
    expect(sanitizeForApi('path\\escape')).toBe('pathescape');
  });

  it('handles non-string input', () => {
    expect(sanitizeForApi(null)).toBe('');
    expect(sanitizeForApi(42)).toBe('');
  });
});

describe('isValidCode', () => {
  it('accepts 4-digit codes', () => {
    expect(isValidCode('1234')).toBe(true);
    expect(isValidCode('0000')).toBe(true);
    expect(isValidCode('9999')).toBe(true);
  });

  it('rejects non-4-digit codes', () => {
    expect(isValidCode('123')).toBe(false);
    expect(isValidCode('12345')).toBe(false);
    expect(isValidCode('abcd')).toBe(false);
    expect(isValidCode('')).toBe(false);
  });
});

describe('isStrongPassword', () => {
  it('accepts strong passwords', () => {
    expect(isStrongPassword('Test@123')).toBe(true);
    expect(isStrongPassword('MyP4ssword')).toBe(true);
  });

  it('rejects weak passwords', () => {
    expect(isStrongPassword('short1A')).toBe(false); // < 8 chars
    expect(isStrongPassword('alllowercase1')).toBe(false); // no uppercase
    expect(isStrongPassword('ALLUPPERCASE1')).toBe(false); // no lowercase
    expect(isStrongPassword('NoDigitsHere')).toBe(false); // no digit
  });
});

describe('createRateLimiter', () => {
  it('allows first call immediately', () => {
    const limiter = createRateLimiter(1000);
    const fn = jest.fn(() => 'ok');
    expect(limiter(fn)).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('blocks rapid subsequent calls', () => {
    const limiter = createRateLimiter(1000);
    const fn = jest.fn(() => 'ok');
    limiter(fn); // first call
    const result = limiter(fn); // immediate second call
    expect(result).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
