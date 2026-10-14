import { ZodError } from 'zod';
import { ValidationError } from '../utils/errors.js';

/**
 * Validate request data against a Zod schema.
 * Strips unknown keys by default.
 *
 * Usage:
 *   router.post('/checkin', authenticate, validate(CheckInSchema), controller)
 */
export const validate =
  (schema, target = 'body') =>
  (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      next(new ValidationError('Request validation failed', errors));
      return;
    }
    // Replace with parsed/coerced data
    req[target] = result.data;
    next();
  };
