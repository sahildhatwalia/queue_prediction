import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Role } from '@hospital-queue/shared';

export function signAccessToken(payload) {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    issuer: 'hospital-queue-api',
    audience: 'hospital-queue-web',
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN,
    issuer: 'hospital-queue-api',
    audience: 'hospital-queue-web',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'hospital-queue-api',
    audience: 'hospital-queue-web',
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: 'hospital-queue-api',
    audience: 'hospital-queue-web',
  });
}

/** Decode a token without verifying the signature (for reading exp from expired tokens) */
export function decodeToken(token) {
  return jwt.decode(token);
}

/** Returns milliseconds until token expiry */
export function tokenExpiresInMs(token) {
  const decoded = decodeToken(token);
  if (!decoded?.exp) return 0;
  return decoded.exp * 1000 - Date.now();
}

// Role hierarchy — higher index = more privilege
const ROLE_ORDER = [
  Role.PATIENT,
  Role.NURSE,
  Role.RECEPTIONIST,
  Role.DOCTOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
];

export function hasMinRole(userRole, minRole) {
  return ROLE_ORDER.indexOf(userRole) >= ROLE_ORDER.indexOf(minRole);
}
