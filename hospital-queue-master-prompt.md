# 🏥 Master Build Prompt — Hospital Queue Prediction System
## Complete Blueprint · All Phases · Full Security Coverage

---

> **HOW TO USE THIS PROMPT**
> Copy everything below this line into your AI coding assistant (Claude Code, Cursor, Copilot, etc.)
> or hand it to your dev team as the single source of truth. Every section is ordered by priority.
> Follow phases in sequence. Do not skip security sections.

---

## ════════════════════════════════════════════
## SECTION 0 — PROJECT IDENTITY & CONSTRAINTS
## ════════════════════════════════════════════

You are building a **Hospital Queue Prediction System** — a full-stack web application
that lets patients check in online or at a kiosk, predicts their wait time using a
machine learning model, and gives staff a live dashboard to manage department queues
in real time.

### Core objectives
- Zero waiting-room confusion: patients always know their estimated wait time.
- Staff can call patients, reassign queues, and view department load in one view.
- ML model continuously improves by learning from actual vs. predicted wait times.
- System must handle a mid-size hospital: up to 500 concurrent patients, 30 departments.

### Hard constraints
- HIPAA-aligned data handling (India: DISHA / ABDM compliance if deploying in India).
- All PHI (Protected Health Information) encrypted at rest and in transit.
- Authentication required for every non-public endpoint.
- Zero-downtime deployments required from Phase 3 onward.
- All user-facing copy in English + Hindi (i18n-ready architecture from day one).

---

## ════════════════════════════════════════════
## SECTION 1 — COMPLETE TECH STACK
## ════════════════════════════════════════════

### Frontend
- Framework      : Next.js 14 (App Router, SSR + SSG)
- Language       : TypeScript (strict mode)
- Styling        : Tailwind CSS v3
- State          : Zustand (global) + React Query v5 (server state)
- Real-time      : Socket.IO client v4
- Charts         : Recharts
- Forms          : React Hook Form + Zod validation
- i18n           : next-intl
- UI components  : shadcn/ui (Radix primitives)
- Testing        : Vitest + React Testing Library + Playwright (E2E)

### Backend — API Server
- Runtime        : Node.js 20 LTS
- Framework      : Express.js 5 + TypeScript
- WebSocket      : Socket.IO v4
- Auth           : Passport.js (JWT + refresh tokens)
- Validation     : Zod
- ORM            : Prisma 5
- Job queue      : Bull (Redis-backed) for notifications + model triggers
- Testing        : Jest + Supertest

### ML Service
- Language       : Python 3.11
- Framework      : FastAPI
- ML library     : scikit-learn (Random Forest + XGBoost ensemble)
- Data processing: pandas + numpy
- Model storage  : MLflow (local) → S3 for versioned artifacts
- Scheduler      : APScheduler (nightly retraining)
- Testing        : pytest

### Databases
- Primary DB     : PostgreSQL 15 (via Prisma)
- Cache + queues : Redis 7 (Upstash-compatible)
- Analytics      : TimescaleDB extension on Postgres (time-series wait data)

### Infrastructure
- Containerization : Docker + Docker Compose (dev) → Kubernetes (prod optional)
- CI/CD          : GitHub Actions
- Hosting        : AWS (EC2 + RDS + ElastiCache + S3) or Railway (simpler)
- Reverse proxy  : NGINX
- SSL            : Let's Encrypt (Certbot) or AWS ACM
- Monitoring     : Grafana + Prometheus
- Error tracking : Sentry (frontend + backend)
- Secrets        : AWS Secrets Manager or HashiCorp Vault

### Notifications
- SMS            : Twilio Verify + Messaging API
- Push           : Firebase Cloud Messaging (FCM)
- Email          : SendGrid (transactional)
- In-app         : Socket.IO events

### Third-party Integrations
- Hospital EHR   : HL7 FHIR R4 REST APIs
- Payment (OPD fee): Razorpay (India) or Stripe
- QR/Barcode     : zxing-js (browser-based scanner for kiosk)

---

## ════════════════════════════════════════════
## SECTION 2 — DATABASE SCHEMA (POSTGRESQL + PRISMA)
## ════════════════════════════════════════════

