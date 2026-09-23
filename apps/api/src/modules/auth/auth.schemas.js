import { z } from 'zod';

// ─── SCHEMAS ─────────────────────────────────────────────────────────────────

export const RegisterSchema = z.object({
  email: z.string().email().toLowerCase().optional(),
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/).optional(),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
      message: 'Password must contain uppercase, lowercase, digit, and special character',
    }),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  dateOfBirth: z.string().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
}).refine((d) => d.email || d.phone, {
  message: 'Either email or phone is required',
  path: ['email'],
});

export const LoginSchema = z.object({
  email: z.string().email().toLowerCase().optional(),
  phone: z.string().optional(),
  password: z.string().min(1),
}).refine((d) => d.email || d.phone, {
  message: 'Either email or phone is required',
  path: ['email'],
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const CheckInSchema = z.object({
  departmentId: z.string().min(1, 'Department is required'),
  // Use z.enum with explicit string values (compatible with plain JS objects)
  appointmentType: z.enum(['WALK_IN', 'PRE_BOOKED', 'EMERGENCY', 'FOLLOW_UP']).default('WALK_IN'),
  symptoms: z.string().max(500).optional(),
  painLevel: z.number().int().min(1).max(10).optional(),
  patientId: z.string().min(1).optional(), // receptionist checking in on behalf of patient
});
