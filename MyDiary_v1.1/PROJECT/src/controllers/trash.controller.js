const { readTrash } = require('../services/trash.service');

function getTrash(req, res, next) {
    try {
        const data = readTrash();
        res.json(data);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getTrash
};
