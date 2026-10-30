/**
 * TRACE - Web Dashboard Controller & SCAMCHAIN Visualizer
 * 
 * Features:
 * 1. Live Message Analysis (via POST /api/analyze)
 * 2. Multilingual Quick Sample Loaders (EN, HI, KN, Hinglish, Legitimate)
 * 3. Interactive SCAMCHAIN Network Graph on HTML5 Canvas (100% offline-resilient)
 * 4. Claim Verification Display (Supported / Contradicted / Unverified)
 * 5. Investigation History Log
 */

// Preset Demo Samples
const DEMO_SAMPLES = {
  english: {
    channel: 'gmail',
    text: `Dear SBI Customer, your bank account has been blocked due to missing PAN card. Immediately update KYC within 2 hours to avoid permanent suspension. Pay verification fee of Rs 10 to clear dues: upi: sbi-kyc-verify@okhdfcbank or visit https://sbi-kyc-portal.online. For helpline call +91 9845123456 or 1800-111-2223.`
  },
  hindi: {
    channel: 'whatsapp',
    text: `प्रिय उपभोक्ता, आज रात 9:30 बजे आपकी बिजली काट दी जाएगी क्योंकि आपका पिछले महीने का बिल अपडेट नहीं हुआ है। तुरंत संपर्क करें और बिजली विभाग के बिल का भुगतान करें। UPI ID: bijli-pay@okaxis या कॉल करें +91-9876543210 पर।`
  },
  kannada: {
    channel: 'whatsapp',
    text: `ಗೌರವಾನ್ವಿತ ಗ್ರಾಹಕರೇ, ನಿಮ್ಮ ಕೆವೈಸಿ ನವೀಕರಣ ಬಾಕಿ ಇರುವುದರಿಂದ ನಿಮ್ಮ ಬ್ಯಾಂಕ್ ಖಾತೆ ಸ್ಥಗಿತಗೊಳಿಸಲಾಗುವುದು. ತಕ್ಷಣ ಲಿಂಕ್ ಕ್ಲಿಕ್ ಮಾಡಿ ದೃಢೀಕರಿಸಿ: https://karnataka-bank-verify.in ಅಥವಾ ಬೆಂಬಲಕ್ಕಾಗಿ +91 9123456789 ಸಂಪರ್ಕಿಸಿ.`
  },
  hinglish: {
    channel: 'whatsapp',
    text: `Dear consumer, your electricity bill is unpaid. Aaj raat bijli kat jayegi. Turant 200 Rs bill bharein at upi: bescom-dues@okhdfcbank or call electricity helpline +91 9876500001 immediately.`
  },
  legitimate: {
    channel: 'gmail',
    text: `Dear Consumer, your electricity bill for Account 54321 is generated. You can securely review and pay your bill through the official portal https://bescom.karnataka.gov.in or contact official 24x7 customer helpline 1912. No personal UPI transfers are accepted.`
  }
};

// Global State
let currentGraphData = { nodes: [], links: [], campaigns: [] };
let selectedNode = null;
let currentSourceChannel = 'manual';

// DOM Elements
document.addEventListener('DOMContentLoaded', () => {
  initHealthCheck();
  initSampleButtons();
  initChannelTabs();
  initAnalysisForm();
  initGraph();
  loadScamChainGraph();
  loadInvestigationHistory();

  document.getElementById('reset-db-btn').addEventListener('click', handleResetDatabase);
  document.getElementById('seed-demo-btn').addEventListener('click', handleSeedDemo);
  document.getElementById('refresh-graph-btn').addEventListener('click', () => {
    loadScamChainGraph();
    loadInvestigationHistory();
  });
  document.getElementById('close-inspector-btn').addEventListener('click', () => {
    document.getElementById('node-inspector').classList.add('hidden');
    selectedNode = null;
    drawGraph();
  });
});

/**
 * Pings backend health endpoint and updates top status indicators
 */
