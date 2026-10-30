/**
 * TRACE - Phase 7B Regression Test Suite
 * 
 * Verifies all 3 Phase 7B Improvements:
 * 1. Incident Report Export:
 *    - Valid standalone HTML report with print styles
 *    - Contains ID, timestamp, verdict, score, source channel, original text
 *    - Contains technical identifiers, claims verification status, and behavioral quotes
 *    - Contains associated campaign linkages and shared evidence
 *    - Contains explicit limitation notice regarding technical attribution vs criminal ownership
 * 2. Campaign Timeline:
 *    - Chronological sequencing of linked investigations across platforms
 *    - Accurate channel, timestamp, and verdict indicators
 *    - Accurate evidence strength indicators (STRONG, MODERATE, WEAK)
 *    - Explicit disclaimer that chronological proximity alone does not establish connection
 * 3. Judge Demo Flow:
 *    - 4-step guided progression (Initial Email -> WhatsApp Urgency -> Payment Demand -> SCAMCHAIN Linkage)
 *    - Accurate educational explanations of cross-channel evasion
 *    - Clear attribution boundary distinctions
 * 4. Zero regression on normal analysis, storage integrity, and SCAMCHAIN graph
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateIncidentReportHtml } from './engine/report_generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

async function runPhase7BTests() {
  console.log('================================================================');
  console.log('🚀 TRACE Phase 7B: Incident Export, Timeline & Judge Demo Suite');
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
  // TEST 1: Incident Report Export
  // ----------------------------------------------------------------
  console.log('--- TEST 1: Incident Report Export ---');
  try {
    // 1A: Query recent investigations from storage
    const resInvs = await fetch(`${BASE_URL}/api/investigations`);
    assert(resInvs.status === 200, 'GET /api/investigations returns HTTP 200');
    const invs = await resInvs.json();
    assert(Array.isArray(invs) && invs.length > 0, `Database contains ${invs.length} investigations available for export`);

    const targetInv = invs[0];

    // 1B: Fetch exported HTML report via API endpoint
    const resExport = await fetch(`${BASE_URL}/api/investigations/${targetInv.id}/export`);
    assert(resExport.status === 200, `GET /api/investigations/${targetInv.id}/export returns HTTP 200`);
    assert(resExport.headers.get('content-type')?.includes('text/html'), 'Export endpoint returns Content-Type text/html');

    const html = await resExport.text();

    // 1C: Verify required report content fields
    assert(html.includes(targetInv.id), 'Report contains Investigation ID');
    assert(html.includes('TRACE Incident Report'), 'Report contains authoritative TRACE header');
    assert(html.includes('Defensive Threat Intelligence'), 'Report contains Defensive Threat Intelligence header');
    assert(html.includes(targetInv.riskVerdict), 'Report contains Risk Verdict');
    assert(html.includes(String(targetInv.riskScore)), 'Report contains Threat Score');
    assert(html.includes((targetInv.source || 'manual').toUpperCase()), 'Report contains Ingestion Channel');
    assert(html.includes('Extracted Technical Identifiers'), 'Report contains Technical Identifiers section');
    assert(html.includes('Institutional Claims &amp; Registry Verification') || html.includes('Institutional Claims & Registry Verification'), 'Report contains Institutional Claims verification section');
    assert(html.includes('Cross-Channel Campaign Correlation (SCAMCHAIN)'), 'Report contains SCAMCHAIN correlation section');

    // 1D: Verify Important Limitations Disclaimer
    assert(html.includes('IMPORTANT DEFENSIVE CYBERSECURITY NOTICE'), 'Report contains prominent cybersecurity notice banner');
    assert(html.includes('not proof of common criminal ownership') || html.includes('not constitute proof of common criminal ownership'), 'Report strictly disclaims criminal ownership / attribution');

    // 1E: Verify Download Header
    const resDownload = await fetch(`${BASE_URL}/api/investigations/${targetInv.id}/export?download=true`);
    assert(resDownload.headers.get('content-disposition')?.includes('attachment'), 'Export supports download=true attachment disposition');

    // 1F: Verify standalone unit generation via report_generator.js
    const sampleRecord = {
      id: 'INV-TEST-UNIT-01',
      timestamp: new Date().toISOString(),
      source: 'whatsapp',
      riskVerdict: 'HIGH_RISK',
      riskScore: 90,
      analysisMode: 'DETERMINISTIC_FALLBACK',
      rawText: 'Pay Rs 50 electricity bill now at upi: bescom-dues@okhdfcbank or power disconnected.',
      identifiers: {
        upiIds: ['bescom-dues@okhdfcbank'],
        domains: ['bescom.karnataka.gov.in'],
        phoneNumbers: ['+91 9845123456'],
        emails: []
      },
      claims: [{
        organizationName: 'Bangalore Electricity Supply Company (BESCOM)',
        status: 'CONTRADICTED',
        reason: 'Personal UPI handle contradicts official billing records.'
      }],
      findings: [{
        category: 'payment_demand',
        severity: 'HIGH',
        quote: 'Pay Rs 50 electricity bill now',
        explanation: 'Coercive unverified payment demand.'
      }],
      recommendedActions: ['Verify with official utility via 1912.'],
      campaignId: 'CAMP-TEST-01'
    };

    const mockDb = {
      campaigns: [{
        id: 'CAMP-TEST-01',
        title: 'Coordinated BESCOM Bait',
        channels: ['gmail', 'whatsapp'],
        investigationIds: ['INV-TEST-UNIT-01', 'INV-TEST-UNIT-02'],
        sharedEvidenceSummary: [{ type: 'UPI_PAYMENT_HANDLE', value: 'bescom-dues@okhdfcbank', strength: 'STRONG' }]
      }],
      investigations: [
        sampleRecord,
        { id: 'INV-TEST-UNIT-02', source: 'gmail', riskVerdict: 'HIGH_RISK', riskScore: 85, timestamp: new Date().toISOString() }
      ]
    };

    const unitHtml = generateIncidentReportHtml(sampleRecord, mockDb);
    assert(unitHtml.includes('INV-TEST-UNIT-01'), 'Unit generator renders record ID');
    assert(unitHtml.includes('bescom-dues@okhdfcbank'), 'Unit generator renders shared UPI handle');
    assert(unitHtml.includes('CAMP-TEST-01'), 'Unit generator renders linked campaign ID');
    assert(unitHtml.includes('INV-TEST-UNIT-02'), 'Unit generator renders linked investigation partner');
    assert(unitHtml.includes('CONTRADICTED'), 'Unit generator renders claims status');

  } catch (err) {
    assert(false, `Test 1 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 2: Campaign Chronological Timeline
  // ----------------------------------------------------------------
  console.log('\n--- TEST 2: Campaign Timeline Verification ---');
  try {
    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

    // 2A: Check HTML structure contains timeline container and badge
    assert(indexHtml.includes('id="campaign-timeline-section"'), 'public/index.html includes #campaign-timeline-section');
    assert(indexHtml.includes('id="timeline-container"'), 'public/index.html includes #timeline-container');
    assert(indexHtml.includes('id="timeline-events-badge"'), 'public/index.html includes #timeline-events-badge');

    // 2B: Check public/app.js implements renderCampaignTimeline
    assert(appJs.includes('function renderCampaignTimeline'), 'public/app.js implements renderCampaignTimeline');
    assert(appJs.includes('renderCampaignTimeline(currentGraphData)'), 'loadScamChainGraph calls renderCampaignTimeline');

    // 2C: Check evidence strength classification in timeline logic
    assert(appJs.includes("l.strength === 'STRONG'"), 'Timeline logic differentiates STRONG evidence');
    assert(appJs.includes('evidence-badge'), 'Timeline renders evidence badge classes');
    assert(appJs.includes('STRONG:'), 'Timeline displays STRONG evidence indicators');
    assert(appJs.includes('MODERATE:'), 'Timeline displays MODERATE evidence indicators');

    // 2D: Check attribution boundary notice in timeline
    assert(appJs.includes('not chronological proximity') || appJs.includes('not proof of common criminal ownership'), 'Timeline explicitly notes that chronological proximity alone does not prove connection');

    // 2E: Live SCAMCHAIN graph endpoint contains valid nodes and links for timeline
    const resGraph = await fetch(`${BASE_URL}/api/scamchain`);
    assert(resGraph.status === 200, 'GET /api/scamchain returns HTTP 200');
    const graphData = await resGraph.json();
    assert(Array.isArray(graphData.nodes), 'SCAMCHAIN graph nodes array present');
    assert(Array.isArray(graphData.links), 'SCAMCHAIN graph links array present');

  } catch (err) {
    assert(false, `Test 2 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 3: Investigation-First Dashboard & Demo Removal Verification
  // ----------------------------------------------------------------
  console.log('\n--- TEST 3: Investigation-First Dashboard & Clean UI Verification ---');
  try {
    const appJs = fs.readFileSync(path.join(__dirname, 'public', 'app.js'), 'utf8');
    const indexHtml = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');

    // 3A: Check Judge Demo card and stepper pills completely removed
    assert(!indexHtml.includes('id="judge-demo-section"'), 'public/index.html strictly does NOT contain #judge-demo-section');
    assert(!indexHtml.includes('id="judge-demo-body"'), 'public/index.html strictly does NOT contain #judge-demo-body');
    assert(!indexHtml.includes('demo-step-pills'), 'public/index.html strictly does NOT contain demo-step-pills');
    assert(!indexHtml.includes('HACKATHON JUDGE DEMO'), 'Card strictly does NOT contain HACKATHON JUDGE DEMO branding');
    assert(!indexHtml.includes('24h DEFENSIVE CYBERSECURITY HACKATHON'), 'Hero strictly does NOT contain hackathon label');

    // 3B: Check public/app.js removed demo progression and state
    assert(!appJs.includes('JUDGE_DEMO_STEPS'), 'public/app.js strictly does NOT define JUDGE_DEMO_STEPS sequence');
    assert(!appJs.includes('initJudgeDemo'), 'public/app.js strictly does NOT implement or call initJudgeDemo');
    assert(!appJs.includes('runJudgeDemoStep'), 'public/app.js strictly does NOT implement runJudgeDemoStep');
    assert(!appJs.includes('renderJudgeDemoStep'), 'public/app.js strictly does NOT implement renderJudgeDemoStep');

    // 3C: Check clean investigation-first UI components are prioritized
    assert(indexHtml.includes('id="message-input"'), 'Dashboard prioritizes empty #message-input');
    assert(indexHtml.includes('id="analyze-btn"'), 'Dashboard prioritizes #analyze-btn');
    assert(indexHtml.includes('Optional Test Messages:'), 'Optional test messages separated cleanly from normal flow');
    assert(indexHtml.includes('id="scamchain-canvas"'), 'SCAMCHAIN explorer canvas present');
    assert(indexHtml.includes('id="campaign-timeline-section"'), 'Campaign timeline preserved as supporting investigation feature');

    // 3D: Verification of Consistency Cleanup
    assert(!indexHtml.includes('demo sample') && !indexHtml.includes('demo workflow'), 'Empty state has zero stale demo sample or demo workflow references');
    assert(indexHtml.includes('Enter or paste a suspicious message in the input panel and click'), 'Empty state explains entering/pasting message to begin investigation');
    assert(appJs.includes('Investigation ${index + 1}:') && !appJs.includes('Step ${index + 1}:'), 'Timeline labels records as Investigation 1, Investigation 2 (not Step 1, Step 2)');
    assert(appJs.includes("'Backend Connected'"), 'System status uses neutral "Backend Connected" reflecting health endpoint');
    assert(indexHtml.includes('id="admin-controls-group" style="display: none;"'), 'Development controls are hidden by default in ordinary public interface');

  } catch (err) {
    assert(false, `Test 3 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // TEST 4: Zero Regression on Core Operations
  // ----------------------------------------------------------------
  console.log('\n--- TEST 4: Core Analysis & Storage Preservation ---');
  try {
    const testMsg = 'Urgent bill overdue notice: pay Rs 50 electricity bill now at upi: bescom-dues@okaxis or connection lost.';
    
    // 4A: Normal analysis continues to work seamlessly
    const resAnalysis = await fetch(`${BASE_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: testMsg, source: 'manual', record: true })
    });
    assert(resAnalysis.status === 200, 'POST /api/analyze executes cleanly (HTTP 200)');
    const report = await resAnalysis.json();
    assert(report.investigationId, `Investigation successfully created: ${report.investigationId}`);
    assert(report.riskVerdict === 'HIGH_RISK', 'Verdict correctly determined');

    // 4B: Export endpoint works for the newly created investigation
    const resNewExport = await fetch(`${BASE_URL}/api/investigations/${report.investigationId}/export`);
    assert(resNewExport.status === 200, 'New investigation exported as incident report immediately (HTTP 200)');

  } catch (err) {
    assert(false, `Test 4 failed with exception: ${err.message}`);
  }

  // ----------------------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`Phase 7B Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase7BTests();

