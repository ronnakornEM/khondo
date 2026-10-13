// Expands recurring calendar events into concrete occurrences for a visible range.
// Pure & dependency-free so it works on the server (.ics) and in the app.
import type { CalendarEvent } from './types';

export interface Occurrence extends CalendarEvent {
  occurrenceStart: string; // ISO start of this occurrence
  occurrenceEnd: string;
  isRecurrence: boolean;
}

function addStep(d: Date, rec: CalendarEvent['recurrence'], n: number): Date {
  const x = new Date(d);
  if (rec === 'daily') x.setDate(x.getDate() + n);
  else if (rec === 'weekly') x.setDate(x.getDate() + 7 * n);
  else if (rec === 'monthly') {
    // keep day-of-month; clamp for short months
    const day = d.getDate();
    x.setDate(1);
    x.setMonth(d.getMonth() + n);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
  } else if (rec === 'yearly') {
    const day = d.getDate();
    x.setDate(1);
    x.setFullYear(d.getFullYear() + n);
    const last = new Date(x.getFullYear(), x.getMonth() + 1, 0).getDate();
    x.setDate(Math.min(day, last));
  }
  return x;
}

export function expandEvents(events: CalendarEvent[], rangeStart: Date, rangeEnd: Date, cap = 500): Occurrence[] {
  const out: Occurrence[] = [];
  for (const ev of events) {
    const start = new Date(ev.startAt);
    const duration = new Date(ev.endAt).getTime() - start.getTime();
    if (ev.recurrence === 'none') {
      const end = new Date(start.getTime() + duration);
      if (end >= rangeStart && start <= rangeEnd) {
        out.push({ ...ev, occurrenceStart: start.toISOString(), occurrenceEnd: end.toISOString(), isRecurrence: false });
      }
      continue;
    }
    const until = ev.recurrenceUntil ? new Date(`${ev.recurrenceUntil}T23:59:59`) : null;
    for (let i = 0; i < cap; i++) {
      const s = addStep(start, ev.recurrence, i);
      if (s > rangeEnd || (until && s > until)) break;
      const e = new Date(s.getTime() + duration);
      if (e >= rangeStart) {
        out.push({ ...ev, occurrenceStart: s.toISOString(), occurrenceEnd: e.toISOString(), isRecurrence: i > 0 });
      }
    }
  }
  return out.sort((a, b) => a.occurrenceStart.localeCompare(b.occurrenceStart));
}
