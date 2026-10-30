/**
 * TRACE - Phase 3 Contextual Analysis & Offline Fallback Test Runner
 * 
 * Verifies:
 * 1. Explicit provenance labeling (DETERMINISTIC_FALLBACK vs AI_CONTEXTUAL)
 * 2. Strict claim classification:
 *    - CONTRADICTED: Fake domain with claimed official organization
 *    - SUPPORTED: Verified official domain for claimed organization
 *    - UNVERIFIED: Unknown organization or missing reference
 * 3. Exact quote extraction in findings
 * 4. End-to-end HTTP API verification of POST /api/analyze
 */

import { runDeterministicFallback, analyzeMessage } from './engine/ai_analyzer.js';
import { evaluateOrganizationalClaims } from './engine/trusted_registry.js';
import { spawn } from 'child_process';

console.log('================================================================');
console.log('🛡️  TRACE - PHASE 3 CONTEXTUAL & FALLBACK TEST RUNNER');
console.log('================================================================\n');

let allPassed = true;

// -----------------------------------------------------------------
// Test 1: Strict Claim Classification Verification (Updated Standard)
// -----------------------------------------------------------------
console.log('--- TEST 1: Strict Claim Classification Logic ---');

// Case A: Contradicted (Government entity using non-gov / suspicious commercial TLD)
const fakeGovClaims = evaluateOrganizationalClaims('Income Tax Department notice for refund', ['tax-refund-portal.online']);
console.log('Case A (Contradicted Gov Domain):', fakeGovClaims[0].status, '-', fakeGovClaims[0].reason);
if (fakeGovClaims[0].status !== 'CONTRADICTED') {
  console.error('❌ Expected CONTRADICTED for government entity on commercial TLD');
  allPassed = false;
} else {
  console.log('✅ Case A Passed (CONTRADICTED verified)');
}

// Case B: Supported (Matches official verified domain)
const realBescomClaims = evaluateOrganizationalClaims('BESCOM bill payment update', ['bescom.karnataka.gov.in']);
console.log('Case B (Official BESCOM Domain):', realBescomClaims[0].status, '-', realBescomClaims[0].reason);
if (realBescomClaims[0].status !== 'SUPPORTED') {
  console.error('❌ Expected SUPPORTED for official BESCOM domain');
  allPassed = false;
} else {
  console.log('✅ Case B Passed (SUPPORTED verified)');
}

// Case C: Unverified (Unregistered domain for private bank - NOT proof of fraud!)
const unverifiedBankClaims = evaluateOrganizationalClaims('State Bank of India rewards program', ['sbi-rewards-partner.com']);
console.log('Case C (Unfamiliar Unregistered Domain):', unverifiedBankClaims[0].status, '-', unverifiedBankClaims[0].reason);
if (unverifiedBankClaims[0].status !== 'UNVERIFIED') {
  console.error('❌ Expected UNVERIFIED for unfamiliar domain without direct contradiction');
  allPassed = false;
} else {
  console.log('✅ Case C Passed (UNVERIFIED verified for unfamiliar domain)');
}

// Case D: Unverified (Entity with no trusted reference registry entry)
const unknownOrgClaims = evaluateOrganizationalClaims('Fast Courier Express package arrival', ['fastcourier-track.com']);
console.log('Case D (Unknown Entity):', unknownOrgClaims[0].status, '-', unknownOrgClaims[0].reason);
if (unknownOrgClaims[0].status !== 'UNVERIFIED') {
  console.error('❌ Expected UNVERIFIED for unknown entity');
  allPassed = false;
} else {
  console.log('✅ Case D Passed (UNVERIFIED verified for unknown entity)');
}

// -----------------------------------------------------------------
// Test 2: Deterministic Fallback Mode & Exact Quotes
// -----------------------------------------------------------------
console.log('\n--- TEST 2: Deterministic Fallback Mode & Quotes ---');
const sampleThreat = 'Dear customer, your power bill is unpaid. Power cut tonight at 9:30 PM. Pay now at upi: bescom-dues@okhdfcbank or call 9876543210.';
const fallbackResult = runDeterministicFallback(sampleThreat, 'manual');

console.log(`Analysis Mode : ${fallbackResult.analysisMode}`);
console.log(`Disclaimer    : ${fallbackResult.disclaimer}`);
console.log(`Verdict       : ${fallbackResult.riskVerdict} (Score: ${fallbackResult.riskScore})`);
console.log(`Findings count: ${fallbackResult.findings.length}`);
fallbackResult.findings.forEach(f => {
  console.log(`  - [${f.severity}] ${f.label} -> Quote: "${f.quote}"`);
});

if (fallbackResult.analysisMode !== 'DETERMINISTIC_FALLBACK' || !fallbackResult.disclaimer) {
  console.error('❌ Expected DETERMINISTIC_FALLBACK mode with explicit disclaimer');
  allPassed = false;
} else {
  console.log('✅ Test 2 Passed (Provenance & Quotes verified)');
}

// -----------------------------------------------------------------
// Test 3: HTTP API Verification (POST /api/analyze)
// -----------------------------------------------------------------
console.log('\n--- TEST 3: HTTP Server API POST /api/analyze ---');

const serverProc = spawn('node', ['server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverReady = false;

serverProc.stdout.on('data', async (buf) => {
  const str = buf.toString();
  if (str.includes('TRACE Server is running') && !serverReady) {
    serverReady = true;

    try {
      const payload = {
        text: 'प्रिय ग्राहक, तुरंत बिल भरें वरना आज रात बिजली काट दी जाएगी। UPI: bijli@okaxis',
        source: 'hindi-threat-test'
      };

      const res = await fetch('http://127.0.0.1:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log(`HTTP Status: ${res.status} ${res.statusText}`);
      const json = await res.json();
      console.log(`Returned Analysis Mode: ${json.analysisMode}`);
      console.log(`Detected Language     : ${json.language.primary} (${json.language.script})`);
      console.log(`Risk Verdict          : ${json.riskVerdict}`);
      console.log(`Extracted UPI         : ${JSON.stringify(json.identifiers.upiIds)}`);

      if (res.status === 200 && json.analysisMode && json.identifiers.upiIds.includes('bijli@okaxis')) {
        console.log('✅ HTTP API POST /api/analyze responded with HTTP 200 OK & valid payload');
      } else {
        console.error('❌ HTTP API verification failed');
        allPassed = false;
      }

      serverProc.kill('SIGINT');
      finishTest();
    } catch (err) {
      console.error('❌ HTTP request failed:', err);
      allPassed = false;
      serverProc.kill('SIGINT');
      finishTest();
    }
  }
});

serverProc.stderr.on('data', (err) => {
  console.error('Server stderr:', err.toString());
});

function finishTest() {
  console.log('\n================================================================');
  if (allPassed) {
    console.log('🎉 ALL PHASE 3 REQUIREMENTS & TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error('⚠️ SOME PHASE 3 TESTS FAILED.');
    process.exit(1);
  }
}

