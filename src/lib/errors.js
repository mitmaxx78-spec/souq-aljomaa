'use strict';

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function badRequest(message, details) {
  return new AppError(400, 'BAD_REQUEST', message, details);
}

function notFound(message) {
  return new AppError(404, 'NOT_FOUND', message);
}

function conflict(message, details) {
  return new AppError(409, 'CONFLICT', message, details);
}

function forbidden(message) {
  return new AppError(403, 'FORBIDDEN', message);
}

function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Kept last in server.js. Express's own default error page leaks a stack
// trace to the browser, which is fine for us in dev but not for a public
// marketplace site strangers can poke at.
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
  }
  // zod throws its own error class on .parse() failures. Without this it fell
  // through to the generic 500 below, so a form typo looked like a server
  // crash instead of the validation message the person actually needed.
  if (err && err.name === 'ZodError') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'في خطأ بالبيانات المرسلة', details: err.issues },
    });
  }
  console.error('[souq] unhandled error', err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'صار خطأ، جرب كمان مرة' } });
}

module.exports = { AppError, badRequest, notFound, conflict, forbidden, asyncRoute, errorHandler };
