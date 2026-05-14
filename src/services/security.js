/**
 * 🛡️ NUDGEME SECURITY MODULE
 * Handles input sanitization, injection detection, and rate limiting.
 */

// 1. INJECTION DETECTION PATTERNS
// Patterns commonly used to attempt prompt injection or jailbreaking
const INJECTION_PATTERNS = [
  /ignore previous instructions/i,
  /ignore all previous instructions/i,
  /new system prompt/i,
  /you are now/i,
  /pretend you are/i,
  /pretend to be/i,
  /act as/i,
  /developer mode/i,
  /admin mode/i,
  /unrestricted mode/i,
  /disable safety/i,
  /bypass security/i,
  /DAN mode/i,
  /do anything now/i,
  /jailbreak/i,
  /system override/i,
  /system instructions/i,
  /simulated conversation/i,
  /hypothetical scenario/i,
  /for testing purposes/i,
  /your creator/i,
  /the system/i
];

/**
 * Sanitizes user input to remove potentially harmful characters and normalize text.
 * @param {string} text - The raw user input
 * @returns {string} - The sanitized text
 */
export const sanitizeInput = (text) => {
  if (typeof text !== 'string') return '';
  
  // Trim whitespace
  let cleanText = text.trim();
  
  // Remove invisible control characters (except common whitespace)
  // eslint-disable-next-line no-control-regex
  cleanText = cleanText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  
  // Normalize multiple spaces to single space
  cleanText = cleanText.replace(/\s+/g, ' ');
  
  return cleanText;
};

/**
 * Checks for prompt injection attempts in the user input.
 * @param {string} text - The user input
 * @returns {boolean} - True if injection detected, false otherwise
 */
export const detectInjection = (text) => {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  
  // Check against known injection patterns
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(lowerText)) {
      console.warn(`🛡️ Security: Injection attempt detected: ${pattern}`);
      return true;
    }
  }
  
  // Heuristic: Check for extremely long inputs (potential buffer overflow or token exhaustion)
  if (text.length > 2000) {
     console.warn(`🛡️ Security: Input too long (${text.length} chars)`);
     return true;
  }
  
  return false;
};

// Rate limiting state (in-memory)
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15; // Max 15 requests per minute
let requestTimestamps = [];

/**
 * Checks if the current request exceeds the rate limit.
 * @returns {boolean} - True if request is allowed, false if rate limited
 */
export const checkRateLimit = () => {
  const now = Date.now();
  
  // Filter out timestamps older than the window
  requestTimestamps = requestTimestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    console.warn('🛡️ Security: Rate limit exceeded');
    return false;
  }
  
  requestTimestamps.push(now);
  return true;
};

/**
 * Validates AI output to ensure no system information is leaked.
 * @param {string} text - The AI response
 * @returns {boolean} - True if safe, false if potential leak
 */
export const validateOutput = (text) => {
  if (!text) return true; // Empty is safe
  
  // Check if AI leaked system prompt details
  const LEAK_PATTERNS = [
    /system prompt/i,
    /initial instructions/i,
    /cannot be reassigned/i, 
    /anti-injection rules/i,
    /critical security instructions/i
  ];
  
  for (const pattern of LEAK_PATTERNS) {
    if (pattern.test(text)) {
      console.warn(`🛡️ Security: Output validation failed (potential leak): ${pattern}`);
      return false;
    }
  }
  
  return true;
};

export const SecurityService = {
  sanitizeInput,
  detectInjection,
  checkRateLimit,
  validateOutput
};
