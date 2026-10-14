import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';

/** Global rate limiter applied to all routes */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'RATE_LIMITED', message: 'Too many requests, please try again later.' },
});

/** Strict limiter for auth endpoints — prevents brute-force password attacks */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === 'production' ? 5 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'RATE_LIMITED', message: 'Too many login attempts. Try again in 15 minutes.' },
});

/** OTP/SMS limiter — maximum 3 OTP requests per hour */
export const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'RATE_LIMITED', message: 'Too many OTP requests. Try again in 1 hour.' },
});
