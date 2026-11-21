import { afterNextRender, signal, type Signal } from '@angular/core';

const shown = new Set<string>();

/**
 * 1.16: a screen's entrance animations (the days of the flame popping in, the goal bar growing) play the first time it
 * shows in a visit of the app, not at each return to its tab: coming back looked like a reload. Returns a signal that is
 * true on the way back, for the first moments: the host sets a class that gives those animations no time (0 s), then
 * drops it, so that what changes afterwards (a day just validated) still animates. To call in a constructor.
 */
export function calmReturn(key: string, ms = 700): Signal<boolean> {
  const first = !shown.has(key);
  shown.add(key);
  const calm = signal(!first);
  if (!first) afterNextRender(() => setTimeout(() => calm.set(false), ms));
  return calm.asReadonly();
}
