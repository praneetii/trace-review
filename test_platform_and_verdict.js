/**
 * TRACE - Refinement Verification Test Suite
 * 
 * Verifies:
 * 1. Multi-tenant public platform isolation (forms.gle does NOT create strong campaign connections)
 * 2. Official institutional domain isolation (bescom.karnataka.gov.in does NOT create scam campaigns)
 * 3. Genuine dedicated suspicious domains STILL create STRONG campaign connections
 * 4. Dedicated UPI IDs STILL create STRONG campaign connections
 * 5. Score 0 messages display LOW_RISK / NO STRONG SUSPICIOUS SIGNALS DETECTED (never "SAFE / VERIFIED")
 */

import { resetDatabase, readDatabase } from './engine/storage.js';
import { recordAndCorrelate } from './engine/scamchain.js';
import { runDeterministicFallback } from './engine/ai_analyzer.js';

console.log('================================================================');
console.log('🛡️  TRACE - PLATFORM ISOLATION & VERDICT WORDING TEST');
console.log('================================================================\n');

let allPassed = true;

// -----------------------------------------------------------------
// Test 1: Shared Public Platform Domain (forms.gle)
// -----------------------------------------------------------------
console.log('--- TEST 1: Common Public Platform Isolation (forms.gle) ---');
await resetDatabase();

const formMsg1 = {
  rawText: 'Please fill our employee survey: https://forms.gle/survey123',
  source: 'gmail',
  language: { primary: 'English', script: 'Latin', isCodeMixed: false },
  riskVerdict: 'LOW_RISK',
  riskScore: 0,
  intentSummary: 'Survey request',
  identifiers: { urls: ['https://forms.gle/survey123'], domains: ['forms.gle'], upiIds: [], phoneNumbers: [] },
  findings: [],
  claims: []
};
const resForm1 = await recordAndCorrelate(formMsg1);

const formMsg2 = {
  rawText: 'Urgent feedback requested on https://forms.gle/survey123',
  source: 'whatsapp',
  language: { primary: 'English', script: 'Latin', isCodeMixed: false },
  riskVerdict: 'LOW_RISK',
  riskScore: 0,
  intentSummary: 'Feedback request',
  identifiers: { urls: ['https://forms.gle/survey123'], domains: ['forms.gle'], upiIds: [], phoneNumbers: [] },
  findings: [],
  claims: []
};
const resForm2 = await recordAndCorrelate(formMsg2);

console.log(`Message 1 & 2 share 'forms.gle'`);
console.log(`Campaign Connection Created: ${resForm2.scamchain.hasCampaignConnection ? 'YES (UNEXPECTED)' : 'NO (CORRECT)'}`);

