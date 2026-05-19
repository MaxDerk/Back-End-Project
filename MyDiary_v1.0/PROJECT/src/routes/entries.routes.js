const express = require('express');
const {
    createEntry,
    deleteEntry,
    exportEntries,
    getEntries,
    updateEntry
} = require('../controllers/entries.controller');

const router = express.Router();

router.get('/export', exportEntries);
router.get('/', getEntries);
router.post('/', createEntry);
router.put('/:id', updateEntry);
router.delete('/:id', deleteEntry);

module.exports = router;
