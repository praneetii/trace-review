/**
 * TRACE - Development vs Production Behavior Regression Test Suite
 * 
 * Verifies all 6 requirements specified for the production environment:
 * 1. Public dashboard's Reset Database and Seed Demo Data controls are disabled/hidden in production
 * 2. Production frontend does NOT request, store, or transmit TRACE_ADMIN_KEY
 * 3. Reset and seed endpoints remain unavailable to ordinary public visitors in production (HTTP 403)
 * 4. Existing administrative functionality remains available in local development
 * 5. Production server fails safely if its required security configuration is missing
 * 6. Ordinary message analysis, investigation history, and SCAMCHAIN graph continue working without administrative credentials
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateAdminConfiguration, requireAdminAuth } from './server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

async function runDevProdTests() {
  console.log('================================================================');
  console.log('⚖️  TRACE: Development vs Production Behavior Regression Suite');
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
  // REQUIREMENT 1: Public Dashboard Controls in Production
  // ----------------------------------------------------------------
  console.log('--- 1. Dashboard Controls Disabled in Production ---');
  try {
    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

    // 1A: Check public/index.html wraps admin buttons in dedicated control group
    assert(indexHtml.includes('id="admin-controls-group"'), 'public/index.html groups admin buttons in #admin-controls-group');
    assert(indexHtml.includes('id="reset-db-btn"'), 'Reset Database button exists inside control group');
    assert(indexHtml.includes('id="seed-demo-btn"'), 'Seed Demo Campaigns button exists inside control group');

    // 1B: Check public/app.js hides the controls when adminControlsEnabled is false or environment is production
    assert(appJs.includes("adminGroup.style.display = 'none'"), 'public/app.js hides #admin-controls-group when disabled in production');
    assert(appJs.includes("data.adminControlsEnabled === false || data.environment === 'production'"), 'public/app.js explicitly evaluates production mode to hide controls');

    // 1C: Health endpoint accurately reports environment & control status
    const resHealth = await fetch(`${BASE_URL}/api/health`);
    assert(resHealth.status === 200, 'GET /api/health responds with HTTP 200');
    const healthData = await resHealth.json();
    assert(typeof healthData.environment === 'string', `Health endpoint reports environment: "${healthData.environment}"`);
    assert(typeof healthData.adminControlsEnabled === 'boolean', `Health endpoint reports adminControlsEnabled: ${healthData.adminControlsEnabled}`);

  } catch (err) {
    assert(false, `Requirement 1 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // REQUIREMENT 2: Production Frontend Does NOT Request, Store, or Transmit TRACE_ADMIN_KEY
  // ----------------------------------------------------------------
  console.log('\n--- 2. Frontend Does NOT Request, Store, or Transmit TRACE_ADMIN_KEY ---');
  try {
    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    const popupJs = fs.readFileSync(path.join(__dirname, 'extension', 'popup.js'), 'utf8');

    // 2A: Never references TRACE_ADMIN_KEY variable
    assert(!appJs.includes('TRACE_ADMIN_KEY'), 'public/app.js does not contain TRACE_ADMIN_KEY variable');
    assert(!popupJs.includes('TRACE_ADMIN_KEY'), 'extension/popup.js does not contain TRACE_ADMIN_KEY variable');

    // 2B: Never prompts user for admin credentials
    assert(!appJs.includes('prompt('), 'public/app.js does not prompt user for admin credentials');

    // 2C: Never stores credentials in sessionStorage or localStorage
    assert(!appJs.includes('sessionStorage'), 'public/app.js does not store admin credentials in sessionStorage');
    assert(!appJs.includes('localStorage'), 'public/app.js does not store admin credentials in localStorage');

    // 2D: Never transmits hardcoded secrets or X-TRACE-ADMIN headers
    assert(!appJs.includes('trace-dev-admin'), 'public/app.js does not contain hardcoded default admin secrets');
    assert(!appJs.includes('X-TRACE-ADMIN'), 'public/app.js does not transmit X-TRACE-ADMIN secret headers');

  } catch (err) {
    assert(false, `Requirement 2 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // REQUIREMENT 3: Reset and Seed Endpoints Unavailable to Public Visitors in Production
  // ----------------------------------------------------------------
  console.log('\n--- 3. Reset & Seed Endpoints Unavailable to Public Visitors in Production ---');
  try {
    const prevEnv = process.env.NODE_ENV;
    const prevKey = process.env.TRACE_ADMIN_KEY;

    process.env.NODE_ENV = 'production';
    process.env.TRACE_ADMIN_KEY = 'production-secret-token-32chars!';

    // 3A: Public visitor without key rejected with 403 Forbidden
    let unauthStatus = null;
    let unauthBody = null;
    requireAdminAuth(
      { headers: {}, query: {} },
      { status: (code) => { unauthStatus = code; return { json: (b) => { unauthBody = b; } }; } },
      () => {}
    );
    assert(unauthStatus === 403, `Production blocks unauthenticated public visitor with HTTP 403 (got ${unauthStatus})`);
    assert(unauthBody?.error?.includes('disabled for public visitors in production'), 'Explicit message: Administrative endpoints are disabled for public visitors in production');

    // 3B: Public visitor with arbitrary/bogus key rejected with 403 Forbidden
    let bogusStatus = null;
    requireAdminAuth(
      { headers: { 'x-trace-admin': 'random-public-visitor-token' }, query: {} },
      { status: (code) => { bogusStatus = code; return { json: () => {} }; } },
      () => {}
    );
    assert(bogusStatus === 403, 'Production blocks visitor with invalid admin key with HTTP 403');

    // 3C: Authorized administrative call with exact production key succeeds
    let authCalledNext = false;
    requireAdminAuth(
      { headers: { 'x-trace-admin': 'production-secret-token-32chars!' }, query: {} },
      { status: () => ({ json: () => {} }) },
      () => { authCalledNext = true; }
    );
    assert(authCalledNext, 'Authorized system administrator with valid production key is permitted');

    process.env.NODE_ENV = prevEnv;
    process.env.TRACE_ADMIN_KEY = prevKey;

  } catch (err) {
    assert(false, `Requirement 3 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // REQUIREMENT 4: Administrative Functionality Available in Local Development
  // ----------------------------------------------------------------
  console.log('\n--- 4. Administrative Functionality Available in Local Development ---');
  try {
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    // 4A: Localhost request without credentials permitted cleanly
    let devLocalhostAllowed = false;
    requireAdminAuth(
      { ip: '127.0.0.1', headers: {}, query: {} },
      { status: () => ({ json: () => {} }) },
      () => { devLocalhostAllowed = true; }
    );
    assert(devLocalhostAllowed, 'Local development permits localhost (127.0.0.1) administrative actions cleanly');

    // 4B: IPv6 loopback (::1) permitted cleanly
    let devLoopbackAllowed = false;
    requireAdminAuth(
      { ip: '::1', headers: {}, query: {} },
      { status: () => ({ json: () => {} }) },
      () => { devLoopbackAllowed = true; }
    );
    assert(devLoopbackAllowed, 'Local development permits IPv6 loopback (::1) administrative actions cleanly');

    // 4C: Non-localhost external IP rejected in dev if no credentials provided
    let devExternalBlocked = false;
    requireAdminAuth(
      { ip: '198.51.100.25', headers: {}, query: {} },
      { status: (code) => { if (code === 403) devExternalBlocked = true; return { json: () => {} }; } },
      () => {}
    );
    assert(devExternalBlocked, 'Local development blocks non-localhost unauthenticated IPs (HTTP 403)');

    process.env.NODE_ENV = prevEnv;

    // 4D: Live development call to POST /api/scamchain/seed works cleanly on localhost
    const resLiveSeed = await fetch(`${BASE_URL}/api/scamchain/seed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert(resLiveSeed.status === 200, `Live local server permits seed on localhost (HTTP ${resLiveSeed.status})`);
    const seedResult = await resLiveSeed.json();
    assert(seedResult && (seedResult.seeded !== undefined || seedResult.message), 'Demo campaigns endpoint executed successfully in local development');

  } catch (err) {
    assert(false, `Requirement 4 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // REQUIREMENT 5: Production Server Fails Safely if Required Configuration is Missing
  // ----------------------------------------------------------------
  console.log('\n--- 5. Production Server Fail-Safe Security Validation ---');
  try {
    // 5A: Fails safely when TRACE_ADMIN_KEY is undefined in production
    let threwUndef = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production' });
    } catch (err) {
      threwUndef = true;
      assert(err.message.includes('required and cannot be empty'), 'Fails safely when TRACE_ADMIN_KEY is undefined');
    }
    assert(threwUndef, 'Server refuses to start in production without TRACE_ADMIN_KEY');

    // 5B: Fails safely when TRACE_ADMIN_KEY is empty in production
    let threwEmpty = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production', TRACE_ADMIN_KEY: '   ' });
    } catch (err) {
      threwEmpty = true;
      assert(err.message.includes('required and cannot be empty'), 'Fails safely when TRACE_ADMIN_KEY is empty');
    }
    assert(threwEmpty, 'Server refuses to start in production with empty TRACE_ADMIN_KEY');

    // 5C: Fails safely when default dev credential ('trace-dev-admin') is used in production
    let threwDevSecret = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production', TRACE_ADMIN_KEY: 'trace-dev-admin' });
    } catch (err) {
      threwDevSecret = true;
      assert(err.message.includes('cannot use default/predictable credentials'), 'Fails safely when default dev secret is used');
    }
    assert(threwDevSecret, 'Server refuses to start in production with default dev credentials');

    // 5D: Fails safely when key is shorter than 16 characters in production
    let threwShortKey = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production', TRACE_ADMIN_KEY: 'too-short-key' });
    } catch (err) {
      threwShortKey = true;
      assert(err.message.includes('at least 16 characters'), 'Fails safely when key is under 16 characters');
    }
    assert(threwShortKey, 'Server refuses to start in production with short credentials');

    // 5E: Succeeds cleanly when a strong secret (>= 16 chars) is configured
    let threwStrong = false;
    try {
      validateAdminConfiguration({ NODE_ENV: 'production', TRACE_ADMIN_KEY: 'prod-secure-token-32-chars-length!' });
    } catch (err) {
      threwStrong = true;
    }
    assert(!threwStrong, 'Server starts cleanly in production with secure, strong credentials (>= 16 chars)');

  } catch (err) {
    assert(false, `Requirement 5 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // REQUIREMENT 6: Ordinary Analysis, History, and SCAMCHAIN Operate Without Credentials
  // ----------------------------------------------------------------
  console.log('\n--- 6. Normal Operations Continue Working Without Administrative Credentials ---');
  try {
    const testMessage = `URGENT: BESCOM electricity will be disconnected at 9:30 PM. Pay Rs 50 bill dues now at upi: bescom-dues@okaxis or visit https://bescom.karnataka.gov.in.`;

    // 6A: Message Analysis (POST /api/analyze) requires NO administrative credentials
    const resAnalyze = await fetch(`${BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: testMessage,
        source: 'manual',
        record: true
      })
    });
    assert(resAnalyze.status === 200, 'POST /api/analyze requires NO admin credentials (HTTP 200)');
    const analysisData = await resAnalyze.json();
    assert(analysisData.investigationId, `Investigation successfully created with ID: ${analysisData.investigationId}`);
    assert(analysisData.riskVerdict === 'HIGH_RISK', `Verdict correctly computed: ${analysisData.riskVerdict}`);
    assert(analysisData.riskScore >= 60, `Risk score computed: ${analysisData.riskScore}`);

    // 6B: Investigation History (GET /api/investigations) requires NO administrative credentials
    const resHistory = await fetch(`${BASE_URL}/api/investigations`);
    assert(resHistory.status === 200, 'GET /api/investigations requires NO admin credentials (HTTP 200)');
    const historyData = await resHistory.json();
    assert(Array.isArray(historyData), 'Investigation history array returned');
    assert(historyData.length > 0, `History contains ${historyData.length} preserved investigations`);

    // 6C: Single Investigation Inspection (GET /api/investigations/:id) requires NO administrative credentials
    const latestId = historyData[0].id;
    const resSingle = await fetch(`${BASE_URL}/api/investigations/${latestId}`);
    assert(resSingle.status === 200, `GET /api/investigations/${latestId} requires NO admin credentials (HTTP 200)`);
    const singleData = await resSingle.json();
    assert(singleData.id === latestId, 'Fetched investigation matches requested ID');

    // 6D: SCAMCHAIN Graph Data (GET /api/scamchain) requires NO administrative credentials
    const resGraph = await fetch(`${BASE_URL}/api/scamchain`);
    assert(resGraph.status === 200, 'GET /api/scamchain requires NO admin credentials (HTTP 200)');
    const graphData = await resGraph.json();
    assert(Array.isArray(graphData.nodes), 'SCAMCHAIN graph nodes returned');
    assert(Array.isArray(graphData.links), 'SCAMCHAIN graph links returned');
    assert(graphData.nodes.length > 0, `Graph contains ${graphData.nodes.length} nodes (investigations + shared technical evidence)`);

  } catch (err) {
    assert(false, `Requirement 6 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`Dev vs Prod Behavior Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runDevProdTests();
