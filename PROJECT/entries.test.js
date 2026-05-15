const fs = require('fs');
const path = require('path');
const request = require('supertest');

const app = require('./src/app');
const prisma = require('./src/config/prisma');
const entriesController = require('./src/controllers/entries.controller');
const trashController = require('./src/controllers/trash.controller');
const { createDiaryExport, removeExportFile } = require('./src/services/export.service');
const trashService = require('./src/services/trash.service');

const trashPath = path.join(__dirname, 'trash_bin.json');
const exportPath = path.join(__dirname, 'diary_export.txt');

describe('entries and trash API', () => {
    let entryId;
    let consoleErrorSpy;
    let originalEntries;

    beforeAll(async () => {
        originalEntries = await prisma.entry.findMany();
        await prisma.entry.deleteMany({});
        [trashPath, exportPath].forEach((filePath) => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
    });

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    afterAll(async () => {
        await prisma.entry.deleteMany({});
        if (originalEntries.length > 0) {
            await prisma.entry.createMany({ data: originalEntries });
        }
        [trashPath, exportPath].forEach((filePath) => {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
        await prisma.$disconnect();
    });

    it('creates an entry', async () => {
        const res = await request(app)
            .post('/api/entries')
            .send({ content: 'Test Note', tag: 'work' });

        expect(res.statusCode).toBe(201);
        expect(res.body).toMatchObject({ content: 'Test Note', tag: 'work' });
        entryId = res.body.id;
    });

    it('rejects an empty entry', async () => {
        const res = await request(app).post('/api/entries').send({ content: '' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Content is empty');
    });

    it('gets entries with tag and date filters', async () => {
        const date = new Date().toISOString().split('T')[0];
        const res = await request(app).get(`/api/entries?tag=work&date=${date}`);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('updates an entry and handles update validation errors', async () => {
        const updated = await request(app)
            .put(`/api/entries/${entryId}`)
            .send({ content: 'Updated content', tag: 'life' });

        expect(updated.statusCode).toBe(200);
        expect(updated.body).toMatchObject({ content: 'Updated content', tag: 'life' });

        const invalidId = await request(app).put('/api/entries/not-a-number').send({ content: 'X' });
        expect(invalidId.statusCode).toBe(400);

        const missing = await request(app).put('/api/entries/999999').send({ content: 'X' });
        expect(missing.statusCode).toBe(404);
        expect(missing.body.error).toBe('Entry not found');
    });

    it('handles delete validation errors and deletes an entry to trash', async () => {
        const invalidId = await request(app).delete('/api/entries/abc');
        expect(invalidId.statusCode).toBe(400);

        const missing = await request(app).delete('/api/entries/999999');
        expect(missing.statusCode).toBe(404);

        const deleted = await request(app).delete(`/api/entries/${entryId}`);
        expect(deleted.statusCode).toBe(200);
        expect(deleted.body.message).toContain('moved to trash');

        const trash = await request(app).get('/api/trash');
        expect(trash.statusCode).toBe(200);
        expect(trash.body).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: entryId, content: 'Updated content' })])
        );
    });

    it('reads an empty or missing trash file as an empty list', () => {
        if (fs.existsSync(trashPath)) {
            fs.unlinkSync(trashPath);
        }
        expect(trashService.readTrash()).toEqual([]);

        fs.writeFileSync(trashPath, '', 'utf8');
        expect(trashService.readTrash()).toEqual([]);
    });

    it('passes trash read errors to the error middleware', async () => {
        fs.writeFileSync(trashPath, '{bad json', 'utf8');

        const res = await request(app).get('/api/trash');

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toContain('JSON');
    });

    it('exports an empty diary as html', async () => {
        await prisma.entry.deleteMany({});

        const res = await request(app).get('/api/entries/export');

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Diary is empty');
    });

    it('exports diary data as a downloadable text file', async () => {
        await request(app).post('/api/entries').send({ content: 'Export me' });

        const res = await request(app).get('/api/entries/export');

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-disposition']).toContain('my_diary.txt');
        expect(res.text).toContain('Export me');
    });

    it('handles database errors from entries endpoints', async () => {
        jest.spyOn(prisma.entry, 'findMany').mockRejectedValueOnce(new Error('Database Failure'));
        const getRes = await request(app).get('/api/entries');
        expect(getRes.statusCode).toBe(500);

        jest.spyOn(prisma.entry, 'create').mockRejectedValueOnce(new Error('Insert Failure'));
        const createRes = await request(app).post('/api/entries').send({ content: 'Fail' });
        expect(createRes.statusCode).toBe(500);
    });

    it('handles export database errors', async () => {
        jest.spyOn(prisma.entry, 'findMany').mockRejectedValueOnce(new Error('Export Failure'));

        const res = await request(app).get('/api/entries/export');

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Export Failure');
    });

    it('uses the default error message when an error has no message', async () => {
        jest.spyOn(prisma.entry, 'findMany').mockImplementationOnce(() => {
            const emptyError = new Error();
            delete emptyError.message;
            throw emptyError;
        });

        const res = await request(app).get('/api/entries');

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Server Error');
    });

    it('covers direct controller error paths', async () => {
        const next = jest.fn();

        jest.spyOn(prisma.entry, 'update').mockRejectedValueOnce(new Error('Update Failure'));
        await entriesController.updateEntry(
            { params: { id: '1' }, body: { content: 'Broken', tag: 'bug' } },
            {},
            next
        );
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Update Failure' }));

        next.mockClear();
        if (fs.existsSync(trashPath)) {
            fs.unlinkSync(trashPath);
        }
        jest.spyOn(prisma.entry, 'findUnique').mockResolvedValueOnce({ id: 1, content: 'Broken' });
        jest.spyOn(prisma.entry, 'delete').mockRejectedValueOnce(new Error('Delete Failure'));
        await entriesController.deleteEntry({ params: { id: '1' } }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Delete Failure' }));
    });

    it('covers trash controller catch behavior directly', () => {
        const next = jest.fn();
        jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
            throw new Error('FS Fail');
        });

        trashController.getTrash({}, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'FS Fail' }));
    });

    it('logs download errors and still removes the export file', async () => {
        jest.spyOn(prisma.entry, 'findMany').mockResolvedValueOnce([
            { id: 7, content: 'Download callback', tag: null, createdAt: new Date() }
        ]);
        const res = {
            download: jest.fn((filePath, fileName, callback) => callback(new Error('Download Failure')))
        };

        await entriesController.exportEntries({}, res, jest.fn());

        expect(res.download).toHaveBeenCalledWith(exportPath, 'my_diary.txt', expect.any(Function));
        expect(consoleErrorSpy).toHaveBeenCalledWith('Download error:', expect.any(Error));
        expect(fs.existsSync(exportPath)).toBe(false);
    });

    it('creates export content and safely removes a missing export file', () => {
        const filePath = createDiaryExport([
            { id: 9, content: 'Manual export', tag: null, createdAt: new Date('2026-05-16T10:00:00Z') }
        ]);

        expect(filePath).toBe(exportPath);
        expect(fs.readFileSync(exportPath, 'utf8')).toContain('No tag');

        removeExportFile();
        removeExportFile();

        expect(fs.existsSync(exportPath)).toBe(false);
    });
});
