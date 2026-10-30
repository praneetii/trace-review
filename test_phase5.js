/**
 * TRACE - Phase 5 Web Dashboard & End-to-End Integration Test Suite
 * 
 * Verifies:
 * 1. Web server serves all frontend assets (index.html, style.css, app.js)
 * 2. Complete flow: Submit Message 1 (Gmail/EN) -> Submit Message 2 (WhatsApp/HI) -> SCAMCHAIN links them
 * 3. REST APIs: /api/analyze, /api/scamchain, /api/investigations
 */

import { spawn } from 'child_process';

console.log('================================================================');
console.log('🛡️  TRACE - PHASE 5 DASHBOARD & END-TO-END FLOW TEST');
console.log('================================================================\n');

const serverProc = spawn('node', ['server.js'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverReady = false;

serverProc.stdout.on('data', async (buf) => {
  const str = buf.toString();
  if (str.includes('TRACE Server is running') && !serverReady) {
    serverReady = true;

    try {
      console.log('1. Testing Frontend Static Asset Serving...');
      const rHtml = await fetch('http://127.0.0.1:3000/');
      const htmlText = await rHtml.text();
      const hasTitle = htmlText.includes('SCAMCHAIN Campaign Visualizer');
      console.log(`   - index.html Status: ${rHtml.status} (Contains SCAMCHAIN Visualizer: ${hasTitle})`);

      const rCss = await fetch('http://127.0.0.1:3000/style.css');
      console.log(`   - style.css Status: ${rCss.status}`);

      const rJs = await fetch('http://127.0.0.1:3000/app.js');
      console.log(`   - app.js Status: ${rJs.status}`);

      if (rHtml.status !== 200 || rCss.status !== 200 || rJs.status !== 200 || !hasTitle) {
        throw new Error('Static frontend asset test failed');
      }
      console.log('   ✅ Frontend static assets served correctly.\n');

      console.log('2. Testing End-to-End Analysis & Storage Flow...');

      // Message 1: Gmail in English
      const msg1 = {
        text: 'Urgent: BESCOM electricity disconnected tonight. Pay Rs 250 dues at upi: bescom-power-pay@okhdfcbank or power cut.',
        source: 'gmail',
        forceOffline: true
      };

      const res1 = await fetch('http://127.0.0.1:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg1)
      });
      const data1 = await res1.json();
      console.log(`   - Message 1 Analyzed: ID ${data1.investigationId} | Verdict: ${data1.riskVerdict}`);

      // Message 2: WhatsApp in Hindi (Same UPI)
      const msg2 = {
        text: 'प्रिय उपभोक्ता, आज रात बिजली काट दी जाएगी। तुरंत बिल भरें upi: bescom-power-pay@okhdfcbank पर।',
        source: 'whatsapp',
        forceOffline: true
      };

      const res2 = await fetch('http://127.0.0.1:3000/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg2)
      });
      const data2 = await res2.json();
      console.log(`   - Message 2 Analyzed: ID ${data2.investigationId} | Verdict: ${data2.riskVerdict}`);

      console.log('3. Verifying SCAMCHAIN Cross-Channel Linkage...');
      const hasLink = data2.scamchain && data2.scamchain.hasCampaignConnection;
      console.log(`   - Campaign Connection Found: ${hasLink ? 'YES' : 'NO'}`);

      if (hasLink) {
        const conn = data2.scamchain.connections[0];
        console.log(`   - Connected Target ID: ${conn.targetInvestigationId} (Source: ${conn.targetSource})`);
        console.log(`   - Evidence Strength  : ${conn.connectionStrength}`);
        console.log(`   - Shared Identifier  : ${conn.sharedEvidence[0].type} = ${conn.sharedEvidence[0].value}`);
      }

      console.log('\n4. Verifying Graph API & Investigation History...');
      const rGraph = await fetch('http://127.0.0.1:3000/api/scamchain');
      const graph = await rGraph.json();
      console.log(`   - Graph API: ${graph.nodes.length} nodes, ${graph.links.length} links, ${graph.totalCampaigns} campaigns`);

      const rHistory = await fetch('http://127.0.0.1:3000/api/investigations');
      const history = await rHistory.json();
      console.log(`   - History API: ${history.length} records retrieved`);

      serverProc.kill('SIGINT');

      if (hasLink && graph.nodes.length > 0 && history.length >= 2) {
        console.log('\n================================================================');
        console.log('🎉 ALL PHASE 5 END-TO-END FLOW TESTS PASSED SUCCESSFULLY!');
        process.exit(0);
      } else {
        console.error('\n❌ Phase 5 verification assertions failed.');
        process.exit(1);
      }

    } catch (err) {
      console.error('\n❌ Phase 5 Test Error:', err);
      serverProc.kill('SIGINT');
      process.exit(1);
    }
  }
});

serverProc.stderr.on('data', (err) => {
  console.error('Server error:', err.toString());
});