Create the following Prisma schema at `prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── ENUMS ───────────────────────────────────────────────────────────────────

enum Role {
  PATIENT
  DOCTOR
  NURSE
  RECEPTIONIST
  ADMIN
  SUPER_ADMIN
}

enum QueueStatus {
  WAITING
  CALLED
  IN_CONSULTATION
  COMPLETED
  NO_SHOW
  CANCELLED
}

enum Priority {
  CRITICAL   // Emergency — jump to front
  HIGH       // Urgent — within 30 min
  NORMAL     // Standard OPD
  LOW        // Follow-up / routine
}

enum NotificationType {
  SMS
  EMAIL
  PUSH
  IN_APP
}

enum AppointmentType {
  WALK_IN
  PRE_BOOKED
  EMERGENCY
  FOLLOW_UP
}

// ─── CORE MODELS ─────────────────────────────────────────────────────────────

model User {
  id                String    @id @default(cuid())
  email             String?   @unique
  phone             String?   @unique
  passwordHash      String?
  role              Role      @default(PATIENT)
  firstName         String
  lastName          String
  dateOfBirth       DateTime?
  gender            String?
  bloodGroup        String?
  address           Json?     // encrypted JSON
  isEmailVerified   Boolean   @default(false)
  isPhoneVerified   Boolean   @default(false)
  isActive          Boolean   @default(true)
  twoFactorEnabled  Boolean   @default(false)
  twoFactorSecret   String?   // TOTP secret, encrypted
  lastLoginAt       DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // Relations
  sessions          Session[]
  auditLogs         AuditLog[]
  refreshTokens     RefreshToken[]
  queueEntries      QueueEntry[]
  notifications     Notification[]
  doctorProfile     DoctorProfile?
  staffProfile      StaffProfile?

  @@index([email])
  @@index([phone])
}

model Session {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String   @unique
  ipAddress  String?
  userAgent  String?
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  @@index([userId])
}

model RefreshToken {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  token      String   @unique
  family     String   // token rotation family to detect reuse attacks
  used       Boolean  @default(false)
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  @@index([userId])
  @@index([token])
}

model Department {
  id                String    @id @default(cuid())
  name              String    @unique
  code              String    @unique // e.g. "CARD", "ORTHO"
  floor             Int?
  averageServiceMin Int       @default(15) // baseline service time
  maxCapacity       Int       @default(30)
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  doctors           DoctorProfile[]
  queueEntries      QueueEntry[]
  counters          Counter[]
  predictions       WaitPrediction[]
}

model DoctorProfile {
  id           String     @id @default(cuid())
  userId       String     @unique
  user         User       @relation(fields: [userId], references: [id])
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id])
  specialization String?
  licenseNumber  String?  @unique
  avgConsultMin  Int      @default(10) // personal average
  isAvailable    Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model StaffProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  user      User     @relation(fields: [userId], references: [id])
  position  String
  createdAt DateTime @default(now())
}

model Counter {
  id           String     @id @default(cuid())
  departmentId String
  department   Department @relation(fields: [departmentId], references: [id])
  name         String     // e.g. "Counter 1", "Room A"
  isActive     Boolean    @default(true)
  createdAt    DateTime   @default(now())

  queueEntries QueueEntry[]
}

model QueueEntry {
  id                String          @id @default(cuid())
  token             String          @unique // e.g. "CARD-042"
  patientId         String
  patient           User            @relation(fields: [patientId], references: [id])
  departmentId      String
  department        Department      @relation(fields: [departmentId], references: [id])
  counterId         String?
  counter           Counter?        @relation(fields: [counterId], references: [id])
  appointmentType   AppointmentType @default(WALK_IN)
  priority          Priority        @default(NORMAL)
  priorityScore     Int             @default(50) // 0-100, computed
  status            QueueStatus     @default(WAITING)

  // Timing
  checkInAt         DateTime        @default(now())
  calledAt          DateTime?
  consultStartAt    DateTime?
  consultEndAt      DateTime?
  
  // Prediction tracking
  predictedWaitMin  Int?            // ML prediction at check-in
  actualWaitMin     Int?            // computed on completion
  predictionError   Float?          // |predicted - actual| for model eval

  // Symptom data (anonymized after consultation)
  symptoms          String?
  painLevel         Int?            // 1-10
  notes             String?

  position          Int?            // position in queue at check-in
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  predictions       WaitPrediction[]
  notifications     Notification[]

  @@index([departmentId, status])
  @@index([patientId])
  @@index([checkInAt])
}

model WaitPrediction {
  id              String     @id @default(cuid())
  queueEntryId    String
  queueEntry      QueueEntry @relation(fields: [queueEntryId], references: [id])
  departmentId    String
  department      Department @relation(fields: [departmentId], references: [id])
  predictedMin    Int
  confidenceScore Float      // 0-1
  modelVersion    String
  featuresSnapshot Json      // what features were passed to the model
  createdAt       DateTime   @default(now())

  @@index([queueEntryId])
}

model Notification {
  id           String           @id @default(cuid())
  userId       String
  user         User             @relation(fields: [userId], references: [id])
  queueEntryId String?
  queueEntry   QueueEntry?      @relation(fields: [queueEntryId], references: [id])
  type         NotificationType
  subject      String?
  body         String
  sentAt       DateTime?
  deliveredAt  DateTime?
  readAt       DateTime?
  failed       Boolean          @default(false)
  failReason   String?
  createdAt    DateTime         @default(now())

  @@index([userId])
}

model AuditLog {
  id         String   @id @default(cuid())
  userId     String?
  user       User?    @relation(fields: [userId], references: [id])
  action     String   // e.g. "QUEUE_ENTRY_CREATED", "USER_LOGIN", "PRIORITY_CHANGED"
  entityType String?  // e.g. "QueueEntry", "User"
  entityId   String?
  oldValue   Json?
  newValue   Json?
  ipAddress  String?
  userAgent  String?
  createdAt  DateTime @default(now())

  @@index([userId])
  @@index([action])
  @@index([createdAt])
}

model ModelTrainingLog {
  id              String   @id @default(cuid())
  modelVersion    String
  trainedAt       DateTime @default(now())
  samplesUsed     Int
  maeMinutes      Float    // Mean Absolute Error in minutes
  r2Score         Float
  featuresUsed    Json
  hyperparameters Json
  notes           String?
}
```

---

## ════════════════════════════════════════════
## SECTION 3 — PROJECT FOLDER STRUCTURE
## ════════════════════════════════════════════

