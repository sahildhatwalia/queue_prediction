import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { NotFoundError } from '../../utils/errors.js';

const DEPT_CACHE_TTL = 30; // seconds

export class DepartmentService {
  async listAll() {
    // Try cache first
    const cached = await redis.get('departments:all');
    if (cached) return JSON.parse(cached);

    const departments = await prisma.department.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });

    await redis.set('departments:all', JSON.stringify(departments), 'EX', DEPT_CACHE_TTL);
    return departments;
  }

  async getById(id) {
    const dept = await prisma.department.findUnique({
      where: { id },
      include: {
        doctors: {
          include: { user: { select: { firstName: true, lastName: true } } },
          where: { isAvailable: true },
        },
        counters: { where: { isActive: true } },
      },
    });
    if (!dept) throw new NotFoundError('Department not found');
    return dept;
  }

  async getStats(departmentId) {
    const dept = await prisma.department.findUnique({ where: { id: departmentId } });
    if (!dept) throw new NotFoundError('Department not found');

    const [waiting, called, inConsultation] = await Promise.all([
      prisma.queueEntry.count({ where: { departmentId, status: 'WAITING' } }),
      prisma.queueEntry.count({ where: { departmentId, status: 'CALLED' } }),
      prisma.queueEntry.count({ where: { departmentId, status: 'IN_CONSULTATION' } }),
    ]);

    // Average wait time from completed entries today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const completedToday = await prisma.queueEntry.findMany({
      where: {
        departmentId,
        status: 'COMPLETED',
        checkInAt: { gte: today },
        actualWaitMin: { not: null },
      },
      select: { actualWaitMin: true },
    });
    const avgWaitMin =
      completedToday.length > 0
        ? Math.round(
            completedToday.reduce((sum, e) => sum + (e.actualWaitMin ?? 0), 0) /
              completedToday.length,
          )
        : dept.averageServiceMin;

    const currentLoad = waiting + called + inConsultation;
    const loadPct = Math.min(100, Math.round((currentLoad / dept.maxCapacity) * 100));

    return {
      departmentId,
      name: dept.name,
      code: dept.code,
      floor: dept.floor,
      currentWaiting: waiting,
      currentCalled: called,
      currentInConsultation: inConsultation,
      avgWaitMin,
      maxCapacity: dept.maxCapacity,
      loadPct,
    };
  }

  async create(data) {
    return prisma.department.create({ data });
  }

  async update(id, data) {
    const dept = await prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundError('Department not found');

    // Invalidate cache
    await redis.del('departments:all');

    return prisma.department.update({ where: { id }, data });
  }
}

export const departmentService = new DepartmentService();
