function errorHandler(error, req, res, next) {
    const status = error.statusCode || 500;
    console.error(`[Error]: ${error.message}`);
    const message = status === 500 ? 'Internal Server Error' : error.message;
    res.status(status).json({
        success: false,
        error: message
    });
}
module.exports = errorHandler;