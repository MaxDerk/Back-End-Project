require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const entriesRoutes = require('./routes/entries.routes');
const trashRoutes = require('./routes/trash.routes');
const errorHandler = require('./middleware/error.middleware');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/entries', entriesRoutes);
app.use('/api/trash', trashRoutes);

app.use(errorHandler);

module.exports = app;
