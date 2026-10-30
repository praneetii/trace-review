/**
 * TRACE - SCAMCHAIN Correlation Engine
 * 
 * Central Differentiator: Evidence-Based Cross-Channel Campaign Detection
 * 
 * Rules:
 * 1. Compare previously analysed communications across Gmail, WhatsApp, and manual submissions.
 * 2. Distinguish evidence strength:
 *    - STRONG: Shared exact payment identifier (UPI ID) or exact domain name.
 *    - MODERATE: Shared phone number or direct email.
 *    - WEAK: Similar wording or generic phrasing alone.
 * 3. NEVER treat similar wording alone as proof of a campaign connection.
 * 4. Transparently explain WHY messages were connected.
 */

import { readDatabase, writeDatabase, updateDatabase } from './storage.js';
import { TRUSTED_ORGANIZATIONS } from './trusted_registry.js';

// Multi-tenant platforms, public form builders, link shorteners, and social channels
const COMMON_PUBLIC_PLATFORMS = new Set([
  'forms.gle', 'docs.google.com', 'drive.google.com', 'sites.google.com',
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'is.gd', 'buff.ly', 'cutt.ly',
  'wa.me', 'api.whatsapp.com', 'whatsapp.com',
  't.me', 'telegram.me',
  'google.com', 'youtube.com', 'youtu.be',
  'facebook.com', 'fb.me', 'instagram.com', 'twitter.com', 'x.com',
  'linkedin.com', 'github.com', 'notion.so', 'canva.com', 'medium.com'
]);

/**
 * Checks if a domain belongs to a verified trusted official organization
 */
export function isTrustedOfficialDomain(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase().trim();
  return TRUSTED_ORGANIZATIONS.some(org =>
    org.officialDomains.some(od => d === od || d.endsWith('.' + od))
  );
}

/**
 * Checks if a domain is a common public multi-tenant platform or link shortener
 */
export function isCommonPublicPlatform(domain) {
  if (!domain) return false;
  const d = domain.toLowerCase().trim();
  return COMMON_PUBLIC_PLATFORMS.has(d) || Array.from(COMMON_PUBLIC_PLATFORMS).some(p => d.endsWith('.' + p));
}

/**
 * Normalizes an identifier string for clean indexing
 */
function normalize(str) {
  return typeof str === 'string' ? str.trim().toLowerCase() : '';
}

/**
 * Privacy-conscious PII sanitization for raw message storage.
 * Redacts sensitive credentials (Aadhaar, payment card numbers, OTPs, passwords, CVVs, secret PINs)
 * while strictly preserving investigation identifiers (UPI IDs, domains, URLs, phone numbers, postal codes).
 */
