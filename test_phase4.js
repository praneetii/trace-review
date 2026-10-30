/**
 * TRACE - Phase 4 SCAMCHAIN Correlation & Safe Storage Test Suite
 * 
 * Verifies:
 * 1. Safe concurrent file writes (no file corruption or race conditions)
 * 2. Cross-Channel Campaign Detection (Gmail in English + WhatsApp in Hindi linked by UPI)
 * 3. Strong vs Weak Evidence distinction (Similar wording alone NEVER creates campaign link)
 * 4. Graph structure generation for visualization
 */

import { resetDatabase, readDatabase, writeDatabase, updateDatabase } from './engine/storage.js';
import { recordAndCorrelate, getScamChainGraph } from './engine/scamchain.js';
import { runDeterministicFallback } from './engine/ai_analyzer.js';

console.log('================================================================');
console.log('🛡️  TRACE - PHASE 4 SCAMCHAIN CORRELATION & STORAGE TEST');
console.log('================================================================\n');

let allPassed = true;

// Reset database for a clean test run
await resetDatabase();

// -----------------------------------------------------------------
// Test 1: Safe Concurrent File Writes (Concurrency Stress Test)
// -----------------------------------------------------------------
console.log('--- TEST 1: Safe Concurrent Writes (Queue & Atomic Rename) ---');

const concurrentOps = [];
for (let i = 1; i <= 10; i++) {
  concurrentOps.push(
    updateDatabase((current) => {
      current.investigations.push({
        id: `INV-CONCURRENCY-${i}`,
        source: 'manual',
        timestamp: new Date().toISOString()
      });
      return current;
    })
  );
}

await Promise.all(concurrentOps);

const verifiedDb = readDatabase();
console.log(`Concurrent writes completed. Total records saved: ${verifiedDb.investigations.length}`);

if (verifiedDb.investigations.length === 10) {
  console.log('✅ Test 1 Passed: 10 concurrent writes completed without corruption or data loss.');
} else {
  console.error(`❌ Test 1 Failed: Expected 10 records, got ${verifiedDb.investigations.length}`);
  allPassed = false;
}

// Reset database for correlation tests
await resetDatabase();

// -----------------------------------------------------------------
// Test 2: Cross-Channel Campaign Correlation (Gmail + WhatsApp)
// -----------------------------------------------------------------
console.log('\n--- TEST 2: Cross-Channel Campaign Correlation ---');

// Channel 1: Gmail in English
const gmailMessage = `Dear BESCOM customer, your electricity bill of Rs 450 is unpaid. Power cut tonight at 9:30 PM. Pay immediately via UPI: kptcl-support@okaxis or electricity disconnected.`;
const gmailReport = runDeterministicFallback(gmailMessage, 'gmail');
gmailReport.rawText = gmailMessage;

const res1 = await recordAndCorrelate(gmailReport);
console.log(`Ingested Message 1 (Gmail / English): ID ${res1.investigation.id}`);
console.log(`Has Campaign Link: ${res1.scamchain.hasCampaignConnection ? 'YES' : 'NO (First occurrence)'}`);

// Channel 2: WhatsApp in Hindi (Same UPI ID!)
const waMessage = `प्रिय उपभोक्ता, आज रात 9:30 बजे आपकी बिजली काट दी जाएगी। तुरंत बिल का भुगतान करें UPI: kptcl-support@okaxis पर या कॉल करें।`;
const waReport = runDeterministicFallback(waMessage, 'whatsapp');
waReport.rawText = waMessage;

const res2 = await recordAndCorrelate(waReport);
console.log(`\nIngested Message 2 (WhatsApp / Hindi): ID ${res2.investigation.id}`);
console.log(`Has Campaign Link: ${res2.scamchain.hasCampaignConnection ? 'YES' : 'NO'}`);

if (res2.scamchain.hasCampaignConnection) {
  const match = res2.scamchain.connections[0];
  console.log(`Connected to Target : ${match.targetInvestigationId} (Source: ${match.targetSource})`);
  console.log(`Connection Strength: ${match.connectionStrength}`);
  console.log(`Shared Evidence    : ${match.sharedEvidence[0].type} = ${match.sharedEvidence[0].value}`);
  console.log(`Campaign Channels  : ${JSON.stringify(res2.scamchain.campaign.channels)}`);

  const hasStrong = match.connectionStrength === 'STRONG';
  const sharedUpi = match.sharedEvidence[0].value === 'kptcl-support@okaxis';
  const spansBoth = res2.scamchain.campaign.channels.includes('gmail') && res2.scamchain.campaign.channels.includes('whatsapp');

  if (hasStrong && sharedUpi && spansBoth) {
    console.log('✅ Test 2 Passed: Cross-channel correlation successfully forged between Gmail and WhatsApp via shared UPI!');
  } else {
    console.error('❌ Test 2 Failed: Campaign connection properties did not match');
    allPassed = false;
  }
} else {
  console.error('❌ Test 2 Failed: Did not detect connection between Message 1 and Message 2');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 3: Distinguishing Strong vs Weak Evidence
// -----------------------------------------------------------------
console.log('\n--- TEST 3: Strong vs Weak Evidence Standard ---');

// Message 3: Shares similar scam wording ("power cut tonight", "pay bill"), but has a totally DIFFERENT UPI
const unrelatedMessage = `Urgent alert: Electricity power cut tonight. Please pay your pending bill now at upi: independent-vendor@paytm.`;
const unrelatedReport = runDeterministicFallback(unrelatedMessage, 'whatsapp');
unrelatedReport.rawText = unrelatedMessage;

const res3 = await recordAndCorrelate(unrelatedReport);
console.log(`Ingested Message 3 (Similar wording, completely different UPI): ID ${res3.investigation.id}`);
console.log(`Assigned to Previous Campaign: ${res3.investigation.campaignId === res2.investigation.campaignId ? 'YES' : 'NO'}`);

if (res3.investigation.campaignId !== res2.investigation.campaignId) {
  console.log('✅ Test 3 Passed: Similar wording alone was NOT treated as proof of campaign linkage.');
} else {
  console.error('❌ Test 3 Failed: Similar wording falsely merged into campaign cluster!');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 4: SCAMCHAIN Graph Generation for Visualization
// -----------------------------------------------------------------
console.log('\n--- TEST 4: SCAMCHAIN Graph Generation ---');
const graph = getScamChainGraph();
console.log(`Graph Nodes Count : ${graph.nodes.length}`);
console.log(`Graph Links Count : ${graph.links.length}`);
console.log(`Total Campaigns   : ${graph.totalCampaigns}`);

const hasInvestigationNodes = graph.nodes.some(n => n.group === 'investigation');
const hasEvidenceNodes = graph.nodes.some(n => n.group === 'evidence_upi');
const hasStrongLinks = graph.links.some(l => l.strength === 'STRONG');

if (hasInvestigationNodes && hasEvidenceNodes && hasStrongLinks) {
  console.log('✅ Test 4 Passed: SCAMCHAIN graph data correctly generated for web visualizer.');
} else {
  console.error('❌ Test 4 Failed: Incomplete graph structure');
  allPassed = false;
}

console.log('\n================================================================');
if (allPassed) {
  console.log('🎉 ALL PHASE 4 REQUIREMENTS & TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
} else {
  console.error('⚠️ SOME PHASE 4 TESTS FAILED.');
  process.exit(1);
}
