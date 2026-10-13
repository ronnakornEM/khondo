import { readdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

type App = { request: (input: string, init?: RequestInit) => Response | Promise<Response> };
type Pool = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export function makeKit(app: App, getPool: () => Pool) {
  async function call(method: string, path: string, opts: { token?: string; json?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
    const headers: Record<string, string> = { ...(opts.headers ?? {}) };
    if (opts.token) headers.authorization = `Bearer ${opts.token}`;
    if (opts.json !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(`/api${path}`, { method, headers, body: opts.raw ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined) });
    const text = await res.text();
    let data: any = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* not json */
    }
    return { status: res.status, data, res };
  }

  let seq = 0;
  async function registerAgent(name: string) {
    const r = await call('POST', '/auth/register', { json: { email: `agent${Date.now()}x${++seq}@example.com`, password: 'password123', name } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return { token: r.data.token as string, agent: r.data.agent };
  }
  async function registerCustomer(name: string, phone = '') {
    const email = `customer${Date.now()}x${++seq}@example.com`;
    const r = await call('POST', '/auth/register', { json: { email, password: 'password123', name, phone, role: 'customer' } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    return { token: r.data.token as string, email };
  }
  async function resetDb() {
    const pool = getPool();
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    for (const f of readdirSync('db/migrations').sort()) await pool.query(readFileSync(`db/migrations/${f}`, 'utf8'));
  }
  const makeSuper = (email: string) => getPool().query('UPDATE users SET is_superuser = true WHERE lower(email) = lower($1)', [email]);
  return { call, registerAgent, registerCustomer, resetDb, makeSuper };
}
