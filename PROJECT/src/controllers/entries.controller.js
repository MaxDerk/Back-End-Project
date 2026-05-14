const prisma = require('../config/prisma');
const { createDiaryExport, removeExportFile } = require('../services/export.service');
const { saveToTrash } = require('../services/trash.service');

async function getEntries(req, res, next) {
    try {
        const { tag, date } = req.query;
        const filter = {};

        if (tag) {
            filter.tag = tag;
        }

        if (date) {
            filter.createdAt = {
                gte: new Date(`${date}T00:00:00.000Z`),
                lte: new Date(`${date}T23:59:59.999Z`)
            };
        }

        const entries = await prisma.entry.findMany({
            where: filter,
            orderBy: { createdAt: 'desc' }
        });

        res.json(entries);
    } catch (error) {
        next(error);
    }
}

async function createEntry(req, res, next) {
    try {
        const { content, tag } = req.body;

        if (!content || content.trim() === '') {
            const error = new Error('Content is empty');
            error.statusCode = 400;
            throw error;
        }

        const newEntry = await prisma.entry.create({
            data: { content, tag: tag || null }
        });

        res.status(201).json(newEntry);
    } catch (error) {
        next(error);
    }
}

async function updateEntry(req, res, next) {
    try {
        const id = Number.parseInt(req.params.id, 10);

        if (Number.isNaN(id)) {
            const error = new Error('ID must be a number');
            error.statusCode = 400;
            throw error;
        }

        const { content, tag } = req.body;
        const updatedEntry = await prisma.entry.update({
            where: { id },
            data: { content, tag }
        });

        res.json(updatedEntry);
    } catch (error) {
        if (error.code === 'P2025') {
            res.status(404).json({ error: 'Entry not found' });
            return;
        }

        next(error);
    }
}

async function deleteEntry(req, res, next) {
    try {
        const id = Number.parseInt(req.params.id, 10);

        if (Number.isNaN(id)) {
            const error = new Error('ID must be a number');
            error.statusCode = 400;
            throw error;
        }

        const entryToDelete = await prisma.entry.findUnique({ where: { id } });

        if (!entryToDelete) {
            res.status(404).json({ error: 'Entry not found' });
            return;
        }

        saveToTrash(entryToDelete);
        await prisma.entry.delete({ where: { id } });

        res.json({ message: 'Entry deleted and moved to trash_bin.json' });
    } catch (error) {
        next(error);
    }
}

async function exportEntries(req, res, next) {
    try {
        const entries = await prisma.entry.findMany({ orderBy: { createdAt: 'desc' } });

        if (entries.length === 0) {
            res.send('<h1>Diary is empty. No data to export.</h1>');
            return;
        }

        const filePath = createDiaryExport(entries);

        res.download(filePath, 'my_diary.txt', (error) => {
            if (error) {
                console.error('Download error:', error);
            }

            removeExportFile();
        });
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getEntries,
    createEntry,
    updateEntry,
    deleteEntry,
    exportEntries
};
