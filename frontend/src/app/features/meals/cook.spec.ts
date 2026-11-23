import { durations } from './cook.page';

describe('cooking step by step (1.19): the durations of a step are timers', () => {
  it('reads minutes, hours with their minutes, and seconds', () => {
    expect(durations('Laisser mijoter 3 heures à couvert à feu doux').map((d) => d.seconds)).toEqual([3 * 3600]);
    expect(durations('Cuire 15 min puis 1 h 30 au four').map((d) => d.seconds)).toEqual([15 * 60, 90 * 60]);
    expect(durations('Fouetter 30 secondes').map((d) => d.seconds)).toEqual([30]);
    expect(durations('Cuire 10 minutes, retourner, encore 10 minutes').map((d) => d.seconds)).toEqual([600]);
  });

  it('takes no quantity for a duration', () => {
    expect(durations('Ajouter 2 saucisses et 200 g de riz')).toEqual([]);
    expect(durations('Préchauffer le four à 180 °C')).toEqual([]);
    expect(durations('Laisser reposer 5 s')).toEqual([]);
  });
});
