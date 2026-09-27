export function notFound(req, res, next) {
  res.status(404);
  next(new Error(`Route not found: ${req.originalUrl}`));
}

export function errorHandler(err, req, res, next) {
  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
  res.status(statusCode).json({
    message: err.message,
    // A string code lets the app react to a specific error (e.g. REPORTS_LOCKED -> ask for the PIN).
    code: typeof err.code === "string" ? err.code : undefined,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  });
}
