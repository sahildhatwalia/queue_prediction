import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { predictionService } from './prediction.service.js';
import { Role } from '@hospital-queue/shared';
import { prisma } from '../../config/db.js';

const router = Router();

// POST /api/v1/predictions/estimate — get a wait time estimate
router.post('/estimate', authenticate, async (req, res, next) => {
  try {
    const { departmentId, priorityScore, appointmentType, painLevel } = req.body;

    // Get current queue length for context
    const queueLength = await prisma.queueEntry.count({
      where: { departmentId, status: { in: ['WAITING', 'CALLED', 'IN_CONSULTATION'] } },
    });

    const result = await predictionService.predict({
      departmentId,
      currentQueueLength: queueLength,
      priorityScore: priorityScore ?? 50,
      appointmentType: appointmentType ?? 'WALK_IN',
      painLevel: painLevel ?? 5,
    });

    res.json({
      success: true,
      data: result ?? { predictedWaitMin: queueLength * 15, confidenceScore: 0.5, modelVersion: 'heuristic' },
    });
  } catch (err) { next(err); }
});

// GET /api/v1/predictions/accuracy — model accuracy metrics (admin+)
router.get('/accuracy', authenticate, authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const recentPredictions = await prisma.queueEntry.findMany({
      where: {
        predictedWaitMin: { not: null },
        actualWaitMin: { not: null },
        predictionError: { not: null },
      },
      select: {
        predictionError: true,
        predictedWaitMin: true,
        actualWaitMin: true,
        departmentId: true,
        checkInAt: true,
      },
      orderBy: { checkInAt: 'desc' },
      take: 1000,
    });

    const mae = recentPredictions.length > 0
      ? Math.round(recentPredictions.reduce((sum, e) => sum + (e.predictionError ?? 0), 0) / recentPredictions.length * 10) / 10
      : 0;

    res.json({
      success: true,
      data: {
        totalPredictions: recentPredictions.length,
        maeMinutes: mae,
        message: recentPredictions.length === 0 ? 'No predictions yet — check in some patients first' : undefined,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/predictions/retrain — trigger manual retraining (super admin only)
router.post('/retrain', authenticate, authorize(Role.SUPER_ADMIN), async (req, res, next) => {
  try {
    const { departmentId } = req.body;
    const result = await predictionService.triggerRetrain(departmentId);
    res.json({ success: true, data: result, message: 'Retraining triggered' });
  } catch (err) { next(err); }
});

export default router;
