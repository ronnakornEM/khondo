import './env.js';
import { getPool } from './db.js';

// Grants or revokes the superuser flag (all Premium features unlocked + the Admin page).
//   npm run admin:grant -- you@example.com            grant
//   npm run admin:grant -- you@example.com --revoke   revoke
// There is deliberately no API or sign-up path to become a superuser.
const [email, flag] = process.argv.slice(2);
if (!email || email.startsWith('--')) {
  console.error('Usage: npm run admin:grant -- <email> [--revoke]');
  process.exit(1);
}
const pool = getPool();
const res = await pool.query('UPDATE users SET is_superuser = $1 WHERE lower(email) = lower($2) RETURNING email, role', [flag !== '--revoke', email]);
if (!res.rowCount) {
  console.error(`No account with email ${email}. Register it in the app first, then run this again.`);
  process.exitCode = 1;
} else {
  console.log(`${res.rows[0].email} (${res.rows[0].role}) is ${flag === '--revoke' ? 'no longer' : 'now'} a superuser.`);
}
await pool.end();
