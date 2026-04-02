// Email validation
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Phone validation
export const isValidPhone = (phone) => /^[\d\s\+\-\(\)]{6,20}$/.test(phone);

// Sanitize text input (prevent XSS)
export const sanitizeInput = (text) => {
  if (typeof text !== 'string') return '';
  return text.replace(/<[^>]*>/g, '').replace(/[<>"'&]/g, '').trim();
};

// Sanitize for SQL injection patterns
export const sanitizeForApi = (text) => {
  if (typeof text !== 'string') return '';
  return text.replace(/['";\\]/g, '').trim();
};

// Validate delivery code (4 digits)
export const isValidCode = (code) => /^\d{4}$/.test(code);

// Validate password strength
export const isStrongPassword = (password) => {
  return password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
};

// Rate limiter for button presses (prevent double-tap)
export const createRateLimiter = (ms = 1000) => {
  let lastCall = 0;
  return (fn) => {
    const now = Date.now();
    if (now - lastCall >= ms) {
      lastCall = now;
      return fn();
    }
  };
};
