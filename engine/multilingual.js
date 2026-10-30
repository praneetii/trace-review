/**
 * TRACE - Multilingual Detection & Behavioral Signal Module
 * 
 * Supports:
 * - English
 * - Hindi (Native Devanagari & Transliterated Hinglish)
 * - Kannada (Native Kannada Script & Transliterated Kanglish)
 * - True Code-Mixed communications (multi-script or mixed vocabulary)
 * 
 * NOTE: Technical identifiers (URLs, UPI IDs, phone numbers, and technical
 * acronyms like KYC, PAN, OTP, UPI) are intentionally excluded from natural
 * language classification so they do not falsely trigger code-mixed flags.
 */

// Popular Hinglish vocabulary (Hindi words spelled in Latin script)
const HINGLISH_WORDS = new Set([
  'turant', 'bijli', 'khata', 'band', 'karein', 'karo', 'bhejo', 'sampark',
  'kripya', 'dhyan', 'suvidha', 'kat', 'jayegi', 'paisa', 'paise', 'jald',
  'shulk', 'suchna', 'sewa', 'vibhag', 'namaskar', 'grahak', 'upbhokta',
  'raat', 'aaj', 'din', 'mahina', 'bharo', 'bharein', 'rok', 'muft', 'inam'
]);

// Popular Kanglish vocabulary (Kannada words spelled in Latin script)
const KANGLISH_WORDS = new Set([
  'tumba', 'taksyana', 'kalsi', 'madu', 'maadi', 'aguttade', 'kelasa',
  'duddu', 'hana', 'illi', 'dayavittu', 'khate', 'hodi', 'nodiri', 'sulabha',
  'katti', 'bils', 'vidyut', 'mandali', 'bescom', 'namaskara', 'grahakare',
  'yella', 'beku', 'beda', 'hege', 'estu', 'raatri', 'indu'
]);

