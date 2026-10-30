/**
 * TRACE - Phase 7A Verification & Regression Test Suite
 * 
 * Verifies:
 * 1. Strict 10,000-character input limit (backend HTTP 400 + frontend validation)
 * 2. Gemini risk score fallback uses deterministic heuristic score (not arbitrary 70)
 * 3. Empty-state rendering in SCAMCHAIN visualizer when 0 investigations exist
 * 4. Administrative endpoint protection (/api/scamchain/reset and /seed)
 * 5. Configurable CORS with preservation of localhost & extension access
 * 6. Privacy-conscious PII sanitization in stored messages without losing investigation history
 * 7. Non-exposure of API keys in public/ and extension/ files
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { sanitizeMessageForStorage } from './engine/scamchain.js';
import { runDeterministicFallback } from './engine/ai_analyzer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('===============================================================');
  console.log('🧪 TRACE Phase 7A: Critical Reliability & Security Verification');
  console.log('===============================================================\n');

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

  // -------------------------------------------------------------
  // Test 1: Strict 10,000-character input limit (Backend)
  // -------------------------------------------------------------
  console.log('--- TEST 1: Strict 10,000-Character Input Limit ---');
  try {
    const validText = 'A'.repeat(500);
    const boundaryText = 'B'.repeat(10000);
    const oversizedText = 'C'.repeat(10001);

    // 1A: Valid 500 chars -> Accepted
    const resValid = await fetch(`${BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: validText })
    });
    assert(resValid.status === 200, 'POST /api/extract accepts 500 characters (HTTP 200)');

    // 1B: Exact 10,000 chars -> Accepted
    const resBoundary = await fetch(`${BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: boundaryText })
    });
    assert(resBoundary.status === 200, 'POST /api/extract accepts exactly 10,000 characters (HTTP 200)');

    // 1C: 10,001 chars on /api/extract -> Rejected with 400
    const resOverExtract = await fetch(`${BASE_URL}/api/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: oversizedText })
    });
    assert(resOverExtract.status === 400, 'POST /api/extract rejects 10,001 characters with HTTP 400');
    const extractErr = await resOverExtract.json();
    assert(extractErr.error && extractErr.error.includes('10,000'), 'Error message specifically cites the 10,000 character limit');

    // 1D: 10,001 chars on /api/analyze -> Rejected with 400
    const resOverAnalyze = await fetch(`${BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: oversizedText })
    });
    assert(resOverAnalyze.status === 400, 'POST /api/analyze rejects 10,001 characters with HTTP 400');
    const analyzeErr = await resOverAnalyze.json();
    assert(analyzeErr.error && analyzeErr.error.includes('10,000'), 'Analysis error specifically cites the 10,000 character limit');

    // 1E: Frontend maxlength attribute verified in index.html and extension popup.html
    const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
    assert(indexHtml.includes('maxlength="10000"'), 'public/index.html includes maxlength="10000" on textarea');
    assert(indexHtml.includes('char-counter'), 'public/index.html includes dynamic character counter element');

    const popupHtml = fs.readFileSync(path.join(__dirname, 'extension', 'popup.html'), 'utf8');
    assert(popupHtml.includes('maxlength="10000"'), 'extension/popup.html includes maxlength="10000" on textarea');

  } catch (err) {
    assert(false, `Test 1 failed with exception: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 2: Gemini Risk-Score Fallback (Deterministic heuristic fallback)
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Deterministic Heuristic Risk-Score Fallback ---');
  try {
    // 2A: Clean message (score should be 0, not 70)
    const cleanMsg = 'Hello team, the project meeting is scheduled for tomorrow at 10 AM. See you all there.';
    const cleanReport = runDeterministicFallback(cleanMsg);
    assert(cleanReport.riskScore === 0, `Clean message fallback score is ${cleanReport.riskScore} (expected 0, not 70)`);
    assert(cleanReport.riskVerdict === 'LOW_RISK', `Clean message fallback verdict is ${cleanReport.riskVerdict} (expected LOW_RISK)`);

    // 2B: Scam message with urgency and payment demand (score derived from heuristic weightings)
    const scamMsg = 'URGENT: Your electricity will be disconnected tonight at 9:30 PM. Pay unpaid bill of Rs 50 immediately to avoid power cut at upi: bescom-pay@okaxis';
    const scamReport = runDeterministicFallback(scamMsg);
    assert(scamReport.riskScore >= 60, `High-urgency scam fallback score is ${scamReport.riskScore} (>= 60 based on signals)`);
    assert(scamReport.riskVerdict === 'HIGH_RISK', `Scam message fallback verdict is ${scamReport.riskVerdict}`);

    // 2C: Verify ai_analyzer code does not have hardcoded default 70
    const aiAnalyzerSrc = fs.readFileSync(path.join(__dirname, 'engine', 'ai_analyzer.js'), 'utf8');
    assert(!aiAnalyzerSrc.includes(': 70'), 'engine/ai_analyzer.js no longer contains hardcoded fallback score : 70');
    assert(aiAnalyzerSrc.includes('heuristicScore'), 'engine/ai_analyzer.js derives fallback score from multilingual heuristicScore');

  } catch (err) {
    assert(false, `Test 2 failed with exception: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 3: SCAMCHAIN Graph Empty-State Verification
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: SCAMCHAIN Graph Empty-State Display ---');
  try {
    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    assert(appJs.includes('if (graphNodes.length === 0)'), 'public/app.js handles empty graphNodes state');
    assert(appJs.includes('No investigations or campaign correlations recorded yet'), 'public/app.js renders clear empty-state message on canvas');
  } catch (err) {
    assert(false, `Test 3 failed with exception: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 4: Administrative Endpoint Protection (Dev vs Prod Separation)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Administrative Endpoint Protection ---');
  try {
    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    assert(serverJs.includes('requireAdminAuth'), 'server.js implements requireAdminAuth middleware');
    assert(serverJs.includes('app.post(\'/api/scamchain/seed\', requireAdminAuth'), 'POST /api/scamchain/seed protected with requireAdminAuth');
    assert(serverJs.includes('app.post(\'/api/scamchain/reset\', requireAdminAuth'), 'POST /api/scamchain/reset protected with requireAdminAuth');

    // 4B: In production mode, public requests without valid TRACE_ADMIN_KEY return HTTP 403 Forbidden
    const { requireAdminAuth } = await import('./server.js');
    const prevEnv = process.env.NODE_ENV;
    const prevKey = process.env.TRACE_ADMIN_KEY;
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
    assert(prodBody?.error?.includes('disabled for public visitors'), 'Production error message explicitly cites disabled public access');

    // 4C: In development mode, localhost requests succeed cleanly without credentials
    process.env.NODE_ENV = 'development';
    let devAllowed = false;
    requireAdminAuth(
      { ip: '127.0.0.1', headers: {} },
      { status: () => ({ json: () => {} }) },
      () => { devAllowed = true; }
    );
    assert(devAllowed, 'Development requireAdminAuth permits local development requests cleanly');
    process.env.NODE_ENV = prevEnv;
    process.env.TRACE_ADMIN_KEY = prevKey;

    // 4D: Verify public/app.js does NOT contain or transmit administrative secrets
    assert(!appJs.includes('trace-dev-admin'), 'public/app.js does NOT include hardcoded admin credentials');
    assert(!appJs.includes('X-TRACE-ADMIN'), 'public/app.js does NOT transmit X-TRACE-ADMIN secret headers');

  } catch (err) {
    assert(false, `Test 4 failed with exception: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 5: Configurable CORS Settings
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Configurable CORS Settings ---');
  try {
    const serverJs = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
    assert(serverJs.includes('ALLOWED_ORIGINS'), 'server.js supports configurable ALLOWED_ORIGINS');
    assert(serverJs.includes('chrome-extension://'), 'server.js explicitly permits chrome-extension:// origins');
    assert(serverJs.includes('localhost'), 'server.js permits local development origins');

    // Test health endpoint OPTIONS / GET preflight
    const resHealth = await fetch(`${BASE_URL}/api/health`, {
      headers: { 'Origin': 'http://localhost:3000' }
    });
    assert(resHealth.ok, 'Localhost origin allowed through CORS on API calls');
  } catch (err) {
    assert(false, `Test 5 failed with exception: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 6: Privacy-Conscious Raw Message Storage
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Privacy-Conscious Raw Message Sanitization ---');
  try {
    const sensitiveMessage = `Dear customer, pay Rs 500 to clear BESCOM bill at upi: bescom-dues@okaxis.
My Aadhaar card is 5432 1234 5678 and credit card number is 4111 2222 3333 4444.
Your OTP is 894321 and password: secretPass123. Helpline: +91 9845123456 or visit https://bescom.karnataka.gov.in.`;

    const sanitized = sanitizeMessageForStorage(sensitiveMessage);

    // 6A: Aadhaar redacted
    assert(!sanitized.includes('5432 1234 5678'), 'Aadhaar number is masked from stored text');
    assert(sanitized.includes('[REDACTED_AADHAAR]'), 'Aadhaar replaced with [REDACTED_AADHAAR]');

    // 6B: Card redacted
    assert(!sanitized.includes('4111 2222 3333 4444'), 'Payment card number is masked from stored text');
    assert(sanitized.includes('[REDACTED_CARD]'), 'Card number replaced with [REDACTED_CARD]');

    // 6C: OTP & Password redacted
    assert(!sanitized.includes('894321'), 'OTP digits are masked from stored text');
    assert(!sanitized.includes('secretPass123'), 'Password is masked from stored text');
    assert(sanitized.includes('[REDACTED_SECRET]'), 'Sensitive secrets replaced with [REDACTED_SECRET]');

    // 6D: Essential technical investigation identifiers STRICTLY PRESERVED
    assert(sanitized.includes('bescom-dues@okaxis'), 'Technical UPI ID is preserved intact for campaign correlation');
    assert(sanitized.includes('https://bescom.karnataka.gov.in'), 'Technical URL/domain is preserved intact for correlation');
    assert(sanitized.includes('+91 9845123456'), 'Helpline phone number is preserved intact for investigation');

    // 6E: Verify data/scamchain.json is not deleted or corrupted
    const dbPath = path.join(__dirname, 'data', 'scamchain.json');
    assert(fs.existsSync(dbPath), 'data/scamchain.json exists and was NOT deleted');
    const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    assert(Array.isArray(db.investigations), 'Database investigations array is intact');
    assert(Array.isArray(db.campaigns), 'Database campaigns array is intact');

  } catch (err) {
    assert(false, `Test 6 failed with exception: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Test 7: API Key Security & Non-Exposure
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: API Key Non-Exposure in Client/Extension Code ---');
  try {
    function scanDir(dir) {
      let files = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files = files.concat(scanDir(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.html') || entry.name.endsWith('.json'))) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const publicFiles = scanDir(path.join(__dirname, 'public'));
    const extensionFiles = scanDir(path.join(__dirname, 'extension'));
    const allClientFiles = [...publicFiles, ...extensionFiles];

    let leaked = false;
    for (const f of allClientFiles) {
      const content = fs.readFileSync(f, 'utf8');
      if (content.includes('AIzaSy') || content.includes('GEMINI_API_KEY')) {
        console.error(`Leak found in ${f}`);
        leaked = true;
      }
    }
    assert(!leaked, 'No GEMINI_API_KEY or Google API keys present in public/ or extension/ code');

    // Verify .gitignore includes .env
    const gitignore = fs.readFileSync(path.join(__dirname, '.gitignore'), 'utf8');
    assert(gitignore.includes('.env'), '.gitignore properly includes .env to prevent committing secrets');

  } catch (err) {
    assert(false, `Test 7 failed with exception: ${err.message}`);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log(`Phase 7A Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('===============================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