```
hospital-queue/
├── apps/
│   ├── web/                        # Next.js frontend
│   │   ├── app/
│   │   │   ├── (auth)/
│   │   │   │   ├── login/
│   │   │   │   ├── register/
│   │   │   │   └── verify/
│   │   │   ├── (patient)/
│   │   │   │   ├── checkin/
│   │   │   │   ├── status/[token]/
│   │   │   │   └── history/
│   │   │   ├── (staff)/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── queue/[deptId]/
│   │   │   │   └── call/
│   │   │   ├── (admin)/
│   │   │   │   ├── departments/
│   │   │   │   ├── users/
│   │   │   │   ├── reports/
│   │   │   │   └── model/
│   │   │   ├── kiosk/              # Full-screen kiosk mode
│   │   │   └── api/                # Next.js API routes (thin BFF layer)
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn components
│   │   │   ├── queue/              # Queue-specific components
│   │   │   ├── dashboard/          # Staff dashboard components
│   │   │   └── charts/             # Recharts wrappers
│   │   ├── hooks/
│   │   │   ├── useQueue.ts
│   │   │   ├── useSocket.ts
│   │   │   └── useWaitTime.ts
│   │   ├── lib/
│   │   │   ├── api.ts              # Axios instance + interceptors
│   │   │   ├── socket.ts           # Socket.IO singleton
│   │   │   └── utils.ts
│   │   ├── store/                  # Zustand stores
│   │   ├── messages/               # i18n strings (en.json, hi.json)
│   │   └── middleware.ts           # Auth middleware
│   │
│   ├── api/                        # Express.js API server
│   │   ├── src/
│   │   │   ├── config/
│   │   │   │   ├── env.ts          # Zod-validated env schema
│   │   │   │   ├── db.ts           # Prisma client singleton
│   │   │   │   └── redis.ts        # ioredis client
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.router.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   └── auth.middleware.ts
│   │   │   │   ├── queue/
│   │   │   │   │   ├── queue.router.ts
│   │   │   │   │   ├── queue.service.ts
│   │   │   │   │   ├── queue.controller.ts
│   │   │   │   │   └── queue.events.ts  # Socket.IO emitters
│   │   │   │   ├── department/
│   │   │   │   ├── prediction/
│   │   │   │   │   ├── prediction.service.ts
│   │   │   │   │   └── prediction.client.ts # Calls ML FastAPI
│   │   │   │   ├── notification/
│   │   │   │   │   ├── notification.service.ts
│   │   │   │   │   ├── sms.provider.ts
│   │   │   │   │   └── push.provider.ts
│   │   │   │   ├── admin/
│   │   │   │   └── analytics/
│   │   │   ├── socket/
│   │   │   │   ├── socket.server.ts
│   │   │   │   └── socket.handlers.ts
│   │   │   ├── jobs/               # Bull queue jobs
│   │   │   │   ├── notification.job.ts
│   │   │   │   └── model-retrain.job.ts
│   │   │   ├── middleware/
│   │   │   │   ├── authenticate.ts
│   │   │   │   ├── authorize.ts
│   │   │   │   ├── rateLimiter.ts
│   │   │   │   ├── audit.ts
│   │   │   │   ├── errorHandler.ts
│   │   │   │   └── validate.ts
│   │   │   ├── utils/
│   │   │   │   ├── crypto.ts       # Encryption helpers
│   │   │   │   ├── token.ts        # JWT helpers
│   │   │   │   └── priorityScore.ts
│   │   │   └── app.ts
│   │   └── tests/
│   │
│   └── ml/                         # Python ML microservice
│       ├── app/
│       │   ├── main.py             # FastAPI app
│       │   ├── routers/
│       │   │   ├── predict.py
│       │   │   └── train.py
│       │   ├── models/
│       │   │   ├── predictor.py    # Ensemble model class
│       │   │   └── features.py     # Feature engineering
│       │   ├── schemas/
│       │   │   └── prediction.py   # Pydantic schemas
│       │   ├── services/
│       │   │   ├── training.py
│       │   │   └── mlflow_tracker.py
│       │   └── config.py
│       ├── notebooks/              # Jupyter EDA notebooks
│       ├── requirements.txt
│       └── tests/
│
├── packages/
│   └── shared/                     # Shared TypeScript types
│       ├── src/
│       │   ├── types/
│       │   │   ├── queue.types.ts
│       │   │   ├── user.types.ts
│       │   │   └── socket.events.ts
│       │   └── index.ts
│       └── package.json
│
├── infra/
│   ├── docker/
│   │   ├── Dockerfile.web
│   │   ├── Dockerfile.api
│   │   ├── Dockerfile.ml
│   │   └── nginx.conf
│   ├── docker-compose.yml          # Local dev (all services)
│   ├── docker-compose.prod.yml
│   └── k8s/                        # Kubernetes manifests (optional)
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── deploy-staging.yml
│       └── deploy-prod.yml
│
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
│
├── .env.example                    # NEVER commit .env
├── turbo.json                      # Turborepo config
└── package.json                    # Root workspace
```

---

## ════════════════════════════════════════════
## SECTION 4 — ENVIRONMENT VARIABLES
## ════════════════════════════════════════════

Create `.env.example` (all values are placeholders — fill in `.env` which is gitignored):

```bash
# ─── APP ─────────────────────────────────────────────────────────────────────
NODE_ENV=development
API_PORT=4000
API_BASE_URL=http://localhost:4000
WEB_URL=http://localhost:3000
ML_SERVICE_URL=http://localhost:8000

# ─── DATABASE ────────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/hospital_queue
DATABASE_URL_SHADOW=postgresql://USER:PASSWORD@localhost:5432/hospital_queue_shadow
REDIS_URL=redis://localhost:6379

# ─── AUTH ────────────────────────────────────────────────────────────────────
JWT_ACCESS_SECRET=REPLACE_WITH_64_CHAR_RANDOM_SECRET
JWT_REFRESH_SECRET=REPLACE_WITH_64_CHAR_DIFFERENT_SECRET
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
SESSION_SECRET=REPLACE_WITH_RANDOM_SECRET

# ─── ENCRYPTION ──────────────────────────────────────────────────────────────
ENCRYPTION_KEY=REPLACE_WITH_32_BYTE_HEX_KEY          # AES-256 for PHI fields
ENCRYPTION_IV_LENGTH=16

# ─── TWILIO ──────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# ─── FIREBASE ────────────────────────────────────────────────────────────────
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com

# ─── SENDGRID ────────────────────────────────────────────────────────────────
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourhospital.com

# ─── AWS (PRODUCTION) ────────────────────────────────────────────────────────
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIAXXXXXXXXXXXXXXXX
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
S3_BUCKET_ML_MODELS=hospital-queue-ml-models

# ─── ML SERVICE ──────────────────────────────────────────────────────────────
ML_API_KEY=REPLACE_WITH_INTERNAL_ML_KEY
MLFLOW_TRACKING_URI=http://localhost:5000

# ─── SENTRY ──────────────────────────────────────────────────────────────────
SENTRY_DSN_API=https://xxx@xxx.ingest.sentry.io/xxx
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# ─── RATE LIMITING ───────────────────────────────────────────────────────────
RATE_LIMIT_WINDOW_MS=900000    # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100

# ─── CORS ────────────────────────────────────────────────────────────────────
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com

# ─── NEXT.JS PUBLIC VARS ─────────────────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
NEXT_PUBLIC_FIREBASE_CONFIG={"apiKey":"..."}
```

**Validate every env var at startup using Zod:**

```typescript
// apps/api/src/config/env.ts
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string(),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  ENCRYPTION_KEY: z.string().length(64), // 32 bytes as hex
  ML_SERVICE_URL: z.string().url(),
  ML_API_KEY: z.string().min(16),
  // ... all others
});

export const env = envSchema.parse(process.env);
// App will crash immediately on startup if any required env is missing.
```

---

## ════════════════════════════════════════════
## SECTION 5 — SECURITY IMPLEMENTATION (CRITICAL)
## ════════════════════════════════════════════

This section is NON-NEGOTIABLE. Implement every item before writing any feature code.

### 5.1 Authentication & Authorization

```typescript
// JWT Strategy — Access token: 15 min, Refresh token: 7 days
// Implement refresh token rotation with family tracking to detect reuse attacks.
// On reuse detected: invalidate entire token family, force logout all sessions.

// Middleware: apps/api/src/middleware/authenticate.ts
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorizedError } from '../utils/errors';

export const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) throw new UnauthorizedError('Missing token');

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    req.user = payload;
    // Also check if user is still active in Redis (blacklist check for logout)
    const isBlacklisted = await redis.get(`blacklist:${token}`);
    if (isBlacklisted) throw new UnauthorizedError('Token revoked');
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new UnauthorizedError('Token expired');
    throw new UnauthorizedError('Invalid token');
  }
};

// Authorization middleware with role hierarchy
// SUPER_ADMIN > ADMIN > DOCTOR | NURSE | RECEPTIONIST > PATIENT
export const authorize = (...roles: Role[]) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    throw new ForbiddenError('Insufficient permissions');
  }
  next();
};
```

