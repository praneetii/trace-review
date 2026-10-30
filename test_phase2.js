/**
 * TRACE - Phase 2 Comprehensive Test Suite (Updated)
 * 
 * Verifies deterministic extraction & multilingual detection across 6 scenarios:
 * 1. English Email Phishing with Identifiers (Pure English, not code-mixed)
 * 2. Native Hindi with UPI & Phone (Pure Hindi, NOT code-mixed)
 * 3. Native Kannada with URL & Phone (Pure Kannada, NOT code-mixed)
 * 4. Real Multi-script Code-Mixed (Hindi + English sentences)
 * 5. Transliterated Hinglish (Hindi in Latin script)
 * 6. Transliterated Kanglish (Kannada in Latin script)
 */

import { extractIdentifiers } from './engine/extractor.js';
import { processMultilingualContent } from './engine/multilingual.js';

const TEST_CASES = [
  {
    name: 'Test 1: English Phishing (with UPI, URL, Phone)',
    rawText: `Dear SBI Customer, your bank account has been blocked due to missing PAN card. Immediately update KYC within 2 hours to avoid permanent suspension. Pay verification fee of Rs 10 to clear dues: upi: sbi-kyc-verify@okhdfcbank or visit https://sbi-kyc-portal.online. For helpline call +91 9845123456 or 1800-111-2223.`,
    expectedLanguage: 'English',
    expectedCodeMixed: false,
    expectedUpi: 'sbi-kyc-verify@okhdfcbank',
    expectedDomain: 'sbi-kyc-portal.online'
  },
  {
    name: 'Test 2: Native Hindi (Pure Devanagari with UPI & Phone)',
    rawText: `प्रिय उपभोक्ता, आज रात 9:30 बजे आपकी बिजली काट दी जाएगी क्योंकि आपका पिछले महीने का बिल अपडेट नहीं हुआ है। तुरंत संपर्क करें और बिजली विभाग के बिल का भुगतान करें। UPI ID: bijli-pay@okaxis या कॉल करें +91-9876543210 पर।`,
    expectedLanguage: 'Hindi',
    expectedCodeMixed: false, // Technical identifiers should NOT cause code-mixed
    expectedUpi: 'bijli-pay@okaxis',
    expectedPhone: '+919876543210'
  },
  {
    name: 'Test 3: Native Kannada (Pure Kannada Script with URL & Phone)',
    rawText: `ಗೌರವಾನ್ವಿತ ಗ್ರಾಹಕರೇ, ನಿಮ್ಮ ಕೆವೈಸಿ ನವೀಕರಣ ಬಾಕಿ ಇರುವುದರಿಂದ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸ್ಥಗಿತಗೊಳಿಸಲಾಗುವುದು. ತಕ್ಷಣ ಲಿಂಕ್ ಕ್ಲಿಕ್ ಮಾಡಿ ದೃಢೀಕರಿಸಿ: https://karnataka-bank-verify.in ಅಥವಾ ಬೆಂಬಲಕ್ಕಾಗಿ +91 9123456789 ಸಂಪರ್ಕಿಸಿ.`,
    expectedLanguage: 'Kannada',
    expectedCodeMixed: false, // Technical identifiers should NOT cause code-mixed
    expectedDomain: 'karnataka-bank-verify.in',
    expectedPhone: '+919123456789'
  },
  {
    name: 'Test 4: Real Multi-script Code-Mixed (Hindi + English Sentences)',
    rawText: `Dear customer, your power bill is unpaid. आज रात बिजली काट दी जाएगी। Please immediately pay bill to avoid permanent power cut. UPI: kptcl-pay@okaxis`,
    expectedLanguage: 'Hindi',
    expectedCodeMixed: true, // Truly code-mixed with English conversational words
    expectedUpi: 'kptcl-pay@okaxis'
  },
  {
    name: 'Test 5: Transliterated Hinglish (Hindi in Latin script)',
    rawText: `Dear consumer, aaj raat bijli kat jayegi. Turant 200 Rs bill bharein. Payment karein at upi: bescom-official@paytm or call helpline +91 9876500001 immediately.`,
    expectedLanguage: 'Hindi',
    expectedCodeMixed: true,
    expectedUpi: 'bescom-official@paytm'
  },
  {
    name: 'Test 6: Transliterated Kanglish (Kannada in Latin script)',
    rawText: `Grahakare, tumba urgent notice. Vidyut disconnect aguttade inde raatri. Dayavittu bill katti at upi: bescom-kannada@okhdfcbank or call +91 9988776655.`,
    expectedLanguage: 'Kannada',
    expectedCodeMixed: true,
    expectedUpi: 'bescom-kannada@okhdfcbank'
  }
];

