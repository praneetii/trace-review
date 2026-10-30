/**
 * TRACE - Phase 7A Critical Security & Edge-Case Verification Suite
 * 
 * Verifies:
 * 1. ZERO administrative secrets in public/app.js, extension files, or frontend assets
 * 2. Unauthenticated administrative requests strictly rejected (HTTP 403)
 * 3. Production cannot start with an insecure default or missing admin credential
 * 4. PII sanitization edge cases:
 *    - Preserves UPI IDs (even with 10/12-digit handles or bank domains)
 *    - Preserves Phone numbers (+91, standard 10-digit, toll-free 1800)
 *    - Preserves URLs & domains (even containing numbers or paths)
 *    - Preserves Indian postal PIN codes ("PIN code: 560001")
 *    - Preserves ordinary text, bill amounts, reference IDs
 *    - Strictly masks real Aadhaar, payment cards, OTPs, CVVs, passwords, and secret banking PINs
 * 5. Investigation database history preserved without data loss
 * 6. Live normal message analysis and SCAMCHAIN correlation remain 100% operational
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeMessageForStorage } from './engine/scamchain.js';
import { validateAdminConfiguration } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

async function runSecurityTests() {
  console.log('================================================================');
  console.log('🔒 TRACE Phase 7A: Critical Security & Edge-Case Verification');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ----------------------------------------------------------------
  // TEST 1: No Administrative Secrets in Frontend or Extension Code
  // ----------------------------------------------------------------
  console.log('--- TEST 1: Frontend Secret Non-Exposure ---');
  try {
    function getAllClientFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir, { withFileTypes: true });
      for (const item of list) {
        const fullPath = path.join(dir, item.name);
        if (item.isDirectory()) {
          results = results.concat(getAllClientFiles(fullPath));
        } else if (item.isFile() && (item.name.endsWith('.js') || item.name.endsWith('.html') || item.name.endsWith('.css'))) {
          results.push(fullPath);
        }
      }
      return results;
    }

    const clientFiles = [
      ...getAllClientFiles(path.join(__dirname, 'public')),
      ...getAllClientFiles(path.join(__dirname, 'extension'))
    ];

    let foundSecret = false;
    const forbiddenPatterns = [
      'trace-dev-admin',
      'ADMIN_KEY',
      'adminKey',
      'X-TRACE-ADMIN'
    ];

    // Check specifically for hardcoded keys or exposures
    for (const file of clientFiles) {
      const content = fs.readFileSync(file, 'utf8');
      
      // 1A: Strictly forbid the default dev secret string 'trace-dev-admin' anywhere in client files
      if (content.includes('trace-dev-admin')) {
        console.error(`  Forbidden secret 'trace-dev-admin' discovered in: ${file}`);
        foundSecret = true;
      }
    }
    assert(!foundSecret, 'Zero administrative secrets ("trace-dev-admin") present in public/ or extension/ files');

    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    assert(!appJs.includes('trace-dev-admin'), 'public/app.js does not contain hardcoded "trace-dev-admin"');
    assert(!appJs.includes("'X-TRACE-ADMIN': 'trace-dev-admin'"), 'public/app.js does not hardcode X-TRACE-ADMIN header value');
    assert(!appJs.includes('TRACE_ADMIN_KEY'), 'public/app.js does not request, store or reference TRACE_ADMIN_KEY');
    assert(!appJs.includes("sessionStorage.getItem('trace_admin_key')"), 'public/app.js does not store or read admin keys from session storage');
    assert(!appJs.includes('prompt('), 'public/app.js does not prompt user for admin credentials');
    assert(appJs.includes('adminControlsEnabled'), 'public/app.js conditionally handles admin controls based on backend environment');

  } catch (err) {
    assert(false, `Test 1 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 2: Administrative Endpoint Protection (Dev vs Prod Separation)
  // ----------------------------------------------------------------
  console.log('\n--- TEST 2: Administrative Endpoint Protection ---');
  try {
    const { requireAdminAuth } = await import('./server.js');
    const prevEnv = process.env.NODE_ENV;
    const prevKey = process.env.TRACE_ADMIN_KEY;

    // 2A: Production - Unauthenticated request rejected with 403
    process.env.NODE_ENV = 'production';
    process.env.TRACE_ADMIN_KEY = 'prod-secure-token-32-chars-long!';
    let prodStatus = null;
    let prodBody = null;
    requireAdminAuth(
      { headers: {} },
      { status: (code) => { prodStatus = code; return { json: (b) => { prodBody = b; } }; } },
      () => {}
    );
    assert(prodStatus === 403, `Production requireAdminAuth rejects public visitors with HTTP 403 (got ${prodStatus})`);
    assert(prodBody?.error?.includes('disabled for public visitors'), 'Reset endpoint returns explicit Forbidden error message in production');

    // 2B: Production - Bogus key rejected with 403
    let bogusStatus = null;
    requireAdminAuth(
      { headers: { 'x-trace-admin': 'attacker-invalid-key' } },
      { status: (code) => { bogusStatus = code; return { json: () => {} }; } },
      () => {}
    );
    assert(bogusStatus === 403, 'Production rejects invalid admin key with HTTP 403');

    // 2C: Development - Localhost allowed cleanly without administrative credentials
    process.env.NODE_ENV = 'development';
    let devAllowed = false;
    requireAdminAuth(
      { ip: '127.0.0.1', headers: {} },
      { status: () => ({ json: () => {} }) },
      () => { devAllowed = true; }
    );
    assert(devAllowed, 'Development permits localhost requests cleanly without credentials');

    // 2D: Development - Non-localhost IP without credentials rejected with 403
    let extStatus = null;
    requireAdminAuth(
      { ip: '203.0.113.195', headers: {} },
      { status: (code) => { extStatus = code; return { json: () => {} }; } },
      () => {}
    );
    assert(extStatus === 403, 'Development rejects unauthenticated external (non-localhost) requests with HTTP 403');

    process.env.NODE_ENV = prevEnv;
    process.env.TRACE_ADMIN_KEY = prevKey;

  } catch (err) {
    assert(false, `Test 2 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 3: Production Fail-Safe Startup & Credential Requirements
  // ----------------------------------------------------------------
  console.log('\n--- TEST 3: Production Fail-Safe Admin Configuration ---');
  try {
    // 3A: Missing TRACE_ADMIN_KEY in production must throw
    let threwMissing = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production' });
    } catch (err) {
      threwMissing = true;
      assert(err.message.includes('required and cannot be empty'), 'Throws error when TRACE_ADMIN_KEY is missing in production');
    }
    assert(threwMissing, 'Production fails to start if TRACE_ADMIN_KEY is missing');

    // 3B: Default 'trace-dev-admin' in production must throw
    let threwDefault = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production', TRACE_ADMIN_KEY: 'trace-dev-admin' });
    } catch (err) {
      threwDefault = true;
      assert(err.message.includes('cannot use default'), 'Throws error when default dev credential is used in production');
    }
    assert(threwDefault, 'Production fails to start if default dev credential is used');

    // 3C: Weak/short credential in production (< 16 chars) must throw
    let threwShort = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production', TRACE_ADMIN_KEY: 'short-key-123' });
    } catch (err) {
      threwShort = true;
      assert(err.message.includes('at least 16 characters'), 'Throws error when TRACE_ADMIN_KEY is under 16 characters in production');
    }
    assert(threwShort, 'Production fails to start with short credentials');

    // 3D: Secure credential in production (>= 16 chars) must succeed cleanly
    let threwValid = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production', TRACE_ADMIN_KEY: 'prod-super-secure-token-9843729841' });
    } catch (err) {
      threwValid = true;
    }
    assert(!threwValid, 'Production succeeds validation when a strong secret (>= 16 chars) is configured');

    // 3E: Development mode starts cleanly
    let threwDev = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'development' });
    } catch (err) {
      threwDev = true;
    }
    assert(!threwDev, 'Development mode starts cleanly without production secret requirements');

  } catch (err) {
    assert(false, `Test 3 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 4: PII Sanitization Edge Cases (Preservation vs Redaction)
  // ----------------------------------------------------------------
  console.log('\n--- TEST 4: PII Sanitization Edge-Case Rigor ---');
  try {
    // 4A: Legitimate UPI IDs preserved (must NOT be altered even if containing numbers or bank handles)
    const upiTest = `Please pay via UPI to bescom-dues@okaxis or alternate: 9876543210@paytm or 543212345678@okhdfcbank or sbi.fraud@sbi.co.in.`;
    const sanitizedUpi = sanitizeMessageForStorage(upiTest);
    assert(sanitizedUpi.includes('bescom-dues@okaxis'), 'UPI handle "bescom-dues@okaxis" strictly preserved');
    assert(sanitizedUpi.includes('9876543210@paytm'), '10-digit phone UPI "9876543210@paytm" strictly preserved');
    assert(sanitizedUpi.includes('543212345678@okhdfcbank'), '12-digit account UPI "543212345678@okhdfcbank" not corrupted by Aadhaar regex');
    assert(sanitizedUpi.includes('sbi.fraud@sbi.co.in'), 'Email address "sbi.fraud@sbi.co.in" strictly preserved');

    // 4B: Legitimate Phone Numbers preserved (must NOT be altered)
    const phoneTest = `Call 24x7 helpline: +91 9845123456 or +91-9876543210 or 9876543210 or toll-free 1800-111-2223 or 080-22221111.`;
    const sanitizedPhone = sanitizeMessageForStorage(phoneTest);
    assert(sanitizedPhone.includes('+91 9845123456'), 'Phone with "+91 " prefix strictly preserved');
    assert(sanitizedPhone.includes('+91-9876543210'), 'Phone with "+91-" prefix strictly preserved');
    assert(sanitizedPhone.includes('9876543210'), 'Standard 10-digit mobile number strictly preserved');
    assert(sanitizedPhone.includes('1800-111-2223'), 'Toll-free 1800 number strictly preserved');

    // 4C: Legitimate URLs & Domains preserved (even with numeric IDs or path components)
    const urlTest = `Visit official portal https://bescom.karnataka.gov.in/portal/54321 or check form at https://forms.gle/pin123456 or https://sbi.co.in/bill/4111222233334444.`;
    const sanitizedUrl = sanitizeMessageForStorage(urlTest);
    assert(sanitizedUrl.includes('https://bescom.karnataka.gov.in/portal/54321'), 'Official portal URL strictly preserved');
    assert(sanitizedUrl.includes('https://forms.gle/pin123456'), 'URL containing "pin" in path strictly preserved');
    assert(sanitizedUrl.includes('https://sbi.co.in/bill/4111222233334444'), 'URL containing 16 digits in path strictly preserved');

    // 4D: Indian Postal PIN codes preserved (must NOT be treated as secret banking PINs)
    const postalTest = `Our registered office is at M.G. Road, Bengaluru, PIN code: 560001. Delivery area PIN code is 560025. Postal PIN: 560095.`;
    const sanitizedPostal = sanitizeMessageForStorage(postalTest);
    assert(sanitizedPostal.includes('PIN code: 560001'), 'Indian Postal "PIN code: 560001" strictly preserved');
    assert(sanitizedPostal.includes('PIN code is 560025'), 'Indian Postal "PIN code is 560025" strictly preserved');
    assert(sanitizedPostal.includes('Postal PIN: 560095'), 'Indian Postal "Postal PIN: 560095" strictly preserved');

    // 4E: Ordinary text, amounts, reference IDs preserved
    const textTest = `Dear Consumer, your BESCOM electricity bill of Rs. 50 is due for Account #54321. Reference INV-2026-9876. Thank you.`;
    const sanitizedText = sanitizeMessageForStorage(textTest);
    assert(sanitizedText.includes('Rs. 50'), 'Bill amount "Rs. 50" strictly preserved');
    assert(sanitizedText.includes('Account #54321'), 'Account number "#54321" strictly preserved');
    assert(sanitizedText.includes('INV-2026-9876'), 'Invoice reference "INV-2026-9876" strictly preserved');

    // 4F: True sensitive credentials MUST BE REDACTED
    const sensitiveTest = `Aadhaar: 5432 1234 5678, Card: 4111 2222 3333 4444, OTP is 987654, ATM PIN: 4321, CVV: 789, password: secretPassword123.`;
    const sanitizedSensitive = sanitizeMessageForStorage(sensitiveTest);
    assert(!sanitizedSensitive.includes('5432 1234 5678'), 'Real Aadhaar number is masked');
    assert(sanitizedSensitive.includes('[REDACTED_AADHAAR]'), 'Aadhaar replaced with [REDACTED_AADHAAR]');
    assert(!sanitizedSensitive.includes('4111 2222 3333 4444'), 'Real Credit card number is masked');
    assert(sanitizedSensitive.includes('[REDACTED_CARD]'), 'Card number replaced with [REDACTED_CARD]');
    assert(!sanitizedSensitive.includes('987654'), 'Real OTP is masked');
    assert(!sanitizedSensitive.includes('4321'), 'Real ATM PIN is masked');
    assert(!sanitizedSensitive.includes('789'), 'Real CVV is masked');
    assert(!sanitizedSensitive.includes('secretPassword123'), 'Real password is masked');
    assert(sanitizedSensitive.includes('[REDACTED_SECRET]'), 'Credentials replaced with [REDACTED_SECRET]');

  } catch (err) {
    assert(false, `Test 4 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 5: Investigation History Database Integrity
  // ----------------------------------------------------------------
  console.log('\n--- TEST 5: Investigation History Preservation ---');
  try {
    const dbPath = path.join(__dirname, 'data', 'scamchain.json');
    assert(fs.existsSync(dbPath), 'data/scamchain.json exists on disk');
    const rawDb = fs.readFileSync(dbPath, 'utf8');
    const db = JSON.parse(rawDb);
    assert(Array.isArray(db.investigations), 'Database investigations array exists');
    assert(db.investigations.length > 0, `Database contains existing investigation records (${db.investigations.length} records preserved)`);
    assert(Array.isArray(db.campaigns), 'Database campaigns array exists');

    // Verify GET /api/investigations returns preserved history
    const resHistory = await fetch(`${BASE_URL}/api/investigations`);
    assert(resHistory.status === 200, 'GET /api/investigations returns HTTP 200');
    const historyData = await resHistory.json();
    assert(Array.isArray(historyData), 'History endpoint returns array of past investigations');
    assert(historyData.length === db.investigations.length, 'History API count matches stored records');

  } catch (err) {
    assert(false, `Test 5 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 6: Normal Message Analysis and SCAMCHAIN Operational
  // ----------------------------------------------------------------
  console.log('\n--- TEST 6: Normal Analysis & SCAMCHAIN Operation ---');
  try {
    const sampleMsg = `Dear customer, your BESCOM power connection will be suspended tonight. Pay Rs. 50 bill at upi: bescom-dues@okaxis or call +91-9876543210.`;
    
    // Normal analysis POST /api/analyze without admin headers must work seamlessly
    const resAnalyze = await fetch(`${BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: sampleMsg,
        source: 'manual',
        record: true
      })
    });
    assert(resAnalyze.status === 200, 'POST /api/analyze executes normally without admin headers (HTTP 200)');
    const analysisReport = await resAnalyze.json();
    assert(analysisReport.investigationId, `Investigation assigned ID: ${analysisReport.investigationId}`);
    assert(analysisReport.riskVerdict === 'HIGH_RISK', `Risk verdict identified as HIGH_RISK (got ${analysisReport.riskVerdict})`);
    assert(analysisReport.riskScore >= 60, `Risk score accurately computed: ${analysisReport.riskScore}`);
    assert(analysisReport.identifiers.upiIds.includes('bescom-dues@okaxis'), 'Technical UPI ID extracted');

    // Verify SCAMCHAIN graph API GET /api/scamchain
    const resGraph = await fetch(`${BASE_URL}/api/scamchain`);
    assert(resGraph.status === 200, 'GET /api/scamchain executes normally (HTTP 200)');
    const graphData = await resGraph.json();
    assert(Array.isArray(graphData.nodes), 'SCAMCHAIN graph nodes array returned');
    assert(Array.isArray(graphData.links), 'SCAMCHAIN graph links array returned');

  } catch (err) {
    assert(false, `Test 6 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // Final Summary
  // ----------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`Security & Regression Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runSecurityTests();

