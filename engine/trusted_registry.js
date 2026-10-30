/**
 * TRACE - Trusted Organization Reference Registry
 * 
 * Provides verified baseline records for recognized institutions, utility providers,
 * and government bodies. 
 * 
 * STRICT CLASSIFICATION RULES:
 * 1. SUPPORTED: The claim matches reliable official reference evidence.
 * 2. CONTRADICTED: Reliable evidence directly conflicts with the claim.
 *    (e.g., A government body claiming an official portal on a commercial/free TLD,
 *    or a bank claiming official communication from an anonymous free email provider).
 * 3. UNVERIFIED: There is insufficient evidence to establish either.
 *    (An unfamiliar or unregistered domain is NOT proof of fraud; it is strictly UNVERIFIED).
 * 
 * NOTE ON ENTITY EXTRACTION:
 * Organizations must be explicitly identified in the natural language text.
 * Technical identifiers (e.g. UPI handles like @okhdfcbank or URL parameters)
 * must NEVER trigger organizational claims unless the entity is explicitly named in prose.
 */

export const TRUSTED_ORGANIZATIONS = [
  {
    id: 'sbi',
    name: 'State Bank of India',
    aliases: ['sbi', 'state bank of india', 'state bank', 'स्टेट बैंक', 'ಎಸ್ ಬಿ ಐ'],
    officialDomains: ['sbi.co.in', 'onlinesbi.sbi', 'onlinesbi.com'],
    officialHelplines: ['1800112211', '18004253800', '18001234'],
    category: 'Banking / Financial Institution',
    strictDomainPolicy: true
  },
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    aliases: ['hdfc', 'hdfc bank', 'एचडीएफसी', 'एचडीएफसी बैंक'],
    officialDomains: ['hdfcbank.com'],
    officialHelplines: ['18002026161', '18001600'],
    category: 'Banking / Financial Institution',
    strictDomainPolicy: true
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    aliases: ['icici', 'icici bank', 'आईसीआईसीआई'],
    officialDomains: ['icicibank.com'],
    officialHelplines: ['18001080'],
    category: 'Banking / Financial Institution',
    strictDomainPolicy: true
  },
  {
    id: 'bescom',
    name: 'Bangalore Electricity Supply Company (BESCOM)',
    aliases: ['bescom', 'ಬೆಸ್ಕಾಂ', 'बेस्कॉम'],
    officialDomains: ['bescom.karnataka.gov.in', 'bescom.org'],
    officialHelplines: ['1912'],
    category: 'State Power Utility',
    isGovernmentEntity: true
  },
  {
    id: 'kptcl',
    name: 'Karnataka Power Transmission Corporation Limited',
    aliases: ['kptcl', 'ಕರ್ನಾಟಕ ವಿದ್ಯುತ್', 'केपीटीसीएल'],
    officialDomains: ['kptcl.karnataka.gov.in'],
    officialHelplines: ['1912'],
    category: 'State Power Utility',
    isGovernmentEntity: true
  },
  {
    id: 'incometax',
    name: 'Income Tax Department of India',
    aliases: ['income tax', 'it department', 'आयकर विभाग', 'ಆದಾಯ ತೆರಿಗೆ'],
    officialDomains: ['incometax.gov.in'],
    officialHelplines: ['18001801961'],
    category: 'Government Department',
    isGovernmentEntity: true
  },
  {
    id: 'trai',
    name: 'Telecom Regulatory Authority of India (TRAI)',
    aliases: ['trai', 'telecom department', 'sanchar saathi', 'दूरसंचार विभाग'],
    officialDomains: ['trai.gov.in', 'sancharsaathi.gov.in'],
    officialHelplines: ['1963', '1800110420'],
    category: 'Government Regulator',
    isGovernmentEntity: true
  },
  {
    id: 'indiapost',
    name: 'India Post',
    aliases: ['india post', 'भारतीय डाक', 'ಅಂಚೆ ಇಲಾಖೆ'],
    officialDomains: ['indiapost.gov.in'],
    officialHelplines: ['18002666868'],
    category: 'Government Postal Service',
    isGovernmentEntity: true
  }
];

// Free public webmail domains that directly contradict official institutional outreach
const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'rediffmail.com'];

// Suspicious, disposable, or high-abuse TLDs commonly used in phishing campaigns
const SUSPICIOUS_TLDS = ['.top', '.xyz', '.buzz', '.online', '.live', '.site', '.work', '.vip', '.click'];

/**
 * Strips technical identifiers (URLs, UPI handles, emails, phone numbers)
 * so that we only match organizational names that appear in natural prose.
 * (e.g. Prevents '@okhdfcbank' from falsely triggering an HDFC Bank claim).
 */