async function initHealthCheck() {
  const statusDot = document.querySelector('#system-status .status-dot');
  const statusLabel = document.querySelector('#system-status .status-label');
  const aiBadge = document.getElementById('ai-status-badge');

  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    if (res.ok && data.status === 'ok') {
      statusDot.classList.add('online');
      statusLabel.textContent = 'Backend Connected';
    } else {
      statusDot.classList.remove('online');
      statusLabel.textContent = 'Backend Disconnected';
    }

    if (data.aiConfigured) {
      aiBadge.textContent = 'AI: Gemini 2.0 Ready';
      aiBadge.className = 'badge badge-green';
    } else {
      aiBadge.textContent = 'AI: Deterministic Fallback Active';
      aiBadge.className = 'badge badge-accent';
      aiBadge.title = 'No API key set. Running in reliable deterministic heuristic mode.';
    }

    // Disable and hide Reset / Seed controls in production
    const adminGroup = document.getElementById('admin-controls-group');
    if (adminGroup) {
      if (data.adminControlsEnabled === false || data.environment === 'production') {
        adminGroup.style.display = 'none';
        adminGroup.setAttribute('aria-hidden', 'true');
      } else {
        adminGroup.style.display = 'inline-flex';
        adminGroup.removeAttribute('aria-hidden');
      }
    }
  } catch (err) {
    statusDot.classList.remove('online');
    statusLabel.textContent = 'Backend Offline';
    aiBadge.textContent = 'Server Unreachable';
  }
}

/**
 * Initializes quick demo sample buttons
 */
function initSampleButtons() {
  const pills = document.querySelectorAll('.sample-pill');
  const textarea = document.getElementById('message-input');

  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      const sampleKey = pill.getAttribute('data-sample');
      const sample = DEMO_SAMPLES[sampleKey];
      if (sample) {
        textarea.value = sample.text;
        setChannel(sample.channel);
        updateCharCounter();
        textarea.focus();
      }
    });
  });

  document.getElementById('clear-btn').addEventListener('click', () => {
    textarea.value = '';
    updateCharCounter();
    const exportBtn = document.getElementById('export-report-btn');
    if (exportBtn) exportBtn.classList.add('hidden');
    textarea.focus();
  });

  if (textarea) {
    textarea.addEventListener('input', updateCharCounter);
    updateCharCounter();
  }
}

/**
 * Updates character counter indicator for message input
 */
function updateCharCounter() {
  const textarea = document.getElementById('message-input');
  const counter = document.getElementById('char-counter');
  if (textarea && counter) {
    const len = textarea.value.length;
    counter.textContent = `${len.toLocaleString()} / 10,000`;
    if (len > 10000) {
      counter.style.color = '#ef4444';
      counter.style.fontWeight = 'bold';
    } else if (len > 9000) {
      counter.style.color = '#f59e0b';
      counter.style.fontWeight = 'normal';
    } else {
      counter.style.color = 'var(--text-dim)';
      counter.style.fontWeight = 'normal';
    }
  }
}

/**
 * Sets active channel tab and syncs state
 */
function setChannel(channelName) {
  currentSourceChannel = channelName;
  const options = document.querySelectorAll('.channel-option');
  options.forEach(opt => {
    const isMatch = opt.getAttribute('data-channel') === channelName;
    opt.classList.toggle('active', isMatch);
    const radio = opt.querySelector('input');
    if (radio) {
      radio.checked = isMatch;
    }
  });
}

function initChannelTabs() {
  const options = document.querySelectorAll('.channel-option');
  options.forEach(opt => {
    opt.addEventListener('click', (e) => {
      e.preventDefault();
      const channel = opt.getAttribute('data-channel');
      setChannel(channel);
    });
  });
}

/**
 * Handles Analysis form submission
 */
function initAnalysisForm() {
  const analyzeBtn = document.getElementById('analyze-btn');
  const spinner = document.getElementById('analyze-spinner');
  const btnText = analyzeBtn.querySelector('.btn-text');
  const textarea = document.getElementById('message-input');
  const forceOfflineCheckbox = document.getElementById('force-offline-checkbox');

  analyzeBtn.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) {
      alert('Please enter or select a message to analyze.');
      textarea.focus();
      return;
    }

    // Strict 10,000-character input limit
    if (text.length > 10000) {
      alert(`Message length (${text.length.toLocaleString()} characters) exceeds the maximum allowed limit of 10,000 characters. Please shorten the message.`);
      textarea.focus();
      return;
    }

    // Explicitly use the tracked source channel
    const source = currentSourceChannel || 'manual';
    const forceOffline = forceOfflineCheckbox.checked;

    // UI Loading state
    analyzeBtn.disabled = true;
    spinner.classList.remove('hidden');
    btnText.textContent = 'Analyzing...';

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source,
          forceOffline,
          record: true
        })
      });

      if (!response.ok) {
        let errMsg = `Server responded with status ${response.status}`;
        try {
          const errData = await response.json();
          if (errData.error) errMsg = errData.error;
        } catch (_) {}
        throw new Error(errMsg);
      }

      const report = await response.json();

      // Render Findings
      renderAnalysisReport(report);

      // Refresh graph and history
      await loadScamChainGraph();
      await loadInvestigationHistory();

    } catch (err) {
      console.error('Analysis error:', err);
      alert(`Investigation failed: ${err.message}`);
    } finally {
      analyzeBtn.disabled = false;
      spinner.classList.add('hidden');
      btnText.textContent = 'Analyse in TRACE';
    }
  });
}

