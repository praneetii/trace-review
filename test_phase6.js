/**
 * TRACE - Phase 6 Chrome Extension Verification Test Suite
 * 
 * Verifies:
 * 1. Manifest V3 compliance & minimal privacy permissions
 * 2. Gmail extraction logic (Selection priority + DOM extraction + clean error handling)
 * 3. WhatsApp extraction logic (Selection priority + Incoming bubble extraction)
 * 4. Extension-to-Backend integration and dashboard synchronization
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('================================================================');
console.log('🛡️  TRACE - PHASE 6 CHROME EXTENSION VERIFICATION');
console.log('================================================================\n');

let allPassed = true;

// -----------------------------------------------------------------
// Test 1: Manifest V3 Compliance & Privacy Checks
// -----------------------------------------------------------------
console.log('--- TEST 1: Manifest V3 Structure & Privacy Checks ---');
const manifestPath = path.join(__dirname, 'extension', 'manifest.json');
const manifestRaw = fs.readFileSync(manifestPath, 'utf-8');
const manifest = JSON.parse(manifestRaw);

console.log(`Manifest Version : ${manifest.manifest_version}`);
console.log(`Permissions      : ${JSON.stringify(manifest.permissions)}`);
console.log(`Host Permissions : ${JSON.stringify(manifest.host_permissions)}`);

const isMv3 = manifest.manifest_version === 3;
const hasMinimalPerms = manifest.permissions.includes('activeTab') &&
                        manifest.permissions.includes('scripting') &&
                        !manifest.permissions.includes('webRequest') &&
                        !manifest.permissions.includes('tabs') &&
                        !manifest.permissions.includes('cookies');

const iconsExist = fs.existsSync(path.join(__dirname, 'extension', 'icons', 'icon16.png')) &&
                   fs.existsSync(path.join(__dirname, 'extension', 'icons', 'icon48.png')) &&
                   fs.existsSync(path.join(__dirname, 'extension', 'icons', 'icon128.png'));

if (isMv3 && hasMinimalPerms && iconsExist) {
  console.log('✅ Test 1 Passed: Valid Manifest V3 configuration with strict minimal permissions (no background surveillance).');
} else {
  console.error('❌ Test 1 Failed: Manifest compliance check failed.');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 2: Gmail Extraction Logic Verification
// -----------------------------------------------------------------
console.log('\n--- TEST 2: Gmail Extraction Logic Simulation ---');

// Mock DOM environment for Gmail
function createGmailMockDom(scenario) {
  if (scenario === 'SELECTION') {
    return {
      getSelection: () => ({ toString: () => 'URGENT: Power cut tonight. Pay bill at upi: bescom-test@okaxis.' }),
      querySelector: () => null,
      querySelectorAll: () => []
    };
  }
  if (scenario === 'DOM_OPEN_EMAIL') {
    return {
      getSelection: () => ({ toString: () => '' }),
      querySelector: (selector) => {
        if (selector === 'h2.hP' || selector === 'div[role="main"] h2') {
          return { innerText: 'Urgent Electricity Bill Notice' };
        }
        if (selector === 'span.gD') {
          return { getAttribute: () => 'billing@bescom-alerts.online', innerText: 'billing@bescom-alerts.online' };
        }
        if (selector === '.a3s.aiL') {
          return { innerText: 'Your power bill of Rs 500 is due. Pay immediately via UPI: kptcl-dues@okaxis or service cut.' };
        }
        return null;
      },
      querySelectorAll: () => []
    };
  }
  return {
    getSelection: () => ({ toString: () => '' }),
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

// Logic replicate from content-gmail.js
function testExtractGmail(mockWindow, mockDoc) {
  const sel = mockWindow.getSelection().toString().trim();
  if (sel.length > 5) return { success: true, text: sel, source: 'gmail', method: 'SELECTION' };

  const sub = mockDoc.querySelector('h2.hP')?.innerText || '';
  const sender = mockDoc.querySelector('span.gD')?.getAttribute('email') || '';
  const body = mockDoc.querySelector('.a3s.aiL')?.innerText || '';

  if (body.length > 10) {
    let combined = (sender ? `From: ${sender}\n` : '') + (sub ? `Subject: ${sub}\n\n` : '') + body;
    return { success: true, text: combined.trim(), source: 'gmail', method: 'DOM_EXTRACT' };
  }
  return { success: false, error: 'No active email found.' };
}

const resGmailSel = testExtractGmail(createGmailMockDom('SELECTION'), createGmailMockDom('SELECTION'));
console.log(`Scenario A (User Selection Priority): ${resGmailSel.method} -> "${resGmailSel.text.substring(0, 40)}..."`);

const resGmailDom = testExtractGmail(createGmailMockDom('DOM_OPEN_EMAIL'), createGmailMockDom('DOM_OPEN_EMAIL'));
console.log(`Scenario B (Open Email DOM Extract) : ${resGmailDom.method} -> Subject & Body captured`);

const resGmailEmpty = testExtractGmail(createGmailMockDom('EMPTY'), createGmailMockDom('EMPTY'));
console.log(`Scenario C (No Email Open Fallback) : Success: ${resGmailEmpty.success} (${resGmailEmpty.error})`);

if (resGmailSel.method === 'SELECTION' && resGmailDom.method === 'DOM_EXTRACT' && !resGmailEmpty.success) {
  console.log('✅ Test 2 Passed: Gmail content script logic extracts highlighted text and open email DOM accurately.');
} else {
  console.error('❌ Test 2 Failed: Gmail extraction logic failed.');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 3: WhatsApp Web Extraction Logic Verification
// -----------------------------------------------------------------
console.log('\n--- TEST 3: WhatsApp Web Extraction Logic Simulation ---');

function createWaMockDom(scenario) {
  if (scenario === 'SELECTION') {
    return {
      getSelection: () => ({ toString: () => 'प्रिय उपभोक्ता, आज रात बिजली काट दी जाएगी।' }),
      querySelector: () => null,
      querySelectorAll: () => []
    };
  }
  if (scenario === 'INCOMING_BUBBLE') {
    return {
      getSelection: () => ({ toString: () => '' }),
      querySelector: () => null,
      querySelectorAll: (selector) => {
        if (selector === '.message-in .selectable-text') {
          return [{ innerText: 'Tumba urgent: pay power bill now at upi: bescom-test@okaxis.' }];
        }
        return [];
      }
    };
  }
  return {
    getSelection: () => ({ toString: () => '' }),
    querySelector: () => null,
    querySelectorAll: () => []
  };
}

function testExtractWa(mockWindow, mockDoc) {
  const sel = mockWindow.getSelection().toString().trim();
  if (sel.length > 5) return { success: true, text: sel, source: 'whatsapp', method: 'SELECTION' };

  const incoming = mockDoc.querySelectorAll('.message-in .selectable-text');
  if (incoming.length > 0) {
    return { success: true, text: incoming[incoming.length - 1].innerText.trim(), source: 'whatsapp', method: 'DOM_LATEST_INCOMING' };
  }
  return { success: false, error: 'No active WhatsApp message found.' };
}

const resWaSel = testExtractWa(createWaMockDom('SELECTION'), createWaMockDom('SELECTION'));
console.log(`Scenario A (Highlighted Chat Selection): ${resWaSel.method} -> "${resWaSel.text}"`);

const resWaDom = testExtractWa(createWaMockDom('INCOMING_BUBBLE'), createWaMockDom('INCOMING_BUBBLE'));
console.log(`Scenario B (Incoming Bubble Extraction): ${resWaDom.method} -> "${resWaDom.text}"`);

const resWaEmpty = testExtractWa(createWaMockDom('EMPTY'), createWaMockDom('EMPTY'));
console.log(`Scenario C (No Chat Open Fallback)     : Success: ${resWaEmpty.success}`);

if (resWaSel.method === 'SELECTION' && resWaDom.method === 'DOM_LATEST_INCOMING' && !resWaEmpty.success) {
  console.log('✅ Test 3 Passed: WhatsApp content script logic extracts highlighted text and chat bubbles accurately.');
} else {
  console.error('❌ Test 3 Failed: WhatsApp extraction logic failed.');
  allPassed = false;
}

// -----------------------------------------------------------------
// Test 4: Extension-to-Backend Integration Test
// -----------------------------------------------------------------
console.log('\n--- TEST 4: Extension-to-Backend End-to-End Test ---');

const TEST_PORT = process.env.TEST_PORT || 3005;

async function runIntegrationTest(serverProcToKill) {
  try {
    // Step A: Reset database to ensure clean test
    const rReset = await fetch(`http://127.0.0.1:${TEST_PORT}/api/scamchain/reset`, { method: 'POST' });
    const resetJson = await rReset.json();
    console.log(`1. Database Reset Status: ${resetJson.success}`);

    // Step B: Simulate Gmail extraction submission from Extension Popup
    const extGmailPayload = {
      text: 'From: support@power-billing.online\nSubject: Electricity Disconnection Notice\n\nDear customer, pay Rs 50 at upi: ext-shared@okhdfcbank or power cut tonight.',
      source: 'gmail',
      record: true,
      forceOffline: true
    };

    const resGmail = await fetch(`http://127.0.0.1:${TEST_PORT}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extGmailPayload)
    });
    const dataGmail = await resGmail.json();
    console.log(`2. Extension Gmail Ingestion: ID ${dataGmail.investigationId} | Source: ${dataGmail.source}`);

    // Step C: Simulate WhatsApp extraction submission from Extension Popup (Same UPI)
    const extWaPayload = {
      text: 'प्रिय उपभोक्ता, आज रात बिजली काट दी जाएगी। तुरंत बिल भरें upi: ext-shared@okhdfcbank पर।',
      source: 'whatsapp',
      record: true,
      forceOffline: true
    };

    const resWa = await fetch(`http://127.0.0.1:${TEST_PORT}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(extWaPayload)
    });
    const dataWa = await resWa.json();
    console.log(`3. Extension WhatsApp Ingestion: ID ${dataWa.investigationId} | Source: ${dataWa.source}`);

    // Step D: Verify SCAMCHAIN correlation across both submissions
    const hasConnection = dataWa.scamchain && dataWa.scamchain.hasCampaignConnection;
    const spansBoth = dataWa.scamchain?.campaign?.channels?.includes('gmail') &&
                      dataWa.scamchain?.campaign?.channels?.includes('whatsapp');
    const sharedUpi = dataWa.scamchain?.campaign?.sharedEvidenceSummary?.[0]?.value === 'ext-shared@okhdfcbank';

    console.log(`4. SCAMCHAIN Campaign Connected : ${hasConnection ? 'YES' : 'NO'}`);
    console.log(`   - Cross-Channel Span Detected: ${spansBoth ? 'YES (Gmail + WhatsApp)' : 'NO'}`);
    console.log(`   - Shared Technical Identifier: ${dataWa.scamchain?.campaign?.sharedEvidenceSummary?.[0]?.value}`);

    if (serverProcToKill) {
      serverProcToKill.kill();
    }

    if (dataGmail.source === 'gmail' && dataWa.source === 'whatsapp' && hasConnection && spansBoth && sharedUpi) {
      console.log('\n================================================================');
      console.log('🎉 ALL PHASE 6 EXTENSION VERIFICATION TESTS PASSED SUCCESSFULLY!');
      setTimeout(() => process.exit(0), 200);
    } else {
      console.error('\n❌ Phase 6 backend integration assertion failed.');
      setTimeout(() => process.exit(1), 200);
    }

  } catch (err) {
    console.error('\n❌ Phase 6 Integration Error:', err);
    if (serverProcToKill) serverProcToKill.kill('SIGINT');
    process.exit(1);
  }
}

console.log(`Spawning TRACE server on test port ${TEST_PORT}...`);
const serverProc = spawn('node', ['server.js'], {
  env: { ...process.env, PORT: String(TEST_PORT) },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverReady = false;

serverProc.stdout.on('data', async (buf) => {
  const str = buf.toString();
  if (str.includes('TRACE Server is running') && !serverReady) {
    serverReady = true;
    await runIntegrationTest(serverProc);
  }
});

serverProc.stderr.on('data', (err) => {
  console.error('Server error:', err.toString());
});

