const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const request = require('supertest');

const app = require('./src/app');
const prisma = require('./src/config/prisma');
const authController = require('./src/controllers/auth.controller');
const entriesController = require('./src/controllers/entries.controller');
const trashController = require('./src/controllers/trash.controller');
const authenticate = require('./src/middleware/auth.middleware');
const errorHandler = require('./src/middleware/error.middleware');
const { createDiaryExport, removeExportFile } = require('./src/services/export.service');
const trashService = require('./src/services/trash.service');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-diary-key';
const trashPath = path.join(__dirname, 'trash_bin.json');
const exportPath = path.join(__dirname, 'diary_export.txt');

function removeGeneratedFiles() {
    [trashPath, exportPath].forEach((filePath) => {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });
}

async function clearDatabase() {
    await prisma.entry.deleteMany({});
    await prisma.user.deleteMany({});
}

async function createUser(username = `user-${Date.now()}-${Math.random()}`) {
    return prisma.user.create({
        data: {
            username,
            password: await bcrypt.hash('password123', 10)
        }
    });
}

async function authFor(username) {
    const user = await createUser(username);
    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '24h' });

    return {
        user,
        header: `Bearer ${token}`
    };
}

async function createEntry(userId, data = {}) {
    return prisma.entry.create({
        data: {
            content: data.content || 'Test entry',
            tag: Object.prototype.hasOwnProperty.call(data, 'tag') ? data.tag : 'work',
            userId
        }
    });
}

