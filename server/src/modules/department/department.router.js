import { Router } from 'express';
import { departmentService } from './department.service.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { Role } from '@hospital-queue/shared';

const router = Router();

// GET /api/v1/departments — public
router.get('/', async (_req, res, next) => {
  try {
    const departments = await departmentService.listAll();
    res.json({ success: true, data: departments });
  } catch (err) { next(err); }
});

// GET /api/v1/departments/:id — public
router.get('/:id', async (req, res, next) => {
  try {
    const dept = await departmentService.getById(req.params.id);
    res.json({ success: true, data: dept });
  } catch (err) { next(err); }
});

// GET /api/v1/departments/:id/stats — staff+
router.get('/:id/stats', authenticate, authorize(Role.RECEPTIONIST), async (req, res, next) => {
  try {
    const stats = await departmentService.getStats(req.params.id);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});

// POST /api/v1/departments — admin+
router.post('/', authenticate, authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const dept = await departmentService.create(req.body);
    res.status(201).json({ success: true, data: dept });
  } catch (err) { next(err); }
});

// PATCH /api/v1/departments/:id — admin+
router.patch('/:id', authenticate, authorize(Role.ADMIN), async (req, res, next) => {
  try {
    const dept = await departmentService.update(req.params.id, req.body);
    res.json({ success: true, data: dept });
  } catch (err) { next(err); }
});

export default router;
