import { readPref, writePref } from '../ui/device-prefs';
import { cameBackAfter } from '../offline/network';

/**
 * 1.16: a screen shown again within this time does not ask the server again (the values seen stay on screen); older, it
 * asks behind them and they change when the answer comes
 */
export const FRESH_MS = 30_000;

/** fetched less than FRESH_MS ago (a time of 0: never, or made stale); 1.18: and not before the network came back (what
 * was shown offline came from the phone) */
export function fresh(at: number, ms = FRESH_MS): boolean {
  return at > 0 && Date.now() - at < ms && !cameBackAfter(at);
}

interface Kept<T> {
  owner: string;
  day: string;
  value: T;
}

/**
 * 1.16: a small value kept on this phone for the signed-in account and the day (today's summary, the friends' line), so
 * that the next start shows it at once instead of an empty card; the server's answer follows. Forgotten at sign-out.
 */
export function keep<T>(key: string, owner: string | undefined, day: string, value: T): void {
  if (!owner) return;
  try {
    writePref(key, JSON.stringify({ owner, day, value } satisfies Kept<T>));
  } catch {
    /* too big or storage blocked: shown from the server only */
  }
}

/** the value kept for this account and this day, or null */
export function kept<T>(key: string, owner: string | undefined, day: string): T | null {
  if (!owner) return null;
  try {
    const k = JSON.parse(readPref(key) ?? 'null') as Kept<T> | null;
    return k && k.owner === owner && k.day === day ? k.value : null;
  } catch {
    return null;
  }
}

export function forget(key: string): void {
  writePref(key, null);
}