describe('MyDiary API and controllers', () => {
    let consoleErrorSpy;

    beforeEach(async () => {
        await clearDatabase();
        removeGeneratedFiles();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(async () => {
        jest.restoreAllMocks();
        await clearDatabase();
        removeGeneratedFiles();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    it('registers a new user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'alice', password: 'password123' });

        expect(res.statusCode).toBe(201);
        expect(res.body.message).toBe('User registered successfully!');
    });

    it('stores a registered user in the database', async () => {
        await request(app)
            .post('/api/auth/register')
            .send({ username: 'alice', password: 'password123' });

        await expect(prisma.user.findUnique({ where: { username: 'alice' } })).resolves.toBeTruthy();
    });

    it('rejects registration with a short password', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'bob', password: '123' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Username required and password must be at least 6 characters');
    });

    it('rejects registration with a duplicate username', async () => {
        await createUser('bob');

        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'bob', password: 'password123' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Username is already taken');
    });

    it('logs in a user', async () => {
        await createUser('carol');

        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'carol', password: 'password123' });

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Login successful');
        expect(typeof res.body.token).toBe('string');
    });

    it('rejects login for an unknown user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'missing', password: 'password123' });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('User not found');
    });

    it('rejects login with an invalid password', async () => {
        await createUser('carol');

        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'carol', password: 'wrongpass' });

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('Invalid password');
    });

    it('passes registration database errors to the error middleware', async () => {
        jest.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('Register lookup failed'));

        const res = await request(app)
            .post('/api/auth/register')
            .send({ username: 'dbfail', password: 'password123' });

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Register lookup failed');
    });

    it('passes login database errors to the error middleware', async () => {
        jest.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('Login lookup failed'));

        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'dbfail', password: 'password123' });

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Login lookup failed');
    });

    it('rejects requests without a bearer token', async () => {
        const res = await request(app).get('/api/entries');

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('Unauthorized: No token provided');
    });

    it('rejects requests with an invalid bearer token', async () => {
        const res = await request(app).get('/api/entries').set('Authorization', 'Bearer not-a-token');

        expect(res.statusCode).toBe(401);
        expect(res.body.error).toBe('Unauthorized: Invalid token');
    });

    it('creates an entry for the authenticated user', async () => {
        const { user, header } = await authFor('dana');

        const res = await request(app)
            .post('/api/entries')
            .set('Authorization', header)
            .send({ content: 'Visible entry', tag: 'life' });

        expect(res.statusCode).toBe(201);
        expect(res.body).toMatchObject({ content: 'Visible entry', tag: 'life', userId: user.id });
    });

    it('lists entries for the authenticated user only', async () => {
        const { user, header } = await authFor('dana');
        const other = await createUser('other');
        await createEntry(user.id, { content: 'Visible entry' });
        await createEntry(other.id, { content: 'Hidden entry' });

        const res = await request(app).get('/api/entries').set('Authorization', header);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([expect.objectContaining({ content: 'Visible entry', userId: user.id })]);
    });

    it('rejects empty entry content', async () => {
        const { header } = await authFor('erin');

        const res = await request(app)
            .post('/api/entries')
            .set('Authorization', header)
            .send({ content: '   ' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Content is empty');
    });

    it('updates an owned entry', async () => {
        const { user, header } = await authFor('frank');
        const entry = await createEntry(user.id, { content: 'Before', tag: null });

        const res = await request(app)
            .put(`/api/entries/${entry.id}`)
            .set('Authorization', header)
            .send({ content: 'After', tag: 'edited' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ content: 'After', tag: 'edited' });
    });

    it('redacts an updated entry', async () => {
        const { user, header } = await authFor('frank');
        const entry = await createEntry(user.id, { content: 'Before', tag: null });

        const res = await request(app)
            .put(`/api/entries/${entry.id}`)
            .set('Authorization', header)
            .send({ content: 'After', tag: 'edited' });

        expect(res.body.isRedacted).toBe(true);
    });

    it('rejects update requests with non-numeric ids', async () => {
        const { header } = await authFor('gina');

        const res = await request(app)
            .put('/api/entries/not-a-number')
            .set('Authorization', header)
            .send({ content: 'Nope' });

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('ID must be a number');
    });

    it('returns not found when updating a missing entry', async () => {
        const { header } = await authFor('gina');

        const res = await request(app)
            .put('/api/entries/999999')
            .set('Authorization', header)
            .send({ content: 'Nope' });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Entry not found or access denied');
    });

    it('returns not found when updating another user entry', async () => {
        const { header } = await authFor('gina');
        const { user: other } = await authFor('harry');
        const otherEntry = await createEntry(other.id, { content: 'Not yours' });

        const res = await request(app)
            .put(`/api/entries/${otherEntry.id}`)
            .set('Authorization', header)
            .send({ content: 'Nope' });

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Entry not found or access denied');
    });

    it('deletes an owned entry', async () => {
        const { user, header } = await authFor('ivy');
        const entry = await createEntry(user.id, { content: 'Delete me' });

        const res = await request(app).delete(`/api/entries/${entry.id}`).set('Authorization', header);

        expect(res.statusCode).toBe(200);
        expect(res.body.message).toBe('Entry deleted and moved to trash_bin.json');
    });

    it('moves a deleted entry to trash', async () => {
        const { user, header } = await authFor('june');
        const entry = await createEntry(user.id, { content: 'Move me to trash' });

        await request(app).delete(`/api/entries/${entry.id}`).set('Authorization', header);
        const res = await request(app).get('/api/trash').set('Authorization', header);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([expect.objectContaining({ content: 'Move me to trash', userId: user.id })]);
    });

    it('shows only trash entries that belong to the authenticated user', async () => {
        const { user, header } = await authFor('kim');
        const { user: other } = await authFor('leo');
        trashService.saveToTrash({ id: 1, content: 'My deleted', userId: user.id });
        trashService.saveToTrash({ id: 2, content: 'Other deleted', userId: other.id });

        const res = await request(app).get('/api/trash').set('Authorization', header);

        expect(res.statusCode).toBe(200);
        expect(res.body).toEqual([expect.objectContaining({ content: 'My deleted', userId: user.id })]);
    });

    it('rejects delete requests with non-numeric ids', async () => {
        const { header } = await authFor('kate');

        const res = await request(app).delete('/api/entries/abc').set('Authorization', header);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('ID must be a number');
    });

    it('returns not found when deleting a missing entry', async () => {
        const { header } = await authFor('kate');

        const res = await request(app).delete('/api/entries/999999').set('Authorization', header);

        expect(res.statusCode).toBe(404);
        expect(res.body.error).toBe('Entry not found or access denied');
    });

    it('rejects exporting an empty diary', async () => {
        const { header } = await authFor('liam');

        const res = await request(app).get('/api/entries/export').set('Authorization', header);

        expect(res.statusCode).toBe(400);
        expect(res.body.error).toBe('Your diary is empty, no entries to be exported.');
        expect(fs.existsSync(exportPath)).toBe(false);
    });

    it('exports diary data as a downloadable text file', async () => {
        const { user, header } = await authFor('mila');
        await createEntry(user.id, { content: 'Export me', tag: null });

        const res = await request(app).get('/api/entries/export').set('Authorization', header);

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-disposition']).toContain('my_diary.txt');
    });

    it('includes entry content in the diary export', async () => {
        const { user, header } = await authFor('mila');
        await createEntry(user.id, { content: 'Export me', tag: null });

        const res = await request(app).get('/api/entries/export').set('Authorization', header);

        expect(res.text).toContain('Export me');
    });

    it('uses fallback text for missing export tags', async () => {
        const { user, header } = await authFor('mila');
        await createEntry(user.id, { content: 'Export me', tag: null });

        const res = await request(app).get('/api/entries/export').set('Authorization', header);

        expect(res.text).toContain('No tag');
    });

    it('passes entry list database errors to the error middleware', async () => {
        const { header } = await authFor('nora');
        jest.spyOn(prisma.entry, 'findMany').mockRejectedValueOnce(new Error('Database Failure'));

        const res = await request(app).get('/api/entries').set('Authorization', header);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Database Failure');
    });

    it('passes entry create database errors to the error middleware', async () => {
        const { header } = await authFor('nora');
        jest.spyOn(prisma.entry, 'create').mockRejectedValueOnce(new Error('Insert Failure'));

        const res = await request(app)
            .post('/api/entries')
            .set('Authorization', header)
            .send({ content: 'Fail' });

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Insert Failure');
    });

    it('passes export database errors to the error middleware', async () => {
        const { header } = await authFor('oliver');
        jest.spyOn(prisma.entry, 'findMany').mockRejectedValueOnce(new Error('Export Failure'));

        const res = await request(app).get('/api/entries/export').set('Authorization', header);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Export Failure');
    });

    it('passes trash read errors to the error middleware', async () => {
        const { header } = await authFor('oliver');
        fs.writeFileSync(trashPath, '{bad json', 'utf8');

        const res = await request(app).get('/api/trash').set('Authorization', header);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toContain('JSON');
    });

    it('uses the default error message when an error has no message', async () => {
        const { header } = await authFor('paul');
        jest.spyOn(prisma.entry, 'findMany').mockImplementationOnce(() => {
            const emptyError = new Error();
            delete emptyError.message;
            throw emptyError;
        });

        const res = await request(app).get('/api/entries').set('Authorization', header);

        expect(res.statusCode).toBe(500);
        expect(res.body.error).toBe('Server Error');
    });

    it('passes direct update controller errors to next', async () => {
        const { user } = await authFor('quinn');
        const next = jest.fn();
        jest.spyOn(prisma.entry, 'findFirst').mockResolvedValueOnce({ id: 1, userId: user.id });
        jest.spyOn(prisma.entry, 'update').mockRejectedValueOnce(new Error('Update Failure'));

        await entriesController.updateEntry(
            { params: { id: '1' }, body: { content: 'Broken', tag: 'bug' }, user: { userId: user.id } },
            {},
            next
        );

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Update Failure' }));
    });

    it('passes direct delete controller errors to next', async () => {
        const { user } = await authFor('quinn');
        const next = jest.fn();
        jest.spyOn(prisma.entry, 'findFirst').mockResolvedValueOnce({ id: 2, content: 'Broken', userId: user.id });
        jest.spyOn(prisma.entry, 'delete').mockRejectedValueOnce(new Error('Delete Failure'));

        await entriesController.deleteEntry({ params: { id: '2' }, user: { userId: user.id } }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Delete Failure' }));
    });

    it('passes direct trash controller errors to next', () => {
        const next = jest.fn();
        fs.writeFileSync(trashPath, '[]', 'utf8');
        jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
            throw new Error('FS Fail');
        });

        trashController.getTrash({ user: { userId: 1 } }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'FS Fail' }));
    });

    it('logs download errors', async () => {
        jest.spyOn(prisma.entry, 'findMany').mockResolvedValueOnce([
            { id: 7, content: 'Download callback', tag: null, createdAt: new Date(), userId: 1 }
        ]);
        const res = {
            download: jest.fn((filePath, fileName, callback) => callback(new Error('Download Failure')))
        };

        await entriesController.exportEntries({ user: { userId: 1 } }, res, jest.fn());

        expect(consoleErrorSpy).toHaveBeenCalledWith('Download error:', expect.any(Error));
    });

    it('removes the export file after a download callback', async () => {
        jest.spyOn(prisma.entry, 'findMany').mockResolvedValueOnce([
            { id: 8, content: 'Download callback', tag: null, createdAt: new Date(), userId: 1 }
        ]);
        const res = {
            download: jest.fn((filePath, fileName, callback) => callback())
        };

        await entriesController.exportEntries({ user: { userId: 1 } }, res, jest.fn());

        expect(fs.existsSync(exportPath)).toBe(false);
    });

    it('creates export content', () => {
        const filePath = createDiaryExport([
            { id: 9, content: 'Manual export', tag: null, createdAt: new Date('2026-05-16T10:00:00Z') }
        ]);

        expect(filePath).toBe(exportPath);
        expect(fs.readFileSync(exportPath, 'utf8')).toContain('No tag');
    });

    it('safely removes a missing export file', () => {
        removeExportFile();

        expect(fs.existsSync(exportPath)).toBe(false);
    });

    it('reads a missing trash file as an empty list', () => {
        expect(trashService.readTrash()).toEqual([]);
    });

    it('reads an empty trash file as an empty list', () => {
        fs.writeFileSync(trashPath, '', 'utf8');

        expect(trashService.readTrash()).toEqual([]);
    });

    it('sets req.user for valid tokens in the auth middleware', () => {
        const token = jwt.sign({ userId: 77 }, JWT_SECRET);
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = {};
        const next = jest.fn();

        authenticate(req, res, next);

        expect(req.user.userId).toBe(77);
        expect(next).toHaveBeenCalled();
    });

    it('loads the app with an explicit Swagger server port', () => {
        const originalPort = process.env.PORT;

        jest.resetModules();
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        process.env.PORT = '4567';
        expect(() => require('./src/app')).not.toThrow();

        jest.dontMock('dotenv');
        jest.resetModules();
        if (originalPort === undefined) {
            delete process.env.PORT;
        } else {
            process.env.PORT = originalPort;
        }
    });

    it('loads the app with the default Swagger server port', () => {
        const originalPort = process.env.PORT;

        jest.resetModules();
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        delete process.env.PORT;
        expect(() => require('./src/app')).not.toThrow();

        jest.dontMock('dotenv');
        jest.resetModules();
        if (originalPort === undefined) {
            delete process.env.PORT;
        } else {
            process.env.PORT = originalPort;
        }
    });

    it('passes direct registration errors to next', async () => {
        const next = jest.fn();
        jest.spyOn(bcrypt, 'hash').mockRejectedValueOnce(new Error('Hash failed'));

        await authController.register(
            { body: { username: 'rose', password: 'password123' } },
            {},
            next
        );

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Hash failed' }));
    });

    it('passes direct login errors to next', async () => {
        const next = jest.fn();
        jest.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('Direct login failed'));

        await authController.login(
            { body: { username: 'rose', password: 'password123' } },
            {},
            next
        );

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Direct login failed' }));
    });

    it('formats custom status errors directly', () => {
        const status = jest.fn().mockReturnThis();
        const json = jest.fn();

        errorHandler({ message: 'Bad request', statusCode: 418 }, {}, { status, json });

        expect(status).toHaveBeenCalledWith(418);
        expect(json).toHaveBeenCalledWith({ error: 'Bad request' });
    });
});