### 5.2 PHI Encryption (Field-Level)

```typescript
// apps/api/src/utils/crypto.ts
// Encrypt sensitive fields before DB write, decrypt on read.
// Fields to encrypt: phone, address, symptoms, dateOfBirth, notes

import crypto from 'crypto';
import { env } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const KEY = Buffer.from(env.ENCRYPTION_KEY, 'hex'); // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv:tag:ciphertext (all base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decrypt(ciphertext: string): string {
  const [ivB64, tagB64, dataB64] = ciphertext.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data) + decipher.final('utf8');
}
```

### 5.3 Input Validation & SQL Injection Prevention

```typescript
// Every route uses Zod schemas. Prisma uses parameterized queries — never raw SQL.
// Never use prisma.$queryRaw with user input without prisma.sql template literal.

// Example: Check-in validation schema
const CheckInSchema = z.object({
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  phone: z.string().regex(/^\+?[1-9]\d{9,14}$/),
  departmentId: z.string().cuid(),
  symptoms: z.string().max(500).optional(),
  painLevel: z.number().int().min(1).max(10).optional(),
  appointmentType: z.nativeEnum(AppointmentType),
});

// Sanitize all string inputs — strip HTML to prevent stored XSS
import DOMPurify from 'isomorphic-dompurify';
export const sanitize = (input: string) => DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
```

### 5.4 Rate Limiting

```typescript
// apps/api/src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../config/redis';

// Global limiter
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
});

// Strict limiter for auth endpoints (prevent brute force)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // Only 5 login attempts per 15 min per IP
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
});

// OTP / SMS limiter
export const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Only 3 OTP requests per hour
  store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }),
});
```

### 5.5 Security Headers (NGINX + Helmet)

```typescript
// apps/api/src/app.ts
import helmet from 'helmet';
import cors from 'cors';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", env.WEB_URL],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  xFrameOptions: { action: 'deny' },
}));

app.use(cors({
  origin: env.ALLOWED_ORIGINS.split(','),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Disable X-Powered-By
app.disable('x-powered-by');
```

```nginx
# infra/docker/nginx.conf — add these headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
```

### 5.6 Audit Logging

```typescript
// Every state-changing action (queue update, priority change, user creation)
// must be logged to the AuditLog table including who did it, from which IP,
// what the old value was, and what it changed to.

// apps/api/src/middleware/audit.ts
export const auditLog = (action: string, entityType?: string) =>
  async (req, _res, next) => {
    req.auditContext = { action, entityType, userId: req.user?.id, ipAddress: req.ip };
    next();
  };

// Call in service layer after DB write:
await prisma.auditLog.create({
  data: {
    userId: actorId,
    action: 'QUEUE_STATUS_CHANGED',
    entityType: 'QueueEntry',
    entityId: queueEntry.id,
    oldValue: { status: oldStatus },
    newValue: { status: newStatus },
    ipAddress,
    userAgent,
  },
});
```

### 5.7 Two-Factor Authentication (2FA)

```typescript
// Implement TOTP-based 2FA using otplib for staff/admin accounts.
// Required for all ADMIN and SUPER_ADMIN roles.

import { authenticator } from 'otplib';
import { encrypt, decrypt } from '../utils/crypto';

// Generate secret
const secret = authenticator.generateSecret();
// Store encrypted: user.twoFactorSecret = encrypt(secret)

// Verify OTP
export function verifyTotp(encryptedSecret: string, token: string): boolean {
  const secret = decrypt(encryptedSecret);
  return authenticator.verify({ token, secret });
}
```

### 5.8 WebSocket Security

```typescript
// apps/api/src/socket/socket.server.ts
// Authenticate every WebSocket connection using the same JWT.
// Use Socket.IO rooms to scope broadcasts — never broadcast queue data globally.

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    socket.data.user = payload;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const { user } = socket.data;
  // Join role-based rooms only
  socket.join(`user:${user.id}`);
  if (user.departmentId) socket.join(`dept:${user.departmentId}`);
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) socket.join('admin');
  // Never join all rooms or broadcast to '*'
});
```

### 5.9 Dependency Security

```bash
# Run on every CI build
npm audit --audit-level=high
npx snyk test

# Lock file integrity check
npm ci  # Never use npm install in CI

# Automated dependency updates
# Use Dependabot (GitHub) — configure in .github/dependabot.yml
```

### 5.10 OWASP Top 10 Checklist

```
✅ A01 Broken Access Control   → Role-based middleware on every route
✅ A02 Cryptographic Failures  → AES-256-GCM for PHI, HTTPS everywhere
✅ A03 Injection               → Prisma ORM + Zod validation
✅ A04 Insecure Design         → Threat model documented, audit logs
✅ A05 Security Misconfiguration → Helmet + CSP + env validation at startup
✅ A06 Vulnerable Components   → npm audit in CI, Dependabot
✅ A07 Auth & Session Failures → JWT rotation, TOTP 2FA, IP-bound rate limits
✅ A08 Software Integrity      → npm ci, signed commits, SBOM
✅ A09 Logging & Monitoring    → AuditLog table, Sentry, Prometheus alerts
✅ A10 SSRF                    → ML service behind internal network, no user URLs fetched
```

---

## ════════════════════════════════════════════
## SECTION 6 — API ENDPOINT DESIGN
## ════════════════════════════════════════════

All endpoints prefixed with `/api/v1`. All responses follow:
```json
{ "success": true, "data": {}, "message": "Optional message", "meta": {} }
{ "success": false, "error": "Error code", "message": "Human readable" }
```

### Auth routes — `/api/v1/auth`
```
POST   /register              → Register patient (phone OTP verification)
POST   /login                 → Email/phone + password → access + refresh tokens
POST   /refresh               → Rotate refresh token
POST   /logout                → Blacklist current token
POST   /verify-otp            → Verify phone OTP
POST   /resend-otp            → Resend OTP (rate limited: 3/hour)
POST   /forgot-password       → Send reset email
POST   /reset-password        → Validate token, set new password
POST   /2fa/setup             → Generate TOTP secret (staff/admin)
POST   /2fa/verify            → Verify TOTP token
DELETE /2fa/disable           → Disable 2FA (requires password)
```

