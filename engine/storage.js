/**
 * TRACE - Safe Local Storage Engine
 * 
 * Provides safe, collision-free JSON storage for investigations and SCAMCHAIN campaigns.
 * 
 * Safety Features:
 * 1. In-memory sequential write queue (mutex): Prevents race conditions from simultaneous requests.
 * 2. Atomic read-modify-write transactions (updateDatabase): Guarantees data consistency under load.
 * 3. Atomic file writes: Writes to a temporary file (.tmp) and atomically renames it.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'scamchain.json');
const TMP_FILE = path.join(DATA_DIR, 'scamchain.json.tmp');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// In-memory write queue to serialize simultaneous operations
let writeQueue = Promise.resolve();

/**
 * Default initial database structure
 */
function getDefaultData() {
  return {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    investigations: [],
    campaigns: []
  };
}

/**
 * Reads the current database state from disk.
 */
export function readDatabase() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const initial = getDefaultData();
      saveDatabaseSync(initial);
      return initial;
    }

    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    if (!raw || raw.trim().length === 0) {
      return getDefaultData();
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error('[TRACE Storage] Error reading database. Returning safe fallback:', error.message);
    return getDefaultData();
  }
}

/**
 * Synchronous atomic save helper
 */
function saveDatabaseSync(data) {
  data.lastUpdated = new Date().toISOString();
  const serialized = JSON.stringify(data, null, 2);
  fs.writeFileSync(TMP_FILE, serialized, 'utf-8');
  fs.renameSync(TMP_FILE, DB_FILE);
}

/**
 * Safely writes database state to disk using a sequential queue.
 */
export function writeDatabase(data) {
  writeQueue = writeQueue.then(async () => {
    try {
      saveDatabaseSync(data);
    } catch (error) {
      console.error('[TRACE Storage] Atomic write failed:', error.message);
      throw error;
    }
  });

  return writeQueue;
}

/**
 * Executes a thread-safe read-modify-write transaction within the queue.
 */
export function updateDatabase(mutatorFn) {
  const transactionPromise = new Promise((resolve, reject) => {
    writeQueue = writeQueue.then(async () => {
      try {
        const current = readDatabase();
        const modified = await mutatorFn(current);
        const dataToSave = modified || current;
        saveDatabaseSync(dataToSave);
        resolve(dataToSave);
      } catch (err) {
        console.error('[TRACE Storage] Transaction failed:', err.message);
        reject(err);
      }
    });
  });

  return transactionPromise;
}

/**
 * Clears and resets the database
 */
export async function resetDatabase() {
  const initial = getDefaultData();
  await writeDatabase(initial);
  return initial;
}
