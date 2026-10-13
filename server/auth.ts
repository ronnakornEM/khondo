import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import type { MiddlewareHandler } from 'hono';
import { one } from './db.js';
import { HttpError } from './http.js';
import { PLANS, type PremiumFeature } from '../shared/plans.js';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 16) throw new Error('JWT_SECRET must be set (16+ chars)');
  return new TextEncoder().encode(s);
}

export async function signToken(userId: string): Promise<string> {
  return new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId).setIssuedAt().setExpirationTime('30d').sign(secret());
}

export interface AgentRow {
  id: string;
  userId: string;
  slug: string;
  displayName: string;
  headline: string;
  bio: string;
  phone: string;
  lineId: string;
  contactEmail: string;
  avatarUrl: string;
  landing: Record<string, unknown>;
  plan: 'free' | 'premium';
  planRenewsAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  calendarToken: string;
  createdAt: Date;
}

export type AuthEnv = { Variables: { agent: AgentRow } };

/** Requires `Authorization: Bearer <jwt>` (works for browsers and native apps alike). */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new HttpError(401, 'Not signed in', 'unauthorized');
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    userId = String(payload.sub);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again', 'unauthorized');
  }
  const agent = await one<AgentRow>('SELECT * FROM agents WHERE user_id = $1', [userId]);
  if (!agent) throw new HttpError(401, 'Account not found', 'unauthorized');
  c.set('agent', agent);
  await next();
};

export function requireFeature(feature: PremiumFeature): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const agent = c.get('agent');
    const plan = PLANS[agent.plan];
    const allowed = feature === 'premiumThemes' ? plan.premiumThemes : plan[feature];
    if (!allowed) throw new HttpError(402, 'This feature is part of Khondo Premium', 'premium_required');
    await next();
  };
}