### Queue routes — `/api/v1/queue`
```
POST   /checkin               → Patient check-in (auth: PATIENT or RECEPTIONIST)
GET    /status/:token         → Get queue entry status (public with token)
GET    /department/:id        → Get full dept queue (auth: STAFF+)
PATCH  /:id/call              → Mark as CALLED (auth: RECEPTIONIST+)
PATCH  /:id/start             → Mark as IN_CONSULTATION (auth: DOCTOR)
PATCH  /:id/complete          → Mark as COMPLETED (auth: DOCTOR)
PATCH  /:id/no-show           → Mark as NO_SHOW (auth: RECEPTIONIST+)
PATCH  /:id/priority          → Update priority (auth: DOCTOR+)
DELETE /:id/cancel            → Cancel entry (auth: PATIENT own or ADMIN)
GET    /my-history            → Patient's own past entries (auth: PATIENT)
```

### Department routes — `/api/v1/departments`
```
GET    /                      → List all active departments (public)
GET    /:id                   → Department details + current queue stats (public)
GET    /:id/load              → Real-time load metrics (auth: STAFF+)
POST   /                      → Create department (auth: ADMIN+)
PATCH  /:id                   → Update department (auth: ADMIN+)
```

### Prediction routes — `/api/v1/predictions`
```
POST   /estimate              → Get wait time estimate for given inputs (auth: any)
GET    /accuracy              → Model accuracy metrics (auth: ADMIN+)
POST   /retrain               → Trigger manual retraining (auth: SUPER_ADMIN)
GET    /history               → Prediction vs actual history (auth: ADMIN+)
```

### Admin routes — `/api/v1/admin`
```
GET    /users                 → List all users (auth: ADMIN+)
POST   /users                 → Create staff user (auth: ADMIN+)
PATCH  /users/:id             → Update user role/status (auth: ADMIN+)
GET    /audit-logs            → Paginated audit logs (auth: ADMIN+)
GET    /analytics/summary     → Key metrics (auth: ADMIN+)
GET    /analytics/wait-times  → Historical wait time data (auth: ADMIN+)
```

### WebSocket Events
```typescript
// Server → Client events
'queue:updated'        → { departmentId, entries: QueueEntry[] }
'queue:entry:called'   → { token, patientId, counter }
'queue:entry:status'   → { token, status, predictedWaitMin }
'dept:load:updated'    → { departmentId, currentLoad, avgWait }
'notification:new'     → { type, message }

// Client → Server events
'subscribe:department' → { departmentId }    // Staff joins dept room
'subscribe:token'      → { token }           // Patient watches own entry
```

---

## ════════════════════════════════════════════
## SECTION 7 — ML PREDICTION SERVICE
## ════════════════════════════════════════════

### Feature Engineering

```python
# apps/ml/app/models/features.py
import pandas as pd
import numpy as np

def build_features(raw: dict) -> dict:
    """
    Transform raw check-in data into ML features.
    All features are normalized/encoded before passing to the model.
    """
    hour = pd.Timestamp(raw['check_in_at']).hour
    return {
        # Time features (cyclic encoding to preserve continuity)
        'hour_sin': np.sin(2 * np.pi * hour / 24),
        'hour_cos': np.cos(2 * np.pi * hour / 24),
        'day_of_week': pd.Timestamp(raw['check_in_at']).dayofweek,
        'is_weekend': int(pd.Timestamp(raw['check_in_at']).dayofweek >= 5),
        'is_morning_rush': int(9 <= hour <= 11),
        'is_evening_rush': int(17 <= hour <= 19),

        # Queue state features
        'current_queue_length': raw['current_queue_length'],
        'doctors_active': raw['doctors_active'],
        'avg_service_min_dept': raw['avg_service_min_dept'],
        'avg_service_min_doctor': raw['avg_service_min_doctor'],
        'dept_load_pct': raw['dept_load_pct'],  # 0-1

        # Patient features
        'priority_score': raw['priority_score'],       # 0-100
        'appointment_type': raw['appointment_type'],   # encoded: 0-3
        'pain_level': raw.get('pain_level', 5),        # 1-10, default 5

        # Historical features (from TimescaleDB aggregates)
        'hist_avg_wait_this_hour': raw['hist_avg_wait_this_hour'],
        'hist_avg_wait_today': raw['hist_avg_wait_today'],
        'hist_queue_length_this_hour': raw['hist_queue_length_this_hour'],
    }
```

### Model Training

```python
# apps/ml/app/services/training.py
import mlflow
import mlflow.sklearn
from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
from sklearn.model_selection import cross_val_score, TimeSeriesSplit
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_absolute_error, r2_score
import xgboost as xgb
import numpy as np

def train_model(df: pd.DataFrame, department_id: str):
    """
    Train per-department ensemble model.
    Uses TimeSeriesSplit to avoid data leakage (no future data in training).
    """
    feature_cols = [
        'hour_sin', 'hour_cos', 'day_of_week', 'is_weekend',
        'is_morning_rush', 'is_evening_rush',
        'current_queue_length', 'doctors_active',
        'avg_service_min_dept', 'dept_load_pct',
        'priority_score', 'appointment_type', 'pain_level',
        'hist_avg_wait_this_hour', 'hist_avg_wait_today',
    ]
    
    X = df[feature_cols]
    y = df['actual_wait_min']  # Target: actual recorded wait time
    
    # Time-series cross-validation (respect temporal order)
    tscv = TimeSeriesSplit(n_splits=5)
    
    with mlflow.start_run():
        mlflow.log_param('department_id', department_id)
        mlflow.log_param('training_samples', len(df))
        
        # Ensemble: weighted average of RF + XGBoost
        rf = RandomForestRegressor(n_estimators=200, max_depth=8, random_state=42, n_jobs=-1)
        xgb_model = xgb.XGBRegressor(n_estimators=200, max_depth=6, learning_rate=0.05, random_state=42)
        
        pipeline = Pipeline([('scaler', StandardScaler()), ('rf', rf)])
        
        mae_scores = cross_val_score(pipeline, X, y, cv=tscv, scoring='neg_mean_absolute_error')
        pipeline.fit(X, y)
        
        mae = -mae_scores.mean()
        r2 = r2_score(y, pipeline.predict(X))
        
        mlflow.log_metric('mae_minutes', round(mae, 2))
        mlflow.log_metric('r2_score', round(r2, 4))
        mlflow.sklearn.log_model(pipeline, f'model_{department_id}')
        
        print(f"Dept {department_id}: MAE={mae:.1f} min, R²={r2:.3f}")
        return pipeline, {'mae': mae, 'r2': r2}
```

### FastAPI Prediction Endpoint

