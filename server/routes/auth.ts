import { Hono } from 'hono';
import { z } from 'zod';
import { tx, one, query, buildUpdate } from '../db.js';
import { HttpError, body, parse } from '../http.js';
import { hashPassword, signToken, verifyPassword, requireAuth, type AgentRow, type AuthEnv } from '../auth.js';
import { toAgent, landingOf } from '../mappers.js';
import { PLANS } from '../../shared/plans.js';
import { DEFAULT_LANDING, LANDING_THEMES, type MeResponse } from '../../shared/types.js';

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

const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name: z.string().trim().min(1, 'Name is required').max(80),
});

auth.post('/auth/register', async (c) => {
  const { email, password, name } = parse(registerSchema, await body(c));
  if (await one('SELECT 1 FROM users WHERE lower(email)=$1', [email])) {
    throw new HttpError(409, 'An account with this email already exists', 'email_taken');
  }
  const hash = await hashPassword(password);
  const slug = await uniqueSlug(name);
  const agent = await tx(async (q) => {
    const [user] = await q('INSERT INTO users (email, password_hash) VALUES ($1,$2) RETURNING id', [email, hash]);
    const [a] = await q(
      `INSERT INTO agents (user_id, slug, display_name, contact_email, landing, headline)
       VALUES ($1,$2,$3,$4,$5::jsonb,'Real estate agent in Khon Kaen') RETURNING *`,
      [user.id, slug, name, email, JSON.stringify(DEFAULT_LANDING)],
    );
    return a as AgentRow;
  });
  return c.json({ token: await signToken(agent.userId), agent: toAgent(agent) }, 201);
});

const loginSchema = z.object({ email: z.string().trim().toLowerCase(), password: z.string().min(1) });

auth.post('/auth/login', async (c) => {
  const { email, password } = parse(loginSchema, await body(c));
  const user = await one<{ id: string; passwordHash: string }>('SELECT id, password_hash FROM users WHERE lower(email)=$1', [email]);
  // Always run a hash comparison so timing doesn't reveal whether the email exists.
  const ok = await verifyPassword(password, user?.passwordHash ?? 'scrypt$00$00');
  if (!user || !ok) throw new HttpError(401, 'Incorrect email or password', 'bad_credentials');
  const agent = (await one<AgentRow>('SELECT * FROM agents WHERE user_id=$1', [user.id]))!;
  return c.json({ token: await signToken(user.id), agent: toAgent(agent) });
});

auth.get('/me', requireAuth, async (c) => {
  const agent = c.get('agent');
  const origin = process.env.APP_URL?.replace(/\/$/, '') || new URL(c.req.url).origin;
  const [counts] = await query<{ total: number; published: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE published)::int AS published FROM properties WHERE agent_id=$1`,
    [agent.id],
  );
  const limits = PLANS[agent.plan];
  const res: MeResponse = {
    agent: toAgent(agent),
    usage: { properties: counts.total },
    hiddenProperties: Math.max(0, counts.published - limits.maxProperties),
    calendarFeedUrl: limits.advancedCalendar ? `${origin}/api/calendar/${agent.calendarToken}/khondo.ics` : null,
  };
  return c.json(res);
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
  return c.json({ agent: toAgent(updated!) });
});
