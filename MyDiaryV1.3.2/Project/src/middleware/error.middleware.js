function errorHandler(error, req, res, next) {
    const status = error.statusCode || 500;
    console.error(`[Error]: ${error.message}`);
    const message = error.message || 'Server Error';
    res.status(status).json({ error: message });
}
module.exports = errorHandler;
