import express from 'express';
import * as compilationController from './compilation.controller.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { allow } from '../../middleware/rbac.middleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Compilations
 *   description: API for grouping multiple individual records into a single compiled report at the district level before sending to HQ.
 * 
 * /api/compilations:
 *   get:
 *     summary: Get a list of compilations
 *     description: Fetches compilations, optionally filtered by districtId or status.
 *     tags: [Compilations]
 *     responses:
 *       200:
 *         description: A list of compilations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       district_id:
 *                         type: string
 *                       period:
 *                         type: string
 *                       status:
 *                         type: string
 *                         example: DRAFT
 *   post:
 *     summary: Create a compilation
 *     description: Gathers all currently DISTRICT_REVIEW records for a given district and bundles them into a new DRAFT Compilation.
 *     tags: [Compilations]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               district_id:
 *                 type: string
 *               period:
 *                 type: string
 *                 example: "2024-01-01"
 *     responses:
 *       201:
 *         description: Compilation created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 * 
 * /api/compilations/{id}:
 *   get:
 *     summary: Get a compilation by ID
 *     description: Fetch details of a specific compilation including the list of record IDs it contains.
 *     tags: [Compilations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Compilation data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     records:
 *                       type: array
 *                       items:
 *                         type: string
 * 
 * /api/compilations/{id}/submit:
 *   post:
 *     summary: Submit a compilation to HQ
 *     description: Submits a DRAFT Compilation to HQ. This automatically updates all underlying records to COMPILED status.
 *     tags: [Compilations]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Compilation submitted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Compilation submitted successfully
 */

// GET /api/compilations
router.get('/', authMiddleware, compilationController.getCompilations);

// POST /api/compilations — DISTRICT_OFFICER only (matches workflow config's district.compile
// allowed_roles; this endpoint transitions member records, not just an admin listing).
router.post('/', authMiddleware, allow('DISTRICT_OFFICER'), compilationController.createCompilation);

// GET /api/compilations/:id
router.get('/:id', authMiddleware, compilationController.getCompilation);

// POST /api/compilations/:id/submit
router.post('/:id/submit', authMiddleware, allow('DISTRICT_OFFICER'), compilationController.submitCompilation);

export default router;
