// Email validation
export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Phone validation
export const isValidPhone = (phone) => /^[\d\s\+\-\(\)]{6,20}$/.test(phone);

// Sanitize text input (prevent XSS)
export const sanitizeInput = (text) => {
  if (typeof text !== 'string') return '';
  // Apostrophes et guillemets gardés (« l'entrée B ») : React Native n'interprète
  // pas le HTML, seules les balises et les chevrons sont retirés.
  return text.replace(/<[^>]*>/g, '').replace(/[<>&]/g, '').trim();
};

// Corps JSON envoyé au serveur : texte gardé tel quel, espaces des bords
// retirés. Le serveur (ORM Django) protège déjà des injections SQL ; retirer
// ' " ; \ abîmait les adresses (« l'entrée B ») et les mots de passe.
export const sanitizeForApi = (text) => {
  if (typeof text !== 'string') return '';
  return text.trim();
};

// Validate delivery code (4 digits)
export const isValidCode = (code) => /^\d{4}$/.test(code);

// Validate password strength
export const isStrongPassword = (password) => {
  return password.length >= 10 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
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
