/** Pakistan is UTC+5 all year (no daylight saving). */
export const PKT_OFFSET_MS = 5 * 3600_000;

/** YYYY-MM-DD in Pakistan time, n days from `now`. */
export function pktDate(daysAhead = 0, now = new Date()): string {
  return new Date(now.getTime() + PKT_OFFSET_MS + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

/** 900 → "15:00" */
export const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** A local Pakistan date + "HH:MM" as an ISO instant with +05:00 offset, for booking requests. */
export const pktInstant = (ymd: string, time: string) => `${ymd}T${time}:00+05:00`;

export function formatPkt(iso: string, locale: 'en' | 'ur'): string {
  return new Date(iso).toLocaleString(locale === 'ur' ? 'ur-PK' : 'en-PK', { timeZone: 'Asia/Karachi', dateStyle: 'medium', timeStyle: 'short' });
}