/**
 * Renders the returned analysis report in the right panel
 */
function renderAnalysisReport(report) {
  document.getElementById('results-empty').classList.add('hidden');
  const resultsContent = document.getElementById('results-content');
  resultsContent.classList.remove('hidden');

  // Set ID and configure Export Incident Report button
  document.getElementById('report-inv-id').textContent = report.investigationId || 'LIVE ANALYSIS';
  const exportBtn = document.getElementById('export-report-btn');
  if (exportBtn) {
    if (report.investigationId && report.investigationId !== 'LIVE ANALYSIS') {
      exportBtn.classList.remove('hidden');
      exportBtn.onclick = () => {
        window.open(`/api/investigations/${report.investigationId}/export`, '_blank');
      };
    } else {
      exportBtn.classList.add('hidden');
    }
  }

  // Verdict & Score
  const verdictCard = document.getElementById('verdict-card');
  const verdictBadge = document.getElementById('verdict-badge');
  const verdictScore = document.getElementById('verdict-score');
  const provenanceTag = document.getElementById('provenance-tag');
  const disclaimerBanner = document.getElementById('disclaimer-banner');

  verdictCard.className = 'verdict-card';
  if (report.riskVerdict === 'HIGH_RISK') {
    verdictCard.classList.add('high-risk');
    verdictBadge.textContent = 'HIGH RISK';
  } else if (report.riskVerdict === 'SUSPICIOUS') {
    verdictCard.classList.add('suspicious');
    verdictBadge.textContent = 'SUSPICIOUS';
  } else {
    verdictCard.classList.add('safe');
    verdictBadge.textContent = 'LOW RISK — NO STRONG SUSPICIOUS SIGNALS DETECTED';
  }

  verdictScore.textContent = `Risk Score: ${report.riskScore}/100`;

  if (report.analysisMode === 'AI_CONTEXTUAL') {
    provenanceTag.textContent = `Analysis Mode: Generative AI Contextual (${report.model || 'Gemini'})`;
    disclaimerBanner.classList.add('hidden');
  } else {
    provenanceTag.textContent = 'Analysis Mode: Deterministic Offline Fallback';
    disclaimerBanner.textContent = report.disclaimer || 'Generated using deterministic rules because AI is unconfigured or offline.';
    disclaimerBanner.classList.remove('hidden');
  }

  // Meta items
  const lang = report.language;
  const langText = lang ? `${lang.primary} ${lang.isCodeMixed ? '(' + (lang.codeMixedType || 'Code-Mixed') + ')' : ''}` : 'Unknown';
  document.getElementById('res-language').textContent = langText;
  document.getElementById('res-source').textContent = (report.source || 'manual').toUpperCase();

  // Intent
  document.getElementById('res-intent').textContent = report.intentSummary || 'No specific threat intent identified.';

  // SCAMCHAIN Connection Alert
  const scAlert = document.getElementById('scamchain-alert');
  const scTitle = document.getElementById('scamchain-alert-title');
  const scBody = document.getElementById('scamchain-alert-body');
  const scTags = document.getElementById('scamchain-evidence-tags');

  if (report.scamchain && report.scamchain.hasCampaignConnection) {
    scAlert.classList.remove('hidden');
    const connCount = report.scamchain.connectionCount || 1;
    const channels = report.scamchain.campaign?.channels || [];
    scTitle.textContent = `🔗 SCAMCHAIN Match Detected (${connCount} Linked Message${connCount > 1 ? 's' : ''})`;
    scBody.textContent = `Shared technical infrastructure detected spanning [${channels.join(', ')}]. Note: Establishes a shared technical identifier, not proof of common criminal ownership or identity.`;

    scTags.innerHTML = '';
    (report.scamchain.campaign?.sharedEvidenceSummary || []).forEach(ev => {
      const tag = document.createElement('span');
      tag.className = 'evidence-tag';
      tag.textContent = `${ev.type}: ${ev.value} [${ev.strength}]`;
      scTags.appendChild(tag);
    });
  } else {
    scAlert.classList.add('hidden');
  }

  // Identifiers Grid
  const idGrid = document.getElementById('identifiers-grid');
  idGrid.innerHTML = '';

  const idMap = [
    { label: 'UPI Payment Handles', values: report.identifiers?.upiIds },
    { label: 'Web Domains', values: report.identifiers?.domains },
    { label: 'Phone Numbers', values: report.identifiers?.phoneNumbers },
    { label: 'URLs', values: report.identifiers?.urls },
    { label: 'Emails', values: report.identifiers?.emails }
  ];

  let hasAnyId = false;
  idMap.forEach(item => {
    if (item.values && item.values.length > 0) {
      hasAnyId = true;
      item.values.forEach(val => {
        const div = document.createElement('div');
        div.className = 'id-item';
        div.innerHTML = `<span class="id-label">${item.label}</span><span class="id-val">${escapeHtml(val)}</span>`;
        idGrid.appendChild(div);
      });
    }
  });

  if (!hasAnyId) {
    idGrid.innerHTML = '<div class="id-item"><span class="id-label">Technical Evidence</span><span class="id-val" style="color: var(--text-dim);">No URLs, UPI handles, or phone numbers found.</span></div>';
  }

  // Institutional Claims
  const claimsList = document.getElementById('claims-list');
  claimsList.innerHTML = '';

  if (report.claims && report.claims.length > 0) {
    report.claims.forEach(claim => {
      const card = document.createElement('div');
      card.className = 'claim-card';

      const statusClass = (claim.status || 'UNVERIFIED').toLowerCase();
      card.innerHTML = `
        <div class="claim-card-header">
          <span class="claim-org">${escapeHtml(claim.organizationName || 'Referenced Entity')}</span>
          <span class="claim-pill ${statusClass}">${escapeHtml(claim.status)}</span>
        </div>
        <p class="claim-reason">${escapeHtml(claim.reason)}</p>
      `;
      claimsList.appendChild(card);
    });
  } else {
    claimsList.innerHTML = '<p class="claim-reason">No institutional claims identified in message.</p>';
  }

  // Behavioral Signals
  const signalsList = document.getElementById('signals-list');
  signalsList.innerHTML = '';

  if (report.findings && report.findings.length > 0) {
    report.findings.forEach(sig => {
      const item = document.createElement('div');
      const sevClass = (sig.severity || 'medium').toLowerCase();
      item.className = `signal-item ${sevClass}`;
      item.innerHTML = `
        <div class="signal-top">
          <span class="signal-label">${escapeHtml(sig.label)}</span>
          <span class="signal-severity">${escapeHtml(sig.severity)}</span>
        </div>
        ${sig.quote ? `<span class="signal-quote">"${escapeHtml(sig.quote)}"</span>` : ''}
        <p class="signal-desc">${escapeHtml(sig.explanation)}</p>
      `;
      signalsList.appendChild(item);
    });
  } else {
    signalsList.innerHTML = '<p class="signal-desc">No suspicious behavioral signals detected.</p>';
  }

  // Recommendations
  const recList = document.getElementById('recommendations-list');
  recList.innerHTML = '';
  if (report.recommendedActions && report.recommendedActions.length > 0) {
    report.recommendedActions.forEach(action => {
      const li = document.createElement('li');
      li.textContent = action;
      recList.appendChild(li);
    });
  } else {
    recList.innerHTML = '<li>No specific protective actions required.</li>';
  }
}

