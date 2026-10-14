import { Role } from '@hospital-queue/shared';
import { ForbiddenError, UnauthorizedError } from '../utils/errors.js';
import { hasMinRole } from '../utils/token.js';

/**
 * Role-based authorization middleware. Use after authenticate.
 *
 * authorize(Role.RECEPTIONIST) → RECEPTIONIST, ADMIN, SUPER_ADMIN can access (min role)
 * authorizeRoles(Role.ADMIN, Role.SUPER_ADMIN) → exact role list
 */

/** Requires the user to have AT LEAST the specified role (role hierarchy) */
export const authorize =
  (minRole) =>
  (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!hasMinRole(req.user.role, minRole)) {
      next(new ForbiddenError(`Requires at least ${minRole} role`));
      return;
    }
    next();
  };

/** Requires the user's role to be in the exact list provided */
export const authorizeRoles =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  };
