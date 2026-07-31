#!/usr/bin/env node
/**
 * clear-logs — start a FRESH log capture from this point on.
 *
 * Run BEFORE a tester reproduces a bug so the shared `backend/logs/` folder contains only the
 * relevant session, not weeks of accumulated history:
 *
 *     cd backend && npm run logs:clear
 *
 * What it does:
 *   - Truncates the rolling backend log files to empty (backend.log / combined.log / error.log /
 *     exceptions.log / rejections.log). Truncate (not delete) is deliberate: winston holds these
 *     files open in append mode, so truncating keeps the handle valid and new lines land at the top
 *     of a now-empty file. Deleting an open file on Linux would orphan the handle and silently drop
 *     every subsequent line.
 *   - Deletes every per-session frontend log (`logs/frontend/*.log`). These are opened per-request
 *     (append-and-close), never held open, so deletion is safe and keeps the folder tidy.
 *   - Rewrites logs/README.txt so the folder always ships self-documented.
 *
 * NOTE: logging otherwise NEVER auto-clears — files append across every restart and are retained
 * until you run this. This is the only thing that wipes them.
 */
import fs from 'fs';
import path from 'path';

// Resolve relative to the backend/ root (this file lives at backend/scripts/dev/), so the command
// works no matter what CWD npm runs it from.
const BACKEND_ROOT = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const LOG_DIR = path.join(BACKEND_ROOT, 'logs');
const FRONTEND_DIR = path.join(LOG_DIR, 'frontend');

const ROLLING_FILES = [
  'backend.log',
  'combined.log',
  'error.log',
  'exceptions.log',
  'rejections.log',
];

const README = `PHAROS / PRISM — Debug Logs
============================================================
This folder is a full-stack debug capture. To report a bug, ZIP this entire
folder (backend/logs/) and send it, along with a short written list of what you
did and what went wrong.

WHAT'S IN HERE
------------------------------------------------------------
  backend.log        All backend activity (dense step-by-step, dev only).
                     One JSON object per line.
  combined.log       Same coverage as backend.log (legacy file, kept for
                     compatibility).
  error.log          ERROR level only — the fastest place to see failures.
  exceptions.log     Uncaught exceptions (crashes).
  rejections.log     Unhandled promise rejections.
  frontend/          One file per browser session: <sessionId>.log
                     The frontend (what you clicked/typed) ships its logs here.

HOW IT'S CATEGORIZED (for whoever debugs)
------------------------------------------------------------
Every backend line is a JSON object with these keys:
  level      debug | info | warn | error
  module     which part of the code (e.g. "records.service",
             "import.service", "workflow.engine", "auth.middleware")
  requestId  ONE id shared by the frontend + backend lines of a single user
             action — trace a click across the whole stack by matching it.
  message    what happened   |   plus structured fields (ids, counts, reasons)

Useful slices (run inside this folder):
  grep '"level":"error"' backend.log                 # only errors
  grep '"module":"import.service"' backend.log       # only the import pipeline
  grep '<requestId>' backend.log frontend/*.log      # one action, both ends

Secrets (passwords / tokens / JWTs) are never written here — they are redacted.

A NEW capture is started with:  cd backend && npm run logs:clear
Logs are otherwise retained across restarts (never auto-deleted).
`;

let truncated = 0;
let deleted = 0;

fs.mkdirSync(FRONTEND_DIR, { recursive: true });

for (const name of ROLLING_FILES) {
  const p = path.join(LOG_DIR, name);
  try {
    if (fs.existsSync(p)) {
      fs.writeFileSync(p, ''); // truncate in place — safe while the server holds the handle open
      truncated++;
    }
  } catch (err) {
    console.error(`  ! could not truncate ${name}: ${err.message}`);
  }
}

try {
  for (const f of fs.readdirSync(FRONTEND_DIR)) {
    if (f.endsWith('.log')) {
      fs.rmSync(path.join(FRONTEND_DIR, f));
      deleted++;
    }
  }
} catch {
  // frontend dir may not exist yet on a fresh checkout — nothing to delete
}

fs.writeFileSync(path.join(LOG_DIR, 'README.txt'), README);

console.log(`✓ logs cleared — ${truncated} backend file(s) emptied, ${deleted} frontend session file(s) removed.`);
console.log(`  Fresh capture starts now. Folder: ${LOG_DIR}`);
console.log(`  (Logs append & are retained across restarts until you run this again.)`);