/**
 * Loads SCAMCHAIN graph dataset from /api/scamchain
 */
async function loadScamChainGraph() {
  try {
    const res = await fetch('/api/scamchain');
    if (!res.ok) return;
    currentGraphData = await res.json();
    layoutGraph(currentGraphData);
    drawGraph();
    renderCampaignTimeline(currentGraphData);
  } catch (err) {
    console.warn('Could not load SCAMCHAIN graph:', err);
  }
}

/**
 * Loads investigation history from /api/investigations
 */
async function loadInvestigationHistory() {
  const tbody = document.getElementById('history-tbody');
  const countBadge = document.getElementById('history-count');

  try {
    const res = await fetch('/api/investigations');
    if (!res.ok) return;
    const items = await res.json();

    countBadge.textContent = `${items.length} Records`;
    tbody.innerHTML = '';

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No past investigations recorded yet.</td></tr>';
      return;
    }

    items.forEach(inv => {
      const tr = document.createElement('tr');
      const channelIcon = inv.source === 'gmail' ? '✉️' : (inv.source === 'whatsapp' ? '💬' : '📝');
      const riskClass = (inv.riskVerdict || 'SAFE').toLowerCase().replace('_', '-');
      
      const upiCount = inv.identifiers?.upiIds?.length || 0;
      const domainCount = inv.identifiers?.domains?.length || 0;
      const evidenceSummary = upiCount > 0 ? `UPI (${inv.identifiers.upiIds[0]})` : (domainCount > 0 ? `Domain (${inv.identifiers.domains[0]})` : 'None');

      tr.innerHTML = `
        <td class="table-inv-id">${escapeHtml(inv.id)}</td>
        <td>${channelIcon} ${escapeHtml((inv.source || 'manual').toUpperCase())}</td>
        <td>${escapeHtml(inv.language?.primary || 'Unknown')}</td>
        <td><span class="claim-pill ${riskClass === 'high-risk' ? 'contradicted' : (riskClass === 'suspicious' ? 'unverified' : 'supported')}">${escapeHtml(inv.riskVerdict)}</span></td>
        <td>${escapeHtml(evidenceSummary)}</td>
        <td>${new Date(inv.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
        <td>
          <button type="button" class="btn btn-secondary btn-sm" onclick="inspectHistoryItem('${escapeHtml(inv.id)}')">Inspect</button>
          <button type="button" class="btn btn-secondary btn-sm" style="margin-left: 0.25rem;" onclick="window.open('/api/investigations/${escapeHtml(inv.id)}/export', '_blank')" title="Export Incident Report">Export</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">Failed to load history: ${err.message}</td></tr>`;
  }
}

/**
 * Loads a past investigation into the main report panel
 */
window.inspectHistoryItem = async function(id) {
  try {
    const res = await fetch(`/api/investigations/${id}`);
    if (!res.ok) return;
    const inv = await res.json();
    renderAnalysisReport(inv);
    window.location.hash = '#results-panel';
  } catch (err) {
    alert(`Could not load investigation: ${err.message}`);
  }
};

/**
 * Seeds demo campaigns via /api/scamchain/seed (Local Development)
 * No administrative secrets are requested, stored, or transmitted by frontend code.
 */
async function handleSeedDemo() {
  try {
    const res = await fetch('/api/scamchain/seed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      let errMsg = `Server returned HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errMsg = errJson.error;
      } catch (_) {}
      throw new Error(errMsg);
    }
    const data = await res.json();
    await loadScamChainGraph();
    await loadInvestigationHistory();
    alert('Demo campaigns reloaded successfully! Check the SCAMCHAIN visualizer below.');
  } catch (err) {
    alert(`Could not seed demo: ${err.message}`);
  }
}

