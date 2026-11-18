/**
 * Small choices kept on this phone only (localStorage): the blurred photos, the camera last used… Storage can be
 * blocked (private mode, a preview): then the default is read and the choice lasts as long as the screen.
 */
export function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string | null): void {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* not kept: fine */
  }
}
