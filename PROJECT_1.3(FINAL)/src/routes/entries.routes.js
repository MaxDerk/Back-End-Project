const express = require('express');
const {
    createEntry,
    deleteEntry,
    exportEntries,
    getEntries,
    updateEntry
} = require('../controllers/entries.controller');
const authenticate = require('../middleware/auth.middleware'); // Імпортуємо охоронця

const router = express.Router();

router.get('/export', authenticate, exportEntries);
router.get('/', authenticate, getEntries);
router.post('/', authenticate, createEntry);
router.put('/:id', authenticate, updateEntry);
router.delete('/:id', authenticate, deleteEntry);

/**
 * @swagger
 * /api/entries/export:
 *   get:
 *     summary: Export all diary entries as a text file
 *     tags: [Entries]
 *     responses:
 *       200:
 *         description: Diary export file, or an HTML message when the diary is empty.
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/export', exportEntries);

/**
 * @swagger
 * /api/entries:
 *   get:
 *     summary: Get all diary entries
 *     tags: [Entries]
 *     responses:
 *       200:
 *         description: List of diary entries ordered by creation date.
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
router.get('/', getEntries);

/**
 * @swagger
 * /api/entries:
 *   post:
 *     summary: Create a diary entry
 *     tags: [Entries]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EntryInput'
 *     responses:
 *       201:
 *         description: Created diary entry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Entry'
 *       400:
 *         description: Content is empty or bad request data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/', createEntry);

/**
 * @swagger
 * /api/entries/{id}:
 *   put:
 *     summary: Update a diary entry
 *     tags: [Entries]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Entry ID.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EntryInput'
 *     responses:
 *       200:
 *         description: Updated diary entry.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Entry'
 *       400:
 *         description: ID must be a number.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Entry not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/:id', updateEntry);

/**
 * @swagger
 * /api/entries/{id}:
 *   delete:
 *     summary: Delete a diary entry and move it to trash
 *     tags: [Entries]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Entry ID.
 *     responses:
 *       200:
 *         description: Entry deleted and moved to trash.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Entry deleted and moved to trash_bin.json
 *       400:
 *         description: ID must be a number.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Entry not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', deleteEntry);

module.exports = router;
