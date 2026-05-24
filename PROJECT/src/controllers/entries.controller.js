const prisma = require('../config/prisma');
const { createDiaryExport, removeExportFile } = require('../services/export.service');
const { saveToTrash } = require('../services/trash.service');

async function getEntries(req, res, next) {
    try {
        const entries = await prisma.entry.findMany({
            where: { userId: req.user.userId },
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
            data: { 
                content, 
                tag: tag || null,
                userId: req.user.userId
            }
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

        const existingEntry = await prisma.entry.findFirst({
            where: { id, userId: req.user.userId }
        });

        if (!existingEntry) {
            return res.status(404).json({ error: 'Entry not found or access denied' });
        }

        const { content, tag } = req.body;
        const updatedEntry = await prisma.entry.update({
            where: { id },
            data: { content, tag, isRedacted: true } 
        });

        res.json(updatedEntry);
    } catch (error) {
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

        const entryToDelete = await prisma.entry.findFirst({
            where: { id, userId: req.user.userId }
        });

        if (!entryToDelete) {
            return res.status(404).json({ error: 'Entry not found or access denied' });
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
        const entries = await prisma.entry.findMany({ 
            where: { userId: req.user.userId },
            orderBy: { createdAt: 'desc' } 
        });

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