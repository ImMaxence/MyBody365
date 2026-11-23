import { recentPace } from './plateau-card.component';

function logs(start: string, days: number, kg: (i: number) => number) {
  const t0 = Date.parse(start);
  return Array.from({ length: days }, (_, i) => ({ day: new Date(t0 + i * 86_400_000).toISOString().slice(0, 10), weightKg: kg(i) }));
}

describe('a plateau (1.19): the pace of the last three weeks of weigh-ins', () => {
  it('gives the slope of the weigh-ins in kg a week, water swings included', () => {
    const flat = logs('2026-11-02', 21, (i) => 80 + (i % 3 === 0 ? 0.4 : -0.2));
    expect(Math.abs(recentPace(flat, '2026-11-22')!)).toBeLessThan(0.1);
    const losing = logs('2026-11-02', 21, (i) => 80 - i * 0.07);
    expect(recentPace(losing, '2026-11-22')!).toBeCloseTo(-0.49, 1);
  });

  it('says nothing with too few weigh-ins or too short a span', () => {
    expect(recentPace(logs('2026-11-02', 6, () => 80), '2026-11-22')).toBeNull();
    expect(recentPace(logs('2026-11-12', 10, () => 80), '2026-11-22')).toBeNull();
  });
});
