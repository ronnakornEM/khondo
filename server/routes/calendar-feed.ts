import { Hono } from 'hono';
import { query, one } from '../db.js';
import { HttpError } from '../http.js';
import type { AgentRow } from '../auth.js';
import { PLANS } from '../../shared/plans.js';

// Premium: subscribe from Google / Apple Calendar. Authenticated by an unguessable token in the URL.
export const feed = new Hono();

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const stamp = (d: Date | string) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const day = (s: string) => s.replace(/-/g, '');
const RRULE: Record<string, string> = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' };

function fold(line: string) {
  // RFC 5545: lines should be folded at 75 octets
  const buf = Buffer.from(line);
  if (buf.length <= 75) return line;
  const parts: string[] = [];
  let i = 0;
  while (i < buf.length) {
    let end = Math.min(i + (i === 0 ? 75 : 74), buf.length);
    while (end < buf.length && (buf[end] & 0xc0) === 0x80) end--; // don't split a UTF-8 sequence
    parts.push(buf.subarray(i, end).toString());
    i = end;
  }
  return parts.join('\r\n ');
}

feed.get('/calendar/:token/khondo.ics', async (c) => {
  const agent = await one<AgentRow>('SELECT * FROM agents WHERE calendar_token = $1', [c.req.param('token')]);
  if (!agent || !PLANS[agent.plan].advancedCalendar) throw new HttpError(404, 'Calendar not found');
  const [events, bills] = await Promise.all([
    query<any>('SELECT * FROM events WHERE agent_id = $1 ORDER BY start_at', [agent.id]),
    query<any>(`SELECT number, due_date, total FROM bills WHERE agent_id = $1 AND status = 'sent' AND due_date IS NOT NULL`, [agent.id]),
  ]);
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Khondo//Agent Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:Khondo – ${esc(agent.displayName)}`];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.id}@khondo`, `DTSTAMP:${stamp(new Date())}`);
    if (e.allDay) {
      const s = new Date(e.startAt).toISOString().slice(0, 10);
      const end = new Date(new Date(e.endAt).getTime() + 86400_000).toISOString().slice(0, 10);
      lines.push(`DTSTART;VALUE=DATE:${day(s)}`, `DTEND;VALUE=DATE:${day(end)}`);
    } else {
      lines.push(`DTSTART:${stamp(e.startAt)}`, `DTEND:${stamp(e.endAt)}`);
    }
    lines.push(`SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.recurrence !== 'none') {
      lines.push(`RRULE:FREQ=${RRULE[e.recurrence]}${e.recurrenceUntil ? `;UNTIL=${day(e.recurrenceUntil)}T235959Z` : ''}`);
    }
    if (e.reminderMinutes != null) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.reminderMinutes}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  for (const b of bills) {
    lines.push('BEGIN:VEVENT', `UID:bill-${b.number}@khondo`, `DTSTAMP:${stamp(new Date())}`, `DTSTART;VALUE=DATE:${day(b.dueDate)}`, `SUMMARY:${esc(`Bill due ${b.number} (฿${b.total})`)}`, 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return c.body(lines.map(fold).join('\r\n') + '\r\n', 200, { 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'private, max-age=300' });
});
