/**
 * TRACE - HTTP API Verification Test
 * 
 * Verifies that the Express server starts cleanly and that
 * POST /api/extract responds with HTTP 200 and the expected JSON payload.
 */

import { spawn } from 'child_process';

console.log('1. Starting TRACE server process on port 3000...');

const serverProcess = spawn('node', ['server.js'], {
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverStarted = false;

serverProcess.stdout.on('data', async (data) => {
  const output = data.toString();
  if (output.includes('TRACE Server is running') && !serverStarted) {
    serverStarted = true;
    console.log('2. Server started successfully. Sending HTTP POST to /api/extract...');

    try {
      const payload = {
        text: 'Urgent: Pay Rs 50 electricity bill now at upi: kptcl-bill@okaxis or power cut tonight.',
        source: 'http-verification-test'
      };

      const res = await fetch('http://127.0.0.1:3000/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      console.log(`3. Response Status: ${res.status} ${res.statusText}`);
      const json = await res.json();
      console.log('4. Received JSON Body:\n', JSON.stringify(json, null, 2));

      if (res.status === 200 && json.identifiers.upiIds.includes('kptcl-bill@okaxis')) {
        console.log('\n✅ HTTP API VERIFICATION PASSED: POST /api/extract works cleanly!');
        serverProcess.kill('SIGINT');
        process.exit(0);
      } else {
        console.error('\n❌ HTTP API Response did not match expectations.');
        serverProcess.kill('SIGINT');
        process.exit(1);
      }
    } catch (err) {
      console.error('\n❌ HTTP Request Error:', err);
      serverProcess.kill('SIGINT');
      process.exit(1);
    }
  }
});

serverProcess.stderr.on('data', (err) => {
  console.error('Server error output:', err.toString());
});

serverProcess.on('exit', (code) => {
  if (!serverStarted) {
    console.error(`Server process exited prematurely with code ${code}`);
    process.exit(1);
  }
});

