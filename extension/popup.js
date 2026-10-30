/**
 * TRACE - Chrome Extension Popup Controller
 * 
 * Features:
 * 1. Automatic active tab detection (Gmail Web vs WhatsApp Web vs General)
 * 2. User-controlled message extraction (Selection-first, DOM-second)
 * 3. Fallback to manual text paste & edit
 * 4. Direct communication with local backend (http://localhost:3000/api/analyze)
 * 5. Direct deep-link to Web Dashboard SCAMCHAIN graph
 */

const BACKEND_URL = 'http://localhost:3000';

const SAMPLES = {
  english: `Dear SBI Customer, your bank account has been blocked due to missing PAN card. Immediately update KYC within 2 hours to avoid permanent suspension. Pay verification fee of Rs 10 to clear dues: upi: sbi-kyc-verify@okhdfcbank or visit https://sbi-kyc-portal.online. For helpline call +91 9845123456 or 1800-111-2223.`,
  hindi: `प्रिय उपभोक्ता, आज रात 9:30 बजे आपकी बिजली काट दी जाएगी क्योंकि आपका पिछले महीने का बिल अपडेट नहीं हुआ है। तुरंत संपर्क करें और बिजली विभाग के बिल का भुगतान करें। UPI ID: bijli-pay@okaxis या कॉल करें +91-9876543210 पर।`,
  kannada: `ಗೌರವಾನ್ವಿತ ಗ್ರಾಹಕರೇ, ನಿಮ್ಮ ಕೆವೈಸಿ ನವೀಕರಣ ಬಾಕಿ ಇರುವುದರಿಂದ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸ್ಥಗಿತಗೊಳಿಸಲಾಗುವುದು. ತಕ್ಷಣ ಲಿಂಕ್ ಕ್ಲಿಕ್ ಮಾಡಿ ದೃಢೀಕರಿಸಿ: https://karnataka-bank-verify.in ಅಥವಾ ಬೆಂಬಲಕ್ಕಾಗಿ +91 9123456789 ಸಂಪರ್ಕಿಸಿ.`
};

let currentTab = null;
let detectedPlatform = 'manual';
let lastAnalyzedId = null;

document.addEventListener('DOMContentLoaded', async () => {
  await detectActiveTab();
  initEventListeners();
});

/**
 * Detects whether active tab is Gmail, WhatsApp Web, or general page
 */
async function detectActiveTab() {
  const platformName = document.getElementById('platform-name');
  const smartActionBox = document.getElementById('smart-action-box');
  const extractBtnText = document.getElementById('extract-btn-text');
  const smartHint = document.getElementById('smart-hint');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) {
      currentTab = tabs[0];
      const url = currentTab.url || '';

      if (url.includes('mail.google.com')) {
        detectedPlatform = 'gmail';
        platformName.textContent = 'Gmail Web Detected ✉️';
        extractBtnText.textContent = '⚡ Extract & Analyse Email';
        smartHint.textContent = 'Reads active open email or highlighted text upon click.';
        smartActionBox.classList.remove('hidden');
      } else if (url.includes('web.whatsapp.com')) {
        detectedPlatform = 'whatsapp';
        platformName.textContent = 'WhatsApp Web 💬';
        extractBtnText.textContent = '⚡ Extract & Analyse Chat';
        smartHint.textContent = 'Reads active/selected chat bubble or highlighted text upon click.';
        smartActionBox.classList.remove('hidden');
      } else {
        detectedPlatform = 'manual';
        platformName.textContent = 'Manual Ingestion 📝';
        smartActionBox.classList.add('hidden');
      }
    }
  } catch (err) {
    console.warn('Could not query active tab:', err);
    platformName.textContent = 'Standalone Mode 📝';
    smartActionBox.classList.add('hidden');
  }
}

/**
 * Initializes button clicks and listeners
 */