```python
# apps/ml/app/routers/predict.py
from fastapi import APIRouter, HTTPException, Depends, Header
from app.schemas.prediction import PredictRequest, PredictResponse
from app.models.predictor import Predictor
from app.config import settings

router = APIRouter(prefix="/predict", tags=["prediction"])
predictor = Predictor()  # Singleton that loads models from MLflow

async def verify_api_key(x_api_key: str = Header(...)):
    if x_api_key != settings.ML_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")

@router.post("/wait-time", response_model=PredictResponse)
async def predict_wait_time(
    request: PredictRequest,
    _: None = Depends(verify_api_key)
):
    features = build_features(request.dict())
    prediction, confidence = predictor.predict(request.department_id, features)
    
    return PredictResponse(
        predicted_wait_min=max(1, round(prediction)),
        confidence_score=round(confidence, 3),
        model_version=predictor.get_version(request.department_id),
        features_used=list(features.keys()),
    )
```

---

## ════════════════════════════════════════════
## SECTION 8 — PRIORITY SCORING ALGORITHM
## ════════════════════════════════════════════

```typescript
// apps/api/src/utils/priorityScore.ts
// Computed on every check-in and updated on triage changes.
// Score 0-100 where HIGHER = more urgent = goes first in queue.

interface PriorityInput {
  painLevel: number;          // 1-10
  appointmentType: AppointmentType;
  symptoms: string;
  age?: number;
  isPreBooked: boolean;
  waitedMinutes: number;      // recalculated every 5 min for fairness
}

export function computePriorityScore(input: PriorityInput): {
  score: number;
  priority: Priority;
} {
  let score = 0;

  // Pain level (max 30 points)
  score += Math.round((input.painLevel / 10) * 30);

  // Appointment type (max 25 points)
  const typeScores = {
    EMERGENCY: 25, WALK_IN: 10, PRE_BOOKED: 15, FOLLOW_UP: 5,
  };
  score += typeScores[input.appointmentType];

  // Age: elderly (65+) and children (< 12) get boost (max 15 points)
  if (input.age !== undefined) {
    if (input.age >= 65) score += 15;
    else if (input.age < 12) score += 12;
  }

  // Waiting time fairness — bonus for those waiting long (max 20 points)
  const waitBonus = Math.min(20, Math.floor(input.waitedMinutes / 10) * 2);
  score += waitBonus;

  // Pre-booked appointment (max 10 points)
  if (input.isPreBooked) score += 10;

  score = Math.min(100, Math.max(0, score));

  // Map to Priority enum
  const priority =
    score >= 80 ? 'CRITICAL' :
    score >= 60 ? 'HIGH' :
    score >= 35 ? 'NORMAL' : 'LOW';

  return { score, priority };
}
```

---

## ════════════════════════════════════════════
## SECTION 9 — REAL-TIME QUEUE UPDATE FLOW
## ════════════════════════════════════════════

```typescript
// apps/api/src/modules/queue/queue.service.ts
// This is the core service — every queue state change goes through here.

export class QueueService {
  constructor(
    private prisma: PrismaClient,
    private redis: Redis,
    private predictionClient: PredictionClient,
    private notificationService: NotificationService,
    private io: Server,
  ) {}

  async checkIn(dto: CheckInDto, actorId: string): Promise<QueueEntry> {
    // 1. Generate unique token (dept code + sequential number)
    const token = await this.generateToken(dto.departmentId);

    // 2. Compute priority score
    const { score, priority } = computePriorityScore({
      painLevel: dto.painLevel ?? 5,
      appointmentType: dto.appointmentType,
      isPreBooked: dto.appointmentType === 'PRE_BOOKED',
      waitedMinutes: 0,
    });

    // 3. Get current queue position
    const position = await this.getQueueLength(dto.departmentId) + 1;

    // 4. Fetch ML prediction (async, don't block check-in)
    const predictionPromise = this.predictionClient.predict({
      departmentId: dto.departmentId,
      currentQueueLength: position,
      priorityScore: score,
      appointmentType: dto.appointmentType,
      // ... other features
    });

    // 5. Create queue entry in DB (encrypt sensitive fields)
    const entry = await this.prisma.queueEntry.create({
      data: {
        token,
        patientId: dto.patientId,
        departmentId: dto.departmentId,
        priority,
        priorityScore: score,
        position,
        appointmentType: dto.appointmentType,
        symptoms: dto.symptoms ? encrypt(dto.symptoms) : null,
        painLevel: dto.painLevel,
        status: 'WAITING',
      },
    });

    // 6. Save prediction
    const prediction = await predictionPromise;
    if (prediction) {
      await this.prisma.queueEntry.update({
        where: { id: entry.id },
        data: { predictedWaitMin: prediction.predictedWaitMin },
      });
      await this.prisma.waitPrediction.create({
        data: {
          queueEntryId: entry.id,
          departmentId: dto.departmentId,
          predictedMin: prediction.predictedWaitMin,
          confidenceScore: prediction.confidenceScore,
          modelVersion: prediction.modelVersion,
          featuresSnapshot: prediction.features,
        },
      });
    }

    // 7. Update Redis cache for dept queue state
    await this.refreshDeptCache(dto.departmentId);

    // 8. Broadcast queue update to all staff watching this dept
    await this.broadcastDeptUpdate(dto.departmentId);

    // 9. Send confirmation SMS to patient
    await this.notificationService.sendCheckInConfirmation(entry);

    // 10. Audit log
    await this.auditLog('QUEUE_ENTRY_CREATED', 'QueueEntry', entry.id, null, entry, actorId);

    return entry;
  }

  async callNext(departmentId: string, actorId: string): Promise<QueueEntry> {
    // Get highest priority WAITING entry
    const entry = await this.prisma.queueEntry.findFirst({
      where: { departmentId, status: 'WAITING' },
      orderBy: [{ priority: 'desc' }, { priorityScore: 'desc' }, { checkInAt: 'asc' }],
    });

    if (!entry) throw new NotFoundError('No patients in queue');

    const updated = await this.prisma.queueEntry.update({
      where: { id: entry.id },
      data: { status: 'CALLED', calledAt: new Date() },
    });

    // Notify patient via SMS + in-app
    await this.notificationService.sendCalledNotification(updated);

    // Update downstream patients' predicted wait times (async)
    this.refreshWaitPredictions(departmentId).catch(console.error);

    await this.broadcastDeptUpdate(departmentId);
    // Also emit directly to the patient's socket room
    this.io.to(`user:${entry.patientId}`).emit('queue:entry:called', {
      token: entry.token, status: 'CALLED',
    });

    return updated;
  }

  private async broadcastDeptUpdate(departmentId: string) {
    const queue = await this.getDeptQueue(departmentId);
    this.io.to(`dept:${departmentId}`).emit('queue:updated', {
      departmentId, entries: queue,
    });
  }
}
```

