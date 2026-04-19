// Email validation - RFC 5322 simplified but stricter
export const isValidEmail = (email) => {
  if (typeof email !== 'string' || email.length > 254) return false;
  return /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/.test(email);
};

// Phone validation - must contain at least 7 digits
export const isValidPhone = (phone) => {
  if (typeof phone !== 'string') return false;
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 && /^[\d\s\+\-\(\)]+$/.test(phone);
};

// Sanitize text input (prevent XSS)
export const sanitizeInput = (text) => {
  if (typeof text !== 'string') return '';
  return text
    .replace(/<[^>]*>/g, '')           // Remove HTML tags
    .replace(/[<>"'&`]/g, '')          // Remove dangerous chars
    .replace(/javascript:/gi, '')       // Remove JS protocol
    .replace(/on\w+\s*=/gi, '')        // Remove event handlers
    .replace(/\x00/g, '')              // Remove null bytes
    .trim();
};

// Sanitize for API transmission (prevent injection)
export const sanitizeForApi = (text) => {
  if (typeof text !== 'string') return '';
  return text
    .replace(/['";\\]/g, '')           // Remove SQL special chars
    .replace(/--/g, '')                // Remove SQL comments
    .replace(/\/\*/g, '')              // Remove block comments
    .replace(/\x00/g, '')             // Remove null bytes
    .replace(/\\u[\dA-Fa-f]{4}/g, '') // Remove unicode escapes
    .trim();
};

// Validate delivery code (4 digits) with attempt tracking
let codeAttempts = 0;
let codeAttemptReset = 0;
export const isValidCode = (code) => {
  const now = Date.now();
  // Reset attempts every 15 minutes
  if (now - codeAttemptReset > 15 * 60 * 1000) {
    codeAttempts = 0;
    codeAttemptReset = now;
  }
  codeAttempts++;
  // Block after 5 wrong attempts
  if (codeAttempts > 5) return false;
  return /^\d{4}$/.test(code);
};

// Reset code attempt counter (call on successful verification)
export const resetCodeAttempts = () => { codeAttempts = 0; };

// Validate password strength
export const isStrongPassword = (password) => {
  if (typeof password !== 'string') return false;
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