function initEventListeners() {
  // Extract complete message button
  document.getElementById('auto-extract-btn').addEventListener('click', () => {
    handleExtract('full_message');
  });

  // Extract highlighted selection button
  const selBtn = document.getElementById('extract-selection-btn');
  if (selBtn) {
    selBtn.addEventListener('click', () => {
      handleExtract('selection_only');
    });
  }

  // Manual analyse button
  document.getElementById('manual-analyze-btn').addEventListener('click', () => {
    const text = document.getElementById('popup-textarea').value.trim();
    if (!text) {
      showAlert('Please paste or type a message to analyze.', 'warning');
      return;
    }
    performAnalysis(text, detectedPlatform);
  });

  // Clear button
  document.getElementById('clear-text-btn').addEventListener('click', () => {
    document.getElementById('popup-textarea').value = '';
    document.getElementById('results-card').classList.add('hidden');
    const debugBox = document.getElementById('extract-debug-box');
    if (debugBox) debugBox.classList.add('hidden');
    hideAlert();
  });

  // Quick sample buttons
  document.querySelectorAll('.sample-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sampleKey = btn.getAttribute('data-sample');
      const sampleText = SAMPLES[sampleKey];
      if (sampleText) {
        document.getElementById('popup-textarea').value = sampleText;
        hideAlert();
      }
    });
  });

  // Open Full Dashboard button
  document.getElementById('open-dashboard-btn').addEventListener('click', () => {
    const targetUrl = lastAnalyzedId ? `${BACKEND_URL}/#results-panel` : BACKEND_URL;
    chrome.tabs.create({ url: targetUrl });
  });
}

/**
 * Handles explicit extraction request to the content script
 * @param {'full_message' | 'selection_only'} mode
 */
async function handleExtract(mode = 'full_message') {
  if (!currentTab || !currentTab.id) {
    showAlert('Cannot access active tab. Please use manual paste below.', 'error');
    return;
  }

  const spinner = mode === 'selection_only'
    ? document.getElementById('selection-spinner')
    : document.getElementById('extract-spinner');
  const btn = mode === 'selection_only'
    ? document.getElementById('extract-selection-btn')
    : document.getElementById('auto-extract-btn');
  const btnText = mode === 'selection_only'
    ? document.getElementById('selection-btn-text')
    : document.getElementById('extract-btn-text');

  if (btn) btn.disabled = true;
  if (spinner) spinner.classList.remove('hidden');
  hideAlert();

  try {
    // Send message to content script on active tab
    chrome.tabs.sendMessage(currentTab.id, { action: 'EXTRACT_MESSAGE', mode: mode }, async (response) => {
      if (btn) btn.disabled = false;
      if (spinner) spinner.classList.add('hidden');

      if (chrome.runtime.lastError || !response) {
        // Fallback: If content script was not loaded yet, offer manual fallback
        showAlert('Could not read message automatically. Please reload the WhatsApp tab and click Analyse again.', 'warning');
        document.getElementById('popup-textarea').focus();
        return;
      }

      if (!response.success) {
        showAlert(response.error || 'No message detected. Highlight text or paste below.', 'warning');
        document.getElementById('popup-textarea').focus();
        return;
      }

      // Display telemetry debug information
      const debugBox = document.getElementById('extract-debug-box');
      const debugTarget = document.getElementById('debug-target-line');
      const debugStats = document.getElementById('debug-stats-line');

      if (debugBox && response.debugInfo) {
        debugBox.classList.remove('hidden');
        const dbg = response.debugInfo;
        debugTarget.textContent = `🔍 Target DOM: <${dbg.targetTagName || 'DIV'} class="${dbg.targetClassName || ''}"> | Root: <${dbg.textRootTagName || 'DIV'}>`;
        debugStats.textContent = `📊 Extracted: ${dbg.extractedLength} chars | ${dbg.lineCount} lines | Method: ${dbg.extractionMethod}`;
      }

      // Populate textarea with extracted content
      document.getElementById('popup-textarea').value = response.text;
      
      // Immediately run analysis
      await performAnalysis(response.text, response.source || detectedPlatform);
    });
  } catch (err) {
    if (btn) btn.disabled = false;
    if (spinner) spinner.classList.add('hidden');
    showAlert('Extraction error. Please paste message manually.', 'error');
    console.error('Extraction error:', err);
  }
}

/**
 * Sends message to TRACE backend for analysis
 */
async function performAnalysis(text, source) {
  const manualSpinner = document.getElementById('manual-spinner');
  const manualBtn = document.getElementById('manual-analyze-btn');

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    showAlert('Please enter or select a message to analyze.', 'warning');
    return;
  }

  // Strict 10,000-character input limit
  if (text.length > 10000) {
    showAlert(`Input length (${text.length.toLocaleString()} characters) exceeds the maximum allowed limit of 10,000 characters. Please shorten the message.`, 'warning');
    return;
  }

  manualBtn.disabled = true;
  manualSpinner.classList.remove('hidden');
  hideAlert();

  try {
    const res = await fetch(`${BACKEND_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        source: source || 'manual',
        record: true
      })
    });

    if (!res.ok) {
      let errMsg = `Server returned HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errMsg = errJson.error;
      } catch (_) {}
      throw new Error(errMsg);
    }

    const report = await res.json();
    lastAnalyzedId = report.investigationId;
    renderResults(report);

  } catch (err) {
    console.error('Backend connection error:', err);
    showAlert(`Analysis failed: ${err.message}. Ensure backend is running at http://localhost:3000`, 'error');
  } finally {
    manualBtn.disabled = false;
    manualSpinner.classList.add('hidden');
  }
}

