import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { HttpError } from './http.js';
import { auth } from './routes/auth.js';
import { properties } from './routes/properties.js';
import { pub } from './routes/public.js';
import { inquiries } from './routes/inquiries.js';
import { contacts } from './routes/contacts.js';
import { bills } from './routes/bills.js';
import { events } from './routes/events.js';
import { feed } from './routes/calendar-feed.js';
import { dashboard } from './routes/dashboard.js';
import { billing } from './routes/billing.js';
import { uploads } from './routes/uploads.js';

export const app = new Hono().basePath('/api');

// Browsers use same-origin requests. Native shells (Capacitor) call from capacitor://localhost etc.
const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
app.use('*', cors({ origin: (o) => (origins.includes(o) ? o : null), allowHeaders: ['Authorization', 'Content-Type'], maxAge: 86400 }));

// Safe default: nothing is cached unless a handler opts in (public pages do). Authenticated JSON must never be
// stored by a CDN or the browser's shared caches.
app.use('*', async (c, next) => {
  await next();
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});

app.get('/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

app.route('/', auth);
app.route('/', properties);
app.route('/', pub);
app.route('/', inquiries);
app.route('/', contacts);
app.route('/', bills);
app.route('/', events);
app.route('/', feed);
app.route('/', dashboard);
app.route('/', billing);
app.route('/', uploads);

app.notFound((c) => c.json({ error: 'Not found', code: 'not_found' }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message, code: err.code ?? 'error' }, err.status);
  if (err instanceof HTTPException) return err.getResponse();
  console.error(err);
  return c.json({ error: 'Something went wrong on our side', code: 'internal' }, 500);
});
