import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Import Phase 2 Engines
import { extractIdentifiers } from './engine/extractor.js';
import { processMultilingualContent } from './engine/multilingual.js';

// Import Phase 3 Contextual Engine
import { analyzeMessage, runDeterministicFallback } from './engine/ai_analyzer.js';

// Import Phase 4 SCAMCHAIN Engine
import {
  recordAndCorrelate,
  getScamChainGraph,
  getInvestigations,
  getInvestigationById,
  seedDemoCampaigns
} from './engine/scamchain.js';

import { resetDatabase, readDatabase } from './engine/storage.js';
import { generateIncidentReportHtml } from './engine/report_generator.js';

// Set up directory resolution for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_MESSAGE_LENGTH = 10000;

// Administrative Security Configuration
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Validates administrative security configuration.
 * Fails safely in production if a secure TRACE_ADMIN_KEY is not defined.
 */
export function validateAdminConfiguration(env = process.env) {
  const isProd = env.NODE_ENV === 'production';
  const adminKey = env.TRACE_ADMIN_KEY;

  if (isProd) {
    if (!adminKey || typeof adminKey !== 'string' || adminKey.trim() === '') {
      throw new Error('FATAL SECURITY ERROR: In production mode (NODE_ENV=production), TRACE_ADMIN_KEY environment variable is required and cannot be empty.');
    }
    const insecureDefaults = ['trace-dev-admin', 'admin', 'password', '12345678', 'secret', 'changeme'];
    if (insecureDefaults.includes(adminKey.toLowerCase()) || adminKey.length < 16) {
      throw new Error('FATAL SECURITY ERROR: In production mode, TRACE_ADMIN_KEY must be a secure secret of at least 16 characters and cannot use default/predictable credentials.');
    }
  }
}

// In production, execute validation immediately to prevent starting with insecure credentials
if (isProduction) {
  try {
    validateAdminConfiguration(process.env);
  } catch (err) {
    console.error(`❌ ${err.message}`);
    process.exit(1);
  }
}

/**
 * Middleware: Protects sensitive administrative endpoints (reset / seed).
 * Strictly disables public access in production.
 * Keeps administrative functionality available in local development.
 */
export function requireAdminAuth(req, res, next) {
  const isProd = process.env.NODE_ENV === 'production';
  const providedKey = req.headers?.['x-trace-admin'] || req.query?.adminKey;

  if (isProd) {
    const prodKey = process.env.TRACE_ADMIN_KEY;
    if (!prodKey || !providedKey || providedKey !== prodKey) {
      return res.status(403).json({
        error: 'Forbidden: Administrative endpoints are disabled for public visitors in production.'
      });
    }
    return next();
  }

  // In development: keep administrative functionality convenient for localhost, or require dev key
  const clientIp = req.ip || req.socket.remoteAddress || '';
  const isLocalhost = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp.includes('127.0.0.1');

  const devKey = process.env.TRACE_ADMIN_KEY || 'trace-dev-admin';
  if (isLocalhost || (providedKey && providedKey === devKey)) {
    return next();
  }

  return res.status(403).json({
    error: 'Forbidden: Administrative endpoint protected. Provide valid X-TRACE-ADMIN header.'
  });
}

// Configurable CORS settings (keeps localhost and Chrome extensions functional)
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
let corsOptions;

if (allowedOriginsEnv && allowedOriginsEnv.trim() !== '') {
  const allowedOrigins = allowedOriginsEnv.split(',').map(o => o.trim());
  corsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (/^https?:\/\/localhost(:\d+)?$/.test(origin) || /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      if (origin.startsWith('chrome-extension://')) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error('Blocked by CORS policy'));
    },
    methods: ['GET', 'POST']
  };
} else {
  corsOptions = {
    origin: (origin, callback) => {
      // Allow localhost and browser extensions by default
      callback(null, true);
    },
    methods: ['GET', 'POST']
  };
}

app.use(cors(corsOptions));

// 2. Parse incoming JSON request bodies (up to 1MB)
app.use(express.json({ limit: '1mb' }));

// 3. Serve static front-end assets from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Basic System Health Endpoint
app.get('/api/health', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.json({
    status: 'ok',
    app: 'TRACE — Digital Trust & Scam Investigation Platform',
    version: '1.0.0',
    phase: 'Phase 4: SCAMCHAIN Correlation & Local Storage',
    environment: isProd ? 'production' : 'development',
    adminControlsEnabled: !isProd,
    aiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'YOUR_GEMINI_API_KEY_HERE'),
    timestamp: new Date().toISOString()
  });
});

