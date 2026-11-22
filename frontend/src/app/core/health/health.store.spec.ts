import { average, bpLevel } from './health.store';

describe('blood pressure (1.17)', () => {
  it('reads a home measure against the thresholds (135/85, 180/110)', () => {
    expect(bpLevel(128, 82)).toBe('ok');
    expect(bpLevel(136, 80)).toBe('high');
    expect(bpLevel(130, 86)).toBe('high');
    expect(bpLevel(182, 95)).toBe('urgent');
    expect(bpLevel(150, 112)).toBe('urgent');
    expect(bpLevel(88, 58)).toBe('low');
  });

  it('averages the readings as the server does (the pulse of those that give it)', () => {
    expect(average([{ systolic: 131, diastolic: 84, pulse: 70 }, { systolic: 128, diastolic: 82 }, { systolic: 126, diastolic: 81, pulse: 66 }])).toEqual({
      systolic: 128,
      diastolic: 82,
      pulse: 68,
    });
    expect(average([{ systolic: 120, diastolic: 80 }]).pulse).toBeNull();
  });
});
