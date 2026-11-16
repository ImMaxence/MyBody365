import { normalizeUsername } from '../friends/friends-api';
import { dayStatus, monthGrid, shiftMonth, weekOf } from './meals.store';

describe('meals calendar', () => {
  it('starts the week on Monday', () => {
    // 2026-11-18 is a Wednesday
    expect(weekOf('2026-11-18')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(weekOf('2026-11-16')[0]).toBe('2026-11-16');
    expect(weekOf('2026-11-22')[0]).toBe('2026-11-16');
  });

  it('lays out whole weeks around a month', () => {
    const nov = monthGrid('2026-11');
    expect(nov.length % 7).toBe(0);
    expect(nov[0]).toBe('2026-10-26'); // the Monday before 1 November (a Sunday)
    expect(nov).toContain('2026-11-30');
    expect(nov.at(-1)).toBe('2026-12-06');
    expect(monthGrid('2027-02').filter((d) => d.startsWith('2027-02')).length).toBe(28);
  });

  it('moves from month to month across years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });

  it('tells how a day went against the target', () => {
    const today = '2026-11-16';
    expect(dayStatus(undefined, 2000, '2026-11-10', today)).toBeNull();
    expect(dayStatus(0, 2000, '2026-11-10', today)).toBeNull();
    expect(dayStatus(1500, null, '2026-11-10', today)).toBe('logged');
    expect(dayStatus(2000, 2000, '2026-11-10', today)).toBe('ok');
    expect(dayStatus(1810, 2000, '2026-11-10', today)).toBe('ok');
    expect(dayStatus(2300, 2000, '2026-11-10', today)).toBe('over');
    expect(dayStatus(1200, 2000, '2026-11-10', today)).toBe('under');
    // today is not over: below the target, it is still in progress
    expect(dayStatus(1200, 2000, today, today)).toBe('ongoing');
    expect(dayStatus(2600, 2000, today, today)).toBe('over');
  });
});

describe('usernames', () => {
  it('reads what people type', () => {
    expect(normalizeUsername('  @Lea.Martin ')).toBe('lea.martin');
    expect(normalizeUsername('le')).toBeNull();
    expect(normalizeUsername('léa')).toBeNull();
    expect(normalizeUsername('a'.repeat(21))).toBeNull();
  });
});
