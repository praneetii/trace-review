/**
 * TRACE - Deterministic Extraction Engine
 * 
 * Extracts exact, verifiable identifiers from untrusted message text:
 * - URLs and extracted domain names
 * - Payment identifiers (UPI IDs, Bank IFSC codes)
 * - Indian phone numbers (+91, standard 10-digit mobile, toll-free)
 * - Email addresses
 */

// Popular Indian UPI payment service provider (PSP) handles
const KNOWN_UPI_HANDLES = [
  'okhdfcbank', 'okaxis', 'okicici', 'oksbi', 'paytm', 'ybl', 'ibl', 'upi',
  'axl', 'apl', 'pingpay', 'postbank', 'jupiteraxis', 'fbl', 'idfcbank',
  'freecharge', 'airtel', 'kotak', 'barodampay', 'icici', 'hdfcbank', 'sbi',
  'yesbank', 'indus', 'federal'
];

/**
 * Extracts and cleans URLs from text
 */
export function extractUrls(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Matches http://, https://, and standalone domains with common TLDs
  const urlRegex = /(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`\[\]]+|(?:[a-zA-Z0-9-]+\.)+(?:com|in|org|net|co|online|xyz|top|live|site|info|buzz|club|app|cc|work|vip)[^\s<>"'{}|\\^`\[\]]*/gi;
  
  const matches = text.match(urlRegex) || [];
  const normalized = matches.map(u => {
    let clean = u.replace(/[.,;:)\]]+$/, ''); // Strip trailing punctuation
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    return clean;
  });

  return Array.from(new Set(normalized));
}

/**
 * Extracts domains and hostnames from extracted URLs or raw text
 */
export function extractDomains(urls) {
  const domains = [];
  
  for (const rawUrl of urls) {
    try {
      const parsed = new URL(rawUrl);
      const host = parsed.hostname.toLowerCase();
      // Remove 'www.' prefix if present
      const cleanHost = host.startsWith('www.') ? host.slice(4) : host;
      if (cleanHost && !domains.includes(cleanHost)) {
        domains.push(cleanHost);
      }
    } catch {
      // Invalid URL format, skip safely
    }
  }

  return domains;
}

/**
 * Extracts UPI Payment Handles (e.g., merchant@okaxis, billdesk@paytm)
 */
export function extractUpiIds(text) {
  if (!text || typeof text !== 'string') return [];
  
  // Handles explicit upi: prefixes or standard username@handle formats
  const upiRegex = /[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9]{2,32}/g;
  const matches = text.match(upiRegex) || [];
  
  const upiList = [];
  
  for (const candidate of matches) {
    const parts = candidate.split('@');
    if (parts.length !== 2) continue;
    
    const [user, handle] = parts;
    const lowerHandle = handle.toLowerCase();
    
    // Check if handle matches known UPI banks, or has explicit UPI indicator
    const isKnownHandle = KNOWN_UPI_HANDLES.includes(lowerHandle);
    const hasUpiPrefix = text.toLowerCase().includes(`upi:${candidate.toLowerCase()}`) ||
                         text.toLowerCase().includes(`upi id: ${candidate.toLowerCase()}`) ||
                         text.toLowerCase().includes(`upi id ${candidate.toLowerCase()}`);

    // If it's a known banking handle or explicitly prefixed as UPI, capture it
    // Also avoid matching standard email domains like gmail.com, yahoo.com unless marked upi
    const isEmailDomain = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'].includes(lowerHandle);
    
    if ((isKnownHandle || hasUpiPrefix) && !isEmailDomain) {
      upiList.push(candidate.toLowerCase());
    }
  }

  return Array.from(new Set(upiList));
}

/**
 * Extracts Indian mobile numbers and toll-free contact numbers
 */
export function extractPhoneNumbers(text) {
  if (!text || typeof text !== 'string') return [];

  const phoneNumbers = [];

  // 1. Matches +91 or 91 format: +91 9876543210 or +91-98765-43210
  const intlRegex = /(?:\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}\b/g;
  const intlMatches = text.match(intlRegex) || [];
  for (const m of intlMatches) {
    const digits = m.replace(/\D/g, '');
    const cleanNum = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
    if (cleanNum.length === 10) {
      phoneNumbers.push('+91' + cleanNum);
    }
  }

  // 2. Matches Toll-Free numbers: 1800-XXX-XXXX
  const tollFreeRegex = /\b1800[\-\s]?\d{3}[\-\s]?\d{3,4}\b/g;
  const tfMatches = text.match(tollFreeRegex) || [];
  for (const m of tfMatches) {
    const digits = m.replace(/\D/g, '');
    phoneNumbers.push(digits);
  }

  return Array.from(new Set(phoneNumbers));
}

/**
 * Extracts Email Addresses
 */
export function extractEmails(text) {
  if (!text || typeof text !== 'string') return [];
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  const matches = text.match(emailRegex) || [];
  return Array.from(new Set(matches.map(e => e.toLowerCase())));
}

/**
 * Main Deterministic Extractor function
 */
export function extractIdentifiers(text) {
  const urls = extractUrls(text);
  const domains = extractDomains(urls);
  const upiIds = extractUpiIds(text);
  const phoneNumbers = extractPhoneNumbers(text);
  const emails = extractEmails(text);

  return {
    urls,
    domains,
    upiIds,
    phoneNumbers,
    emails,
    hasPaymentIdentifiers: upiIds.length > 0,
    hasDigitalPresence: urls.length > 0 || domains.length > 0,
    extractedCount: urls.length + domains.length + upiIds.length + phoneNumbers.length + emails.length
  };
}

