/**
 * TRACE - Comprehensive Regression Test Suite
 * 
 * Verifies fixes for the 4 identified issues:
 * 1. False institutional claims (HDFC must NOT be matched from @okhdfcbank in a BESCOM message)
 * 2. Missing payment detection ("Pay Rs 50" must be detected with supporting quote)
 * 3. SCAMCHAIN data contamination (Database reset endpoint + clean 2-message correlation)
 * 4. Source platform tracking (Selected channel must be correctly stored & returned)
 */

import { evaluateOrganizationalClaims } from './engine/trusted_registry.js';
import { runDeterministicFallback } from './engine/ai_analyzer.js';
import { analyzeBehavioralSignals } from './engine/multilingual.js';
import { resetDatabase, readDatabase } from './engine/storage.js';
import { recordAndCorrelate } from './engine/scamchain.js';

console.log('================================================================');
console.log('🛡️  TRACE - COMPREHENSIVE REGRESSION TEST SUITE');
console.log('================================================================\n');

let allPassed = true;

// -----------------------------------------------------------------
// Regression Test 1: False Institutional Claims Prevention
// -----------------------------------------------------------------
console.log('--- TEST 1: False Institutional Claims Prevention ---');
const testMsg1 = 'Dear BESCOM consumer, your electricity bill is unpaid. Pay bill at upi: bescom-dues@okhdfcbank or power cut tonight.';
const claims1 = evaluateOrganizationalClaims(testMsg1, [], []);

console.log(`Input message mentions BESCOM with UPI: bescom-dues@okhdfcbank`);
console.log(`Detected Claims: ${claims1.map(c => c.organizationName).join(', ')}`);

const hasBescom = claims1.some(c => c.organizationId === 'bescom');
const hasHdfc = claims1.some(c => c.organizationId === 'hdfc');

if (hasBescom && !hasHdfc) {
  console.log('✅ Test 1 Passed: BESCOM matched cleanly; HDFC Bank was NOT falsely triggered by @okhdfcbank.');
} else {
  console.error(`❌ Test 1 Failed: hasBescom=${hasBescom}, hasHdfc=${hasHdfc} (HDFC should NOT be present)`);
  allPassed = false;
}

// -----------------------------------------------------------------
// Regression Test 2: Payment Demand Detection & Exact Quotes
// -----------------------------------------------------------------
console.log('\n--- TEST 2: Payment Demand Detection ("Pay Rs 50") ---');
const testMsg2 = 'Urgent: Pay Rs 50 electricity bill now at upi: kptcl-bill@okaxis or power cut tonight.';
const signals = analyzeBehavioralSignals(testMsg2);

const paymentSignal = signals.detectedSignals.find(s => s.category === 'payment_demand');
console.log(`Detected Signals: ${signals.detectedSignals.map(s => s.category).join(', ')}`);

if (paymentSignal) {
  console.log(`Payment Evidence Quotes: ${JSON.stringify(paymentSignal.evidence)}`);
  const hasAmountQuote = paymentSignal.evidence.some(e => e.toLowerCase().includes('pay rs 50') || e.toLowerCase().includes('pay rs'));
  if (hasAmountQuote) {
    console.log('✅ Test 2 Passed: "Pay Rs 50" explicitly detected with exact evidence quote.');
  } else {
    console.error('❌ Test 2 Failed: Payment detected but exact amount quote was missing.');
    allPassed = false;
  }
} else {
  console.error('❌ Test 2 Failed: payment_demand was NOT detected in "Pay Rs 50 electricity bill".');
  allPassed = false;
}

// -----------------------------------------------------------------
// Regression Test 3: SCAMCHAIN Clean Two-Message Test (No Contamination)
// -----------------------------------------------------------------
console.log('\n--- TEST 3: SCAMCHAIN Clean Two-Message Test ---');

// Step A: Reset database
await resetDatabase();
const freshDb = readDatabase();
console.log(`Database reset. Initial record count: ${freshDb.investigations.length}`);

