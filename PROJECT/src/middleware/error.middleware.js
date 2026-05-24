function errorHandler(error, req, res, _next) {
    const status = error.statusCode || 500;

    console.error(`[Error]: ${error.message}`);

    res.status(status).json({
        error: error.message || 'Server Error'
    });
}

module.exports = errorHandler;
