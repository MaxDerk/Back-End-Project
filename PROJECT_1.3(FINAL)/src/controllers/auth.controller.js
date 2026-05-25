const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'retro_diary_secret_key_1995';
async function register(req, res, next) {
    try {
        const { username, password } = req.body;
        if (!username || !password || password.length < 6) {
            const err = new Error('Username required and password must be at least 6 characters');
            err.statusCode = 400;
            throw err;
        }
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            const err = new Error('Username already taken');
            err.statusCode = 400;
            throw err;
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        await prisma.user.create({
            data: { username, password: hashedPassword }
        });
        return res.status(201).json({ message: 'User registered successfully!' });
    } catch (error) {
        next(error);
    }
}
async function login(req, res, next) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            const err = new Error('Username and password are required');
            err.statusCode = 400;
            throw err;
        }
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            const err = new Error('User not found');
            err.statusCode = 404;
            throw err;
        }
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            const err = new Error('Invalid password');
            err.statusCode = 401;
            throw err;
        }
        const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
        return res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        next(error);
    }
}
module.exports = { register, login };