/**
 * Renders analysis results inside extension popup
 */
function renderResults(report) {
  const card = document.getElementById('results-card');
  card.classList.remove('hidden');

  // Verdict bar
  const vBar = document.getElementById('verdict-bar');
  const vLabel = document.getElementById('verdict-label');
  const vScore = document.getElementById('verdict-score');

  vBar.className = 'verdict-bar';
  if (report.riskVerdict === 'HIGH_RISK') {
    vBar.classList.add('high-risk');
    vLabel.textContent = 'HIGH RISK';
  } else if (report.riskVerdict === 'SUSPICIOUS') {
    vBar.classList.add('suspicious');
    vLabel.textContent = 'SUSPICIOUS';
  } else {
    vBar.classList.add('safe');
    vLabel.textContent = 'LOW RISK — NO STRONG THREATS DETECTED';
  }

  vScore.textContent = `Score: ${report.riskScore}/100`;

  // Meta
  document.getElementById('meta-lang').textContent = report.language?.primary || 'Unknown';
  document.getElementById('meta-source').textContent = (report.source || 'manual').toUpperCase();
  document.getElementById('meta-mode').textContent = report.analysisMode === 'AI_CONTEXTUAL' ? 'AI' : 'Deterministic';

  // Intent
  document.getElementById('result-intent').textContent = report.intentSummary || 'No specific threat intent identified.';

  // SCAMCHAIN Banner
  const scBanner = document.getElementById('scamchain-banner');
  const scDesc = document.getElementById('sc-desc');
  const scChips = document.getElementById('sc-evidence-chips');

  if (report.scamchain && report.scamchain.hasCampaignConnection) {
    scBanner.classList.remove('hidden');
    const channels = report.scamchain.campaign?.channels || [];
    scDesc.textContent = `Connected across [${channels.join(', ')}] via shared technical infrastructure (shared technical identifier).`;

    scChips.innerHTML = '';
    (report.scamchain.campaign?.sharedEvidenceSummary || []).forEach(ev => {
      const chip = document.createElement('span');
      chip.className = 'sc-chip';
      chip.textContent = `${ev.type}: ${ev.value}`;
      scChips.appendChild(chip);
    });
  } else {
    scBanner.classList.add('hidden');
  }

  // Evidence List
  const evList = document.getElementById('evidence-list');
  evList.innerHTML = '';

  const idMap = [
    ...(report.identifiers?.upiIds || []).map(u => `UPI: ${u}`),
    ...(report.identifiers?.domains || []).map(d => `Domain: ${d}`),
    ...(report.identifiers?.phoneNumbers || []).map(p => `Phone: ${p}`)
  ];

  if (idMap.length > 0) {
    idMap.forEach(item => {
      const div = document.createElement('div');
      div.className = 'evidence-item';
      div.textContent = item;
      evList.appendChild(div);
    });
  } else {
    evList.innerHTML = '<div class="evidence-item" style="color: var(--text-dim);">No URLs, UPI handles, or phone numbers found.</div>';
  }

  // Claims List
  const claimsList = document.getElementById('claims-list');
  claimsList.innerHTML = '';

  if (report.claims && report.claims.length > 0) {
    report.claims.forEach(c => {
      const mini = document.createElement('div');
      mini.className = 'claim-mini';
      const statusClass = (c.status || 'UNVERIFIED').toLowerCase();
      mini.innerHTML = `
        <span>${escapeHtml(c.organizationName || 'Entity')}</span>
        <span class="claim-pill ${statusClass}">${escapeHtml(c.status)}</span>
      `;
      claimsList.appendChild(mini);
    });
  } else {
    claimsList.innerHTML = '<span style="font-size: 0.72rem; color: var(--text-dim);">No institutional claims.</span>';
  }
}

function showAlert(message, type = 'warning') {
  const box = document.getElementById('status-alert');
  box.textContent = message;
  box.className = 'alert-box';
  if (type === 'error') {
    box.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
    box.style.borderColor = 'rgba(239, 68, 68, 0.3)';
    box.style.color = '#f87171';
  }
  box.classList.remove('hidden');
}

function hideAlert() {
  document.getElementById('status-alert').classList.add('hidden');
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

