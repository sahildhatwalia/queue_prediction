import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  // Reconnect up to 10 times on disconnect
  retryStrategy: (times) => {
    if (times > 10) {
      logger.error('Redis: max reconnection attempts reached');
      return null; // stop retrying
    }
    return Math.min(times * 200, 2000); // wait up to 2s between retries
  },
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis error'));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));
