import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import * as importController from './import.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow, enforceScope } from '../../middleware/rbac.middleware.js';
import { logger } from '../../utils/logger.js';

const router = Router();

router.use(authMiddleware, enforceScope);

// backend/var/tmp/imports — moved off the repo-root ./temp-imports directory this
// integration (Integration 3, WP6). Boot-created, gitignored.
const tempDir = path.join(process.cwd(), 'var', 'tmp', 'imports');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Boot-time sweep: delete any upload left over from a crashed/killed process more than 24h
// ago. Not a recurring timer — a fresh check on every process start, same "startup sweep"
// meaning as importConfirmHandler.js's stale-CONFIRMED-batch sweep. A file still legitimately
// in flight (a batch mid-VALIDATED, waiting to be confirmed) is always younger than 24h in
// any real workflow, so this never touches a live upload.
(function sweepStaleTempFiles() {
  const STALE_MS = 24 * 60 * 60 * 1000;
  let files;
  try {
    files = fs.readdirSync(tempDir);
  } catch (err) {
    logger.warn(`[ImportRouter] Could not read temp import dir for startup sweep: ${err.message}`);
    return;
  }
  const now = Date.now();
  let swept = 0;
  for (const name of files) {
    const filePath = path.join(tempDir, name);
    try {
      const stat = fs.statSync(filePath);
      if (now - stat.mtimeMs > STALE_MS) {
        fs.unlinkSync(filePath);
        swept++;
      }
    } catch (err) {
      logger.warn(`[ImportRouter] Failed to sweep stale temp file ${name}: ${err.message}`);
    }
  }
  if (swept > 0) logger.info(`[ImportRouter] Startup sweep removed ${swept} stale import temp file(s)`);
})();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB — generous for a single PS's bulk upload
  fileFilter: (req, file, cb) => {
    const extOk = path.extname(file.originalname).toLowerCase() === '.xlsx';
    const mimeOk = file.mimetype === XLSX_MIME;
    if (!extOk || !mimeOk) {
      // multer surfaces this as an error on req.file being absent; the controller's own
      // "No file uploaded" / extension check is the actual user-facing message either way,
      // this is the belt to that braces (a renamed .zip/.exe never reaches disk at all).
      return cb(null, false);
    }
    cb(null, true);
  },
});

// Every route explicitly scoped — P5.5 (default-deny), no endpoint left un-gated. HQ_ANALYST
// (read-only role, no import capability) removed from /validate — it was there pre-
// Integration-3 by oversight, not design.
router.get('/template/:record_type', allow('HC', 'SHO', 'DISTRICT_OFFICER', 'SYSTEM_ADMIN'), importController.downloadImportTemplate);
router.post('/validate', allow('HC', 'DISTRICT_OFFICER'), upload.single('file'), importController.validateImportBatch);
router.post('/confirm/:batchId', allow('HC', 'DISTRICT_OFFICER'), importController.confirmImportBatch);
router.post('/batches/:batchId/cancel', allow('HC', 'DISTRICT_OFFICER'), importController.cancelImportBatch);
router.get('/batches', allow('HC', 'DISTRICT_OFFICER'), importController.listBatches);
router.get('/batches/:batchId', allow('HC', 'DISTRICT_OFFICER'), importController.getBatchDetail);

// Multer surfaces oversize/malformed-multipart failures via next(err) with a MulterError
// (LIMIT_FILE_SIZE etc.) — left uncaught, app.js's global handler reports these as 500s,
// which is wrong: an 11MB upload against a 10MB cap is a client error, not a server fault.
// Scoped here (not in app.js) since MulterError only ever originates from this router's
// upload.single() calls.
router.use((err, req, res, next) => {
  if (err && err.name === 'MulterError') {
    logger.warn(`[ImportRouter] Upload rejected: ${err.code} — ${err.message}`);
    return res.status(400).json({ success: false, message: err.message });
  }
  next(err);
});

export default router;
