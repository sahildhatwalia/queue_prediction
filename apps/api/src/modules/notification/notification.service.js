import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { prisma } from '../../config/db.js';

/**
 * Notification service — sends SMS, email, and in-app notifications.
 * In development, notifications are logged but not actually sent.
 * Wire in Twilio/SendGrid credentials in .env for production.
 */
export class NotificationService {
  constructor(io) {
    this.io = io;
  }

  /**
   * Send check-in confirmation to a patient.
   */
  async sendCheckInConfirmation(queueEntry) {
    const message = `✅ You're in the queue at ${queueEntry.department?.name ?? 'the hospital'}. Your token is ${queueEntry.token}. Estimated wait: ~${queueEntry.predictedWaitMin ?? '?'} minutes.`;

    await this.sendInApp(queueEntry.patientId, message, queueEntry.id);

    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      await this.sendSms(queueEntry.patient?.phone, message);
    } else {
      logger.info({ token: queueEntry.token }, '[SMS stub] Check-in confirmation: ' + message);
    }
  }

  /**
   * Notify patient that they've been called.
   */
  async sendCalledNotification(queueEntry) {
    const message = `📢 It's your turn! Token ${queueEntry.token} — please proceed to the counter now.`;

    await this.sendInApp(queueEntry.patientId, message, queueEntry.id);

    if (env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) {
      await this.sendSms(queueEntry.patient?.phone, message);
    } else {
      logger.info({ token: queueEntry.token }, '[SMS stub] Called notification: ' + message);
    }
  }

  /**
   * Send in-app notification via Socket.IO + record in DB.
   */
  async sendInApp(userId, body, queueEntryId) {
    try {
      // Record in database
      await prisma.notification.create({
        data: {
          userId,
          queueEntryId,
          type: 'IN_APP',
          body,
          sentAt: new Date(),
        },
      });

      // Emit via Socket.IO if connected
      if (this.io) {
        this.io.to(`user:${userId}`).emit('notification:new', {
          type: 'IN_APP',
          message: body,
          queueEntryId,
        });
      }
    } catch (err) {
      logger.error({ err: err.message, userId }, 'Failed to send in-app notification');
    }
  }

  /**
   * Send SMS via Twilio (requires credentials in env).
   */
  async sendSms(phone, message) {
    if (!phone) return;
    if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
      logger.warn('Twilio credentials not configured — SMS not sent');
      return;
    }

    try {
      // Dynamic import to avoid requiring twilio in dev without credentials
      const twilio = (await import('twilio')).default;
      const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
      await client.messages.create({
        body: message,
        from: env.TWILIO_PHONE_NUMBER,
        to: phone,
      });
      logger.info({ phone }, 'SMS sent successfully');
    } catch (err) {
      logger.error({ err: err.message, phone }, 'Failed to send SMS');
    }
  }
}

export const notificationService = new NotificationService();
