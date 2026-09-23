import { authService } from './auth.service.js';
import { BadRequestError } from '../../utils/errors.js';

export class AuthController {
  async register(req, res, next) {
    try {
      const result = await authService.register(req.body);
      res.status(201).json({
        success: true,
        data: result,
        message: 'Registration successful',
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const result = await authService.login(
        req.body,
        req.ip ?? undefined,
        req.headers['user-agent'] ?? undefined,
      );
      res.status(200).json({
        success: true,
        data: result,
        message: 'Login successful',
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) {
        throw new BadRequestError('refreshToken is required');
      }
      const tokens = await authService.refresh(refreshToken);
      res.status(200).json({ success: true, data: tokens });
    } catch (err) {
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader?.slice(7) ?? '';
      await authService.logout(token, req.user.sub, req.ip ?? undefined);
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }

  async me(req, res, next) {
    try {
      const user = await authService.getProfile(req.user.sub);
      res.status(200).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
}

export const authController = new AuthController();
