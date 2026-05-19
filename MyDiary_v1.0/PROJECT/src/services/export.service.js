const fs = require('fs');
const path = require('path');

const EXPORT_FILE_PATH = path.join(__dirname, '..', '..', 'diary_export.txt');

function createDiaryExport(entries) {
    let fileContent = '--- YOUR DIARY ENTRIES ---\n\n';

    entries.forEach((entry, index) => {
        fileContent += `Entry #${entries.length - index}\n`;
        fileContent += `ID: ${entry.id} | Date: ${entry.createdAt.toLocaleString()}\n`;
        fileContent += `Tag: ${entry.tag || 'No tag'}\n`;
        fileContent += `Content: ${entry.content}\n`;
        fileContent += '------------------------------------------\n\n';
    });

    fs.writeFileSync(EXPORT_FILE_PATH, fileContent, 'utf8');

    return EXPORT_FILE_PATH;
}

function removeExportFile() {
    if (fs.existsSync(EXPORT_FILE_PATH)) {
        fs.unlinkSync(EXPORT_FILE_PATH);
    }
}

module.exports = {
    createDiaryExport,
    removeExportFile
};
