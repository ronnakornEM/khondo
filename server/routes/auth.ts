import { Hono } from 'hono';
import { z } from 'zod';
import { tx, one, query, buildUpdate } from '../db.js';
import { HttpError, body, parse } from '../http.js';
import { hashPassword, signToken, verifyPassword, requireAuth, requireUser, withEffectivePlan, AGENT_SELECT, type AgentRow, type AuthEnv } from '../auth.js';
import { toAgent, landingOf } from '../mappers.js';
import { PLANS } from '../../shared/plans.js';
import { createHash, randomBytes } from 'node:crypto';
import { sendMail, verificationEnabled, verificationMail, type MailLang } from '../mail.js';
import { DEFAULT_LANDING, LANDING_THEMES, type CustomerMeResponse, type MeResponse } from '../../shared/types.js';

export const auth = new Hono<AuthEnv>();

const RESERVED = new Set(['app', 'api', 'a', 'login', 'register', 'admin', 'assets', 'pricing', 'khondo', 'www', 'help', 'support']);
const slugRe = /^[a-z0-9][a-z0-9-]{2,29}$/;

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}

async function uniqueSlug(base: string): Promise<string> {
  let b = slugify(base);
  if (b.length < 3 || RESERVED.has(b)) b = 'agent';
  for (let i = 0; i < 8; i++) {
    const candidate = i === 0 ? b : `${b}-${Math.random().toString(36).slice(2, 6)}`;
    if (!RESERVED.has(candidate) && !(await one('SELECT 1 FROM agents WHERE lower(slug)=$1', [candidate]))) return candidate;
  }
  return `agent-${Date.now().toString(36)}`;
}

const VERIFY_TTL_MS = 24 * 3600_000;
const RESEND_COOLDOWN_MS = 60_000;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const lang = z.enum(['en', 'th', 'zh']).default('en');

/** Creates a fresh single-use token (invalidating older ones) and emails the link. Returns whether the email was sent. */
async function sendVerification(user: { id: string; email: string; name: string }, mailLang: MailLang, origin: string): Promise<boolean> {
  const token = randomBytes(32).toString('base64url');
  await query('DELETE FROM email_verifications WHERE user_id = $1', [user.id]);
  await query('INSERT INTO email_verifications (user_id, token_hash, expires_at) VALUES ($1,$2,$3)', [user.id, sha256(token), new Date(Date.now() + VERIFY_TTL_MS)]);
  const base = process.env.APP_URL?.replace(/\/$/, '') || origin;
  return sendMail(verificationMail(user.email, user.name, `${base}/verify-email?token=${token}`, mailLang));
}

async function sessionFor(userId: string, role: 'agent' | 'customer') {
  const token = await signToken(userId);
  if (role === 'customer') return { token, role: 'customer' as const };
  const agent = (await one<AgentRow>(`${AGENT_SELECT} WHERE a.user_id=$1`, [userId]))!;
  return { token, role: 'agent' as const, agent: toAgent(withEffectivePlan(agent)) };
}

const registerSchema = z.object({
  lang,
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name: z.string().trim().min(1, 'Name is required').max(80),
  role: z.enum(['agent', 'customer']).default('agent'),
  phone: z.string().trim().max(40).default(''),
});