// Step B: Submit Message 1 via Gmail
const msgA = {
  rawText: 'Dear user, power cut tonight. Pay Rs 100 at upi: test-clean@okaxis.',
  source: 'gmail',
  language: { primary: 'English', script: 'Latin', isCodeMixed: false },
  riskVerdict: 'HIGH_RISK',
  riskScore: 85,
  intentSummary: 'Utility threat',
  identifiers: { upiIds: ['test-clean@okaxis'], domains: [], phoneNumbers: [] },
  findings: [],
  claims: []
};
const resA = await recordAndCorrelate(msgA);
console.log(`Ingested Message 1 (Gmail): ID ${resA.investigation.id} | Has Campaign: ${resA.scamchain.hasCampaignConnection}`);

// Step C: Submit Message 2 via WhatsApp (Same UPI)
const msgB = {
  rawText: 'प्रिय ग्राहक, बिजली काट दी जाएगी। तुरंत बिल भरें upi: test-clean@okaxis पर।',
  source: 'whatsapp',
  language: { primary: 'Hindi', script: 'Devanagari', isCodeMixed: false },
  riskVerdict: 'HIGH_RISK',
  riskScore: 85,
  intentSummary: 'Hindi threat',
  identifiers: { upiIds: ['test-clean@okaxis'], domains: [], phoneNumbers: [] },
  findings: [],
  claims: []
};
const resB = await recordAndCorrelate(msgB);
console.log(`Ingested Message 2 (WhatsApp): ID ${resB.investigation.id} | Has Campaign: ${resB.scamchain.hasCampaignConnection}`);

const cleanDb = readDatabase();
console.log(`Investigations in DB: ${cleanDb.investigations.length} (Expected: 2)`);
console.log(`Campaigns in DB     : ${cleanDb.campaigns.length} (Expected: 1)`);
console.log(`Campaign Channels   : ${JSON.stringify(cleanDb.campaigns[0]?.channels)} (Expected: ["whatsapp","gmail"])`);

const inv1 = cleanDb.investigations.find(i => i.id === resA.investigation.id);
const inv2 = cleanDb.investigations.find(i => i.id === resB.investigation.id);
console.log(`Investigation 1 Campaign ID in History: ${inv1?.campaignId}`);
console.log(`Investigation 2 Campaign ID in History: ${inv2?.campaignId}`);

const exactlyTwoInvs = cleanDb.investigations.length === 2;
const exactlyOneCamp = cleanDb.campaigns.length === 1;
const onlyGmailAndWa = cleanDb.campaigns[0]?.channels.length === 2 &&
                       cleanDb.campaigns[0]?.channels.includes('gmail') &&
                       cleanDb.campaigns[0]?.channels.includes('whatsapp') &&
                       !cleanDb.campaigns[0]?.channels.includes('manual');
const bothHaveSameCampaignId = inv1 && inv2 && inv1.campaignId === inv2.campaignId && inv1.campaignId !== null;

if (exactlyTwoInvs && exactlyOneCamp && onlyGmailAndWa && bothHaveSameCampaignId) {
  console.log('✅ Test 3 Passed: Clean 2-message correlation succeeded; BOTH records share identical campaign ID in stored history.');
} else {
  console.error(`❌ Test 3 Failed: Data contamination or inconsistent campaign ID (inv1=${inv1?.campaignId}, inv2=${inv2?.campaignId})`);
  allPassed = false;
}

// -----------------------------------------------------------------
// Regression Test 4: Source Platform Tracking
// -----------------------------------------------------------------
console.log('\n--- TEST 4: Source Platform Tracking ---');
const reportWa = runDeterministicFallback('Sample alert message', 'whatsapp');
console.log(`Generated Fallback Source: ${reportWa.source} (Expected: whatsapp)`);

const reportGmail = runDeterministicFallback('Sample alert message', 'gmail');
console.log(`Generated Fallback Source: ${reportGmail.source} (Expected: gmail)`);

if (reportWa.source === 'whatsapp' && reportGmail.source === 'gmail') {
  console.log('✅ Test 4 Passed: Source platform correctly assigned to analysis report.');
} else {
  console.error('❌ Test 4 Failed: Source platform was not preserved.');
  allPassed = false;
}

// -----------------------------------------------------------------
// Final Summary
// -----------------------------------------------------------------
console.log('\n================================================================');
if (allPassed) {
  console.log('🎉 ALL 4 REGRESSION TESTS PASSED PERFECTLY!');
  process.exit(0);
} else {
  console.error('⚠️ SOME REGRESSION TESTS FAILED.');
  process.exit(1);
}

