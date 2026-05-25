- Відкрити MyDiaryV1.4 за допомогою VSC
- В терміналі зайти в папку Project
- npm install
- Створити файл .env в папці Project з вмістом:
DATABASE_URL="file:./dev.db"
PORT=3000
- npm start

Тести:
- run test:cover
- npm run lint
!!! Запуск npm run test:cover знищить всі існуючі дані про користувачів та їхні записи

Доступ до датабази: npx prisma studio
