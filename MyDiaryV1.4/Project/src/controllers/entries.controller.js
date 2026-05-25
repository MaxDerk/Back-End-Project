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
    } catch (error) { next(error); }
}
async function createEntry(req, res, next) {
    try {
        const { content, tag } = req.body;
        if (!content || content.trim() === '') {
            const err = new Error('Content is empty');
            err.statusCode = 400;
            throw err;
        }
        const newEntry = await prisma.entry.create({
            data: { content, tag: tag || null, userId: req.user.userId }
        });
        res.status(201).json(newEntry);
    } catch (error) { next(error); }
}
async function updateEntry(req, res, next) {
    try {
        const id = Number.parseInt(req.params.id, 10);
        if (Number.isNaN(id)) {
            const err = new Error('ID must be a number');
            err.statusCode = 400;
            throw err;
        }
        const existingEntry = await prisma.entry.findFirst({
            where: { id, userId: req.user.userId }
        });
        if (!existingEntry) {
            const err = new Error('Entry not found or access denied');
            err.statusCode = 404;
            throw err;
        }
        const { content, tag } = req.body;
        const updatedEntry = await prisma.entry.update({
            where: { id },
            data: { content, tag, isRedacted: true } 
        });
        res.json(updatedEntry);
    } catch (error) { next(error); }
}
async function deleteEntry(req, res, next) {
    try {
        const id = Number.parseInt(req.params.id, 10);
        if (Number.isNaN(id)) {
            const err = new Error('ID must be a number');
            err.statusCode = 400;
            throw err;
        }
        const entryToDelete = await prisma.entry.findFirst({
            where: { id, userId: req.user.userId }
        });
        if (!entryToDelete) {
            const err = new Error('Entry not found or access denied');
            err.statusCode = 404;
            throw err;
        }
        saveToTrash(entryToDelete);
        await prisma.entry.delete({ where: { id } });
        res.json({ message: 'Entry deleted and moved to trash_bin.json' });
    } catch (error) { next(error); }
}
async function exportEntries(req, res, next) {
    try {
        const entries = await prisma.entry.findMany({ 
            where: { userId: req.user.userId },
            orderBy: { createdAt: 'desc' } 
        });
        if (entries.length === 0) {
            const err = new Error('Your diary is empty, no entries to be exported.');
            err.statusCode = 400;
            throw err;
        }
        const filePath = createDiaryExport(entries);
        res.download(filePath, 'my_diary.txt', (error) => {
            if (error) {
                console.error('Download error:', error);
                return next(error);
            }
            removeExportFile();
        });
    } catch (error) { next(error); }
}
module.exports = { getEntries, createEntry, updateEntry, deleteEntry, exportEntries };
