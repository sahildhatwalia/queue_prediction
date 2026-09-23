# 🏥 MediQueue — Hospital Queue Prediction System

A full-stack, real-time hospital queue management system with ML-powered wait time predictions. Built entirely in **JavaScript** (Node.js backend, Next.js frontend, Python FastAPI ML service).

---

## 🚀 Quick Start

### Prerequisites
- **Node.js 20+** — [Download](https://nodejs.org/)
- **Docker Desktop** — [Download](https://www.docker.com/products/docker-desktop/) *(for PostgreSQL + Redis)*
- **Python 3.11+** — [Download](https://www.python.org/) *(for ML service)*

---

## Step 1 — Start the Database & Redis

```bash
# From project root — starts PostgreSQL + Redis
docker compose up postgres redis -d
```

Wait ~10 seconds for services to be healthy.

---

## Step 2 — Install Dependencies

```bash
# From project root
npm install
```

---

## Step 3 — Setup the API Database

```bash
# Generate Prisma client
npm run --workspace=apps/api prisma:generate

# Run migrations (creates all tables)
npm run --workspace=apps/api prisma:migrate

# Seed demo data (departments + staff accounts)
npm run --workspace=apps/api prisma:seed
```

---

## Step 4 — Run the API Server

```bash
# In one terminal — starts on port 4000
cd apps/api
npm run dev
```

Health check: http://localhost:4000/api/v1/health

---

## Step 5 — Run the Web Frontend

```bash
# In another terminal — starts on port 3000
cd apps/web
npm run dev
```

Open: http://localhost:3000

---

## Step 6 — (Optional) Run the ML Service

```bash
cd apps/ml

# Create virtual environment
python -m venv venv

# Activate (Windows)
.\venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Start the service
uvicorn app.main:app --reload --port 8000
```

ML API docs: http://localhost:8000/docs

---

## 🔑 Demo Login Credentials

| Role | Email | Password |
|------|-------|----------|
| 🏥 Super Admin | admin@hospital.com | Admin@12345 |
| 👨‍⚕️ Doctor | dr.sharma@hospital.com | Doctor@12345 |
| 🧑‍💼 Receptionist | reception@hospital.com | Staff@12345 |
| 🧑‍⚕️ Patient | patient@example.com | Patient@12345 |

---

## 🏗️ Architecture

```
hospital-queue/
├── apps/
│   ├── api/          # Express.js REST + Socket.IO API (port 4000)
│   ├── web/          # Next.js 16 frontend (port 3000)
│   └── ml/           # Python FastAPI ML service (port 8000)
├── packages/
│   └── shared/       # Shared JS constants (roles, events, types)
└── docker-compose.yml  # PostgreSQL + Redis + MLflow
```

## 📡 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/register` | Public | Register new patient |
| POST | `/api/v1/auth/login` | Public | Login |
| GET | `/api/v1/auth/me` | JWT | Get profile |
| GET | `/api/v1/departments` | Public | List departments |
| GET | `/api/v1/departments/:id/stats` | Staff+ | Dept queue stats |
| POST | `/api/v1/queue/checkin` | JWT | Patient check-in |
| GET | `/api/v1/queue/status/:token` | Public | Queue status by token |
| GET | `/api/v1/queue/department/:id` | Staff+ | Full department queue |
| PATCH | `/api/v1/queue/:id/call` | Receptionist+ | Call specific patient |
| POST | `/api/v1/queue/department/:id/call-next` | Receptionist+ | Call next in queue |
| PATCH | `/api/v1/queue/:id/complete` | Doctor+ | Complete consultation |
| PATCH | `/api/v1/queue/:id/no-show` | Receptionist+ | Mark no-show |
| GET | `/api/v1/admin/analytics/summary` | Admin+ | Hospital analytics |

## 🔌 WebSocket Events

```js
// Client subscribes to department queue updates
socket.emit('subscribe:department', { departmentId })

// Server pushes live queue updates
socket.on('queue:updated', ({ departmentId, entries }) => { ... })

// Server notifies patient when called
socket.on('queue:entry:called', ({ token, patientId }) => { ... })
```

## 🔒 Security

- JWT access tokens (15 min) + refresh token rotation (7 days)
- Refresh token family tracking — reuse detected → all sessions invalidated
- AES-256-GCM encryption for PHI fields (symptoms, address)
- Redis blacklist for immediate token revocation on logout
- Rate limiting: 100 req/15min global, 5 req/15min on auth endpoints
- Role hierarchy: PATIENT < NURSE < RECEPTIONIST < DOCTOR < ADMIN < SUPER_ADMIN
- Helmet security headers + CORS protection
