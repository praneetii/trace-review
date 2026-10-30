/**
 * TRACE - Incident Report Generator
 * 
 * Generates self-contained, clean, professional incident reports in standalone HTML.
 * Includes print-friendly stylesheets (@media print) for direct "Save as PDF" browser export
 * without requiring heavy external PDF generation dependencies.
 */

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Builds a standalone incident investigation report HTML document
 */
export function generateIncidentReportHtml(investigation, db = { campaigns: [], investigations: [] }) {
  const inv = investigation;
  const isHigh = inv.riskVerdict === 'HIGH_RISK';
  const isSuspicious = inv.riskVerdict === 'SUSPICIOUS';
  const verdictClass = isHigh ? 'high-risk' : (isSuspicious ? 'suspicious' : 'low-risk');
  const verdictLabel = isHigh ? 'HIGH RISK' : (isSuspicious ? 'SUSPICIOUS' : 'LOW RISK');

  // Find linked campaign if present
  let linkedCampaign = null;
  let linkedInvestigations = [];
  if (inv.campaignId && db.campaigns) {
    linkedCampaign = db.campaigns.find(c => c.id === inv.campaignId);
    if (linkedCampaign && db.investigations) {
      linkedInvestigations = db.investigations.filter(i => 
        linkedCampaign.investigationIds.includes(i.id) && i.id !== inv.id
      );
    }
  }

  const generatedDate = new Date().toUTCString();
  const invDate = inv.timestamp ? new Date(inv.timestamp).toUTCString() : 'N/A';

  const identifiers = inv.identifiers || { upiIds: [], domains: [], phoneNumbers: [], emails: [], urls: [] };
  const claims = inv.claims || [];
  const findings = inv.findings || [];
  const recommendations = inv.recommendedActions || [];

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TRACE Incident Report — ${escapeHtml(inv.id)}</title>
  <style>
    :root {
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      --font-mono: 'JetBrains Mono', 'SF Mono', Consolas, Menlo, monospace;
      --color-bg: #f8fafc;
      --color-surface: #ffffff;
      --color-border: #e2e8f0;
      --color-text: #0f172a;
      --color-muted: #64748b;
      --color-high: #dc2626;
      --color-suspicious: #d97706;
      --color-low: #059669;
      --color-accent: #0284c7;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: var(--font-sans);
      background-color: var(--color-bg);
      color: var(--color-text);
      line-height: 1.55;
      padding: 2rem 1rem;
    }

    .report-page {
      max-width: 860px;
      margin: 0 auto;
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 2.5rem 3rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }

    .no-print-toolbar {
      max-width: 860px;
      margin: 0 auto 1.5rem auto;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 0.75rem;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.5rem 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      border: 1px solid transparent;
    }
    .btn-primary { background: #0284c7; color: #fff; }
    .btn-primary:hover { background: #0369a1; }
    .btn-secondary { background: #fff; border-color: #cbd5e1; color: #334155; }
    .btn-secondary:hover { background: #f1f5f9; }

    /* Header */
    .report-header {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 1.25rem;
      margin-bottom: 1.75rem;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .header-logo {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 1.4rem;
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .header-subtitle {
      font-size: 0.82rem;
      color: var(--color-muted);
      margin-top: 0.2rem;
    }

    .header-meta {
      text-align: right;
      font-size: 0.8rem;
      color: var(--color-muted);
      font-family: var(--font-mono);
    }

    .report-title-strip {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1.5rem;
      padding: 1rem 1.25rem;
      border-radius: 6px;
      background: #f1f5f9;
      border-left: 4px solid #0284c7;
    }
    .report-title-strip.high-risk { border-left-color: var(--color-high); background: #fef2f2; }
    .report-title-strip.suspicious { border-left-color: var(--color-suspicious); background: #fffbeb; }
    .report-title-strip.low-risk { border-left-color: var(--color-low); background: #f0fdf4; }

    .verdict-tag {
      font-size: 1.1rem;
      font-weight: 800;
      letter-spacing: 0.03em;
    }
    .verdict-tag.high-risk { color: var(--color-high); }
    .verdict-tag.suspicious { color: var(--color-suspicious); }
    .verdict-tag.low-risk { color: var(--color-low); }

    .score-badge {
      font-size: 1rem;
      font-weight: 700;
      padding: 0.25rem 0.65rem;
      border-radius: 4px;
      background: #fff;
      border: 1px solid rgba(0, 0, 0, 0.1);
      font-family: var(--font-mono);
    }

    /* Section Styles */
    .section-title {
      font-size: 0.95rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #334155;
      border-bottom: 1px solid var(--color-border);
      padding-bottom: 0.35rem;
      margin: 1.5rem 0 0.75rem 0;
    }

    .meta-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .meta-card {
      background: #f8fafc;
      padding: 0.65rem 0.85rem;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
    }
    .meta-card-label {
      font-size: 0.72rem;
      color: var(--color-muted);
      text-transform: uppercase;
      font-weight: 600;
    }
    .meta-card-value {
      font-size: 0.88rem;
      font-weight: 600;
      color: #0f172a;
      margin-top: 0.15rem;
    }

    .raw-message-box {
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 1rem;
      font-family: var(--font-mono);
      font-size: 0.82rem;
      white-space: pre-wrap;
      word-break: break-word;
      color: #1e293b;
      margin-bottom: 1rem;
    }

    /* Identifiers Table */
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.82rem;
      margin-bottom: 1rem;
    }
    table.data-table th, table.data-table td {
      padding: 0.5rem 0.75rem;
      border: 1px solid var(--color-border);
      text-align: left;
    }
    table.data-table th {
      background: #f1f5f9;
      font-weight: 600;
      color: #334155;
    }
    table.data-table code {
      font-family: var(--font-mono);
      color: #0369a1;
      font-weight: 600;
    }

    /* Status Badges */
    .status-pill {
      display: inline-block;
      padding: 0.15rem 0.45rem;
      font-size: 0.72rem;
      font-weight: 700;
      border-radius: 4px;
      text-transform: uppercase;
    }
    .status-SUPPORTED { background: #dcfce7; color: #15803d; }
    .status-CONTRADICTED { background: #fee2e2; color: #b91c1c; }
    .status-UNVERIFIED { background: #fef3c7; color: #b45309; }

    /* SCAMCHAIN Linkage Block */
    .scamchain-box {
      border: 1px solid #c084fc;
      background: #faf5ff;
      border-radius: 6px;
      padding: 1rem 1.25rem;
      margin-bottom: 1rem;
    }
    .scamchain-title {
      color: #7e22ce;
      font-weight: 700;
      font-size: 0.9rem;
      margin-bottom: 0.35rem;
    }

    /* Limitations Disclaimer */
    .limitations-box {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-left: 4px solid #f59e0b;
      border-radius: 4px;
      padding: 0.85rem 1rem;
      font-size: 0.78rem;
      color: #78350f;
      line-height: 1.5;
      margin-top: 1.75rem;
    }

    .footer-note {
      text-align: center;
      font-size: 0.75rem;
      color: var(--color-muted);
      margin-top: 1.5rem;
      border-top: 1px solid var(--color-border);
      padding-top: 0.75rem;
    }

    /* Print Formatting */
    @media print {
      body { background: #fff; padding: 0; }
      .no-print-toolbar { display: none !important; }
      .report-page { border: none; box-shadow: none; padding: 0; max-width: 100%; }
      a { text-decoration: none; color: inherit; }
    }
  </style>
</head>
<body>

  <!-- Screen-Only Toolbar -->
  <div class="no-print-toolbar">
    <div style="font-size: 0.82rem; color: #64748b;">
      Incident Report Preview &bull; Ready for printing or PDF export
    </div>
    <div style="display: flex; gap: 0.5rem;">
      <button type="button" class="btn btn-secondary" onclick="window.close()">Close</button>
      <button type="button" class="btn btn-primary" onclick="window.print()">🖨️ Print / Save as PDF</button>
    </div>
  </div>

  <!-- Main Report Container -->
  <div class="report-page">
    
    <!-- Header -->
    <header class="report-header">
      <div>
        <div class="header-logo">
          <span>🛡️</span>
          <span>TRACE</span>
        </div>
        <div class="header-subtitle">Digital Trust & Cross-Channel Scam Investigation Platform</div>
        <div style="font-size: 0.78rem; font-weight: 600; color: #0284c7; margin-top: 0.15rem;">Defensive Threat Intelligence</div>
      </div>
      <div class="header-meta">
        <div><strong>REPORT ID:</strong> ${escapeHtml(inv.id)}</div>
        <div><strong>TIMESTAMP:</strong> ${escapeHtml(invDate)}</div>
        <div><strong>GENERATED:</strong> ${escapeHtml(generatedDate)}</div>
      </div>
    </header>

    <!-- Verdict Banner -->
    <div class="report-title-strip ${verdictClass}">
      <div>
        <div style="font-size: 0.72rem; text-transform: uppercase; font-weight: 600; color: #475569;">Investigation Assessment</div>
        <div class="verdict-tag ${verdictClass}">${verdictLabel} (${escapeHtml(inv.riskVerdict || 'LOW_RISK')})</div>
      </div>
      <div class="score-badge">Threat Score: ${escapeHtml(inv.riskScore || 0)} / 100</div>
    </div>

    <!-- Metadata Grid -->
    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-card-label">Platform Source</div>
        <div class="meta-card-value">${escapeHtml((inv.source || 'manual').toUpperCase())}</div>
      </div>
      <div class="meta-card">
        <div class="meta-card-label">Language</div>
        <div class="meta-card-value">${escapeHtml(inv.language?.primary || 'Unknown')}</div>
      </div>
      <div class="meta-card">
        <div class="meta-card-label">Analysis Provenance</div>
        <div class="meta-card-value">${escapeHtml(inv.analysisMode || 'Deterministic Fallback')}</div>
      </div>
      <div class="meta-card">
        <div class="meta-card-label">Campaign Linkage</div>
        <div class="meta-card-value">${escapeHtml(inv.campaignId || 'None (Isolated)')}</div>
      </div>
    </div>

    <!-- Intent Summary -->
    <h3 class="section-title">1. Conversational Intent & Executive Summary</h3>
    <p style="font-size: 0.88rem; color: #1e293b; margin-bottom: 1rem;">
      ${escapeHtml(inv.intentSummary || 'No specific threat intent identified in text.')}
    </p>

    <!-- Original Message -->
    <h3 class="section-title">2. Ingested Communication (PII Redacted)</h3>
    <div class="raw-message-box">${escapeHtml(inv.rawText || inv.excerpt || '')}</div>

    <!-- Technical Identifiers -->
    <h3 class="section-title">3. Extracted Technical Identifiers</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 25%;">Category</th>
          <th style="width: 50%;">Identifier Value</th>
          <th style="width: 25%;">Verification Role</th>
        </tr>
      </thead>
      <tbody>
        ${(identifiers.upiIds && identifiers.upiIds.length > 0) ? identifiers.upiIds.map(upi => `
          <tr>
            <td><strong>UPI Handle</strong></td>
            <td><code>${escapeHtml(upi)}</code></td>
            <td>Financial routing / exact correlation handle</td>
          </tr>
        `).join('') : ''}
        ${(identifiers.domains && identifiers.domains.length > 0) ? identifiers.domains.map(d => `
          <tr>
            <td><strong>Domain / Host</strong></td>
            <td><code>${escapeHtml(d)}</code></td>
            <td>Infrastructure domain lookup</td>
          </tr>
        `).join('') : ''}
        ${(identifiers.phoneNumbers && identifiers.phoneNumbers.length > 0) ? identifiers.phoneNumbers.map(p => `
          <tr>
            <td><strong>Phone / SMS Sender</strong></td>
            <td><code>${escapeHtml(p)}</code></td>
            <td>Telephony identifier</td>
          </tr>
        `).join('') : ''}
        ${(identifiers.emails && identifiers.emails.length > 0) ? identifiers.emails.map(e => `
          <tr>
            <td><strong>Email Contact</strong></td>
            <td><code>${escapeHtml(e)}</code></td>
            <td>Electronic mail contact</td>
          </tr>
        `).join('') : ''}
        ${(!identifiers.extractedCount && (!identifiers.upiIds || identifiers.upiIds.length === 0) && (!identifiers.domains || identifiers.domains.length === 0) && (!identifiers.phoneNumbers || identifiers.phoneNumbers.length === 0)) ? `
          <tr>
            <td colspan="3" style="color: #64748b; font-style: italic;">No technical routing identifiers (UPI, domains, phones) detected in message text.</td>
          </tr>
        ` : ''}
      </tbody>
    </table>

    <!-- Institutional Claims -->
    <h3 class="section-title">4. Institutional Claims & Registry Verification</h3>
    ${claims.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>Claimed Organization</th>
            <th>Verification Status</th>
            <th>Reference Evidence / Justification</th>
          </tr>
        </thead>
        <tbody>
          ${claims.map(c => `
            <tr>
              <td><strong>${escapeHtml(c.organizationName || 'Unknown Entity')}</strong></td>
              <td><span class="status-pill status-${escapeHtml(c.status)}">${escapeHtml(c.status)}</span></td>
              <td>${escapeHtml(c.reason || 'Verified against trusted institutional registry.')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : '<p style="font-size: 0.85rem; color: #64748b;">No institutional claims referenced in communication.</p>'}

    <!-- Suspicious Behavioral Signals -->
    ${findings.length > 0 ? `
      <h3 class="section-title">5. Suspicious Behavioral Signals & Evidence Quotes</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Category / Severity</th>
            <th>Evidence Quote from Message</th>
            <th>Threat Explanation</th>
          </tr>
        </thead>
        <tbody>
          ${findings.map(f => `
            <tr>
              <td>
                <span class="status-pill" style="background: #fee2e2; color: #b91c1c;">${escapeHtml(f.severity || 'HIGH')}</span>
                <div style="font-weight: 600; font-size: 0.78rem; margin-top: 0.2rem;">${escapeHtml(f.label || f.category)}</div>
              </td>
              <td><em style="color: #475569;">"${escapeHtml(f.quote || '')}"</em></td>
              <td>${escapeHtml(f.explanation || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : ''}

    <!-- SCAMCHAIN Cross-Channel Campaign Findings -->
    <h3 class="section-title">6. Cross-Channel Campaign Correlation (SCAMCHAIN)</h3>
    ${linkedCampaign ? `
      <div class="scamchain-box">
        <div class="scamchain-title">🔗 Associated Campaign: ${escapeHtml(linkedCampaign.id)} &bull; ${escapeHtml(linkedCampaign.title || 'Coordinated Activity')}</div>
        <p style="font-size: 0.82rem; color: #4b5563; margin-bottom: 0.65rem;">
          This communication shares technical infrastructure with <strong>${linkedInvestigations.length}</strong> other message(s) spanning channels: 
          <strong>${(linkedCampaign.channels || []).map(ch => ch.toUpperCase()).join(', ')}</strong>.
        </p>

        <div style="font-size: 0.8rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem;">Shared Technical Evidence:</div>
        <ul style="font-size: 0.8rem; padding-left: 1.25rem; color: #1f2937; margin-bottom: 0.75rem;">
          ${(linkedCampaign.sharedEvidenceSummary || []).map(e => `
            <li>[<strong>${escapeHtml(e.strength || 'STRONG')}</strong>] Shared ${escapeHtml(e.type)}: <code>${escapeHtml(e.value)}</code></li>
          `).join('')}
        </ul>

        <div style="font-size: 0.8rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem;">Linked Investigation Nodes:</div>
        <table class="data-table" style="background: #fff; margin-bottom: 0;">
          <thead>
            <tr>
              <th>ID</th>
              <th>Channel</th>
              <th>Verdict</th>
              <th>Timestamp</th>
            </tr>
          </thead>
          <tbody>
            ${linkedInvestigations.map(li => `
              <tr>
                <td><code>${escapeHtml(li.id)}</code></td>
                <td>${escapeHtml((li.source || 'manual').toUpperCase())}</td>
                <td>${escapeHtml(li.riskVerdict || 'LOW_RISK')} (${escapeHtml(li.riskScore || 0)}/100)</td>
                <td>${escapeHtml(li.timestamp ? new Date(li.timestamp).toLocaleDateString() : 'N/A')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : `
      <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 1rem;">
        No shared technical identifiers currently connect this record to other stored investigations. It is classified as an isolated event.
      </p>
    `}

    <!-- Safe Recommendations -->
    <h3 class="section-title">7. Actionable Defensive Recommendations</h3>
    <ul style="font-size: 0.84rem; padding-left: 1.25rem; color: #1e293b; line-height: 1.6; margin-bottom: 1rem;">
      ${recommendations.map(r => `<li>${escapeHtml(r)}</li>`).join('')}
    </ul>

    <!-- Important Limitations Disclaimer -->
    <div class="limitations-box">
      <strong>⚠️ IMPORTANT DEFENSIVE CYBERSECURITY NOTICE & ATTRIBUTION BOUNDARY:</strong><br>
      Shared technical identifiers (such as identical UPI payment handles, phone numbers, or server domains) establish shared technical infrastructure and financial routing connections across communications. 
      They demonstrate technical infrastructure reuse across channels. 
      They do not constitute proof of common criminal ownership, organizational attribution, or legal identity. Absence of detected signals is not proof of legitimacy.
    </div>

    <div class="footer-note">
      TRACE — Cross-Channel Scam Investigation & Campaign Correlation Platform &bull; Defensive Threat Intelligence
    </div>

  </div>

</body>
</html>`;
}
