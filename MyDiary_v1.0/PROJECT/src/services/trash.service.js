const fs = require('fs');
const path = require('path');

const TRASH_FILE_PATH = path.join(__dirname, '..', '..', 'trash_bin.json');

function readTrash() {
    if (!fs.existsSync(TRASH_FILE_PATH)) {
        return [];
    }

    const fileData = fs.readFileSync(TRASH_FILE_PATH, 'utf8');
    return JSON.parse(fileData || '[]');
}

function saveToTrash(data) {
    const trash = readTrash();

    trash.push({
        ...data,
        deletedAt: new Date().toISOString()
    });

    fs.writeFileSync(TRASH_FILE_PATH, JSON.stringify(trash, null, 2), 'utf8');
}

module.exports = {
    readTrash,
    saveToTrash
};
