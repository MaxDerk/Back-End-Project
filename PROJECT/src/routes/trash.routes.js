const express = require('express');
const { getTrash } = require('../controllers/trash.controller');
const authenticate = require('../middleware/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/trash:
 *   get:
 *     summary: Get deleted diary entries from trash
 *     tags: [Trash]
 *     responses:
 *       200:
 *         description: List of entries stored in trash_bin.json.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Entry'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', authenticate, getTrash);

module.exports = router;
