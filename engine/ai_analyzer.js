/**
 * TRACE - Contextual Analysis & Offline Fallback Engine
 * 
 * Capabilities:
 * 1. AI-Powered Contextual Analysis (via Gemini API when API key is provided)
 * 2. Deterministic Rule-Based Fallback (when API key is missing or service is offline)
 * 3. Strict Claim Classification (SUPPORTED, CONTRADICTED, UNVERIFIED)
 * 4. Transparent provenance labeling (AI_CONTEXTUAL vs DETERMINISTIC_FALLBACK)
 */

import 'dotenv/config';
import { extractIdentifiers } from './extractor.js';
import { processMultilingualContent } from './multilingual.js';
import { evaluateOrganizationalClaims } from './trusted_registry.js';

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_TIMEOUT_MS = 5000;

/**
 * Builds the deterministic fallback analysis report.
 * Guaranteed to run instantly, 100% offline, without external APIs.
 */
export function runDeterministicFallback(text, source = 'manual') {
  const identifiers = extractIdentifiers(text);
  const multilingual = processMultilingualContent(text);
  const claims = evaluateOrganizationalClaims(text, identifiers.domains, identifiers.phoneNumbers, identifiers.emails);

  // Generate evidence findings with exact quotes
  const findings = [];
  for (const signal of multilingual.behavioralAnalysis.detectedSignals) {
    findings.push({
      category: signal.category,
      label: signal.label,
      severity: signal.severity,
      quote: signal.evidence.join('; '),
      explanation: `Deterministic pattern matched suspicious language signaling ${signal.label.toLowerCase()}.`
    });
  }

  // Synthesize intent summary from heuristic evidence
  let intentSummary = 'No strong suspicious signals or threat indicators detected in message text.';
  let verdict = 'LOW_RISK';

  if (multilingual.behavioralAnalysis.heuristicRiskLevel === 'HIGH') {
    verdict = 'HIGH_RISK';
    intentSummary = `High-risk communication demanding urgent action or unverified payments, impersonating authority or threatening service disruption.`;
  } else if (multilingual.behavioralAnalysis.heuristicRiskLevel === 'MEDIUM') {
    verdict = 'SUSPICIOUS';
    intentSummary = `Communication contains questionable requests or unverified institutional claims requiring caution.`;
  }

  // Generate safe user recommendations
  const recommendedActions = [
    'Absence of detected threats is not proof of legitimacy. Always verify requests through independent official channels.',
    'Do not click on unverified links or dial unknown phone numbers provided in unsolicited messages.',
    'Never transfer funds or clear bills via personal UPI IDs provided in unsolicited messages.'
  ];

  if (identifiers.domains.length > 0) {
    recommendedActions.push(`Verify the legitimacy of domain(s) [${identifiers.domains.join(', ')}] through official channels.`);
  }
  if (claims.some(c => c.status === 'CONTRADICTED')) {
    recommendedActions.push('WARNING: The technical contact details in this message directly contradict official records for the claimed institution.');
  }

  return {
    analysisMode: 'DETERMINISTIC_FALLBACK',
    model: null,
    disclaimer: 'This finding is generated using deterministic heuristic rules because the AI service is currently unavailable or unconfigured. It does not reflect deep semantic AI reasoning.',
    timestamp: new Date().toISOString(),
    source,
    language: multilingual.language,
    identifiers,
    intentSummary,
    riskVerdict: verdict,
    riskScore: multilingual.behavioralAnalysis.heuristicRiskScore,
    findings,
    claims,
    recommendedActions
  };
}

/**
 * Executes Contextual Analysis using Gemini API if key is available.
 * Automatically falls back to deterministic analysis on timeout or error.
 */
