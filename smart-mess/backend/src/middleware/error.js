function errorHandler(err, req, res, next) {
  // Never log passwords, password hashes, or sensitive tokens
  const safeMessage = err.message || 'Internal server error';
  const statusCode = err.statusCode || 500;

  if (process.env.NODE_ENV !== 'production' && statusCode === 500) {
    console.error('[SERVER ERROR]', err);
  }

  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error' : safeMessage,
    details: err.details || (statusCode === 500 ? 'An unexpected error occurred.' : safeMessage)
  });
}

function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not found',
    details: `Cannot ${req.method} ${req.originalUrl}`
  });
}

module.exports = {
  errorHandler,
  notFoundHandler
};