function extractCleanProseForEntities(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/(?:https?:\/\/|www\.)[^\s<>"'{}|\\^`\[\]]+/gi, ' ')
    .replace(/[a-zA-Z0-9.\-_]+@[a-zA-Z0-9.\-_]+/g, ' ')
    .replace(/(?:\+91[\-\s]?)?[6-9]\d{4}[\-\s]?\d{5}\b/g, ' ')
    .replace(/\b1800[\-\s]?\d{3}[\-\s]?\d{3,4}\b/g, ' ')
    .toLowerCase();
}

/**
 * Checks if an organizational alias is explicitly mentioned as a word in prose.
 */
function isAliasMentioned(cleanProse, alias) {
  const cleanAlias = alias.toLowerCase().trim();
  // If alias is ASCII/Latin (e.g. 'sbi', 'hdfc', 'bescom', 'kptcl')
  if (/^[a-z0-9\s]+$/i.test(cleanAlias)) {
    // Word boundary regex guarantees we match "HDFC" or "HDFC Bank", not "okhdfcbank"
    const regex = new RegExp(`\\b${cleanAlias.replace(/\s+/g, '\\s+')}\\b`, 'i');
    return regex.test(cleanProse);
  }
  // For Unicode scripts (Devanagari, Kannada: e.g. 'ಬೆಸ್ಕಾಂ', 'स्टेट बैंक')
  return cleanProse.includes(cleanAlias);
}

/**
 * Evaluates claims made in a communication against the trusted reference registry.
 */
export function evaluateOrganizationalClaims(rawText, extractedDomains = [], extractedPhones = [], extractedEmails = []) {
  const claims = [];
  const cleanProse = extractCleanProseForEntities(rawText);

  for (const org of TRUSTED_ORGANIZATIONS) {
    // Check if any alias is mentioned in the clean natural prose
    const matchedAlias = org.aliases.find(alias => isAliasMentioned(cleanProse, alias));

    if (matchedAlias) {
      let status = 'UNVERIFIED';
      let reason = `Message explicitly references ${org.name}. Insufficient official evidence to verify or contradict.`;

      // 1. Check for SUPPORTED evidence: matches verified official domain or helpline
      const matchesOfficialDomain = extractedDomains.some(d =>
        org.officialDomains.some(od => d === od || d.endsWith('.' + od))
      );

      const matchesOfficialPhone = extractedPhones.some(p =>
        org.officialHelplines.some(hp => p.includes(hp))
      );

      if (matchesOfficialDomain) {
        status = 'SUPPORTED';
        reason = `Claim supported: Domain matches official trusted registry record for ${org.name} (${org.officialDomains.join(', ')}).`;
      } else if (matchesOfficialPhone) {
        status = 'SUPPORTED';
        reason = `Claim supported: Contact number matches verified official helpline for ${org.name}.`;
      } else {
        // 2. Check for CONTRADICTED evidence:
        // Evidence directly conflicts ONLY if:
        // a) Claim is a Government department, but domain uses a non-governmental commercial TLD or suspicious TLD (.online, .top, etc.)
        //    while government regulations mandate .gov.in / .nic.in for official portals.
        // b) Claim is a major bank/authority, but official communication instructs using a personal free webmail address.
        const usesDisallowedTld = org.isGovernmentEntity && extractedDomains.some(d => 
          SUSPICIOUS_TLDS.some(tld => d.endsWith(tld)) || !d.endsWith('.gov.in') && !d.endsWith('.nic.in') && !org.officialDomains.includes(d)
        );

        const usesFreeWebmail = extractedEmails.some(e => {
          const domain = e.split('@')[1];
          return FREE_EMAIL_DOMAINS.includes(domain);
        });

        if (usesDisallowedTld) {
          status = 'CONTRADICTED';
          reason = `Claim contradicted: Official statutory regulation mandates government entities (${org.name}) operate strictly on .gov.in/.nic.in domains. Provided domain(s) [${extractedDomains.join(', ')}] directly conflict with this requirement.`;
        } else if (usesFreeWebmail) {
          status = 'CONTRADICTED';
          reason = `Claim contradicted: Official institutional communication from ${org.name} never conducts official transactions via free public webmail addresses.`;
        } else {
          // 3. Otherwise: UNVERIFIED
          // An unfamiliar domain or private link is NOT automatic proof of impersonation.
          status = 'UNVERIFIED';
          reason = `Claim unverified: The domain(s) [${extractedDomains.join(', ') || 'none'}] are not listed in the trusted registry. There is insufficient evidence to confirm or contradict this claim.`;
        }
      }

      claims.push({
        organizationId: org.id,
        organizationName: org.name,
        matchedMention: matchedAlias,
        status: status,
        reason: reason,
        officialReference: {
          domains: org.officialDomains,
          category: org.category
        }
      });
    }
  }

  // If no recognized organization was referenced at all
  if (claims.length === 0) {
    claims.push({
      organizationId: null,
      organizationName: 'Unspecified / Private Entity',
      matchedMention: null,
      status: 'UNVERIFIED',
      reason: 'No recognized institutional claims were identified against the trusted reference registry.',
      officialReference: null
    });
  }

  return claims;
}
