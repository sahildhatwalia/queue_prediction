import { AppError, ValidationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { ZodError } from 'zod';
import { env } from '../config/env.js';

/**
 * Global error handler — must be registered as the LAST middleware in Express.
 * All thrown errors (or errors passed to next()) end up here.
 * Produces a consistent API error response shape.
 */
export const errorHandler = (err, req, res, _next) => {
  // 1. Zod validation errors (if not already wrapped)
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.flatten().fieldErrors,
    });
    return;
  }

  // 2. Our typed AppError hierarchy
  if (err instanceof AppError) {
    // Log 5xx errors as errors; 4xx as warnings
    if (err.statusCode >= 500) {
      logger.error({ err, path: req.path, method: req.method }, err.message);
    } else {
      logger.warn({ code: err.code, path: req.path }, err.message);
    }

    const body = {
      success: false,
      error: err.code,
      message: err.message,
    };

    // Include validation details if present
    if (err instanceof ValidationError && err.details) {
      body.details = err.details;
    }

    // Exclude stack traces from production responses
    if (env.NODE_ENV === 'development') {
      body.stack = err.stack;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // 3. Unknown / unexpected errors
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');
  res.status(500).json({
    success: false,
    error: 'INTERNAL_SERVER_ERROR',
    message: env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    ...(env.NODE_ENV === 'development' ? { stack: err.stack } : {}),
  });
};
