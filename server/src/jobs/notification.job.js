import Bull from 'bull';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { notificationService } from '../modules/notification/notification.service.js';
import { prisma } from '../config/db.js';

// Notification job queue backed by Redis
const notificationQueue = new Bull('notifications', env.REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});

// ─── JOB PROCESSORS ──────────────────────────────────────────────────────────

/**
 * Process a notification job.
 * Job data: { type: 'CHECK_IN' | 'CALLED' | 'NEAR_TURN', queueEntryId }
 */
notificationQueue.process(async (job) => {
  const { type, queueEntryId } = job.data;

  const entry = await prisma.queueEntry.findUnique({
    where: { id: queueEntryId },
    include: {
      patient: { select: { phone: true, firstName: true } },
      department: { select: { name: true } },
    },
  });

  if (!entry) {
    logger.warn({ queueEntryId }, 'Queue entry not found for notification job');
    return;
  }

  switch (type) {
    case 'CHECK_IN':
      await notificationService.sendCheckInConfirmation(entry);
      break;
    case 'CALLED':
      await notificationService.sendCalledNotification(entry);
      break;
    case 'NEAR_TURN': {
      const msg = `⏰ You're almost next! Token ${entry.token} — please make your way to ${entry.department?.name}.`;
      await notificationService.sendInApp(entry.patientId, msg, entry.id);
      break;
    }
    default:
      logger.warn({ type }, 'Unknown notification type');
  }
});

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────

notificationQueue.on('completed', (job) => {
  logger.debug({ jobId: job.id, type: job.data.type }, 'Notification job completed');
});

notificationQueue.on('failed', (job, err) => {
  logger.error({ jobId: job.id, type: job.data.type, err: err.message }, 'Notification job failed');
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/**
 * Queue a check-in confirmation notification.
 */
export async function queueCheckInNotification(queueEntryId) {
  await notificationQueue.add({ type: 'CHECK_IN', queueEntryId }, { delay: 0 });
}

/**
 * Queue a "patient called" notification.
 */
export async function queueCalledNotification(queueEntryId) {
  await notificationQueue.add({ type: 'CALLED', queueEntryId }, { delay: 0 });
}

/**
 * Queue a "near your turn" warning notification.
 */
export async function queueNearTurnNotification(queueEntryId) {
  await notificationQueue.add({ type: 'NEAR_TURN', queueEntryId }, { delay: 0 });
}

export { notificationQueue };
