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
        await expect(prisma.user.findUnique({ where: { username: 'alice' } })).resolves.toBeTruthy();
    });

    it('rejects invalid and duplicate registration requests', async () => {
        const invalid = await request(app)
            .post('/api/auth/register')
            .send({ username: 'bob', password: '123' });
        expect(invalid.statusCode).toBe(400);
        expect(invalid.body.error).toBe('Username required and password must be at least 6 characters');

        await createUser('bob');
        const duplicate = await request(app)
            .post('/api/auth/register')
            .send({ username: 'bob', password: 'password123' });
        expect(duplicate.statusCode).toBe(400);
        expect(duplicate.body.error).toBe('Username is already taken');
    });

    it('logs in a user and rejects missing or invalid credentials', async () => {
        await createUser('carol');

        const loggedIn = await request(app)
            .post('/api/auth/login')
            .send({ username: 'carol', password: 'password123' });
        expect(loggedIn.statusCode).toBe(200);
        expect(loggedIn.body).toMatchObject({ message: 'Login successful' });
        expect(typeof loggedIn.body.token).toBe('string');

        const missing = await request(app)
            .post('/api/auth/login')
            .send({ username: 'missing', password: 'password123' });
        expect(missing.statusCode).toBe(404);
        expect(missing.body.error).toBe('User not found');

        const badPassword = await request(app)
            .post('/api/auth/login')
            .send({ username: 'carol', password: 'wrongpass' });
        expect(badPassword.statusCode).toBe(401);
        expect(badPassword.body.error).toBe('Invalid password');
    });

    it('passes auth controller database errors to the error middleware', async () => {
        jest.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('Register lookup failed'));
        const registerRes = await request(app)
            .post('/api/auth/register')
            .send({ username: 'dbfail', password: 'password123' });
        expect(registerRes.statusCode).toBe(500);
        expect(registerRes.body.error).toBe('Register lookup failed');

        jest.spyOn(prisma.user, 'findUnique').mockRejectedValueOnce(new Error('Login lookup failed'));
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ username: 'dbfail', password: 'password123' });
        expect(loginRes.statusCode).toBe(500);
        expect(loginRes.body.error).toBe('Login lookup failed');
    });

    it('rejects requests with missing or invalid bearer tokens', async () => {
        const missing = await request(app).get('/api/entries');
        expect(missing.statusCode).toBe(401);
        expect(missing.body.error).toBe('Unauthorized: No token provided');

        const invalid = await request(app).get('/api/entries').set('Authorization', 'Bearer not-a-token');
        expect(invalid.statusCode).toBe(401);
        expect(invalid.body.error).toBe('Unauthorized: Invalid token');
    });

    it('creates and lists only the authenticated user entries', async () => {
        const { user, header } = await authFor('dana');
        const other = await createUser('other');
        await createEntry(other.id, { content: 'Hidden entry' });

        const created = await request(app)
            .post('/api/entries')
            .set('Authorization', header)
            .send({ content: 'Visible entry', tag: 'life' });
        expect(created.statusCode).toBe(201);
        expect(created.body).toMatchObject({ content: 'Visible entry', tag: 'life', userId: user.id });

        const list = await request(app).get('/api/entries').set('Authorization', header);
        expect(list.statusCode).toBe(200);
        expect(list.body).toEqual([expect.objectContaining({ content: 'Visible entry', userId: user.id })]);
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

    it('updates an owned entry and redacts it', async () => {
        const { user, header } = await authFor('frank');
        const entry = await createEntry(user.id, { content: 'Before', tag: null });

        const res = await request(app)
            .put(`/api/entries/${entry.id}`)
            .set('Authorization', header)
            .send({ content: 'After', tag: 'edited' });

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ content: 'After', tag: 'edited', isRedacted: true });
    });

    it('handles invalid, missing, and cross-user update requests independently', async () => {
        const { header } = await authFor('gina');
        const { user: other } = await authFor('harry');
        const otherEntry = await createEntry(other.id, { content: 'Not yours' });

        const invalid = await request(app)
            .put('/api/entries/not-a-number')
            .set('Authorization', header)
            .send({ content: 'Nope' });
        expect(invalid.statusCode).toBe(400);
        expect(invalid.body.error).toBe('ID must be a number');

        const missing = await request(app)
            .put('/api/entries/999999')
            .set('Authorization', header)
            .send({ content: 'Nope' });
        expect(missing.statusCode).toBe(404);
        expect(missing.body.error).toBe('Entry not found or access denied');

        const forbidden = await request(app)
            .put(`/api/entries/${otherEntry.id}`)
            .set('Authorization', header)
            .send({ content: 'Nope' });
        expect(forbidden.statusCode).toBe(404);
        expect(forbidden.body.error).toBe('Entry not found or access denied');
    });

    it('deletes an owned entry and shows it in that user trash only', async () => {
        const { user, header } = await authFor('ivy');
        const { user: other, header: otherHeader } = await authFor('june');
        const entry = await createEntry(user.id, { content: 'Delete me' });
        const otherEntry = await createEntry(other.id, { content: 'Other deleted' });

        const deleted = await request(app).delete(`/api/entries/${entry.id}`).set('Authorization', header);
        expect(deleted.statusCode).toBe(200);
        expect(deleted.body.message).toBe('Entry deleted and moved to trash_bin.json');

        trashService.saveToTrash(otherEntry);

        const trash = await request(app).get('/api/trash').set('Authorization', header);
        expect(trash.statusCode).toBe(200);
        expect(trash.body).toEqual([expect.objectContaining({ content: 'Delete me', userId: user.id })]);

        const otherTrash = await request(app).get('/api/trash').set('Authorization', otherHeader);
        expect(otherTrash.body).toEqual([expect.objectContaining({ content: 'Other deleted', userId: other.id })]);
    });

    it('handles invalid and missing delete requests independently', async () => {
        const { header } = await authFor('kate');

        const invalid = await request(app).delete('/api/entries/abc').set('Authorization', header);
        expect(invalid.statusCode).toBe(400);
        expect(invalid.body.error).toBe('ID must be a number');

        const missing = await request(app).delete('/api/entries/999999').set('Authorization', header);
        expect(missing.statusCode).toBe(404);
        expect(missing.body.error).toBe('Entry not found or access denied');
    });

    it('exports an empty diary as html', async () => {
        const { header } = await authFor('liam');

        const res = await request(app).get('/api/entries/export').set('Authorization', header);

        expect(res.statusCode).toBe(200);
        expect(res.text).toContain('Diary is empty');
    });

    it('exports diary data as a downloadable text file', async () => {
        const { user, header } = await authFor('mila');
        await createEntry(user.id, { content: 'Export me', tag: null });

        const res = await request(app).get('/api/entries/export').set('Authorization', header);

        expect(res.statusCode).toBe(200);
        expect(res.headers['content-disposition']).toContain('my_diary.txt');
        expect(res.text).toContain('Export me');
        expect(res.text).toContain('No tag');
    });

    it('handles database errors from entries endpoints', async () => {
        const { header } = await authFor('nora');

        jest.spyOn(prisma.entry, 'findMany').mockRejectedValueOnce(new Error('Database Failure'));
        const getRes = await request(app).get('/api/entries').set('Authorization', header);
        expect(getRes.statusCode).toBe(500);
        expect(getRes.body.error).toBe('Database Failure');

        jest.spyOn(prisma.entry, 'create').mockRejectedValueOnce(new Error('Insert Failure'));
        const createRes = await request(app)
            .post('/api/entries')
            .set('Authorization', header)
            .send({ content: 'Fail' });
        expect(createRes.statusCode).toBe(500);
        expect(createRes.body.error).toBe('Insert Failure');
    });

    it('handles export and trash read errors through middleware', async () => {
        const { header } = await authFor('oliver');

        jest.spyOn(prisma.entry, 'findMany').mockRejectedValueOnce(new Error('Export Failure'));
        const exportRes = await request(app).get('/api/entries/export').set('Authorization', header);
        expect(exportRes.statusCode).toBe(500);
        expect(exportRes.body.error).toBe('Export Failure');

        fs.writeFileSync(trashPath, '{bad json', 'utf8');
        const trashRes = await request(app).get('/api/trash').set('Authorization', header);
        expect(trashRes.statusCode).toBe(500);
        expect(trashRes.body.error).toContain('JSON');
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

    it('covers direct controller error paths', async () => {
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

        next.mockClear();
        jest.spyOn(prisma.entry, 'findFirst').mockResolvedValueOnce({ id: 2, content: 'Broken', userId: user.id });
        jest.spyOn(prisma.entry, 'delete').mockRejectedValueOnce(new Error('Delete Failure'));
        await entriesController.deleteEntry({ params: { id: '2' }, user: { userId: user.id } }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Delete Failure' }));
    });

    it('covers trash controller catch behavior directly', () => {
        const next = jest.fn();
        fs.writeFileSync(trashPath, '[]', 'utf8');
        jest.spyOn(fs, 'readFileSync').mockImplementationOnce(() => {
            throw new Error('FS Fail');
        });

        trashController.getTrash({ user: { userId: 1 } }, {}, next);

        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'FS Fail' }));
    });

    it('logs download errors and still removes the export file', async () => {
        jest.spyOn(prisma.entry, 'findMany').mockResolvedValueOnce([
            { id: 7, content: 'Download callback', tag: null, createdAt: new Date(), userId: 1 }
        ]);
        const res = {
            download: jest.fn((filePath, fileName, callback) => callback(new Error('Download Failure')))
        };

        await entriesController.exportEntries({ user: { userId: 1 } }, res, jest.fn());

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

    it('reads missing and empty trash files as an empty list', () => {
        expect(trashService.readTrash()).toEqual([]);

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

    it('uses explicit and default Swagger server ports when loading the app', () => {
        const originalPort = process.env.PORT;

        jest.resetModules();
        jest.doMock('dotenv', () => ({ config: jest.fn() }));
        process.env.PORT = '4567';
        expect(() => require('./src/app')).not.toThrow();

        jest.resetModules();
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

    it('passes direct auth controller errors to next', async () => {
        const next = jest.fn();

        jest.spyOn(bcrypt, 'hash').mockRejectedValueOnce(new Error('Hash failed'));
        await authController.register(
            { body: { username: 'rose', password: 'password123' } },
            {},
            next
        );
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Hash failed' }));

        next.mockClear();
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
