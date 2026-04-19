// Test the URL validation logic independently
const API_BASE = 'https://api.pearlstreets.com:81';
const ALLOWED_HOSTS = ['api.pearlstreets.com'];

function validateRequestUrl(url) {
  try {
    const parsed = new URL(url, API_BASE);
    if (parsed.protocol !== 'https:') {
      throw new Error('HTTPS required: insecure HTTP requests are blocked');
    }
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Blocked request to unauthorized host: ${parsed.hostname}`);
    }
  } catch (e) {
    if (e.message.includes('HTTPS required') || e.message.includes('Blocked request')) {
      throw e;
    }
  }
}

describe('API Security - URL validation', () => {
  it('allows HTTPS requests to authorized host', () => {
    expect(() => validateRequestUrl('https://api.pearlstreets.com:81/api/v1/test')).not.toThrow();
  });

  it('allows relative URLs (resolved against API_BASE)', () => {
    expect(() => validateRequestUrl('/api/v1/delivery/login/')).not.toThrow();
  });

  it('blocks HTTP requests', () => {
    expect(() => validateRequestUrl('http://api.pearlstreets.com:81/api/v1/test')).toThrow('HTTPS required');
  });

  it('blocks requests to unauthorized hosts', () => {
    expect(() => validateRequestUrl('https://evil.com/api')).toThrow('Blocked request to unauthorized host');
  });

  it('blocks requests to similar-looking domains', () => {
    expect(() => validateRequestUrl('https://api.pearlstreets.com.evil.com/api')).toThrow('Blocked request');
  });

  it('blocks IP-based URLs', () => {
    expect(() => validateRequestUrl('https://192.168.1.1/api')).toThrow('Blocked request');
  });

  it('blocks localhost requests', () => {
    expect(() => validateRequestUrl('https://localhost/api')).toThrow('Blocked request');
  });

  it('blocks FTP protocol', () => {
    expect(() => validateRequestUrl('ftp://api.pearlstreets.com/file')).toThrow('HTTPS required');
  });
});
