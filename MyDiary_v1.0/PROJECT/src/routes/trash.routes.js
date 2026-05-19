const express = require('express');
const { getTrash } = require('../controllers/trash.controller');

const router = express.Router();

router.get('/', getTrash);

module.exports = router;