export async function analyzeMessage(text, source = 'manual') {
  const apiKey = process.env.GEMINI_API_KEY;

  // 1. If no API key is provided, run the deterministic fallback immediately
  if (!apiKey || apiKey.trim() === '' || apiKey === 'YOUR_GEMINI_API_KEY_HERE') {
    return runDeterministicFallback(text, source);
  }

  // 2. We have an API key -> attempt Gemini contextual analysis
  try {
    const prompt = `You are TRACE, a defensive cybersecurity scam investigator.
Analyze the following user-submitted message for scam signals, coercive intent, and organizational claims.

CRITICAL INSTRUCTIONS:
1. Support English, Hindi (Devanagari/Hinglish), and Kannada (Script/Kanglish).
2. Identify the true intent and conversational context (not just keyword matching).
3. Extract exact quotes from the original message as evidence for every finding.
4. CLAIMS CLASSIFICATION RULE:
   - Only mark a claim as "SUPPORTED" or "CONTRADICTED" if verifiable evidence exists in the text.
   - If an unfamiliar sender or organization cannot be verified with certainty, strictly mark it "UNVERIFIED".
   - Never claim an organization is fraudulent without explicit technical proof.
5. Provide actionable, safe user recommendations.

MESSAGE TO ANALYZE:
"""
${text}
"""

Return ONLY a valid JSON object matching this schema without markdown codeblocks:
{
  "intentSummary": "1-2 sentence description of what the sender is trying to achieve",
  "riskVerdict": "HIGH_RISK" | "SUSPICIOUS" | "LOW_RISK",
  "riskScore": integer between 0 and 100,
  "findings": [
    {
      "category": "urgency_threat" | "payment_demand" | "credential_harvest" | "authority_impersonation" | "other",
      "label": "Short label",
      "severity": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW",
      "quote": "exact snippet quote from the message",
      "explanation": "why this quote represents a risk"
    }
  ],
  "claims": [
    {
      "organizationName": "Name of entity claimed or referenced",
      "status": "SUPPORTED" | "CONTRADICTED" | "UNVERIFIED",
      "reason": "Evidence-based reason for this status"
    }
  ],
  "recommendedActions": [
    "action item 1",
    "action item 2"
  ]
}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json'
        }
      })
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[TRACE AI] Gemini API returned status ${response.status}. Using deterministic fallback.`);
      return runDeterministicFallback(text, source);
    }

    const data = await response.json();
    const rawContent = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawContent) {
      console.warn('[TRACE AI] Empty Gemini response. Using deterministic fallback.');
      return runDeterministicFallback(text, source);
    }

    const aiParsed = JSON.parse(rawContent);

    // Combine AI semantic findings with deterministic identifier extraction
    const identifiers = extractIdentifiers(text);
    const multilingual = processMultilingualContent(text);

    // Determine risk score: if AI provided a valid numeric score, use it; otherwise fallback to deterministic heuristic score
    const heuristicScore = multilingual.behavioralAnalysis?.heuristicRiskScore || 0;
    const finalScore = (typeof aiParsed.riskScore === 'number' && !isNaN(aiParsed.riskScore))
      ? Math.max(0, Math.min(100, Math.round(aiParsed.riskScore)))
      : heuristicScore;

    // Determine risk verdict: if AI provided a verdict, sanitize it; otherwise derive from score
    let finalVerdict = aiParsed.riskVerdict;
    if (!finalVerdict || finalVerdict === 'SAFE') {
      if (finalScore >= 60) finalVerdict = 'HIGH_RISK';
      else if (finalScore >= 30) finalVerdict = 'SUSPICIOUS';
      else finalVerdict = 'LOW_RISK';
    }

    return {
      analysisMode: 'AI_CONTEXTUAL',
      model: GEMINI_MODEL,
      disclaimer: null,
      timestamp: new Date().toISOString(),
      source,
      language: multilingual.language,
      identifiers,
      intentSummary: aiParsed.intentSummary || 'Contextual analysis completed.',
      riskVerdict: finalVerdict,
      riskScore: finalScore,
      findings: aiParsed.findings || [],
      claims: aiParsed.claims || [],
      recommendedActions: aiParsed.recommendedActions || []
    };

  } catch (error) {
    console.warn(`[TRACE AI] Error communicating with Gemini (${error.message}). Falling back to deterministic analysis.`);
    return runDeterministicFallback(text, source);
  }
}

