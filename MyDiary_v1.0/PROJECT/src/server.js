const app = require('./app');

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server started: http://localhost:${PORT}`);
    console.log(`API entries: http://localhost:${PORT}/api/entries`);
    console.log(`Export: http://localhost:${PORT}/api/entries/export`);
    console.log(`Trash: http://localhost:${PORT}/api/trash`);
});