if (!resForm2.scamchain.hasCampaignConnection) {
  console.log('✅ Test 1 Passed: Shared public platform (forms.gle) correctly prevented from creating a false campaign cluster.');
} else {
  console.error('❌ Test 1 Failed: forms.gle falsely triggered a strong campaign connection!');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 2: Shared Official Institutional Domain (bescom.karnataka.gov.in)
// -----------------------------------------------------------------
console.log('\n--- TEST 2: Official Institutional Domain Isolation ---');
await resetDatabase();

const officialMsg1 = {
  rawText: 'Dear Consumer, view your bill on https://bescom.karnataka.gov.in',
  source: 'gmail',
  language: { primary: 'English', script: 'Latin', isCodeMixed: false },
  riskVerdict: 'LOW_RISK',
  riskScore: 0,
  intentSummary: 'Official bill viewing',
  identifiers: { urls: ['https://bescom.karnataka.gov.in'], domains: ['bescom.karnataka.gov.in'], upiIds: [], phoneNumbers: [] },
  findings: [],
  claims: []
};
const resOff1 = await recordAndCorrelate(officialMsg1);

const officialMsg2 = {
  rawText: 'Pay BESCOM bill securely via official portal: https://bescom.karnataka.gov.in',
  source: 'whatsapp',
  language: { primary: 'English', script: 'Latin', isCodeMixed: false },
  riskVerdict: 'LOW_RISK',
  riskScore: 0,
  intentSummary: 'Bill payment portal',
  identifiers: { urls: ['https://bescom.karnataka.gov.in'], domains: ['bescom.karnataka.gov.in'], upiIds: [], phoneNumbers: [] },
  findings: [],
  claims: []
};
const resOff2 = await recordAndCorrelate(officialMsg2);

console.log(`Message 1 & 2 share official 'bescom.karnataka.gov.in'`);
console.log(`Campaign Connection Created: ${resOff2.scamchain.hasCampaignConnection ? 'YES (UNEXPECTED)' : 'NO (CORRECT)'}`);

if (!resOff2.scamchain.hasCampaignConnection) {
  console.log('✅ Test 2 Passed: Official institutional domain correctly prevented from creating a scam campaign cluster.');
} else {
  console.error('❌ Test 2 Failed: Official domain falsely triggered a scam campaign cluster!');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 3: Dedicated Attacker Domain STILL Creates STRONG Connection
// -----------------------------------------------------------------
console.log('\n--- TEST 3: Dedicated Attacker Domain Correlation ---');
await resetDatabase();

const scamDom1 = {
  rawText: 'Urgent: update KYC at https://sbi-fake-kyc.online or account blocked.',
  source: 'gmail',
  language: { primary: 'English', script: 'Latin', isCodeMixed: false },
  riskVerdict: 'HIGH_RISK',
  riskScore: 85,
  intentSummary: 'Phishing',
  identifiers: { urls: ['https://sbi-fake-kyc.online'], domains: ['sbi-fake-kyc.online'], upiIds: [], phoneNumbers: [] },
  findings: [],
  claims: []
};
await recordAndCorrelate(scamDom1);

const scamDom2 = {
  rawText: 'Reactivate your account now: https://sbi-fake-kyc.online',
  source: 'whatsapp',
  language: { primary: 'English', script: 'Latin', isCodeMixed: false },
  riskVerdict: 'HIGH_RISK',
  riskScore: 85,
  intentSummary: 'Phishing',
  identifiers: { urls: ['https://sbi-fake-kyc.online'], domains: ['sbi-fake-kyc.online'], upiIds: [], phoneNumbers: [] },
  findings: [],
  claims: []
};
const resScamDom2 = await recordAndCorrelate(scamDom2);

console.log(`Message 1 & 2 share dedicated unverified domain 'sbi-fake-kyc.online'`);
console.log(`Campaign Connection Created: ${resScamDom2.scamchain.hasCampaignConnection ? 'YES' : 'NO'}`);
console.log(`Evidence Strength: ${resScamDom2.scamchain.connections[0]?.connectionStrength}`);

const hasStrongDomain = resScamDom2.scamchain.hasCampaignConnection &&
                        resScamDom2.scamchain.connections[0]?.connectionStrength === 'STRONG';

if (hasStrongDomain) {
  console.log('✅ Test 3 Passed: Dedicated unverified domain successfully establishes STRONG campaign connection.');
} else {
  console.error('❌ Test 3 Failed: Dedicated domain correlation failed or was weakened.');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 4: Dedicated UPI Handle STILL Creates STRONG Connection
// -----------------------------------------------------------------
console.log('\n--- TEST 4: Dedicated UPI Handle Correlation ---');
await resetDatabase();

const upiMsg1 = {
  rawText: 'Pay power bill to upi: kptcl-fraud@okaxis',
  source: 'gmail',
  language: { primary: 'English', script: 'Latin', isCodeMixed: false },
  riskVerdict: 'HIGH_RISK',
  riskScore: 85,
  intentSummary: 'Utility threat',
  identifiers: { urls: [], domains: [], upiIds: ['kptcl-fraud@okaxis'], phoneNumbers: [] },
  findings: [],
  claims: []
};
await recordAndCorrelate(upiMsg1);

const upiMsg2 = {
  rawText: 'Power cut tonight, pay to upi: kptcl-fraud@okaxis',
  source: 'whatsapp',
  language: { primary: 'Hindi', script: 'Devanagari', isCodeMixed: false },
  riskVerdict: 'HIGH_RISK',
  riskScore: 85,
  intentSummary: 'Utility threat',
  identifiers: { urls: [], domains: [], upiIds: ['kptcl-fraud@okaxis'], phoneNumbers: [] },
  findings: [],
  claims: []
};
const resUpi2 = await recordAndCorrelate(upiMsg2);

console.log(`Message 1 & 2 share UPI 'kptcl-fraud@okaxis'`);
console.log(`Campaign Connection Created: ${resUpi2.scamchain.hasCampaignConnection ? 'YES' : 'NO'}`);
console.log(`Evidence Strength: ${resUpi2.scamchain.connections[0]?.connectionStrength}`);

const hasStrongUpi = resUpi2.scamchain.hasCampaignConnection &&
                     resUpi2.scamchain.connections[0]?.connectionStrength === 'STRONG';

if (hasStrongUpi) {
  console.log('✅ Test 4 Passed: Dedicated UPI handle successfully establishes STRONG cross-channel campaign connection.');
} else {
  console.error('❌ Test 4 Failed: UPI correlation failed or was weakened.');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 5: Score 0 Verdict Wording (Absence of threats is not proof of legitimacy)
// -----------------------------------------------------------------
console.log('\n--- TEST 5: Score 0 Verdict Wording Standard ---');
const benignText = 'Hello team, the project sync is scheduled for tomorrow at 10:00 AM in Conference Room B.';
const benignReport = runDeterministicFallback(benignText, 'manual');

console.log(`Risk Score   : ${benignReport.riskScore}`);
console.log(`Risk Verdict : ${benignReport.riskVerdict}`);
console.log(`Intent       : ${benignReport.intentSummary}`);
console.log(`First Recommendation: "${benignReport.recommendedActions[0]}"`);

const verdictIsLowRisk = benignReport.riskVerdict === 'LOW_RISK';
const notSafeVerified = !JSON.stringify(benignReport).includes('SAFE / VERIFIED');
const hasProtectiveNote = benignReport.recommendedActions.some(r => r.includes('Absence of detected threats is not proof'));

if (verdictIsLowRisk && notSafeVerified && hasProtectiveNote) {
  console.log('✅ Test 5 Passed: Verdict uses LOW_RISK with explicit caveat that absence of threats is not proof of legitimacy.');
} else {
  console.error(`❌ Test 5 Failed: verdictIsLowRisk=${verdictIsLowRisk}, notSafeVerified=${notSafeVerified}, hasProtectiveNote=${hasProtectiveNote}`);
  allPassed = false;
}

// -----------------------------------------------------------------
// Final Summary
// -----------------------------------------------------------------
console.log('\n================================================================');
if (allPassed) {
  console.log('🎉 ALL REFINEMENT & REGRESSION TESTS PASSED PERFECTLY!');
  process.exit(0);
} else {
  console.error('⚠️ SOME TESTS FAILED.');
  process.exit(1);
}

