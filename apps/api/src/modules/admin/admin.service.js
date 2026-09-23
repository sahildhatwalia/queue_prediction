import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { NotFoundError, ConflictError, BadRequestError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import bcrypt from 'bcryptjs';

export class AdminService {
  /**
   * List all users with optional role filtering and pagination.
   */
  async listUsers({ page = 1, limit = 20, role, search } = {}) {
    const where = {
      ...(role ? { role } : {}),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          phone: true,
          role: true,
          firstName: true,
          lastName: true,
          isActive: true,
          twoFactorEnabled: true,
          lastLoginAt: true,
          createdAt: true,
          doctorProfile: { select: { departmentId: true, specialization: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
    ]);

    return { users, total, page, limit };
  }

  /**
   * Create a staff user (non-patient).
   */
  async createStaffUser(dto, createdByUserId) {
    if (dto.email) {
      const existing = await prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictError('Email already in use');
    }
    if (dto.phone) {
      const existing = await prisma.user.findUnique({ where: { phone: dto.phone } });
      if (existing) throw new ConflictError('Phone already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
      select: {
        id: true,
        email: true,
        phone: true,
        role: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    });

    // If doctor, create doctor profile
    if (dto.role === 'DOCTOR' && dto.departmentId) {
      await prisma.doctorProfile.create({
        data: {
          userId: user.id,
          departmentId: dto.departmentId,
          specialization: dto.specialization,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        userId: createdByUserId,
        action: 'USER_CREATED',
        entityType: 'User',
        entityId: user.id,
        newValue: { role: dto.role, email: dto.email },
      },
    });

    logger.info({ userId: user.id, role: dto.role, createdBy: createdByUserId }, 'Staff user created');
    return user;
  }

  /**
   * Update a user's role or active status.
   */
  async updateUser(userId, updates, actorId) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User not found');

    const oldValues = { role: user.role, isActive: user.isActive };

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(updates.role ? { role: updates.role } : {}),
        ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'USER_UPDATED',
        entityType: 'User',
        entityId: userId,
        oldValue: oldValues,
        newValue: updates,
      },
    });

    return updated;
  }

  /**
   * Get paginated audit logs.
   */
  async getAuditLogs({ page = 1, limit = 50, action, userId } = {}) {
    const where = {
      ...(action ? { action: { contains: action } } : {}),
      ...(userId ? { userId } : {}),
    };

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { firstName: true, lastName: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total, page, limit };
  }

  /**
   * Hospital-wide analytics summary.
   */
  async getAnalyticsSummary() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      totalPatients,
      checkedInToday,
      completedToday,
      activeNow,
      avgWaitData,
      departmentLoads,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'PATIENT' } }),
      prisma.queueEntry.count({ where: { checkInAt: { gte: today } } }),
      prisma.queueEntry.count({ where: { status: 'COMPLETED', checkInAt: { gte: today } } }),
      prisma.queueEntry.count({ where: { status: { in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] } } }),
      prisma.queueEntry.aggregate({
        where: { actualWaitMin: { not: null }, checkInAt: { gte: today } },
        _avg: { actualWaitMin: true },
      }),
      prisma.department.findMany({
        where: { isActive: true },
        include: {
          _count: {
            select: {
              queueEntries: {
                where: { status: { in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] } },
              },
            },
          },
        },
      }),
    ]);

    return {
      totalPatients,
      checkedInToday,
      completedToday,
      activeNow,
      avgWaitMinToday: Math.round(avgWaitData._avg.actualWaitMin ?? 0),
      departmentLoads: departmentLoads.map((d) => ({
        id: d.id,
        name: d.name,
        code: d.code,
        currentLoad: d._count.queueEntries,
        maxCapacity: d.maxCapacity,
        loadPct: Math.round((d._count.queueEntries / d.maxCapacity) * 100),
      })),
    };
  }
}

export const adminService = new AdminService();