// Phase 2: Deterministic & Multilingual Extraction Endpoint
app.post('/api/extract', (req, res) => {
  const { text, source = 'manual' } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({
      error: 'Invalid input. Please provide a "text" field containing the message to analyze.'
    });
  }

  // Strict 10,000-character input limit for reliability and ReDoS defense
  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Input exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH.toLocaleString()} characters (received ${text.length.toLocaleString()}). Please shorten the message.`
    });
  }

  // 1. Extract exact verifiable identifiers (URLs, UPI IDs, Phone Numbers, Emails)
  const identifiers = extractIdentifiers(text);

  // 2. Multilingual detection and behavioral signal detection
  const multilingual = processMultilingualContent(text);

  // 3. Return unified deterministic extraction report
  return res.json({
    timestamp: new Date().toISOString(),
    source: source,
    characterCount: text.length,
    language: multilingual.language,
    identifiers: identifiers,
    behavioralAnalysis: multilingual.behavioralAnalysis
  });
});

// Phase 3 & 4: Contextual Analysis & SCAMCHAIN Correlation Endpoint
app.post('/api/analyze', async (req, res) => {
  const { text, source = 'manual', forceOffline = false, record = true } = req.body;

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return res.status(400).json({
      error: 'Invalid input. Please provide a "text" field containing the message to analyze.'
    });
  }

  // Strict 10,000-character input limit for reliability and ReDoS defense
  if (text.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: `Input exceeds maximum allowed length of ${MAX_MESSAGE_LENGTH.toLocaleString()} characters (received ${text.length.toLocaleString()}). Please shorten the message.`
    });
  }

  try {
    let result;
    if (forceOffline) {
      result = runDeterministicFallback(text, source);
    } else {
      result = await analyzeMessage(text, source);
    }

    result.rawText = text;
    result.source = source;

    // Phase 4: Automatically correlate and record in SCAMCHAIN
    if (record) {
      const correlated = await recordAndCorrelate(result);
      return res.json({
        ...result,
        investigationId: correlated.investigation.id,
        scamchain: correlated.scamchain
      });
    }

    return res.json(result);
  } catch (error) {
    console.error('[API /api/analyze Error]:', error);
    // Graceful fallback even if an unexpected server error occurs
    const fallback = runDeterministicFallback(text, source);
    fallback.rawText = text;
    fallback.source = source;
    if (record) {
      const correlated = await recordAndCorrelate(fallback);
      return res.json({
        ...fallback,
        investigationId: correlated.investigation.id,
        scamchain: correlated.scamchain
      });
    }
    return res.json(fallback);
  }
});

// Phase 4: SCAMCHAIN Graph Visualization Data Endpoint
app.get('/api/scamchain', (req, res) => {
  const graph = getScamChainGraph();
  res.json(graph);
});

// Phase 4: Past Investigations History Endpoint
app.get('/api/investigations', (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 50;
  const history = getInvestigations(limit);
  res.json(history);
});

// Phase 4: Single Investigation Details Endpoint
app.get('/api/investigations/:id', (req, res) => {
  const record = getInvestigationById(req.params.id);
  if (!record) {
    return res.status(404).json({ error: 'Investigation not found' });
  }
  res.json(record);
});

// Phase 7B: Incident Report Export Endpoint
app.get('/api/investigations/:id/export', (req, res) => {
  const record = getInvestigationById(req.params.id);
  if (!record) {
    return res.status(404).send('<h3>Investigation not found</h3>');
  }
  const db = readDatabase();
  const html = generateIncidentReportHtml(record, db);

  if (req.query.download === 'true') {
    res.setHeader('Content-Disposition', `attachment; filename="TRACE-Incident-Report-${record.id}.html"`);
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

app.get('/api/investigations/:id/report', (req, res) => {
  res.redirect(`/api/investigations/${req.params.id}/export`);
});

// Phase 4: Seed Demo Campaigns Endpoint (Protected Administrative Endpoint)
app.post('/api/scamchain/seed', requireAdminAuth, async (req, res) => {
  const result = await seedDemoCampaigns();
  res.json(result);
});

// Phase 4 / 5: Reset Database Endpoint (Protected Administrative Endpoint)
app.post('/api/scamchain/reset', requireAdminAuth, async (req, res) => {
  try {
    const initial = await resetDatabase();
    res.json({
      success: true,
      message: 'Database reset to clean state (0 investigations, 0 campaigns).',
      data: initial
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server & Initialize Storage only when executed directly as main script
const isMainScript = process.argv[1] && (process.argv[1].endsWith('server.js') || process.argv[1].endsWith('server'));
if (isMainScript) {
  app.listen(PORT, async () => {
    console.log(`====================================================`);
    console.log(`🛡️  TRACE Server is running at http://localhost:${PORT}`);
    console.log(`📁  Serving Web Dashboard from ./public`);
    console.log(`🔍  Health Check:     http://localhost:${PORT}/api/health`);
    console.log(`⚡  Extraction API:   POST http://localhost:${PORT}/api/extract`);
    console.log(`🧠  Analysis API:     POST http://localhost:${PORT}/api/analyze`);
    console.log(`🔗  SCAMCHAIN API:    GET  http://localhost:${PORT}/api/scamchain`);
    console.log(`🧹  Reset DB API:     POST http://localhost:${PORT}/api/scamchain/reset`);
    console.log(`📜  Investigations:  GET  http://localhost:${PORT}/api/investigations`);
    console.log(`====================================================`);
  });
}

export default app;


