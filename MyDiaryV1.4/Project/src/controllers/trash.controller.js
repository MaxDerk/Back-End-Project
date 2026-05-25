const { readTrash } = require('../services/trash.service');
function getTrash(req, res, next) {
    try {
        const data = readTrash();
        const userTrash = data.filter(entry => entry.userId === req.user.userId);
        res.json(userTrash);
    } catch (error) {
        next(error);
    }
}
module.exports = {
    getTrash
};