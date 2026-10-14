import Bull from 'bull';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { predictionService } from '../modules/prediction/prediction.service.js';
import { prisma } from '../config/db.js';

// Model retraining job queue
const retrainQueue = new Bull('model-retrain', env.REDIS_URL, {
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'fixed', delay: 60000 }, // 1 min between retries
    removeOnComplete: 10,
    removeOnFail: 10,
  },
});

// ─── JOB PROCESSOR ───────────────────────────────────────────────────────────

retrainQueue.process(async (job) => {
  const { departmentId } = job.data;

  logger.info({ departmentId: departmentId ?? 'all' }, 'Starting model retraining job');

  let deptIds;
  if (departmentId) {
    deptIds = [departmentId];
  } else {
    // Retrain all active departments
    const depts = await prisma.department.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    deptIds = depts.map((d) => d.id);
  }

  const results = [];
  for (const id of deptIds) {
    try {
      const result = await predictionService.triggerRetrain(id);
      results.push({ departmentId: id, status: 'success', result });

      // Log to database
      if (result?.mae_minutes !== undefined) {
        await prisma.modelTrainingLog.create({
          data: {
            modelVersion: result.model_version ?? `v${Date.now()}`,
            samplesUsed: result.samples_used ?? 0,
            maeMinutes: result.mae_minutes ?? 0,
            r2Score: result.r2_score ?? 0,
            featuresUsed: result.features_used ?? [],
            hyperparameters: result.hyperparameters ?? {},
            notes: `Auto-retrain for department ${id}`,
          },
        });
      }
    } catch (err) {
      logger.error({ departmentId: id, err: err.message }, 'Retraining failed for department');
      results.push({ departmentId: id, status: 'failed', error: err.message });
    }
  }

  logger.info({ results }, 'Model retraining job completed');
  return results;
});

// ─── EVENT LISTENERS ─────────────────────────────────────────────────────────

retrainQueue.on('completed', (job, result) => {
  logger.info({ jobId: job.id, results: result }, 'Retraining job completed successfully');
});

retrainQueue.on('failed', (job, err) => {
  logger.error({ jobId: job.id, err: err.message }, 'Retraining job failed');
});

// ─── SCHEDULE NIGHTLY RETRAIN ─────────────────────────────────────────────────

/**
 * Schedule a nightly full retraining job at 2:00 AM.
 * Uses Bull's repeat feature with cron syntax.
 */
export async function scheduleNightlyRetrain() {
  // Remove existing repeating jobs to avoid duplicates
  const existing = await retrainQueue.getRepeatableJobs();
  for (const job of existing) {
    await retrainQueue.removeRepeatableByKey(job.key);
  }

  await retrainQueue.add(
    { departmentId: null }, // null = retrain all
    {
      repeat: { cron: '0 2 * * *' }, // 2:00 AM daily
      jobId: 'nightly-retrain',
    },
  );

  logger.info('Nightly model retraining scheduled at 02:00 daily');
}

/**
 * Trigger an immediate retraining for one or all departments.
 */
export async function triggerImmediateRetrain(departmentId = null) {
  return retrainQueue.add({ departmentId }, { jobId: `manual-retrain-${Date.now()}` });
}

export { retrainQueue };