---

## ════════════════════════════════════════════
## SECTION 10 — DEVELOPMENT PHASES
## ════════════════════════════════════════════

### Phase 1 — Foundation (Weeks 1–2)
**Goal:** Skeleton running, database seeded, auth working.

```
Tasks:
□ Initialize monorepo with Turborepo
□ Set up PostgreSQL + Prisma schema + run migrations
□ Set up Redis
□ Build Express API skeleton with env validation
□ Implement JWT auth: register, login, refresh, logout
□ Implement OTP phone verification (Twilio)
□ Set up Next.js with TypeScript + Tailwind + shadcn
□ Build login/register pages with form validation
□ Build protected route middleware (frontend)
□ Write seed script: 5 departments, 3 doctors, 2 admin users
□ Docker Compose with all services
□ GitHub Actions: lint + test on PR

Deliverable: Can register, log in, and see an authenticated empty dashboard.
```

### Phase 2 — Core Queue (Weeks 3–4)
**Goal:** Patients can check in; staff can see and call queue.

```
Tasks:
□ Build queue check-in API + form (patient portal)
□ Build token generation + confirmation page
□ Build staff queue dashboard (table view)
□ Implement call/complete/no-show status transitions
□ Implement priority scoring on check-in
□ Build Socket.IO server + client
□ Wire real-time queue updates to staff dashboard
□ Build department selector for multi-dept staff
□ Basic SMS on check-in (Twilio)
□ Unit tests for queue service (status machine)

Deliverable: Staff can see live queue; patient gets a token; staff can call next.
```

### Phase 3 — ML Prediction (Weeks 5–6)
**Goal:** Patients see predicted wait time; model is live.

```
Tasks:
□ Set up FastAPI ML service
□ Generate synthetic historical data for initial training (or use seed data)
□ Build feature engineering pipeline
□ Train Random Forest model per department
□ Integrate ML prediction into check-in flow
□ Display predicted wait time on patient status page
□ Store prediction + actual for model evaluation
□ Set up MLflow model registry
□ Build model accuracy dashboard (admin panel)
□ Set up nightly retraining job (APScheduler + Bull)
□ Unit tests for prediction pipeline

Deliverable: Every check-in shows "Estimated wait: X minutes."
```

### Phase 4 — Notifications & Kiosk (Week 7)
**Goal:** Patients are notified proactively; kiosk mode works.

```
Tasks:
□ SMS notification when 2 positions away from being called
□ Firebase push notification setup
□ In-app notification bell component
□ Email confirmation for pre-booked appointments
□ Build kiosk check-in UI (full-screen, touch-friendly)
□ QR code scanning for returning patients
□ Patient history page (past visits, wait times)
□ Notification preference settings for patients

Deliverable: Patient doesn't need to stare at a screen — they get pinged.
```

### Phase 5 — Admin, Analytics & EHR (Weeks 8–9)
**Goal:** Admin has full control; system talks to EHR.

```
Tasks:
□ Admin panel: user management (create/edit staff)
□ Admin panel: department configuration
□ Admin panel: real-time hospital-wide heat map
□ Analytics: wait time trends (TimescaleDB queries + charts)
□ Analytics: prediction accuracy over time
□ Analytics: peak hour reports (export to CSV)
□ HL7 FHIR integration: pull patient records on check-in
□ 2FA for admin accounts
□ Audit log viewer for admins

Deliverable: Hospital administrator can run the system end-to-end.
```

### Phase 6 — Hardening & Launch (Week 10)
**Goal:** Production-ready, secure, monitored.

```
Tasks:
□ Full OWASP security audit + penetration test checklist
□ Load testing with k6 (target: 500 concurrent users)
□ Sentry integration (frontend + backend)
□ Prometheus + Grafana dashboards
□ Alert rules: high queue length, model MAE spike, error rate spike
□ Zero-downtime deployment setup
□ SSL certificates (Let's Encrypt or ACM)
□ Backup strategy: automated daily DB backups to S3
□ Runbook documentation
□ End-to-end tests with Playwright (happy path + edge cases)
□ GDPR/DISHA compliance review: data retention policy, right to deletion

Deliverable: System in production with monitoring and alerting.
```

---

## ════════════════════════════════════════════
## SECTION 11 — DOCKER COMPOSE (DEV)
## ════════════════════════════════════════════

```yaml
# docker-compose.yml
version: '3.9'

services:
  postgres:
    image: timescale/timescaledb:latest-pg15
    environment:
      POSTGRES_USER: ${DB_USER:-hospital}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-hospitalpass}
      POSTGRES_DB: hospital_queue
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hospital"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD:-redispass} --appendonly yes
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  api:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.api
    ports:
      - "4000:4000"
    environment:
      - DATABASE_URL=postgresql://hospital:hospitalpass@postgres:5432/hospital_queue
      - REDIS_URL=redis://:redispass@redis:6379
      - ML_SERVICE_URL=http://ml:8000
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    volumes:
      - ./apps/api:/app/apps/api
    command: npm run dev --workspace=apps/api

  web:
    build:
      context: .
      dockerfile: infra/docker/Dockerfile.web
    ports:
      - "3000:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://localhost:4000
      - NEXT_PUBLIC_WS_URL=http://localhost:4000
    depends_on:
      - api
    volumes:
      - ./apps/web:/app/apps/web
    command: npm run dev --workspace=apps/web

  ml:
    build:
      context: ./apps/ml
      dockerfile: ../../infra/docker/Dockerfile.ml
    ports:
      - "8000:8000"
    environment:
      - ML_API_KEY=${ML_API_KEY:-dev-ml-key}
      - DATABASE_URL=postgresql://hospital:hospitalpass@postgres:5432/hospital_queue
      - MLFLOW_TRACKING_URI=http://mlflow:5000
    depends_on:
      - postgres
    volumes:
      - ./apps/ml:/app
      - ml_models:/app/models

  mlflow:
    image: ghcr.io/mlflow/mlflow:latest
    ports:
      - "5000:5000"
    command: mlflow server --host 0.0.0.0 --backend-store-uri sqlite:///mlflow.db
    volumes:
      - mlflow_data:/mlflow

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./infra/docker/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - api
      - web

volumes:
  postgres_data:
  redis_data:
  ml_models:
  mlflow_data:
```

---