console.log('================================================================');
console.log('🛡️  TRACE - PHASE 2 REFINED TEST RUNNER (6 TEST SCENARIOS)');
console.log('================================================================\n');

let allPassed = true;

TEST_CASES.forEach((tc, idx) => {
  console.log(`----------------------------------------------------------------`);
  console.log(`📌 ${tc.name}`);
  console.log(`📝 Input Text:\n"${tc.rawText}"\n`);

  // 1. Run Deterministic Extraction
  const identifiers = extractIdentifiers(tc.rawText);

  // 2. Run Multilingual Analysis
  const multilingual = processMultilingualContent(tc.rawText);

  // Print results
  console.log(`🔍 [1. Language Detection]`);
  console.log(`   - Detected Language : ${multilingual.language.primary} (${multilingual.language.script})`);
  console.log(`   - Code-Mixed Status : ${multilingual.language.isCodeMixed ? 'YES (' + multilingual.language.codeMixedType + ')' : 'NO'}`);
  console.log(`   - Confidence        : ${(multilingual.language.confidence * 100).toFixed(0)}%`);

  console.log(`\n🔍 [2. Deterministic Identifiers]`);
  console.log(`   - URLs              : ${JSON.stringify(identifiers.urls)}`);
  console.log(`   - Domains           : ${JSON.stringify(identifiers.domains)}`);
  console.log(`   - UPI Handles       : ${JSON.stringify(identifiers.upiIds)}`);
  console.log(`   - Phone Numbers     : ${JSON.stringify(identifiers.phoneNumbers)}`);

  console.log(`\n🔍 [3. Behavioral Signals]`);
  console.log(`   - Heuristic Score   : ${multilingual.behavioralAnalysis.heuristicRiskScore}/100 [Level: ${multilingual.behavioralAnalysis.heuristicRiskLevel}]`);
  multilingual.behavioralAnalysis.detectedSignals.forEach(s => {
    console.log(`   - ⚠️  [${s.severity}] ${s.label} -> Matched: ${JSON.stringify(s.evidence)}`);
  });

  // Basic assertion checks
  const langMatch = multilingual.language.primary === tc.expectedLanguage;
  const upiMatch = !tc.expectedUpi || identifiers.upiIds.includes(tc.expectedUpi);
  const domainMatch = !tc.expectedDomain || identifiers.domains.includes(tc.expectedDomain);
  const phoneMatch = !tc.expectedPhone || identifiers.phoneNumbers.includes(tc.expectedPhone);
  const codeMixedMatch = tc.expectedCodeMixed === undefined || multilingual.language.isCodeMixed === tc.expectedCodeMixed;

  const passed = langMatch && upiMatch && domainMatch && phoneMatch && codeMixedMatch;

  if (passed) {
    console.log(`\n✅ VERDICT: TEST PASSED`);
  } else {
    console.log(`\n❌ VERDICT: TEST FAILED`);
    console.log(`   Expected Lang: ${tc.expectedLanguage}, Got: ${multilingual.language.primary}`);
    console.log(`   Expected Code-Mixed: ${tc.expectedCodeMixed}, Got: ${multilingual.language.isCodeMixed}`);
    console.log(`   UPI Check: ${upiMatch}, Domain Check: ${domainMatch}, Phone Check: ${phoneMatch}`);
    allPassed = false;
  }
  console.log('----------------------------------------------------------------\n');
});

if (allPassed) {
  console.log('🎉 ALL 6 TEST CASES PASSED PERFECTLY!');
  process.exit(0);
} else {
  console.error('⚠️ SOME TESTS FAILED.');
  process.exit(1);
}