auth.post('/auth/register', async (c) => {
  const { email, password, name, role, phone, lang: mailLang } = parse(registerSchema, await body(c));
  if (await one('SELECT 1 FROM users WHERE lower(email)=$1', [email])) {
    throw new HttpError(409, 'An account with this email already exists', 'email_taken');
  }
  const hash = await hashPassword(password);
  // Without an email provider configured, verification is off and accounts are active immediately.
  const needsVerification = verificationEnabled();
  const verifiedAt = needsVerification ? null : new Date();
  // Registration can only ever create agent or customer accounts; superusers are granted out-of-band (npm run admin:grant).
  let userId: string;
  if (role === 'customer') {
    const [user] = await query<{ id: string }>(
      "INSERT INTO users (email, password_hash, role, name, phone, email_verified_at) VALUES ($1,$2,'customer',$3,$4,$5) RETURNING id",
      [email, hash, name, phone, verifiedAt],
    );
    userId = user.id;
  } else {
    const slug = await uniqueSlug(name);
    userId = await tx(async (q) => {
      const [user] = await q('INSERT INTO users (email, password_hash, name, phone, email_verified_at) VALUES ($1,$2,$3,$4,$5) RETURNING id', [email, hash, name, phone, verifiedAt]);
      await q(
        `INSERT INTO agents (user_id, slug, display_name, contact_email, landing, headline)
         VALUES ($1,$2,$3,$4,$5::jsonb,'Real estate agent in Khon Kaen')`,
        [user.id, slug, name, email, JSON.stringify(DEFAULT_LANDING)],
      );
      return user.id as string;
    });
  }
  if (needsVerification) {
    // No session yet: the account activates when the emailed link is opened.
    const emailSent = await sendVerification({ id: userId, email, name }, mailLang, new URL(c.req.url).origin);
    return c.json({ verificationRequired: true as const, email, emailSent }, 201);
  }
  return c.json(await sessionFor(userId, role), 201);
});

// Opening the emailed link: consumes the one-time token, verifies the address and signs the user in.
auth.post('/auth/verify-email', async (c) => {
  const { token } = parse(z.object({ token: z.string().min(20).max(200) }), await body(c));
  const row = await one<{ id: string; userId: string; expiresAt: Date }>('SELECT id, user_id, expires_at FROM email_verifications WHERE token_hash = $1', [sha256(token)]);
  if (!row || row.expiresAt < new Date()) {
    if (row) await query('DELETE FROM email_verifications WHERE id = $1', [row.id]);
    throw new HttpError(400, 'This verification link is invalid or has expired', 'invalid_token');
  }
  await query('DELETE FROM email_verifications WHERE user_id = $1', [row.userId]);
  const user = (await one<{ id: string; role: 'agent' | 'customer' }>('UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = $1 RETURNING id, role', [row.userId]))!;
  return c.json(await sessionFor(user.id, user.role));
});

// Always answers 200 so it can't be used to discover which emails have accounts. Rate-limited per account.
auth.post('/auth/resend-verification', async (c) => {
  const { email, lang: mailLang } = parse(z.object({ email: z.string().trim().toLowerCase().email(), lang }), await body(c));
  const user = await one<{ id: string; email: string; name: string; emailVerifiedAt: Date | null }>('SELECT id, email, name, email_verified_at FROM users WHERE lower(email) = $1', [email]);
  if (user && !user.emailVerifiedAt && verificationEnabled()) {
    const [recent] = await query<{ last: Date | null; hour: number }>(
      `SELECT max(created_at) AS last, count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour FROM email_verifications WHERE user_id = $1`,
      [user.id],
    );
    const coolingDown = recent.last && Date.now() - new Date(recent.last).getTime() < RESEND_COOLDOWN_MS;
    if (!coolingDown) await sendVerification(user, mailLang, new URL(c.req.url).origin);
  }
  return c.json({ ok: true });
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1) });

auth.post('/auth/login', async (c) => {
  const { email, password } = parse(loginSchema, await body(c));
  const user = await one<{ id: string; passwordHash: string; role: 'agent' | 'customer'; emailVerifiedAt: Date | null }>('SELECT id, password_hash, role, email_verified_at FROM users WHERE lower(email)=$1', [email]);
  // Always run a hash comparison so timing doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? 'scrypt$00$00');
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password', 'bad_credentials');
  // Only revealed after the password is right, so it doesn't leak which addresses are registered.
  if (!user.emailVerifiedAt && verificationEnabled()) throw new HttpError(403, 'Please verify your email address first', 'email_not_verified');
  return c.json(await sessionFor(user.id, user.role));
});

