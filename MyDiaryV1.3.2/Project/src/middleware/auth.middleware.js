const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-diary-key';
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        const err = new Error('Unauthorized: No token provided');
        err.statusCode = 401;
        return next(err);
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        const err = new Error('Unauthorized: Invalid token');
        err.statusCode = 401;
        next(err);
    }
}
module.exports = authenticate;
