import { before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';

// No email provider configured: registration must keep working exactly as before (auto-verified).
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://khondo:khondo@localhost:5432/khondo_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
delete process.env.EMAIL_VERIFICATION;
delete process.env.RESEND_API_KEY;

const { app } = await import('../app.js');
const { getPool } = await import('../db.js');
const { makeKit } = await import('./testkit.js');
const { call, resetDb } = makeKit(app, getPool);
before(resetDb);
after(() => getPool().end());

describe('verification disabled (no email provider)', () => {
  it('registers straight into a session and can log in immediately', async () => {
    const r = await call('POST', '/auth/register', { json: { email: 'quick@example.com', password: 'password123', name: 'Quick' } });
    assert.equal(r.status, 201);
    assert.ok(r.data.token);
    assert.equal(r.data.verificationRequired, undefined);
    assert.equal((await call('POST', '/auth/login', { json: { email: 'quick@example.com', password: 'password123' } })).status, 200);
    assert.ok((await getPool().query(`SELECT email_verified_at FROM users WHERE email='quick@example.com'`)).rows[0].email_verified_at);
    // resend is a harmless no-op
    assert.equal((await call('POST', '/auth/resend-verification', { json: { email: 'quick@example.com' } })).status, 200);
  });
});
