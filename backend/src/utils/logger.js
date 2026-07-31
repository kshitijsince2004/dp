import winston from 'winston';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { getRequestId } from './requestContext.js';

const { combine, timestamp, printf, colorize, errors, json } = winston.format;

// `logs/` itself already existed (combined.log/error.log/etc were already written there);
// `logs/frontend/` is NEW — the destination for the client-log ingest module
// (modules/logs/logs.controller.js). Created here, at logger-module load time (i.e. on boot,
// before any route can be hit), so a fresh checkout never 500s on the first client POST.
const LOG_DIR = 'logs';
const FRONTEND_LOG_DIR = path.join(LOG_DIR, 'frontend');
try {
  fs.mkdirSync(FRONTEND_LOG_DIR, { recursive: true });
} catch {
  // Best-effort — a real permissions problem here will surface as a write error later
  // (logs.controller.js's own try/catch), not as a boot crash.
}

// Injects the ambient request id (AsyncLocalStorage, utils/requestContext.js) into every log
// line so a backend log line correlates 1:1 with the frontend's `x-request-id` header without
// any module ever threading a requestId parameter through its own call signatures. This is the
// backend half of the correlation design (HANDOFF.md §2) — do not invent a second scheme.
const injectRequestId = winston.format((info) => {
  const reqId = getRequestId();
  if (reqId) info.requestId = reqId;
  return info;
});

// The logging convention (HANDOFF.md §3 item 5) is `log.error('msg', { err })` — winston's own
// `errors({ stack: true })` format only unwraps an Error when it IS the log call's message/info
// (e.g. `logger.error(new Error(...))`), not when it's nested under a meta key like `err`. Without
// this, `{ err: someError }` serializes to `{}` (Error's own properties aren't enumerable) and the
// stack is silently lost — exactly the failure the convention calls out. This expands ANY
// meta value that is an Error instance, at any key, into a plain loggable object.
const expandErrorMeta = winston.format((info) => {
  for (const key of Object.keys(info)) {
    if (info[key] instanceof Error) {
      const e = info[key];
      info[key] = { message: e.message, name: e.name, stack: e.stack, ...(e.code ? { code: e.code } : {}) };
    }
  }
  return info;
});

// Applied ONCE at the logger level (not per-transport) — winston runs this default format first
// to build the `info` object, then runs EACH transport's own `format` as an ADDITIONAL pass on
// top of that same (already-mutated) info. Concretely: this must stay free of colorize()/printf()/
// json() — those are presentation-layer and belong solely on individual transports below. Putting
// colorize() here previously leaked raw ANSI escape codes into the JSON log FILES (colorize()
// mutates `info.level` in place; a later json() pass can't undo that), which would have made every
// file a tester ships unreadable by grep/jq. This bug was caught during foundation verification.
const baseFormat = combine(
  expandErrorMeta(),
  injectRequestId(),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  errors({ stack: true })
);

// Console: human-readable in dev, JSON in prod. This is the ONLY place colorize()/the printf
// string layout live.
const devConsoleOnly = printf(({ level, message, timestamp, stack, module: mod, requestId, ...rest }) => {
  const reqTag = requestId ? ` (${requestId})` : '';
  const metaKeys = Object.keys(rest);
  const metaStr = metaKeys.length ? ` ${JSON.stringify(rest)}` : '';
  const line = `[${timestamp}] ${level} [${mod || 'app'}]${reqTag}: ${message}${metaStr}`;
  return stack ? `${line}\n${stack}` : line;
});

const consoleFormat = env.isDev ? combine(colorize(), devConsoleOnly) : json();

// File transports are ALWAYS structured JSON, regardless of dev/prod — these are the files a
// tester zips up and sends back (`backend/logs/`); a colorized/human printf string is useless to
// grep/jq. Only the Console transport gets the human-readable dev format above.
const fileFormat = json();

export const logger = winston.createLogger({
  level: env.isDev ? 'debug' : 'info',
  format: baseFormat,
  transports: [
    new winston.transports.Console({ format: consoleFormat }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error', format: fileFormat }),
    new winston.transports.File({ filename: 'logs/combined.log', format: fileFormat }),
    // NEW (logging-instrumentation-2026-07-22): a plain, all-levels backend log file. In dev
    // this carries `debug` (inherits `logger`'s level, same as combined.log) — the dense
    // step-by-step trace the instrumentation effort is for. Additive: combined.log/error.log
    // are untouched and keep receiving everything they always did.
    new winston.transports.File({ filename: 'logs/backend.log', format: fileFormat }),
  ],
  exceptionHandlers: [
    new winston.transports.File({ filename: 'logs/exceptions.log', format: fileFormat }),
  ],
  rejectionHandlers: [
    new winston.transports.File({ filename: 'logs/rejections.log', format: fileFormat }),
  ],
});

/**
 * Bound child logger for one module — the ONE way modules identify themselves in log output.
 * Every instrumented file starts with:
 *   const log = getLogger('module.name');
 * and calls `log.debug/info/warn/error(event, data)` from then on (never string-prefix messages
 * by hand). See docs/logging-instrumentation-2026-07-22/HANDOFF.md §3 for the full convention;
 * `modules/records/records.service.js` is the canonical worked example.
 */
export function getLogger(moduleName) {
  return logger.child({ module: moduleName });
}
