import { MICROS, microStatus, shortName, sourcesOf, type MicroKey } from './micros';
import { shiftMonth } from './season';

const micro = (k: MicroKey) => MICROS.find((m) => m.key === k)!;

describe('vitamins and minerals (1.21)', () => {
  it('says where a mean a day stands against its reference and its safety limit', () => {
    // vitamin C, 80 mg a day
    expect(microStatus(micro('c'), 10)).toBe('none');
    expect(microStatus(micro('c'), 30)).toBe('low');
    expect(microStatus(micro('c'), 60)).toBe('fair');
    expect(microStatus(micro('c'), 200)).toBe('good');
    // zinc above 25 mg, vitamin D above 100 µg: over the limit; vitamin A never (the carotene of carrots is no risk)
    expect(microStatus(micro('zn'), 30)).toBe('over');
    expect(microStatus(micro('d'), 120)).toBe('over');
    expect(microStatus(micro('a'), 5000)).toBe('good');
    // not known for most of the calories: nothing said
    expect(microStatus(micro('c'), undefined)).toBe('unknown');
  });

  it('names a line without its brand, its state or its pack', () => {
    expect(shortName('Carotte, crue')).toBe('Carotte');
    expect(shortName('Pois chiches - Boîte 530g · U')).toBe('Pois chiches');
    expect(shortName('Soja cuisine semi-épais bio · Bjorg')).toBe('Soja cuisine semi-épais bio');
    expect(shortName('Pain complet ou intégral (à la farine T150)')).toBe('Pain complet');
    expect(shortName('Clémentine ou mandarine, chair sans peau, sans pépins, crue')).toBe('Clémentine');
  });

  it('finds the ingredients that bring a vitamin the most', () => {
    const lines = [
      { name: 'Carotte, crue', micros: { a: 3300, c: 11 } },
      { name: 'Carotte, cuite', micros: { a: 700 } },
      { name: 'Oignon, cru', micros: { a: 2, c: 8 } },
      { name: 'Pois chiches - Boîte 530g · U', micros: { c: 10 } },
      { name: 'Riz basmati', micros: {} },
    ];
    // the two carrots are one; the onion brings under a tenth of the vitamin A
    expect(sourcesOf(lines, 'a')).toEqual(['Carotte']);
    expect(sourcesOf(lines, 'c')).toEqual(['Carotte', 'Pois chiches', 'Oignon']);
    expect(sourcesOf(lines, 'd')).toEqual([]);
    expect(sourcesOf(null, 'c')).toEqual([]);
  });

  it('goes round the year from one month to the next', () => {
    expect(shiftMonth(11, 1)).toBe(12);
    expect(shiftMonth(12, 1)).toBe(1);
    expect(shiftMonth(1, -1)).toBe(12);
  });
});
