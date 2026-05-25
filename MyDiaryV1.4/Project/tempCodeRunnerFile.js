require('dotenv').config();
const express = require('express');
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());

// Шлях до файлу "Кошика"
const TRASH_FILE_PATH = path.join(__dirname, 'trash_bin.json');

// --- ДОПОМІЖНІ ФУНКЦІЇ ---

// Функція для запису видалених даних у файл (Кошик)
const saveToTrash = (data) => {
    try {
        let trash = [];
        if (fs.existsSync(TRASH_FILE_PATH)) {
            const fileData = fs.readFileSync(TRASH_FILE_PATH, 'utf8');
            trash = JSON.parse(fileData || '[]');
        }
        
        // Додаємо мітку часу видалення
        const deletedItem = {
            ...data,
            deletedAt: new Date().toISOString()
        };
        
        trash.push(deletedItem);
        fs.writeFileSync(TRASH_FILE_PATH, JSON.stringify(trash, null, 2), 'utf8');
    } catch (error) {
        console.error('Помилка при збереженні у кошик:', error);
    }
};

// --- МАРШРУТИ ---

// 1. Головна
app.get('/', (req, res) => {
    res.send('<h1>Мій Щоденник API 🚀</h1><p>Система з функцією Кошика та Експорту готова.</p>');
});

// 2. Отримання записів (Пошук за тегом/датою)
app.get('/api/entries', async (req, res, next) => {
    try {
        const { tag, date } = req.query;
        let filter = {};
        if (tag) filter.tag = tag;
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
});

// 3. Створення
app.post('/api/entries', async (req, res, next) => {
    try {
        const { content, tag } = req.body;
        if (!content || content.trim() === "") {
            const err = new Error('Контент порожній');
            err.statusCode = 400;
            throw err;
        }
        const newEntry = await prisma.entry.create({
            data: { content, tag: tag || null }
        });
        res.status(201).json(newEntry);
    } catch (error) {
        next(error);
    }
});

// 4. Оновлення
app.put('/api/entries/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            const err = new Error('ID має бути числом');
            err.statusCode = 400;
            throw err;
        }
        const { content, tag } = req.body;
        const updated = await prisma.entry.update({
            where: { id },
            data: { content, tag }
        });
        res.json(updated);
    } catch (error) {
        if (error.code === 'P2025') res.status(404).json({ error: 'Запис не знайдено' });
        else next(error);
    }
});

// 5. ВИДАЛЕННЯ (з переміщенням у Кошик)
app.delete('/api/entries/:id', async (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        if (isNaN(id)) {
            const err = new Error('ID має бути числом');
            err.statusCode = 400;
            throw err;
        }

        const entryToDelete = await prisma.entry.findUnique({ where: { id } });
        
        if (!entryToDelete) {
            return res.status(404).json({ error: 'Запис не знайдено' });
        }

        // Зберігаємо у файл-кошик перед видаленням
        saveToTrash(entryToDelete);

        // Видаляємо з бази
        await prisma.entry.delete({ where: { id } });

        res.json({ message: 'Запис видалено та переміщено в кошик (trash_bin.json)' });
    } catch (error) {
        next(error);
    }
});

// 6. ЕКСПОРТ У ФАЙЛ
// Доступно за посиланням: http://localhost:3000/api/entries/export
app.get('/api/entries/export', async (req, res, next) => {
    try {
        const entries = await prisma.entry.findMany({ orderBy: { createdAt: 'desc' } });
        
        if (entries.length === 0) {
            return res.send('<h1>Щоденник порожній. Немає даних для експорту.</h1>');
        }

        let fileContent = '--- ВАШІ ЗАПИСИ ЩОДЕННИКА ---\n\n';
        entries.forEach((e, index) => {
            fileContent += `Запис №${entries.length - index}\n`;
            fileContent += `ID: ${e.id} | Дата: ${e.createdAt.toLocaleString()}\n`;
            fileContent += `Тег: ${e.tag || 'Без тегу'}\n`;
            fileContent += `Зміст: ${e.content}\n`;
            fileContent += '------------------------------------------\n\n';
        });

        const filePath = path.join(__dirname, 'diary_export.txt');
        fs.writeFileSync(filePath, fileContent, 'utf8');

        res.download(filePath, 'my_diary.txt', (err) => {
            if (err) console.error('Помилка при завантаженні:', err);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath); // Видаляємо тимчасовий файл
        });
    } catch (error) {
        next(error);
    }
});

// 7. ПЕРЕГЛЯД КОШИКА (через API)
app.get('/api/trash', (req, res) => {
    if (!fs.existsSync(TRASH_FILE_PATH)) return res.json({ message: "Кошик порожній", data: [] });
    const data = fs.readFileSync(TRASH_FILE_PATH, 'utf8');
    res.json(JSON.parse(data || '[]'));
});

// --- ОБРОБКА ПОМИЛОК ---
app.use((err, req, res, next) => {
    const status = err.statusCode || 500;
    console.error(`[Error]: ${err.message}`);
    res.status(status).json({
        error: err.message || 'Server Error'
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`🚀 Сервер запущено: http://localhost:${PORT}`);
    console.log(`📂 Експорт: http://localhost:${PORT}/api/entries/export`);
    console.log(`🗑️ Кошик (JSON): http://localhost:${PORT}/api/trash`);
});