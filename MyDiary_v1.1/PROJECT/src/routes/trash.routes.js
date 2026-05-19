const express = require('express');
const { getTrash } = require('../controllers/trash.controller');

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
 */
router.get('/', getTrash);

module.exports = router;