/**
 * Resets database to clean state (Local Development)
 * No administrative secrets are requested, stored, or transmitted by frontend code.
 */
async function handleResetDatabase() {
  if (!confirm('Reset local investigation database to a clean state? (This will clear previous test and demo records)')) {
    return;
  }
  try {
    const res = await fetch('/api/scamchain/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) {
      let errMsg = `Server returned HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.error) errMsg = errJson.error;
      } catch (_) {}
      throw new Error(errMsg);
    }
    const data = await res.json();
    await loadScamChainGraph();
    await loadInvestigationHistory();
    // Reset findings display
    document.getElementById('results-content').classList.add('hidden');
    document.getElementById('results-empty').classList.remove('hidden');
    document.getElementById('report-inv-id').textContent = 'AWAITING INPUT';
    alert('Database successfully reset to 0 records. Ready for a clean test!');
  } catch (err) {
    alert(`Could not reset database: ${err.message}`);
  }
}

// -------------------------------------------------------------
// Interactive HTML5 Canvas Graph Renderer (Zero external library dependencies)
// -------------------------------------------------------------
let canvas, ctx;
let graphNodes = [];
let graphLinks = [];
let isDragging = false;
let draggedNode = null;
let offset = { x: 0, y: 0 };
let startDrag = { x: 0, y: 0 };

function initGraph() {
  canvas = document.getElementById('scamchain-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');

  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    drawGraph();
  });

  // Mouse interaction
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Check if clicked a node
    const clicked = getNodeAt(mouseX, mouseY);
    if (clicked) {
      draggedNode = clicked;
      selectedNode = clicked;
      showNodeInspector(clicked);
      drawGraph();
    } else {
      isDragging = true;
      startDrag = { x: mouseX - offset.x, y: mouseY - offset.y };
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (draggedNode) {
      draggedNode.x = mouseX - offset.x;
      draggedNode.y = mouseY - offset.y;
      drawGraph();
    } else if (isDragging) {
      offset.x = mouseX - startDrag.x;
      offset.y = mouseY - startDrag.y;
      drawGraph();
    } else {
      const hoverNode = getNodeAt(mouseX, mouseY);
      canvas.style.cursor = hoverNode ? 'pointer' : (isDragging ? 'grabbing' : 'grab');
    }
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
    draggedNode = null;
  });
}

function resizeCanvas() {
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  offset.x = rect.width / 2;
  offset.y = rect.height / 2;
}

function layoutGraph(data) {
  const nodes = data.nodes || [];
  const links = data.links || [];

  graphNodes = [];
  graphLinks = [];

  const total = nodes.length;
  if (total === 0) return;

  const radius = Math.min(canvas.parentElement.clientWidth, canvas.parentElement.clientHeight) * 0.35;

  // Position nodes in structured concentric circles (Evidence in center, messages surrounding)
  const evidenceNodes = nodes.filter(n => n.group.startsWith('evidence'));
  const invNodes = nodes.filter(n => n.group === 'investigation');

  evidenceNodes.forEach((node, i) => {
    const angle = (i / Math.max(evidenceNodes.length, 1)) * Math.PI * 2;
    const r = evidenceNodes.length > 1 ? radius * 0.35 : 0;
    graphNodes.push({
      ...node,
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
      radius: 18
    });
  });

  invNodes.forEach((node, i) => {
    const angle = (i / Math.max(invNodes.length, 1)) * Math.PI * 2;
    graphNodes.push({
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      radius: 16
    });
  });

  // Map links
  links.forEach(l => {
    const sourceNode = graphNodes.find(n => n.id === l.source);
    const targetNode = graphNodes.find(n => n.id === l.target);
    if (sourceNode && targetNode) {
      graphLinks.push({
        source: sourceNode,
        target: targetNode,
        strength: l.strength,
        type: l.type
      });
    }
  });
}

function getNodeAt(x, y) {
  const adjustedX = x - offset.x;
  const adjustedY = y - offset.y;

  for (let i = graphNodes.length - 1; i >= 0; i--) {
    const n = graphNodes[i];
    const dx = adjustedX - n.x;
    const dy = adjustedY - n.y;
    if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 4) {
      return n;
    }
  }
  return null;
}

function drawGraph() {
  if (!ctx || !canvas) return;
  const width = canvas.parentElement.clientWidth;
  const height = canvas.parentElement.clientHeight;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.translate(offset.x, offset.y);

  // Draw background grid pattern
  ctx.strokeStyle = '#111827';
  ctx.lineWidth = 1;
  const gridSize = 40;
  for (let x = -width; x < width * 2; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x - offset.x, -offset.y);
    ctx.lineTo(x - offset.x, height - offset.y);
    ctx.stroke();
  }
  for (let y = -height; y < height * 2; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(-offset.x, y - offset.y);
    ctx.lineTo(width - offset.x, y - offset.y);
    ctx.stroke();
  }

  // Clear Empty-State Display when no investigation nodes exist
  if (graphNodes.length === 0) {
    ctx.restore();
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = '600 15px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('No investigations or campaign correlations recorded yet.', width / 2, height / 2 - 12);

    ctx.font = '13px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Submit a message above to analyze intent and visualize cross-channel campaign linkages.', width / 2, height / 2 + 14);
    ctx.restore();
    return;
  }

  // Draw Links
  graphLinks.forEach(link => {
    ctx.beginPath();
    ctx.moveTo(link.source.x, link.source.y);
    ctx.lineTo(link.target.x, link.target.y);

    const isConnectedToSelected = selectedNode && (link.source.id === selectedNode.id || link.target.id === selectedNode.id);

    if (isConnectedToSelected) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
    } else {
      ctx.strokeStyle = link.strength === 'STRONG' ? '#a855f7' : '#64748b';
      ctx.lineWidth = link.strength === 'STRONG' ? 2 : 1;
    }

    if (link.strength !== 'STRONG') {
      ctx.setLineDash([4, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Draw Nodes
  graphNodes.forEach(node => {
    const isSelected = selectedNode && selectedNode.id === node.id;

    // Outer glow for selected
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius + 7, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.3)';
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

    // Node fill colors
    if (node.group === 'investigation') {
      if (node.source === 'gmail') {
        ctx.fillStyle = '#0284c7';
      } else if (node.source === 'whatsapp') {
        ctx.fillStyle = '#059669';
      } else {
        ctx.fillStyle = '#475569';
      }
    } else if (node.group === 'evidence_upi') {
      ctx.fillStyle = '#9333ea';
    } else if (node.group === 'evidence_domain') {
      ctx.fillStyle = '#d97706';
    } else if (node.group === 'evidence_platform') {
      ctx.fillStyle = '#0284c7';
    }

    ctx.fill();
    ctx.lineWidth = isSelected ? 2.5 : 1.5;
    ctx.strokeStyle = isSelected ? '#fff' : '#1e293b';
    ctx.stroke();

    // Node Label
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = isSelected ? '#ffffff' : '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let displayLabel = node.label || node.id;
    if (displayLabel.length > 20) {
      displayLabel = displayLabel.substring(0, 18) + '...';
    }
    ctx.fillText(displayLabel, node.x, node.y + node.radius + 12);
  });

  ctx.restore();
}

/**
 * Shows node details in the bottom inspector
 */
function showNodeInspector(node) {
  const inspector = document.getElementById('node-inspector');
  const title = document.getElementById('inspector-title');
  const body = document.getElementById('inspector-body');

  inspector.classList.remove('hidden');

  if (node.group === 'investigation') {
    title.textContent = `Investigation Node: ${node.id}`;
    body.innerHTML = `
      <p><strong>Channel:</strong> ${(node.source || 'manual').toUpperCase()} &bull; <strong>Language:</strong> ${node.language} &bull; <strong>Verdict:</strong> ${node.riskVerdict} (${node.riskScore}/100)</p>
      <p style="margin-top: 0.35rem; font-size: 0.8rem; color: #94a3b8;"><strong>Excerpt:</strong> "${escapeHtml(node.excerpt || '')}"</p>
      ${node.campaignId ? `<p style="margin-top: 0.35rem; color: #c084fc;"><strong>Connected Campaign ID:</strong> ${node.campaignId}</p>` : ''}
      <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 0.5rem;" onclick="inspectHistoryItem('${node.id}')">Inspect Full Analysis</button>
      <button type="button" class="btn btn-secondary btn-sm" style="margin-top: 0.5rem; margin-left: 0.35rem;" onclick="window.open('/api/investigations/${node.id}/export', '_blank')">📄 Export Report</button>
    `;
  } else {
    title.textContent = `Shared Technical Evidence: ${node.label}`;
    const connectedInvs = graphLinks.filter(l => l.target.id === node.id).map(l => l.source.id);
    body.innerHTML = `
      <p><strong>Evidence Value:</strong> <code>${escapeHtml(node.value || '')}</code></p>
      <p style="margin-top: 0.35rem;"><strong>Connected Ingestion Nodes:</strong> ${connectedInvs.join(', ') || 'None'}</p>
      <p style="margin-top: 0.35rem; font-size: 0.8rem; color: #f59e0b;">
        ℹ️ Technical Linkage: Shared identifiers establish shared technical infrastructure and routing connections. They represent infrastructure reuse, not proof of common criminal ownership or identity.
      </p>
    `;
  }
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

// -------------------------------------------------------------
// Phase 7B: SCAMCHAIN Campaign Chronological Timeline
// -------------------------------------------------------------

/**
 * Renders the Campaign Chronological Timeline.
 * Shows the sequence of linked investigations across platforms with exact evidence tags.
 * Clearly distinguishes STRONG, MODERATE, and WEAK evidence.
 * Explicitly states that connection is established via shared technical identifiers,
 * not chronological proximity.
 */
function renderCampaignTimeline(graphData) {
  const container = document.getElementById('timeline-container');
  const badge = document.getElementById('timeline-events-badge');
  if (!container || !badge) return;

  const nodes = graphData.nodes || [];
  const links = graphData.links || [];
  const invNodes = nodes.filter(n => n.group === 'investigation');

  // Find all investigations that have links or belong to a campaign
  const connectedIds = new Set();
  links.forEach(l => {
    connectedIds.add(typeof l.source === 'object' ? l.source.id : l.source);
    connectedIds.add(typeof l.target === 'object' ? l.target.id : l.target);
  });

  const linkedInvs = invNodes.filter(n => connectedIds.has(n.id) || n.campaignId);

  // Sort chronologically ascending
  linkedInvs.sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));

  badge.textContent = `${linkedInvs.length} Linked Message${linkedInvs.length === 1 ? '' : 's'}`;

  if (linkedInvs.length === 0) {
    container.innerHTML = `
      <div style="font-size: 0.82rem; color: #64748b; padding: 0.75rem 0; font-style: italic;">
        No linked multi-channel campaign sequence detected yet. Run investigations sharing identical payment handles (UPI) or domains to populate the cross-channel timeline.
      </div>
    `;
    return;
  }

  let html = '';
  linkedInvs.forEach((inv, index) => {
    const invId = inv.id;
    // Find all links connected to this investigation
    const invLinks = links.filter(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return srcId === invId || tgtId === invId;
    });

    const evidenceBadges = [];
    invLinks.forEach(l => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      const evidenceNodeId = srcId === invId ? tgtId : srcId;
      const evidenceNode = nodes.find(n => n.id === evidenceNodeId);

      if (evidenceNode) {
        const isStrong = l.strength === 'STRONG';
        const badgeClass = isStrong ? 'strong' : 'moderate';
        evidenceBadges.push(`
          <span class="evidence-badge ${badgeClass}" title="Shared Technical Identifier">
            <span>${isStrong ? '⚡ STRONG:' : '🔹 MODERATE:'}</span>
            <code>${escapeHtml(evidenceNode.label || evidenceNode.id)}</code>
          </span>
        `);
      }
    });

    const timeFormatted = inv.timestamp ? new Date(inv.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent';
    const channelIcon = inv.source === 'gmail' ? '✉️' : (inv.source === 'whatsapp' ? '💬' : '📝');
    const sourceClass = `source-${inv.source || 'manual'}`;

    html += `
      <div class="timeline-card ${sourceClass}" onclick="inspectHistoryItem('${escapeHtml(inv.id)}')">
        <div class="timeline-card-header">
          <div class="timeline-meta-left">
            <span class="timeline-channel-tag">${channelIcon} ${(inv.source || 'manual').toUpperCase()}</span>
            <span style="font-size: 0.82rem; font-weight: 700; color: #f8fafc;">Investigation ${index + 1}: ${escapeHtml(inv.id)}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span class="badge ${inv.riskVerdict === 'HIGH_RISK' ? 'badge-track' : (inv.riskVerdict === 'SUSPICIOUS' ? 'badge-accent' : 'badge-green')}" style="font-size: 0.7rem;">
              ${escapeHtml(inv.riskVerdict || 'LOW_RISK')} (${inv.riskScore || 0}/100)
            </span>
            <span class="timeline-time">${escapeHtml(timeFormatted)}</span>
          </div>
        </div>

        <div class="timeline-excerpt">
          "${escapeHtml(inv.excerpt || '')}"
        </div>

        <div class="timeline-linkage-row">
          <span style="color: var(--text-dim); font-size: 0.72rem; font-weight: 600;">LINKAGE EVIDENCE:</span>
          ${evidenceBadges.length > 0 ? evidenceBadges.join('') : '<span style="color: #64748b; font-size: 0.72rem;">Initial communication in cluster</span>'}
          <span class="timeline-boundary-text">&bull; Technical link (not criminal attribution)</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

