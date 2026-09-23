import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter, otpLimiter } from '../../middleware/rateLimiter.js';
import { RegisterSchema, LoginSchema, RefreshSchema } from './auth.schemas.js';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', authLimiter, validate(RegisterSchema), authController.register.bind(authController));

// POST /api/v1/auth/login
router.post('/login', authLimiter, validate(LoginSchema), authController.login.bind(authController));

// POST /api/v1/auth/refresh
router.post('/refresh', validate(RefreshSchema), authController.refresh.bind(authController));

// POST /api/v1/auth/logout (requires valid access token)
router.post('/logout', authenticate, authController.logout.bind(authController));

// GET /api/v1/auth/me
router.get('/me', authenticate, authController.me.bind(authController));

export default router;