// Agents get their full workspace summary; customers get their account details.
auth.get('/me', requireUser, async (c) => {
  const user = c.get('user');
  if (user.role === 'customer') {
    const res: CustomerMeResponse = { role: 'customer', user: { id: user.id, email: user.email, name: user.name, phone: user.phone }, isSuperuser: user.isSuperuser };
    return c.json(res);
  }
  const row = await one<AgentRow>(`${AGENT_SELECT} WHERE a.user_id = $1`, [user.id]);
  if (!row) throw new HttpError(403, 'This area is for agents', 'agent_only');
  const agent = withEffectivePlan(row, c.req.header('x-view-as-plan'));
  const origin = process.env.APP_URL?.replace(/\/$/, '') || new URL(c.req.url).origin;
  const [counts] = await query<{ total: number; published: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE published)::int AS published FROM properties WHERE agent_id=$1`,
    [agent.id],
  );
  const limits = PLANS[agent.plan];
  const res: MeResponse = {
    role: 'agent',
    agent: toAgent(agent),
    isSuperuser: !!row.isSuperuser,
    usage: { properties: counts.total },
    hiddenProperties: Math.max(0, counts.published - limits.maxProperties),
    calendarFeedUrl: limits.advancedCalendar ? `${origin}/api/calendar/${agent.calendarToken}/khondo.ics` : null,
  };
  return c.json(res);
});

// Customer profile (used to prefill inquiry forms)
auth.patch('/account', requireUser, async (c) => {
  const data = parse(z.object({ name: z.string().trim().min(1).max(80), phone: z.string().trim().max(40) }).partial(), await body(c));
  const { sets, values } = buildUpdate(data);
  if (sets.length) await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $${values.length + 1}`, [...values, c.get('user').id]);
  const u = (await one<{ id: string; email: string; name: string; phone: string; isSuperuser: boolean }>('SELECT id, email, name, phone, is_superuser FROM users WHERE id=$1', [c.get('user').id]))!;
  return c.json({ user: { id: u.id, email: u.email, name: u.name, phone: u.phone } });
});

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === '' || /^https?:\/\//i.test(v), 'Must start with http:// or https://');

const landingSchema = z
  .object({
    theme: z.enum(LANDING_THEMES),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #0f766e'),
    heroTitle: z.string().trim().max(120),
    heroSubtitle: z.string().trim().max(240),
    coverUrl: httpUrl,
    announcement: z.string().trim().max(200),
    showAbout: z.boolean(),
    showContact: z.boolean(),
    showSold: z.boolean(),
    facebook: httpUrl,
    instagram: httpUrl,
    website: httpUrl,
  })
  .partial();

const profileSchema = z
  .object({
    slug: z.string().trim().toLowerCase().regex(slugRe, 'Use 3–30 lowercase letters, numbers or dashes'),
    displayName: z.string().trim().min(1).max(80),
    headline: z.string().trim().max(120),
    bio: z.string().trim().max(2000),
    phone: z.string().trim().max(40),
    lineId: z.string().trim().max(60),
    contactEmail: z.union([z.literal(''), z.string().trim().email().max(200)]),
    avatarUrl: httpUrl,
    landing: landingSchema,
  })
  .partial();

auth.patch('/me/profile', requireAuth, async (c) => {
  const agent = c.get('agent');
  const data = parse(profileSchema, await body(c));
  const limits = PLANS[agent.plan];

  if (data.slug && data.slug !== agent.slug) {
    if (RESERVED.has(data.slug)) throw new HttpError(409, 'That address is reserved', 'slug_taken');
    if (await one('SELECT 1 FROM agents WHERE lower(slug)=$1 AND id<>$2', [data.slug, agent.id])) {
      throw new HttpError(409, 'That address is already taken', 'slug_taken');
    }
  }
  let landing: Record<string, unknown> | undefined;
  if (data.landing) {
    const merged = { ...landingOf(agent), ...data.landing };
    if (!limits.premiumThemes && (merged.theme !== 'classic' || merged.announcement)) {
      throw new HttpError(402, 'Extra themes and the announcement banner are part of Khondo Premium', 'premium_required');
    }
    landing = merged;
  }
  const { sets, values } = buildUpdate({ ...data, landing }, ['landing']);
  if (!sets.length) return c.json({ agent: toAgent(agent) });
  const updated = await one<AgentRow>(
    `UPDATE agents SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length + 1} RETURNING *`,
    [...values, agent.id],
  );
  return c.json({ agent: toAgent({ ...updated!, plan: agent.plan }) });
});
