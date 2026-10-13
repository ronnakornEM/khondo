import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { SignJWT, jwtVerify } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
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
  isSuperuser?: boolean;
}

export interface UserRow {
  id: string;
  email: string;
  role: 'agent' | 'customer';
  name: string;
  phone: string;
  isSuperuser: boolean;
}

export type AuthEnv = { Variables: { agent: AgentRow; user: UserRow } };

/** Agent row joined with the owner's superuser flag. */
export const AGENT_SELECT = 'SELECT a.*, u.is_superuser FROM agents a JOIN users u ON u.id = a.user_id';

/**
 * Superusers are testers: every Premium feature is unlocked for them. They can preview the Free experience by
 * sending `X-View-As-Plan: free` (the app's "View as Free" switch). Nobody else can use that header.
 */
export function withEffectivePlan<T extends { plan: 'free' | 'premium'; isSuperuser?: boolean }>(row: T, viewAs?: string | null): T {
  if (!row.isSuperuser) return row;
  return { ...row, plan: viewAs === 'free' ? 'free' : 'premium' };
}

async function readUser(c: Context): Promise<UserRow | null> {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret());
    userId = String(payload.sub);
  } catch {
    throw new HttpError(401, 'Session expired, please sign in again', 'unauthorized');
  }
  const user = await one<UserRow>('SELECT id, email, role, name, phone, is_superuser FROM users WHERE id = $1', [userId]);
  if (!user) throw new HttpError(401, 'Account not found', 'unauthorized');
  return user;
}

/** Any signed-in account (agent or customer). */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await readUser(c);
  if (!user) throw new HttpError(401, 'Not signed in', 'unauthorized');
  c.set('user', user);
  await next();
};

/** Signed in if a valid token is sent, otherwise carries on as a guest. A bad token is still rejected. */
export const optionalUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await readUser(c);
  if (user) c.set('user', user);
  await next();
};

/** Requires `Authorization: Bearer <jwt>` of an AGENT account (works for browsers and native apps alike). */
export const requireAuth: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await readUser(c);
  if (!user) throw new HttpError(401, 'Not signed in', 'unauthorized');
  const row = await one<AgentRow & { isSuperuser: boolean }>(`${AGENT_SELECT} WHERE a.user_id = $1`, [user.id]);
  if (!row) throw new HttpError(403, 'This area is for agents', 'agent_only');
  c.set('user', user);
  c.set('agent', withEffectivePlan(row, c.req.header('x-view-as-plan')));
  await next();
};

export const requireSuperuser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await readUser(c);
  if (!user) throw new HttpError(401, 'Not signed in', 'unauthorized');
  if (!user.isSuperuser) throw new HttpError(403, 'Superuser only', 'forbidden');
  c.set('user', user);
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
