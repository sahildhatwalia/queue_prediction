import { prisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';
import { computePriorityScore } from '../../utils/priorityScore.js';
import { encrypt, safeDecrypt } from '../../utils/crypto.js';
import { NotFoundError, BadRequestError, ForbiddenError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AppointmentType, QueueStatus, Role } from '@hospital-queue/shared';
import { SOCKET_EVENTS } from '@hospital-queue/shared';

export class QueueService {
  constructor(io) {
    this.io = io;
  }

  /** Check a patient into a department queue */
  async checkIn(dto, actorId, actorRole) {
    // Determine patient ID: receptionist can check in others; patients check in themselves
    const patientId =
      dto.patientId && [Role.RECEPTIONIST, Role.ADMIN, Role.SUPER_ADMIN].includes(actorRole)
        ? dto.patientId
        : actorId;

    // Ensure department exists
    const dept = await prisma.department.findUnique({ where: { id: dto.departmentId } });
    if (!dept) throw new NotFoundError('Department not found');
    if (!dept.isActive) throw new BadRequestError('This department is currently closed');

    // Check for duplicate active entry
    const existing = await prisma.queueEntry.findFirst({
      where: {
        patientId,
        departmentId: dto.departmentId,
        status: { in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] },
      },
    });
    if (existing) throw new BadRequestError(`You already have an active queue entry (token: ${existing.token})`);

    // Compute priority score
    const { score, priority } = computePriorityScore({
      painLevel: dto.painLevel ?? 5,
      appointmentType: dto.appointmentType,
      isPreBooked: dto.appointmentType === AppointmentType.PRE_BOOKED,
      waitedMinutes: 0,
    });

    // Generate token: CARD-042 format
    const token = await this.generateToken(dept.code);

    // Position = current WAITING queue length + 1
    const position = (await prisma.queueEntry.count({
      where: { departmentId: dto.departmentId, status: 'WAITING' },
    })) + 1;

    // Get simple wait prediction (will be replaced by ML later)
    const predictedWaitMin = Math.max(1, (position - 1) * dept.averageServiceMin);

    // Create the queue entry, encrypting PHI fields
    const entry = await prisma.queueEntry.create({
      data: {
        token,
        patientId,
        departmentId: dto.departmentId,
        appointmentType: dto.appointmentType,
        priority,
        priorityScore: score,
        status: 'WAITING',
        position,
        predictedWaitMin,
        symptoms: dto.symptoms ? encrypt(dto.symptoms) : null,
        painLevel: dto.painLevel,
      },
      include: {
        patient: { select: { firstName: true, lastName: true, phone: true } },
        department: { select: { name: true, code: true, floor: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'QUEUE_ENTRY_CREATED',
        entityType: 'QueueEntry',
        entityId: entry.id,
        newValue: { token, departmentId: dto.departmentId, priority, position },
      },
    });

    // Broadcast to staff watching this department
    await this.broadcastDeptUpdate(dto.departmentId);

    logger.info({ token, patientId, departmentId: dto.departmentId, priority }, 'Patient checked in');

    return { ...entry, symptoms: undefined }; // never return encrypted symptoms
  }

  /** Get a queue entry by its public token — safe for unauthenticated patients */
  async getByToken(token) {
    const entry = await prisma.queueEntry.findUnique({
      where: { token },
      include: {
        department: { select: { name: true, code: true, floor: true } },
      },
    });
    if (!entry) throw new NotFoundError('Queue entry not found');

    // Don't expose encrypted symptoms
    return {
      id: entry.id,
      token: entry.token,
      status: entry.status,
      priority: entry.priority,
      priorityScore: entry.priorityScore,
      position: entry.position,
      predictedWaitMin: entry.predictedWaitMin,
      checkInAt: entry.checkInAt,
      calledAt: entry.calledAt,
      department: entry.department,
    };
  }

  /** Get the full queue for a department — staff only */
  async getDepartmentQueue(departmentId) {
    const entries = await prisma.queueEntry.findMany({
      where: {
        departmentId,
        status: { in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] },
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, phone: true } },
        counter: { select: { name: true } },
      },
      orderBy: [
        { priorityScore: 'desc' },
        { checkInAt: 'asc' },
      ],
    });

    return entries.map((e) => ({
      ...e,
      symptoms: undefined,
    }));
  }

  /** Call the next patient — updates status to CALLED */
  async callNext(departmentId, actorId, counterId) {
    const entry = await prisma.queueEntry.findFirst({
      where: { departmentId, status: 'WAITING' },
      orderBy: [{ priorityScore: 'desc' }, { checkInAt: 'asc' }],
    });
    if (!entry) throw new NotFoundError('No patients waiting in this department');

    return this.updateStatus(entry.id, 'CALLED', actorId, { calledAt: new Date(), counterId: counterId ?? null });
  }

  /** Mark a specific entry as CALLED */
  async callSpecific(entryId, actorId) {
    const entry = await prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundError('Queue entry not found');
    if (entry.status !== 'WAITING') throw new BadRequestError('Can only call WAITING entries');

    return this.updateStatus(entryId, 'CALLED', actorId, { calledAt: new Date() });
  }

  /** Doctor starts consultation */
  async startConsultation(entryId, actorId) {
    return this.updateStatus(entryId, 'IN_CONSULTATION', actorId, { consultStartAt: new Date() });
  }

  /** Doctor completes consultation — calculates actual wait time */
  async completeConsultation(entryId, actorId) {
    const entry = await prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundError('Queue entry not found');

    const consultEndAt = new Date();
    const actualWaitMin = Math.round(
      (consultEndAt.getTime() - entry.checkInAt.getTime()) / 60000,
    );
    const predictionError =
      entry.predictedWaitMin != null
        ? Math.abs(entry.predictedWaitMin - actualWaitMin)
        : null;

    return this.updateStatus(entryId, 'COMPLETED', actorId, {
      consultEndAt,
      actualWaitMin,
      predictionError,
    });
  }

  /** Mark as NO_SHOW */
  async markNoShow(entryId, actorId) {
    return this.updateStatus(entryId, 'NO_SHOW', actorId, {});
  }

  /** Cancel — patients can cancel their own; admins can cancel any */
  async cancel(entryId, actorId, actorRole) {
    const entry = await prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundError('Queue entry not found');

    // Patients can only cancel their own entry
    if (actorRole === Role.PATIENT && entry.patientId !== actorId) {
      throw new ForbiddenError('You can only cancel your own queue entry');
    }

    return this.updateStatus(entryId, 'CANCELLED', actorId, {});
  }

  /** Patient's past visit history */
  async getMyHistory(patientId, page = 1, limit = 10) {
    const [entries, total] = await Promise.all([
      prisma.queueEntry.findMany({
        where: { patientId, status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
        include: { department: { select: { name: true, code: true } } },
        orderBy: { checkInAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.queueEntry.count({
        where: { patientId, status: { in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'] } },
      }),
    ]);

    return { entries: entries.map((e) => ({ ...e, symptoms: undefined })), total, page, limit };
  }

  // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────

  async updateStatus(entryId, newStatus, actorId, extraData) {
    const old = await prisma.queueEntry.findUnique({ where: { id: entryId } });
    if (!old) throw new NotFoundError('Queue entry not found');

    const entry = await prisma.queueEntry.update({
      where: { id: entryId },
      data: { status: newStatus, ...extraData },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        department: { select: { name: true, code: true } },
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        userId: actorId,
        action: 'QUEUE_STATUS_CHANGED',
        entityType: 'QueueEntry',
        entityId: entryId,
        oldValue: { status: old.status },
        newValue: { status: newStatus },
      },
    });

    // Broadcast queue update to staff watching this department
    await this.broadcastDeptUpdate(entry.departmentId);

    // Emit directly to the patient's socket room when called
    if (newStatus === 'CALLED' && this.io) {
      this.io.to(`user:${entry.patient.id}`).emit(SOCKET_EVENTS.QUEUE_ENTRY_CALLED, {
        token: entry.token,
        patientId: entry.patient.id,
        status: 'CALLED',
      });
    }

    return { ...entry, symptoms: undefined };
  }

  async broadcastDeptUpdate(departmentId) {
    if (!this.io) return;
    const entries = await this.getDepartmentQueue(departmentId);
    this.io.to(`dept:${departmentId}`).emit(SOCKET_EVENTS.QUEUE_UPDATED, {
      departmentId,
      entries,
    });
  }

  /** Generate next token: CODE-NNN, resetting daily */
  async generateToken(deptCode) {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const key = `token:${deptCode}:${today}`;
    const count = await redis.incr(key);
    // Expire at midnight + 1 hour buffer
    await redis.expire(key, 25 * 60 * 60);
    return `${deptCode}-${String(count).padStart(3, '0')}`;
  }
}

export const queueService = new QueueService();
