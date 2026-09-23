import { redis } from '../config/redis.js';
import { verifyAccessToken } from '../utils/token.js';
import { UnauthorizedError } from '../utils/errors.js';

/**
 * JWT authenticate middleware.
 * Extracts the Bearer token, verifies it, and checks the token blacklist.
 */
export const authenticate = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing or malformed Authorization header');
    }

    const token = authHeader.slice(7);

    // Verify JWT signature and expiry
    const payload = verifyAccessToken(token);

    // Check token blacklist — logout adds token here until it expires
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) {
      throw new UnauthorizedError('Token has been revoked');
    }

    req.user = payload;
    next();
  } catch (err) {
    next(err);
  }
};

/** Optional auth — populates req.user if token is present, but does not throw if absent */
export const optionalAuthenticate = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      const payload = verifyAccessToken(token);
      const isBlacklisted = await redis.get(`blacklist:${token}`);
      if (!isBlacklisted) {
        req.user = payload;
      }
    }
    next();
  } catch {
    // Silently ignore invalid tokens in optional auth
    next();
  }
};
