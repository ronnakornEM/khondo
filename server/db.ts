import pg from 'pg';

// numeric -> number, date -> 'YYYY-MM-DD' string (no timezone surprises)
pg.types.setTypeParser(1700, (v) => parseFloat(v));
pg.types.setTypeParser(1082, (v) => v);

let pool: pg.Pool | undefined;

export function getPool(): pg.Pool {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    pool = new pg.Pool({
      connectionString: url,
      // Serverless: keep the pool tiny; Neon's pooler (pgbouncer) does the real pooling.
      max: 5,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
      ssl: local ? false : undefined,
    });
  }
  return pool;
}

const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Rows come back with camelCased top-level keys (jsonb contents are left untouched). */
export function camelize<T = any>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  return out as T;
}

export async function query<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await getPool().query(text, params as any[]);
  return res.rows.map((r) => camelize<T>(r));
}

export async function one<T = any>(text: string, params: unknown[] = []): Promise<T | undefined> {
  return (await query<T>(text, params))[0];
}

export async function tx<T>(fn: (q: (text: string, params?: unknown[]) => Promise<any[]>) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(async (text, params = []) => (await client.query(text, params as any[])).rows.map((r) => camelize(r)));
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

/** Builds "col = $n" pairs from a validated partial object. Keys come from our zod schemas, never from the client. */
export function buildUpdate(data: Record<string, unknown>, jsonKeys: string[] = [], startAt = 1) {
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined) continue;
    values.push(jsonKeys.includes(k) ? JSON.stringify(v) : v);
    sets.push(`${toSnake(k)} = $${startAt + values.length - 1}${jsonKeys.includes(k) ? '::jsonb' : ''}`);
  }
  return { sets, values };
}
