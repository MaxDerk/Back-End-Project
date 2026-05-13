const express = require('express');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const app = express();
app.use(express.json());

// 1. Головна
app.get('/', (req, res) => {
  res.send('<h1>Мій Щоденник API 🚀</h1><p>Система готова на 100%.</p>');
});

// 2. Отримання записів (з можливістю пошуку)
app.get('/api/entries', async (req, res) => {
  try {
    const { tag, date } = req.query; 
    let filter = {};
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
    console.error('Помилка при отриманні записів:', error);
    res.status(500).json({ error: 'Внутрішня помилка сервера' });
  }
});

// 3. Створення (Create)
app.post('/api/entries', async (req, res) => {
  const { content, tag } = req.body;
  if (!content) return res.status(400).json({ error: 'Порожньо!' });
  const newEntry = await prisma.entry.create({ data: { content, tag: tag || null } });
  res.status(201).json(newEntry);
});

// 4. Видалення (Delete)
app.delete('/api/entries/:id', async (req, res) => {
  const { id } = req.params;
  await prisma.entry.delete({ where: { id: parseInt(id) } });
  res.json({ message: 'Видалено!' });
});

// 5. Оновлення (Update)
app.put('/api/entries/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, tag } = req.body;
    const updated = await prisma.entry.update({
      where: { id: parseInt(id) },
      data: { content, tag }
    });
    res.json(updated);
  } catch (e) {
    res.status(404).json({ error: 'Не знайдено' });
  }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 БЕКЕНД ГОТОВИЙ: http://localhost:${PORT}`));