// Technical noise to strip before language evaluation
const TECH_TERMS_REGEX = /\b(upi|id|sms|otp|kyc|pan|url|http|https|rs|inr|am|pm|call|helpline|link|app|apk|no|web)\b/gi;
const URL_REGEX = /(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`\[\]]+/gi;
const IDENTIFIER_REGEX = /[a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+/g;
const PHONE_REGEX = /(?:\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}\b|\b1800[\-\s]?\d{3}[\-\s]?\d{3,4}\b/g;

// Suspicious Behavioral Signal Pattern Dictionaries
const SIGNAL_DEFINITIONS = [
  {
    category: 'urgency_threat',
    label: 'Urgency & Coercive Threat',
    severity: 'HIGH',
    score: 35,
    patterns: [
      // English
      /\b(immediately|urgent|within\s+\d+\s*(?:hours?|hrs?|mins?)|tonight\s+at|power\s+cut|disconnected|blocked|suspended|legal\s+action|police\s+case|fir\s+registered|arrest\s+warrant|deactivated)\b/i,
      // Hindi (Devanagari)
      /(तुरंत|शीघ्र|अति\s*आवश्यक|काट\s*दी\s*जाएगी|बिजली\s*कट|अकाउंट\s*ब्लॉक|खाता\s*बंद|निलंबित|कानूनी\s*कार्रवाई|गिरफ्तारी|वारंट|आज\s*रात)/i,
      // Hindi (Hinglish)
      /\b(turant|jald\s+se\s+jald|bijli\s+kat|kat\s+jayegi|account\s+block|khata\s+band|aaj\s+raat|action\s+hoga|police\s+case)\b/i,
      // Kannada (Kannada script)
      /(ತಕ್ಷಣ|ಅತ್ಯಂತ\s*ತುರ್ತು|ವಿದ್ಯುತ್\s*ಕಡಿತ|ಖಾತೆ\s*ಸ್ಥಗಿತ|ಅಮಾನತು|ಇಂದೇ\s*ರಾತ್ರಿ|ಸ್ಥಗಿತಗೊಳಿಸಲಾಗುವುದು|ಬಂಧನ|ವಾರಂಟ್)/i,
      // Kannada (Kanglish)
      /\b(taksyana|tumba\s+urgent|vidyut\s+disconnect|khate\s+block|inde\s+raatri|disconnect\s+aguttade)\b/i
    ]
  },
  {
    category: 'payment_demand',
    label: 'Unverified Financial / Payment Request',
    severity: 'HIGH',
    score: 30,
    patterns: [
      // English: Pay with amounts (e.g. "Pay Rs 50", "Pay Rs. 50", "Pay 500", "Pay ₹100")
      /\bpay\s+(?:rs\.?|inr|\$|₹)?\s*\d+\b/i,
      // English: Pay with direct target (e.g. "pay bill", "pay electricity bill", "pay dues", "pay fee", "pay now")
      /\bpay\s+[^.!?\n,]{0,30}\b(bill|dues|fee|fine|charge|deposit|amount|now)\b/i,
      // English: Pay via UPI or explicit UPI handle payment
      /\bpay\s+(?:at|via|through|to)\s+upi\b/i,
      /\bupi\s*:\s*[a-zA-Z0-9.\-_@]+/i,
      /\bupi\s+id\s*:\s*[a-zA-Z0-9.\-_@]+/i,
      // English: Send or transfer money/amounts
      /\b(send|transfer)\s+(?:rs\.?|inr|\$|₹)?\s*\d+\b/i,
      /\b(transfer|send|clear)\s+(?:amount|money|dues|funds|balance)\b/i,
      /\b(?:rs\.?|inr|₹)\s*\d+\s*(?:bill|shulk|fee|fine|dues|payment)\b/i,
      // Hindi (Devanagari)
      /(बिल\s*भरें|भुगतान\s*करें|पैसे\s*भेजें|शुल्क\s*जमा|रुपये\s*भेजें|पेमेंट\s*करें|बकाया\s*चुकाएं|रुपये\s*\d+|\d+\s*रुपये)/i,
      // Hindi (Hinglish)
      /\b(bill\s+bharein|payment\s+karein|payment\s+karo|paisa\s+bhejo|shulk\s+jama|dues\s+clear\s+karo)\b/i,
      // Kannada (Kannada script)
      /(ಬಿಲ್\s*ಪಾವತಿಸಿ|ಪಾವತಿ\s*ಮಾಡಿ|ಹಣ\s*ಕಳುಹಿಸಿ|ಶುಲ್ಕ\s*ಪಾವತಿಸಿ|ಬಾಕಿ\s*ತೀರಿಸಿ|ರೂಪಾಯಿ\s*\d+|\d+\s*ರೂಪಾಯಿ)/i,
      // Kannada (Kanglish)
      /\b(bill\s+katti|payment\s+maadi|duddu\s+kalsi|hana\s+kalsi|shulka\s+katti)\b/i
    ]
  },
  {
    category: 'credential_harvest',
    label: 'Credential / Identity Harvesting Bait',
    severity: 'CRITICAL',
    score: 40,
    patterns: [
      // English
      /\b(update\s+kyc|verify\s+pan|pan\s+card\s+link|share\s+otp|enter\s+pin|aadhaar\s+verification|click\s+link\s+to\s+verify|reactivate\s+account)\b/i,
      // Hindi (Devanagari)
      /(केवाईसी\s*अपडेट|पैन\s*कार्ड\s*लिंक|ओटीपी\s*साझा|आधार\s*वेरिफिकेशन|लिंक\s*पर\s*क्लिक|सत्यापित\s*करें)/i,
      // Hindi (Hinglish)
      /\b(kyc\s+update|pan\s+link|otp\s+bhejo|otp\s+share|aadhaar\s+verify|link\s+par\s+click)\b/i,
      // Kannada (Kannada script)
      /(ಕೆವೈಸಿ\s*ನವೀಕರಣ|ಪ್ಯಾನ್\s*ಲಿಂಕ್|ಒಟಿಪಿ\s*ಹಂಚಿಕೊಳ್ಳಿ|ಆಧಾರ್\s*ದೃಢೀಕರಣ|ಲಿಂಕ್\s*ಕ್ಲಿಕ್\s*ಮಾಡಿ)/i,
      // Kannada (Kanglish)
      /\b(kyc\s+update\s+maadi|pan\s+link\s+maadi|otp\s+share\s+maadi|link\s+click\s+maadi)\b/i
    ]
  },
  {
    category: 'authority_impersonation',
    label: 'Authority / Organization Claim',
    severity: 'MEDIUM',
    score: 20,
    patterns: [
      // English
      /\b(electricity\s+department|electricity\s+board|power\s+corporation|state\s+police|income\s+tax|telecom\s+department|trai|sbi|hdfc|icici|axis\s+bank|fedex|customs)\b/i,
      // Hindi (Devanagari)
      /(बिजली\s*विभाग|विद्युत\s*वितरण|पुलिस\s*विभाग|आयकर\s*विभाग|स्टेट\s*बैंक|बैंक\s*प्रबंधक|टेलीकॉम)/i,
      // Hindi (Hinglish)
      /\b(bijli\s+vibhag|vidyut\s+vibhag|police\s+vibhag|income\s+tax\s+officer|bank\s+manager)\b/i,
      // Kannada (Kannada script)
      /(ಬೆಸ್ಕಾಂ|ಮೆಸ್ಕಾಂ|ಹೆಸ್ಕಾಂ|ಜೆಸ್ಕಾಂ|ವಿದ್ಯುತ್\s*ಇಲಾಖೆ|ಆದಾಯ\s*ತೆರಿಗೆ|ಪೊಲೀಸ್\s*ಇಲಾಖೆ|ಬ್ಯಾಂಕ್\s*ವ್ಯವಸ್ಥಾಪಕ)/i,
      // Kannada (Kanglish)
      /\b(bescom|mescom|hescom|gescom|vidyut\s+mandali|police\s+department|bank\s+manager)\b/i
    ]
  }
];

/**
 * Strips technical noise (URLs, emails, UPI IDs, phone numbers, and tech abbreviations)
 * so language analysis focuses solely on natural communication text.
 */
function extractNaturalProse(rawText) {
  return rawText
    .replace(URL_REGEX, ' ')
    .replace(IDENTIFIER_REGEX, ' ')
    .replace(PHONE_REGEX, ' ')
    .replace(TECH_TERMS_REGEX, ' ')
    .replace(/[0-9.,;:!?'"\/\\()\[\]{}@#$%^&*_\-+=<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects the language composition of the text:
 * - English
 * - Hindi (Devanagari)
 * - Kannada (Kannada Script)
 * - Code-Mixed (Hinglish, Kanglish, or Multi-script sentences)
 */
export function detectLanguage(text) {
  if (!text || typeof text !== 'string') {
    return {
      primary: 'Unknown',
      script: 'None',
      isCodeMixed: false,
      codeMixedType: null,
      confidence: 0
    };
  }

  // 1. Strip technical identifiers so they don't corrupt natural language analysis
  const naturalProse = extractNaturalProse(text);

  // Character counts of remaining natural prose
  const kannadaChars = (naturalProse.match(/[\u0C80-\u0CFF]/g) || []).length;
  const devanagariChars = (naturalProse.match(/[\u0900-\u097F]/g) || []).length;
  const latinWords = (naturalProse.toLowerCase().match(/\b[a-z]{2,}\b/g) || []);
  const latinChars = latinWords.join('').length;

  // Check for Hinglish / Kanglish vocabulary in Latin words
  let hinglishCount = 0;
  let kanglishCount = 0;
  for (const word of latinWords) {
    if (HINGLISH_WORDS.has(word)) hinglishCount++;
    if (KANGLISH_WORDS.has(word)) kanglishCount++;
  }

  // CASE 1: Native Kannada script dominant
  if (kannadaChars > 0 && kannadaChars >= devanagariChars) {
    // Only flag code-mixed if there is meaningful natural English prose (at least 3 conversational words)
    const isCodeMixed = latinWords.length >= 3;
    return {
      primary: 'Kannada',
      script: 'Kannada Script',
      isCodeMixed: isCodeMixed,
      codeMixedType: isCodeMixed ? 'Kannada + English (Multi-script)' : null,
      confidence: 0.95
    };
  }

  // CASE 2: Native Hindi (Devanagari) script dominant
  if (devanagariChars > 0 && devanagariChars >= kannadaChars) {
    // Only flag code-mixed if there is meaningful natural English prose (at least 3 conversational words)
    const isCodeMixed = latinWords.length >= 3;
    return {
      primary: 'Hindi',
      script: 'Devanagari',
      isCodeMixed: isCodeMixed,
      codeMixedType: isCodeMixed ? 'Hindi + English (Multi-script)' : null,
      confidence: 0.95
    };
  }

  // CASE 3: Latin script dominant -> Check for transliteration (Hinglish or Kanglish)
  if (kanglishCount >= 1 && kanglishCount >= hinglishCount) {
    return {
      primary: 'Kannada',
      script: 'Latin (Transliterated)',
      isCodeMixed: true,
      codeMixedType: 'Kanglish (Kannada in Latin script)',
      confidence: 0.90
    };
  }

  if (hinglishCount >= 1) {
    return {
      primary: 'Hindi',
      script: 'Latin (Transliterated)',
      isCodeMixed: true,
      codeMixedType: 'Hinglish (Hindi in Latin script)',
      confidence: 0.90
    };
  }

  // CASE 4: Standard English
  return {
    primary: 'English',
    script: 'Latin',
    isCodeMixed: false,
    codeMixedType: null,
    confidence: 0.95
  };
}

/**
 * Scans text against behavioral scam indicators
 */
export function analyzeBehavioralSignals(text) {
  const detectedSignals = [];
  let cumulativeScore = 0;

  for (const def of SIGNAL_DEFINITIONS) {
    const matchedEvidence = [];

    for (const pattern of def.patterns) {
      const match = text.match(pattern);
      if (match) {
        matchedEvidence.push(match[0].trim());
      }
    }

    if (matchedEvidence.length > 0) {
      detectedSignals.push({
        category: def.category,
        label: def.label,
        severity: def.severity,
        scoreImpact: def.score,
        evidence: Array.from(new Set(matchedEvidence))
      });
      cumulativeScore += def.score;
    }
  }

  // Calculate normalized risk level based on signal evidence
  const boundedScore = Math.min(cumulativeScore, 100);
  let riskLevel = 'LOW';
  if (boundedScore >= 60) {
    riskLevel = 'HIGH';
  } else if (boundedScore >= 25) {
    riskLevel = 'MEDIUM';
  }

  return {
    detectedSignals,
    signalCount: detectedSignals.length,
    heuristicRiskScore: boundedScore,
    heuristicRiskLevel: riskLevel
  };
}

/**
 * Main Multilingual Engine entry point
 */
export function processMultilingualContent(text) {
  const language = detectLanguage(text);
  const behavioralAnalysis = analyzeBehavioralSignals(text);

  return {
    language,
    behavioralAnalysis
  };
}
