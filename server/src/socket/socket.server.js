import { Server as SocketServer } from 'socket.io';
import { env } from '../config/env.js';
import { verifyAccessToken } from '../utils/token.js';
import { logger } from '../utils/logger.js';
import { SOCKET_EVENTS } from '@hospital-queue/shared';

export function createSocketServer(httpServer) {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: env.ALLOWED_ORIGINS.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ─── JWT AUTHENTICATION MIDDLEWARE ──────────────────────────────────────────
  // Every WebSocket connection must present a valid JWT.
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyAccessToken(token);
      socket.data.user = payload;
      next();
    } catch {
      next(new Error('Invalid or expired token'));
    }
  });

  // ─── CONNECTION HANDLER ─────────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const { user } = socket.data;
    logger.debug({ userId: user.sub, role: user.role }, 'WebSocket connected');

    // Every user gets their own personal room for direct notifications
    socket.join(`user:${user.sub}`);

    // ─── CLIENT → SERVER EVENTS ───────────────────────────────────────────────

    // Staff subscribes to a department's live queue
    socket.on(SOCKET_EVENTS.SUBSCRIBE_DEPARTMENT, ({ departmentId }) => {
      if (!departmentId) return;
      socket.join(`dept:${departmentId}`);
      logger.debug({ userId: user.sub, departmentId }, 'Subscribed to department');
    });

    socket.on(SOCKET_EVENTS.UNSUBSCRIBE_DEPARTMENT, ({ departmentId }) => {
      socket.leave(`dept:${departmentId}`);
    });

    // Patient subscribes to watch their own token status
    socket.on(SOCKET_EVENTS.SUBSCRIBE_TOKEN, ({ token }) => {
      socket.join(`token:${token}`);
    });

    socket.on('disconnect', (reason) => {
      logger.debug({ userId: user.sub, reason }, 'WebSocket disconnected');
    });
  });

  return io;
}