## ════════════════════════════════════════════
## SECTION 12 — CI/CD PIPELINE
## ════════════════════════════════════════════

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  security-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm audit --audit-level=high
      - name: Run Snyk
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}

  test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: testpass
          POSTGRES_DB: hospital_test
        options: --health-cmd pg_isready --health-interval 10s
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/hospital_test
      - run: npm test --workspace=apps/api
        env:
          NODE_ENV: test
          DATABASE_URL: postgresql://postgres:testpass@localhost:5432/hospital_test
          REDIS_URL: redis://localhost:6379
          JWT_ACCESS_SECRET: test-secret-min-32-chars-long-xxxx
          JWT_REFRESH_SECRET: test-refresh-min-32-chars-long-xxx
          ENCRYPTION_KEY: 0000000000000000000000000000000000000000000000000000000000000000

  test-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npm test --workspace=apps/web
      - name: Run Playwright E2E
        run: npx playwright test
        env:
          NEXT_PUBLIC_API_URL: http://localhost:4000

  test-ml:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: pip install -r apps/ml/requirements.txt
      - run: pytest apps/ml/tests/ -v

  deploy-staging:
    needs: [security-audit, test-api, test-web, test-ml]
    if: github.ref == 'refs/heads/develop'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to staging
        run: |
          # SSH deploy or Railway/Render CLI deploy
          echo "Deploy to staging"
```

---

## ════════════════════════════════════════════
## SECTION 13 — SEED DATA SCRIPT
## ════════════════════════════════════════════

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Departments
  const departments = await Promise.all([
    prisma.department.upsert({ where: { code: 'GOPD' }, update: {},
      create: { name: 'General OPD', code: 'GOPD', averageServiceMin: 12, maxCapacity: 50 } }),
    prisma.department.upsert({ where: { code: 'CARD' }, update: {},
      create: { name: 'Cardiology', code: 'CARD', averageServiceMin: 20, maxCapacity: 30 } }),
    prisma.department.upsert({ where: { code: 'ORTHO' }, update: {},
      create: { name: 'Orthopaedics', code: 'ORTHO', averageServiceMin: 18, maxCapacity: 25 } }),
    prisma.department.upsert({ where: { code: 'DERM' }, update: {},
      create: { name: 'Dermatology', code: 'DERM', averageServiceMin: 10, maxCapacity: 20 } }),
    prisma.department.upsert({ where: { code: 'NEURO' }, update: {},
      create: { name: 'Neurology', code: 'NEURO', averageServiceMin: 25, maxCapacity: 20 } }),
    prisma.department.upsert({ where: { code: 'EMRG' }, update: {},
      create: { name: 'Emergency', code: 'EMRG', averageServiceMin: 30, maxCapacity: 15 } }),
  ]);

  // Super Admin
  const adminHash = await bcrypt.hash('Admin@12345', 12);
  await prisma.user.upsert({
    where: { email: 'admin@hospital.com' },
    update: {},
    create: {
      email: 'admin@hospital.com',
      passwordHash: adminHash,
      role: 'SUPER_ADMIN',
      firstName: 'Hospital',
      lastName: 'Admin',
      isEmailVerified: true,
    },
  });

  console.log(`✅ Seeded ${departments.length} departments and admin user`);
}

main().finally(() => prisma.$disconnect());
```

---

## ════════════════════════════════════════════
## SECTION 14 — MONITORING & ALERTING
## ════════════════════════════════════════════

### Prometheus metrics to expose from API

```typescript
// Custom metrics to track
const metrics = {
  queueLength: new Gauge({ name: 'hospital_queue_length', labelNames: ['department'] }),
  avgWaitTime: new Gauge({ name: 'hospital_avg_wait_minutes', labelNames: ['department'] }),
  predictionMAE: new Gauge({ name: 'hospital_prediction_mae_minutes', labelNames: ['department'] }),
  checkInsTotal: new Counter({ name: 'hospital_checkins_total', labelNames: ['department', 'type'] }),
  activeWebsockets: new Gauge({ name: 'hospital_active_websocket_connections' }),
};
```

### Alert rules (Grafana)

```yaml
# Alert: Queue length exceeds capacity
- alert: QueueOverCapacity
  expr: hospital_queue_length > 40
  for: 5m
  annotations:
    summary: "{{ $labels.department }} queue exceeds 40 patients"

# Alert: Prediction model degraded
- alert: ModelAccuracyDegraded
  expr: hospital_prediction_mae_minutes > 15
  for: 30m
  annotations:
    summary: "ML model MAE exceeds 15 minutes — retrain needed"

# Alert: API error rate spike
- alert: HighErrorRate
  expr: rate(http_request_duration_seconds_count{status=~"5.."}[5m]) > 0.05
  annotations:
    summary: "API error rate above 5%"
```

---

## ════════════════════════════════════════════
## SECTION 15 — CODING STANDARDS
## ════════════════════════════════════════════

Follow these standards on every file you write:

1. **TypeScript strict mode** — no `any`, no implicit returns without type.
2. **Error handling** — never throw raw errors; use typed error classes (NotFoundError, UnauthorizedError, ValidationError) that the global error handler serializes consistently.
3. **No console.log** in production code — use a structured logger (pino) with log levels.
4. **Every async function** that touches DB or external services must have try/catch or be wrapped in an error boundary.
5. **No hardcoded strings** — enums or constants files for status values, event names, error codes.
6. **Comments** — explain WHY, not WHAT. Code explains what; comments explain reasoning.
7. **Tests first for services** — write unit tests for QueueService, PriorityScore, and ML features before integrating.
8. **Never commit secrets** — pre-commit hook with `detect-secrets` or `git-secrets`.
9. **All dates in UTC** — store as UTC, convert to local in the frontend only.
10. **Idempotent migrations** — every Prisma migration must be safe to run twice.

---

## ════════════════════════════════════════════
## SECTION 16 — FIRST COMMAND TO RUN
## ════════════════════════════════════════════

```bash
# 1. Clone / init the repo
git init hospital-queue && cd hospital-queue

# 2. Create workspace
npm init -y
# Add "workspaces": ["apps/*", "packages/*"] to package.json

# 3. Install Turborepo
npm install turbo --save-dev

# 4. Copy .env.example to .env and fill all values
cp .env.example .env

# 5. Start all services
docker-compose up -d postgres redis

# 6. Run migrations and seed
npx prisma migrate dev --name init
npx prisma db seed

# 7. Start dev servers
npm run dev  # Starts web + api + ml via Turborepo

# 8. Verify
curl http://localhost:4000/api/v1/health
# → { "status": "ok", "db": "connected", "redis": "connected", "ml": "reachable" }
```

---

*End of master prompt. Build in phase order. Ship the security section first.*
