import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  tokenExpiresInMs,
} from '../../utils/token.js';
import {
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

const BCRYPT_ROUNDS = 12;
// Refresh token TTL in seconds (7 days)
const REFRESH_TTL_SEC = 7 * 24 * 60 * 60;

export class AuthService {
  /**
   * Register a new patient.
   * Staff/admin accounts are created by an existing admin, not via this endpoint.
   */
  async register(dto) {
    // Check uniqueness before hashing (fast fail)
    if (dto.email) {
      const existing = await prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictError('An account with this email already exists');
    }
    if (dto.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing) throw new ConflictError('An account with this phone already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        gender: dto.gender,
        role: 'PATIENT',
      },
    });

    const tokens = await this.issueTokens(user.id, user.role, user.email, user.phone);

    logger.info({ userId: user.id }, 'New patient registered');
    return { user: { id: user.id, email: user.email, firstName: user.firstName }, tokens };
  }

  /**
   * Authenticate a user. Returns access + refresh tokens.
   */
  async login(dto, ipAddress, userAgent) {
    const user = await prisma.user.findFirst({
      where: dto.email ? { email: dto.email } : { phone: dto.phone },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedError('Invalid credentials');
    }
    if (!user.isActive) {
      throw new UnauthorizedError('Account has been deactivated');
    }

    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid credentials');
    }

    const tokens = await this.issueTokens(user.id, user.role, user.email, user.phone);

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'USER_LOGIN',
        ipAddress,
        userAgent,
      },
    });

    logger.info({ userId: user.id, role: user.role }, 'User logged in');
    return {
      user: { id: user.id, role: user.role, firstName: user.firstName, lastName: user.lastName },
      tokens,
    };
  }

  /**
   * Rotate refresh tokens.
   * Implements refresh token family tracking — reuse attack detection.
   */
  async refresh(refreshToken) {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedError('Refresh token not found');
    }

    // Reuse attack detection
    if (storedToken.used) {
      logger.warn({ userId: payload.sub, family: storedToken.family }, 'Refresh token reuse detected — invalidating family');
      await prisma.refreshToken.deleteMany({ where: { family: storedToken.family } });
      throw new UnauthorizedError('Token reuse detected. Please log in again.');
    }

    if (new Date() > storedToken.expiresAt) {
      throw new UnauthorizedError('Refresh token expired');
    }

    // Mark old token as used
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { used: true },
    });

    const { user } = storedToken;
    return this.issueTokens(user.id, user.role, user.email, user.phone, storedToken.family);
  }

  /**
   * Blacklist the access token (logout).
   * The token is added to Redis with a TTL equal to its remaining validity.
   */
  async logout(accessToken, userId, ipAddress) {
    const ttlMs = tokenExpiresInMs(accessToken);
    if (ttlMs > 0) {
      await redis.set(`blacklist:${accessToken}`, '1', 'PX', ttlMs);
    }
    // Invalidate all refresh tokens for this user
    await prisma.refreshToken.deleteMany({ where: { userId } });

    await prisma.auditLog.create({
      data: { userId, action: 'USER_LOGOUT', ipAddress },
    });

    logger.info({ userId }, 'User logged out');
  }

  /**
   * Get a user's profile (safe — no password hash).
   */
  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        bloodGroup: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        twoFactorEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        doctorProfile: { include: { department: true } },
        staffProfile: true,
      },
    });
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────

  async issueTokens(userId, role, email, phone, existingFamily) {
    const payload = {
      sub: userId,
      role,
      ...(email ? { email } : {}),
      ...(phone ? { phone } : {}),
    };

    const accessToken = signAccessToken(payload);
    const refreshToken = signRefreshToken(payload);
    const family = existingFamily ?? uuidv4();

    await prisma.refreshToken.create({
      data: {
        userId,
        token: refreshToken,
        family,
        expiresAt: new Date(Date.now() + REFRESH_TTL_SEC * 1000),
      },
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60, // 15 minutes in seconds
    };
  }
}

export const authService = new AuthService();
