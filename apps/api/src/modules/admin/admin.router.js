import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { adminService } from './admin.service.js';
import { Role } from '@hospital-queue/shared';

const router = Router();

// All admin routes require at least ADMIN role
router.use(authenticate, authorize(Role.ADMIN));

// GET /api/v1/admin/users — list all users
router.get('/users', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { role, search } = req.query;
    const result = await adminService.listUsers({ page, limit, role, search });
    res.json({ success: true, data: result.users, meta: { total: result.total, page, limit } });
  } catch (err) { next(err); }
});

// POST /api/v1/admin/users — create a staff user
router.post('/users', async (req, res, next) => {
  try {
    const user = await adminService.createStaffUser(req.body, req.user.sub);
    res.status(201).json({ success: true, data: user, message: 'Staff user created' });
  } catch (err) { next(err); }
});

// PATCH /api/v1/admin/users/:id — update role/status
router.patch('/users/:id', async (req, res, next) => {
  try {
    const user = await adminService.updateUser(req.params.id, req.body, req.user.sub);
    res.json({ success: true, data: user });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/audit-logs
router.get('/audit-logs', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const { action, userId } = req.query;
    const result = await adminService.getAuditLogs({ page, limit, action, userId });
    res.json({ success: true, data: result.logs, meta: { total: result.total, page, limit } });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/analytics/summary
router.get('/analytics/summary', async (req, res, next) => {
  try {
    const summary = await adminService.getAnalyticsSummary();
    res.json({ success: true, data: summary });
  } catch (err) { next(err); }
});

export default router;