export function sanitizeMessageForStorage(text) {
  if (!text || typeof text !== 'string') return '';

  let sanitized = text;

  // Placeholder vaults to protect legitimate technical identifiers
  const protectedTokens = [];
  function protect(token) {
    const placeholder = `___TRACE_PROTECTED_${protectedTokens.length}___`;
    protectedTokens.push({ placeholder, token });
    return placeholder;
  }

  // 1. Protect URLs & Web Links (e.g. https://bescom.karnataka.gov.in, http://evil-phish.in/path/1234)
  sanitized = sanitized.replace(/\b(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`[\]]+/gi, (url) => {
    return protect(url);
  });

  // 2. Protect UPI IDs and Email Addresses (e.g. bescom-dues@okaxis, 9876543210@paytm, user@gmail.com)
  sanitized = sanitized.replace(/\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b|\b[a-zA-Z0-9_.+-]+@(okhdfcbank|okaxis|oksbi|okicici|paytm|ybl|upi|apl|axl|ibl|sbi|hdfcbank|icici|barodampay)\b/gi, (handle) => {
    return protect(handle);
  });

  // 3. Protect Postal PIN codes (e.g. "PIN code: 560001", "pincode is 560001", "postal PIN 560001")
  sanitized = sanitized.replace(/\b(?:postal\s+code|pincode|postal\s+pin|pin\s+code)[\s:=]+(\d{6})\b/gi, (match) => {
    return protect(match);
  });

  // 4. Protect legitimate Indian Phone Numbers (e.g. +91 9845123456, +91-9876543210, 1800-111-2223)
  sanitized = sanitized.replace(/(?:\+91[\s\-]?)?[6-9]\d{4}[\s\-]?\d{5}\b|\b1800[\s\-]?\d{3}[\s\-]?\d{3,4}\b/g, (phone) => {
    return protect(phone);
  });

  // -------------------------------------------------------------
  // APPLY STRICT PII SANITIZATION ON REMAINING TEXT
  // -------------------------------------------------------------

  // A. Redact 16-digit Credit/Debit card numbers (e.g. 4111 2222 3333 4444 or 4111-2222-3333-4444)
  sanitized = sanitized.replace(/\b(?:\d{4}[-\s]?){3}(\d{4})\b/g, 'XXXX-XXXX-XXXX-$1 [REDACTED_CARD]');

  // B. Redact 12-digit Indian Aadhaar numbers:
  // - Formatted as 4-4-4: e.g. 5432 1234 5678 or 5432-1234-5678
  // - Contiguous 12 digits when explicitly labeled as Aadhaar/UID: e.g. "Aadhaar: 543212345678"
  sanitized = sanitized.replace(/\b([2-9]\d{3})[\s\-](\d{4})[\s\-](\d{4})\b/g, '$1-XXXX-XXXX [REDACTED_AADHAAR]');
  sanitized = sanitized.replace(/\b(?:aadhaar|uidai|uid)[\s:=]+([2-9]\d{3})(\d{8})\b/gi, (match, prefix) => {
    return `Aadhaar: ${prefix}-XXXX-XXXX [REDACTED_AADHAAR]`;
  });

  // C. Redact explicit secrets: OTPs, Passwords, CVVs, ATM/UPI/Banking PINs
  sanitized = sanitized.replace(/\b(otp|cvv|password|pwd|secret|atm\s*pin|upi\s*pin|card\s*pin|login\s*pin)(?:[\s:=]+|[\s]+is[\s]+)([a-zA-Z0-9!@#$%^&*_\-]{3,64})\b/gi, (match, prefix) => {
    return `${prefix}: [REDACTED_SECRET]`;
  });
  // Standalone secret PIN: e.g. "PIN: 1234", "PIN is 4321" (only 4 to 6 digit numbers)
  sanitized = sanitized.replace(/\bpin(?:[\s:=]+|[\s]+is[\s]+)(\d{4,6})\b/gi, 'PIN: [REDACTED_SECRET]');

  // -------------------------------------------------------------
  // RESTORE PROTECTED TOKENS
  // -------------------------------------------------------------
  for (const { placeholder, token } of protectedTokens) {
    sanitized = sanitized.split(placeholder).join(token);
  }

  return sanitized;
}

/**
 * Ingests an analysis report, records it, and correlates with past records
 */
export async function recordAndCorrelate(analysisReport) {
  let resultPayload = null;

  await updateDatabase(async (db) => {
    const investigationId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const currentUpiIds = (analysisReport.identifiers.upiIds || []).map(normalize);
    const currentDomains = (analysisReport.identifiers.domains || []).map(normalize);
    const currentPhones = (analysisReport.identifiers.phoneNumbers || []).map(normalize);

  const matchedConnections = [];

  // Compare against all past investigations in database
  for (const prev of db.investigations) {
    const prevUpiIds = (prev.identifiers.upiIds || []).map(normalize);
    const prevDomains = (prev.identifiers.domains || []).map(normalize);
    const prevPhones = (prev.identifiers.phoneNumbers || []).map(normalize);

    const sharedEvidence = [];

    // 1. Check for STRONG evidence: Shared UPI payment handle
    for (const upi of currentUpiIds) {
      if (prevUpiIds.includes(upi)) {
        sharedEvidence.push({
          type: 'UPI_PAYMENT_HANDLE',
          value: upi,
          strength: 'STRONG',
          explanation: `Both messages share the identical payment identifier (${upi}). This establishes a strong technical connection via shared financial routing. Note: This establishes a shared technical identifier, not common criminal ownership or identity.`
        });
      }
    }

    // 2. Check for domain match (distinguishing public platforms/official domains from dedicated infrastructure)
    for (const domain of currentDomains) {
      if (prevDomains.includes(domain)) {
        const isOfficial = isTrustedOfficialDomain(domain);
        const isPlatform = isCommonPublicPlatform(domain);

        if (isOfficial) {
          sharedEvidence.push({
            type: 'OFFICIAL_ORGANIZATION_DOMAIN',
            value: domain,
            strength: 'INFORMATIONAL',
            explanation: `Both messages reference the verified official domain (${domain}). Shared official domains represent legitimate public reference points, not attacker campaign coordination.`
          });
        } else if (isPlatform) {
          sharedEvidence.push({
            type: 'SHARED_PUBLIC_PLATFORM',
            value: domain,
            strength: 'INFORMATIONAL',
            explanation: `Both messages reference a common public multi-tenant platform (${domain}). Shared public platforms (such as form builders or link shorteners) represent common service usage rather than coordinating attacker infrastructure.`
          });
        } else {
          sharedEvidence.push({
            type: 'DOMAIN_INFRASTRUCTURE',
            value: domain,
            strength: 'STRONG',
            explanation: `Both communications direct traffic to the identical web domain (${domain}). This establishes a strong technical link via shared technical infrastructure, not proof of common ownership or identity.`
          });
        }
      }
    }

    // 3. Check for MODERATE evidence: Shared phone number
    for (const phone of currentPhones) {
      if (prevPhones.includes(phone)) {
        sharedEvidence.push({
          type: 'PHONE_NUMBER',
          value: phone,
          strength: 'MODERATE',
          explanation: `Both messages reference the same contact phone number (${phone}). Represents a moderate technical correlation; phone numbers may be shared, reused, or spoofed.`
        });
      }
    }

    // Only establish a campaign connection if actionable technical evidence exists (STRONG or MODERATE)
    // Common public platforms and official domains (INFORMATIONAL) do NOT forge campaign connections!
    const actionableEvidence = sharedEvidence.filter(e => e.strength === 'STRONG' || e.strength === 'MODERATE');

    if (actionableEvidence.length > 0) {
      const hasStrong = actionableEvidence.some(e => e.strength === 'STRONG');
      matchedConnections.push({
        targetInvestigationId: prev.id,
        targetSource: prev.source,
        targetLanguage: prev.language.primary,
        targetExcerpt: prev.excerpt,
        targetTimestamp: prev.timestamp,
        connectionStrength: hasStrong ? 'STRONG' : 'MODERATE',
        sharedEvidence: sharedEvidence // preserves exact evidence with accurate explanations
      });
    }
  }

  // Determine Campaign Association
  let assignedCampaignId = null;
  let campaignTitle = null;

  if (matchedConnections.length > 0) {
    // Check if any matched investigation already belongs to an existing campaign
    for (const match of matchedConnections) {
      const existingCampaign = db.campaigns.find(c => c.investigationIds.includes(match.targetInvestigationId));
      if (existingCampaign) {
        assignedCampaignId = existingCampaign.id;
        campaignTitle = existingCampaign.title;
        break;
      }
    }

    // If no existing campaign cluster exists, forge a new one
    if (!assignedCampaignId) {
      assignedCampaignId = `CAMP-${Date.now().toString(36).toUpperCase()}`;
      const primaryEvidence = matchedConnections[0].sharedEvidence[0];
      campaignTitle = `Coordinated Campaign [Shared ${primaryEvidence.type}: ${primaryEvidence.value}]`;
    }
  }

  // Create new investigation record with privacy-conscious sanitized text storage
  const sanitizedText = sanitizeMessageForStorage(analysisReport.rawText || '');
  const newRecord = {
    id: investigationId,
    timestamp: analysisReport.timestamp || new Date().toISOString(),
    source: analysisReport.source || 'manual',
    language: analysisReport.language,
    excerpt: sanitizedText.substring(0, 160) + (sanitizedText.length > 160 ? '...' : ''),
    rawText: sanitizedText,
    riskVerdict: analysisReport.riskVerdict,
    riskScore: analysisReport.riskScore,
    intentSummary: analysisReport.intentSummary,
    identifiers: analysisReport.identifiers,
    findings: analysisReport.findings,
    claims: analysisReport.claims,
    recommendedActions: analysisReport.recommendedActions,
    analysisMode: analysisReport.analysisMode,
    campaignId: assignedCampaignId
  };

  // Add investigation to database
  db.investigations.unshift(newRecord);

  // Update or create campaign record
  let currentCampaign = null;
  if (assignedCampaignId) {
    let camp = db.campaigns.find(c => c.id === assignedCampaignId);
    if (!camp) {
      camp = {
        id: assignedCampaignId,
        title: campaignTitle,
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        investigationIds: [],
        channels: [],
        sharedEvidenceSummary: []
      };
      db.campaigns.unshift(camp);
    }

    // Add this investigation if not already present
    if (!camp.investigationIds.includes(investigationId)) {
      camp.investigationIds.push(investigationId);
    }

    // Add all connected investigation IDs
    for (const match of matchedConnections) {
      if (!camp.investigationIds.includes(match.targetInvestigationId)) {
        camp.investigationIds.push(match.targetInvestigationId);
      }
    }

    // Update channels
    const relatedInvs = db.investigations.filter(i => camp.investigationIds.includes(i.id));
    camp.channels = Array.from(new Set(relatedInvs.map(i => i.source)));
    camp.lastActivity = new Date().toISOString();

    // Ensure all connected investigations in stored history display the campaign ID
    for (const inv of db.investigations) {
      if (camp.investigationIds.includes(inv.id)) {
        inv.campaignId = assignedCampaignId;
      }
    }

    // Consolidate shared evidence
    const allEvidence = [];
    matchedConnections.forEach(m => m.sharedEvidence.forEach(e => {
      if (!allEvidence.some(ae => ae.value === e.value)) {
        allEvidence.push({
          type: e.type,
          value: e.value,
          strength: e.strength
        });
      }
    }));
    camp.sharedEvidenceSummary = allEvidence;
    currentCampaign = camp;
  }

  resultPayload = {
    investigation: newRecord,
    scamchain: {
      hasCampaignConnection: matchedConnections.length > 0,
      campaignId: assignedCampaignId,
      campaign: currentCampaign,
      connectionCount: matchedConnections.length,
      connections: matchedConnections,
      summary: matchedConnections.length > 0
        ? `SCAMCHAIN detected ${matchedConnections.length} connected communication(s) spanning [${currentCampaign.channels.join(', ')}] linked by shared technical infrastructure (shared technical identifier, not proof of common criminal ownership or identity).`
        : 'SCAMCHAIN found no previously analyzed communications sharing exact payment or technical infrastructure with this message.'
    }
  };

  return db;
});

return resultPayload;
}

/**
 * Returns formatted graph dataset for UI network visualization
 */
export function getScamChainGraph() {
  const db = readDatabase();
  const nodes = [];
  const links = [];

  // 1. Add Investigation Nodes
  for (const inv of db.investigations) {
    nodes.push({
      id: inv.id,
      label: `${inv.source.toUpperCase()}: ${inv.id}`,
      group: 'investigation',
      source: inv.source,
      riskVerdict: inv.riskVerdict,
      riskScore: inv.riskScore,
      language: inv.language?.primary || 'Unknown',
      timestamp: inv.timestamp,
      excerpt: inv.excerpt,
      campaignId: inv.campaignId
    });

    // 2. Add Evidence Nodes & Links
    // Link UPIs
    for (const upi of (inv.identifiers?.upiIds || [])) {
      const upiNodeId = `evidence-upi-${upi.toLowerCase()}`;
      if (!nodes.some(n => n.id === upiNodeId)) {
        nodes.push({
          id: upiNodeId,
          label: `UPI: ${upi}`,
          group: 'evidence_upi',
          value: upi
        });
      }
      links.push({
        source: inv.id,
        target: upiNodeId,
        strength: 'STRONG',
        type: 'UPI_LINK'
      });
    }

    // Link Domains (distinguishing platform/official from campaign domains)
    for (const domain of (inv.identifiers?.domains || [])) {
      const isOfficial = isTrustedOfficialDomain(domain);
      const isPlatform = isCommonPublicPlatform(domain);

      if (isOfficial || isPlatform) {
        const platformNodeId = `evidence-platform-${domain.toLowerCase()}`;
        if (!nodes.some(n => n.id === platformNodeId)) {
          nodes.push({
            id: platformNodeId,
            label: isOfficial ? `Official: ${domain}` : `Platform: ${domain}`,
            group: 'evidence_platform',
            value: domain
          });
        }
        links.push({
          source: inv.id,
          target: platformNodeId,
          strength: 'INFORMATIONAL',
          type: 'PLATFORM_LINK'
        });
      } else {
        const domainNodeId = `evidence-domain-${domain.toLowerCase()}`;
        if (!nodes.some(n => n.id === domainNodeId)) {
          nodes.push({
            id: domainNodeId,
            label: `Domain: ${domain}`,
            group: 'evidence_domain',
            value: domain
          });
        }
        links.push({
          source: inv.id,
          target: domainNodeId,
          strength: 'STRONG',
          type: 'DOMAIN_LINK'
        });
      }
    }
  }

  return {
    nodes,
    links,
    campaigns: db.campaigns,
    totalInvestigations: db.investigations.length,
    totalCampaigns: db.campaigns.length
  };
}

/**
 * Retrieves past investigations list
 */
export function getInvestigations(limit = 50) {
  const db = readDatabase();
  return db.investigations.slice(0, limit);
}

/**
 * Retrieves a single investigation by ID
 */
export function getInvestigationById(id) {
  const db = readDatabase();
  return db.investigations.find(i => i.id === id) || null;
}

/**
 * Pre-seeds the database with demonstration synthetic cross-channel campaigns
 */
export async function seedDemoCampaigns() {
  const db = readDatabase();
  if (db.investigations.length > 0) {
    return { seeded: false, message: 'Database already contains investigation data.' };
  }

  // Demonstration Campaign 1: Coordinated BESCOM Disconnection Bait
  // Message 1: Gmail in English
  const inv1 = {
    id: 'INV-DEMO-GMAIL-01',
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString(),
    source: 'gmail',
    language: { primary: 'English', script: 'Latin', isCodeMixed: false },
    excerpt: 'Dear Consumer, your electricity bill is unpaid. Power cut tonight. Pay bill at upi: bescom-dues@okhdfcbank or power disconnected.',
    rawText: 'Dear Consumer, your electricity bill is unpaid. Power cut tonight at 9:30 PM. Pay bill at upi: bescom-dues@okhdfcbank or power disconnected.',
    riskVerdict: 'HIGH_RISK',
    riskScore: 85,
    intentSummary: 'Coercive power disconnection threat demanding payment to personal UPI address.',
    identifiers: {
      urls: [],
      domains: [],
      upiIds: ['bescom-dues@okhdfcbank'],
      phoneNumbers: ['+919876543210'],
      emails: []
    },
    findings: [
      { category: 'urgency_threat', label: 'Power Disconnection Threat', severity: 'HIGH', quote: 'Power cut tonight', explanation: 'Coercive urgency threat' },
      { category: 'payment_demand', label: 'Unverified Payment Demand', severity: 'HIGH', quote: 'Pay bill', explanation: 'Demands payment to unauthorized UPI' }
    ],
    claims: [
      { organizationName: 'Bangalore Electricity Supply Company (BESCOM)', status: 'UNVERIFIED', reason: 'Unverified UPI payment handle' }
    ],
    recommendedActions: ['Do not pay via the personal UPI handle.'],
    analysisMode: 'DETERMINISTIC_FALLBACK',
    campaignId: 'CAMP-DEMO-BESCOM'
  };

  // Message 2: WhatsApp in Hindi (Same UPI ID!)
  const inv2 = {
    id: 'INV-DEMO-WA-02',
    timestamp: new Date(Date.now() - 3600000 * 1).toISOString(),
    source: 'whatsapp',
    language: { primary: 'Hindi', script: 'Devanagari', isCodeMixed: false },
    excerpt: 'प्रिय उपभोक्ता, आज रात बिजली काट दी जाएगी। तुरंत बिल भरें UPI ID: bescom-dues@okhdfcbank पर।',
    rawText: 'प्रिय उपभोक्ता, आज रात बिजली काट दी जाएगी। तुरंत बिल भरें UPI ID: bescom-dues@okhdfcbank पर।',
    riskVerdict: 'HIGH_RISK',
    riskScore: 85,
    intentSummary: 'Coordinated Hindi WhatsApp power disconnection scam targeting regional consumers.',
    identifiers: {
      urls: [],
      domains: [],
      upiIds: ['bescom-dues@okhdfcbank'],
      phoneNumbers: ['+919876543210'],
      emails: []
    },
    findings: [
      { category: 'urgency_threat', label: 'Urgency & Power Cut', severity: 'HIGH', quote: 'आज रात', explanation: 'Threat of imminent power cutoff' }
    ],
    claims: [],
    recommendedActions: ['Verify directly with BESCOM official helpline 1912.'],
    analysisMode: 'DETERMINISTIC_FALLBACK',
    campaignId: 'CAMP-DEMO-BESCOM'
  };

  db.investigations.push(inv2, inv1);
  db.campaigns.push({
    id: 'CAMP-DEMO-BESCOM',
    title: 'Cross-Channel Electricity Scam [Shared UPI: bescom-dues@okhdfcbank]',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    lastActivity: new Date(Date.now() - 3600000 * 1).toISOString(),
    investigationIds: ['INV-DEMO-GMAIL-01', 'INV-DEMO-WA-02'],
    channels: ['gmail', 'whatsapp'],
    sharedEvidenceSummary: [
      { type: 'UPI_PAYMENT_HANDLE', value: 'bescom-dues@okhdfcbank', strength: 'STRONG' },
      { type: 'PHONE_NUMBER', value: '+919876543210', strength: 'MODERATE' }
    ]
  });

  await writeDatabase(db);
  return { seeded: true, message: 'Seeded demonstration cross-channel campaigns successfully.' };
}
