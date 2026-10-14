import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate.js';
import { authorize, authorizeRoles } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { CheckInSchema } from '../auth/auth.schemas.js';
import { queueService } from './queue.service.js';
import { Role } from '@hospital-queue/shared';

const router = Router();

// POST /api/v1/queue/checkin — patient or receptionist
router.post(
  '/checkin',
  authenticate,
  validate(CheckInSchema),
  async (req, res, next) => {
    try {
      const entry = await queueService.checkIn(req.body, req.user.sub, req.user.role);
      res.status(201).json({ success: true, data: entry, message: `Check-in successful! Your token is ${entry.token}` });
    } catch (err) { next(err); }
  },
);

// GET /api/v1/queue/status/:token — public with token
router.get(
  '/status/:token',
  async (req, res, next) => {
    try {
      const entry = await queueService.getByToken(req.params.token);
      res.json({ success: true, data: entry });
    } catch (err) { next(err); }
  },
);

// GET /api/v1/queue/department/:id — staff+
router.get(
  '/department/:id',
  authenticate,
  authorize(Role.RECEPTIONIST),
  async (req, res, next) => {
    try {
      const entries = await queueService.getDepartmentQueue(req.params.id);
      res.json({ success: true, data: entries });
    } catch (err) { next(err); }
  },
);

// GET /api/v1/queue/my-history — patient own history
router.get(
  '/my-history',
  authenticate,
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const result = await queueService.getMyHistory(req.user.sub, page, limit);
      res.json({ success: true, data: result.entries, meta: { total: result.total, page, limit } });
    } catch (err) { next(err); }
  },
);

// PATCH /api/v1/queue/:id/call — receptionist+
router.patch(
  '/:id/call',
  authenticate,
  authorize(Role.RECEPTIONIST),
  async (req, res, next) => {
    try {
      const entry = await queueService.callSpecific(req.params.id, req.user.sub);
      res.json({ success: true, data: entry });
    } catch (err) { next(err); }
  },
);

// POST /api/v1/queue/department/:id/call-next — receptionist+
router.post(
  '/department/:id/call-next',
  authenticate,
  authorize(Role.RECEPTIONIST),
  async (req, res, next) => {
    try {
      const entry = await queueService.callNext(req.params.id, req.user.sub);
      res.json({ success: true, data: entry, message: `Called ${entry.token}` });
    } catch (err) { next(err); }
  },
);

// PATCH /api/v1/queue/:id/start — doctor+
router.patch(
  '/:id/start',
  authenticate,
  authorize(Role.DOCTOR),
  async (req, res, next) => {
    try {
      const entry = await queueService.startConsultation(req.params.id, req.user.sub);
      res.json({ success: true, data: entry });
    } catch (err) { next(err); }
  },
);

// PATCH /api/v1/queue/:id/complete — doctor+
router.patch(
  '/:id/complete',
  authenticate,
  authorize(Role.DOCTOR),
  async (req, res, next) => {
    try {
      const entry = await queueService.completeConsultation(req.params.id, req.user.sub);
      res.json({ success: true, data: entry });
    } catch (err) { next(err); }
  },
);

// PATCH /api/v1/queue/:id/no-show — receptionist+
router.patch(
  '/:id/no-show',
  authenticate,
  authorize(Role.RECEPTIONIST),
  async (req, res, next) => {
    try {
      const entry = await queueService.markNoShow(req.params.id, req.user.sub);
      res.json({ success: true, data: entry });
    } catch (err) { next(err); }
  },
);

// DELETE /api/v1/queue/:id/cancel — patient (own) or admin
router.delete(
  '/:id/cancel',
  authenticate,
  async (req, res, next) => {
    try {
      const entry = await queueService.cancel(req.params.id, req.user.sub, req.user.role);
      res.json({ success: true, data: entry, message: 'Queue entry cancelled' });
    } catch (err) { next(err); }
  },
);

export default router;
